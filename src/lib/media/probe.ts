import { invoke } from "@tauri-apps/api/core"
import { useEditor } from "../../store/editor"
import { PEAKS_PER_SECOND, type MediaItem } from "../../types"
import { isTauri } from "../platform"
import { ticks } from "../time"

const STILL_DURATION = ticks(5)
const FILMSTRIP_FRAMES = 12
const FRAME_HEIGHT = 54
const MAX_WAVEFORM_BYTES = 300 * 1024 * 1024

export async function probe(item: MediaItem) {

  const update = (patch: Partial<MediaItem>) => useEditor.getState().updateMedia(item.id, patch)

  try {

    if (item.kind === "image") {

      const img = await loadImage(item.src)

      update({ status: "ready", width: img.naturalWidth, height: img.naturalHeight, duration: STILL_DURATION, frames: [item.src] })

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

      if (!v.videoWidth) throw new Error("No video stream this webview can decode.")

      update({ status: "ready", duration, width: v.videoWidth, height: v.videoHeight })
      update({ frames: await captureFrames(v, seconds) })
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