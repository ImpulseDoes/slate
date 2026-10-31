import { convertFileSrc, invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { useEditor } from "../../store/editor"
import { PEAKS_PER_SECOND, type MediaItem } from "../../types"
import { t } from "../i18n"
import { errorText } from "../errors"
import { isTauri, uid } from "../platform"
import { ticks } from "../time"
import { proxyMode, type MediaInfo, type ProxyMode } from "./proxy"

const STILL_DURATION = ticks(5)
const FILMSTRIP_FRAMES = 12
const FRAME_HEIGHT = 54
const MAX_WAVEFORM_BYTES = 300 * 1024 * 1024

const update = (id: string, patch: Partial<MediaItem>) => useEditor.getState().updateMedia(id, patch)

/** Runs one conversion, showing its progress on the media row. */
async function convert(item: MediaItem, mode: ProxyMode, info: MediaInfo): Promise<MediaItem> {

  const stop = await listen<{ id: string; progress: number }>("proxy-progress", ({ payload }) => {
    if (payload.id === item.id) update(item.id, { progress: payload.progress })
  })

  try {

    const proxy = await invoke<string>("media_proxy", {
      id: item.id,
      path: item.path,
      mode,
      audioStream: item.audioStream ?? null,
      copyAudio: info.audioCodecs[0] === "aac",
      duration: info.duration,
    })
    const patch = { proxy, src: convertFileSrc(proxy), progress: undefined }

    update(item.id, patch)

    return { ...item, ...patch }

  } finally {
    stop()
  }
}

/** Adds the extra audio tracks of a recording as media of their own, once. */
function addCompanions(item: MediaItem, info: MediaInfo) {

  if (item.companions || info.audioCodecs.length < 2) return

  const extra = info.audioCodecs.slice(1).map((_, i): MediaItem => ({ id: uid(), name: `${item.name} · A${i + 2}`, path: item.path, src: "", kind: "audio", duration: 0, width: 0, height: 0, frames: [], audioStream: i + 1, status: "loading" }))

  useEditor.getState().addMedia(extra)
  update(item.id, { companions: extra.map((m) => m.id) })

  for (const m of extra) void probe(m)
}

let previews = Promise.resolve()

/** One at a time and behind everything else. Until it's done the viewer plays the recording itself. */
function queuePreview(item: MediaItem, info: MediaInfo) {

  previews = previews
    .then(async () => {
      if (useEditor.getState().media.some((m) => m.id === item.id)) await convert(item, "transcode", info)
    })
    .catch(() => update(item.id, { progress: undefined }))
}

async function prepare(item: MediaItem): Promise<{ item: MediaItem; info: MediaInfo | null }> {

  if (!isTauri || item.kind === "image") return { item, info: null }

  const info = await invoke<MediaInfo>("media_info", { path: item.path }).catch(() => null)

  if (!info) return { item, info }

  if (item.kind === "audio") return { item: item.audioStream === undefined ? item : await convert(item, "audio", info), info }

  addCompanions(item, info)

  const cached = await invoke<string | null>("media_cached", { path: item.path, mode: "transcode", audioStream: null }).catch(() => null)

  if (cached) return { item: playFrom(item, cached), info }

  const mode = proxyMode(item.path, info)
  const original = playFrom(item, undefined)

  return { item: mode === "none" ? original : await convert(original, mode, info), info }
}

function playFrom(item: MediaItem, proxy: string | undefined) {

  const patch = { proxy, src: convertFileSrc(proxy ?? item.path) }

  update(item.id, patch)

  return { ...item, ...patch }
}

export async function probe(original: MediaItem): Promise<void> {

  const { item, info } = await prepare(original).catch((err) => {
    update(original.id, { status: "error", error: errorText(err), progress: undefined })
    return { item: null, info: null }
  })

  if (!item) return

  await inspect(item, info)

  const ready = useEditor.getState().media.find((m) => m.id === item.id)?.status === "ready"

  if (info && item.kind === "video" && ready) queuePreview(item, info)
}

/** Reads the file the way the viewer will. `info` is there when a failure can still fall back to a conversion. */
async function inspect(item: MediaItem, info: MediaInfo | null): Promise<void> {

  const update_ = (patch: Partial<MediaItem>) => update(item.id, patch)

  try {

    if (item.kind === "image") {

      const img = await loadImage(item.src)

      update_({ status: "ready", width: img.naturalWidth, height: img.naturalHeight, duration: STILL_DURATION, frames: [item.src] })

      return
    }

    const el = document.createElement(item.kind === "video" ? "video" : "audio")

    el.preload = "metadata"
    el.muted = true
    el.crossOrigin = "anonymous"
    el.src = item.src

    await once(el, "loadedmetadata")

    const seconds = Number.isFinite(el.duration) ? el.duration : 0
    const duration = ticks(seconds)

    if (item.kind === "video") {

      const v = el as HTMLVideoElement

      if (!v.videoWidth) throw new Error(t("probe.noVideo"))

      // Reopening a project reads the smaller copy, and the project goes by the recording itself.
      update_({ status: "ready", duration: item.duration || duration, width: item.width || v.videoWidth, height: item.height || v.videoHeight })
      update_({ frames: await captureFrames(v, seconds) })
      update_(await scanAudio(item))
    } else {
      update_({ status: "ready", duration: item.duration || duration })
      update_(await scanAudio(item))
    }
    el.removeAttribute("src")
    el.load()
  } catch (err) {

    // A recording the webview still can't play gets a real conversion, which it always can.
    if (info && item.kind === "video" && proxyMode(item.path, info) !== "transcode") {
      const converted = await convert(item, "transcode", info).catch(() => null)
      if (converted) return inspect(converted, null)
    }

    update_({ status: "error", error: err instanceof Error ? err.message : t("probe.unreadable") })
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
      reject(new Error(t("probe.unsupported")))
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
    img.onerror = () => reject(new Error(t("probe.badImage")))
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

async function scanAudio(item: MediaItem): Promise<Pick<MediaItem, "peaks" | "hasAudio">> {

  let known: boolean | undefined

  if (isTauri) {

    const scan = await invoke<{ hasAudio: boolean; peaks: number[] }>("scan_audio", { path: item.proxy ?? item.path }).catch(() => null)

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