import { convertFileSrc, invoke } from "@tauri-apps/api/core"
import { open } from "@tauri-apps/plugin-dialog"
import { PEAKS_PER_SECOND, type MediaItem, type MediaKind } from "../types"
import { liveMedia, useEditor } from "../store/editor"
import { isTauri, uid } from "./platform"

const EXTENSIONS: Record<MediaKind, string[]> = {
  video: ["mp4", "mov", "m4v", "webm", "mkv", "avi"],
  audio: ["mp3", "wav", "m4a", "aac", "ogg", "flac", "opus"],
  image: ["png", "jpg", "jpeg", "webp", "gif", "bmp"],
}
const ALL_EXTENSIONS = Object.values(EXTENSIONS).flat()

const FILMSTRIP_FRAMES = 12
const FRAME_HEIGHT = 54
/** The webview can only decode a whole file at once, so it stops at this size. Native scans have no limit. */
const MAX_WAVEFORM_BYTES = 300 * 1024 * 1024

function kindOf(name: string): MediaKind | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? ""
  for (const [kind, list] of Object.entries(EXTENSIONS)) if (list.includes(ext)) return kind as MediaKind
  return null
}

const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path

/** Open the system file picker (Tauri) or a browser file input. */
export async function pickAndImport() {
  if (isTauri) {
    const picked = await open({
      multiple: true,
      title: "Import media",
      filters: [{ name: "Media", extensions: ALL_EXTENSIONS }],
    })
    if (picked) importPaths(Array.isArray(picked) ? picked : [picked])
    return
  }
  const input = document.createElement("input")
  input.type = "file"
  input.multiple = true
  input.accept = ALL_EXTENSIONS.map((e) => `.${e}`).join(",")
  input.onchange = () => input.files && importFiles([...input.files])
  input.click()
}

/** Import files dropped from the OS (Tauri gives paths). */
export function importPaths(paths: string[]) {
  importSources(paths.map((p) => ({ name: baseName(p), path: p, src: convertFileSrc(p) })))
}

/** Browser fallback: files from an <input> or HTML drop. */
export function importFiles(files: File[]) {
  importSources(files.map((f) => ({ name: f.name, path: f.name, src: URL.createObjectURL(f), size: f.size })))
}

function importSources(sources: { name: string; path: string; src: string; size?: number }[]) {
  const state = useEditor.getState()
  const known = new Set(liveMedia(state).map((m) => m.path))
  const items: MediaItem[] = []
  for (const s of sources) {
    const kind = kindOf(s.name)
    if (!kind || known.has(s.path)) continue
    items.push({ id: uid(), ...s, kind, duration: 0, width: 0, height: 0, frames: [], status: "loading" })
  }
  if (!items.length) return
  state.addMedia(items)
  for (const item of items) void probe(item)
}

async function probe(item: MediaItem) {
  const update = (patch: Partial<MediaItem>) => useEditor.getState().updateMedia(item.id, patch)
  try {
    if (item.kind === "image") {
      const img = await loadImage(item.src)
      update({ status: "ready", width: img.naturalWidth, height: img.naturalHeight, duration: 5, frames: [item.src] })
      return
    }
    const el = document.createElement(item.kind === "video" ? "video" : "audio")
    el.preload = "metadata"
    el.muted = true
    el.crossOrigin = "anonymous"
    el.src = item.src
    await once(el, "loadedmetadata")
    const duration = Number.isFinite(el.duration) ? el.duration : 0
    if (item.kind === "video") {
      const v = el as HTMLVideoElement
      if (!v.videoWidth) throw new Error("No video stream this webview can decode.")
      update({ status: "ready", duration, width: v.videoWidth, height: v.videoHeight })
      update({ frames: await captureFrames(v, duration) })
      update(await scanAudio(item))
    } else {
      update({ status: "ready", duration })
      update(await scanAudio(item))
    }
    el.removeAttribute("src")
    el.load()
  } catch (err) {
    update({ status: "error", error: err instanceof Error ? err.message : "This file can't be read." })
  }
}

function once(el: HTMLMediaElement, event: string, timeoutMs = 15000) {
  return new Promise<void>((resolve, reject) => {
    const done = () => {
      clearTimeout(timer)
      el.removeEventListener(event, done)
      el.removeEventListener("error", fail)
      resolve()
    }
    const fail = () => {
      clearTimeout(timer)
      el.removeEventListener(event, done)
      reject(new Error("This format isn't supported yet."))
    }
    const timer = setTimeout(fail, timeoutMs)
    el.addEventListener(event, done, { once: true })
    el.addEventListener("error", fail, { once: true })
  })
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("This image can't be read."))
    img.src = src
  })
}

async function captureFrames(v: HTMLVideoElement, duration: number): Promise<string[]> {
  const canvas = document.createElement("canvas")
  canvas.height = FRAME_HEIGHT
  canvas.width = Math.round((FRAME_HEIGHT * v.videoWidth) / v.videoHeight)
  const ctx = canvas.getContext("2d")
  if (!ctx || duration <= 0) return []
  const frames: string[] = []
  for (let i = 0; i < FILMSTRIP_FRAMES; i++) {
    v.currentTime = Math.min(duration - 0.05, ((i + 0.5) / FILMSTRIP_FRAMES) * duration)
    try {
      await once(v, "seeked", 5000)
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
      frames.push(canvas.toDataURL("image/jpeg", 0.7))
    } catch {
      break
    }
  }
  return frames
}

/** Waveform and whether there's sound at all, natively when possible since that streams the file. */
async function scanAudio(item: MediaItem): Promise<Pick<MediaItem, "peaks" | "hasAudio">> {
  let known: boolean | undefined
  if (isTauri) {
    const scan = await invoke<{ hasAudio: boolean; peaks: number[] }>("scan_audio", { path: item.path }).catch(() => null)
    if (scan?.peaks.length) return { peaks: scan.peaks, hasAudio: true }
    if (scan && !scan.hasAudio) return { hasAudio: false }
    known = scan?.hasAudio
  }
  const peaks = await decodePeaks(item.src).catch(() => null)
  if (peaks) return { peaks, hasAudio: true }
  return { hasAudio: known ?? (peaks === null ? false : undefined) }
}

async function decodePeaks(src: string): Promise<number[] | undefined> {
  const res = await fetch(src)
  const size = Number(res.headers.get("content-length") ?? 0)
  if (size > MAX_WAVEFORM_BYTES) return undefined
  const data = await res.arrayBuffer()
  const ctx = new AudioContext()
  try {
    const buf = await ctx.decodeAudioData(data)
    const channel = buf.getChannelData(0)
    const bucket = Math.max(1, Math.floor(buf.sampleRate / PEAKS_PER_SECOND))
    const peaks: number[] = []
    let max = 0
    for (let i = 0; i < channel.length; i += bucket) {
      let peak = 0
      const end = Math.min(channel.length, i + bucket)
      for (let j = i; j < end; j++) {
        const v = Math.abs(channel[j])
        if (v > peak) peak = v
      }
      peaks.push(peak)
      if (peak > max) max = peak
    }
    return max > 0 ? peaks.map((p) => p / max) : peaks
  } finally {
    void ctx.close()
  }
}