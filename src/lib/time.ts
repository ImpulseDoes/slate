import { PROJECT } from "../types"

const FPS = PROJECT.fps
const pad = (n: number) => String(n).padStart(2, "0")

/** Snap a time in seconds to the nearest frame. */
export const toFrame = (t: number) => Math.round(t * FPS) / FPS

export const FRAME = 1 / FPS

/** `00:01:24:12` */
export function timecode(t: number): string {
  const frames = Math.max(0, Math.round(t * FPS))
  const f = frames % FPS
  const s = Math.floor(frames / FPS)
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}:${pad(f)}`
}

/** Short duration for pills: `0:12`, `2:31`, `1:02:03`. */
export function shortDuration(t: number): string {
  const s = Math.max(0, Math.round(t))
  const h = Math.floor(s / 3600)
  const m = Math.floor(s / 60) % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`
}

/** Ruler label: `0:05`, `1:30`, or `0:05:12` (with frames) when zoomed in. */
export function rulerLabel(t: number, withFrames: boolean): string {
  const base = shortDuration(Math.floor(t + 1e-6))
  if (!withFrames) return base
  return `${base}:${pad(Math.round((t - Math.floor(t + 1e-6)) * FPS))}`
}