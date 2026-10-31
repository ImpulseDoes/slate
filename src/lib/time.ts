// 705,600,000 divides evenly by every frame rate Slate offers, NTSC included, so a
// frame edge never lands between two values and long projects don't drift.
export const TICKS = 705_600_000

export type Ticks = number

export interface Fps {
  num: number
  den: number
}

export const FRAME_RATES: { label: string; fps: Fps }[] = [
  { label: "23.976", fps: { num: 24000, den: 1001 } },
  { label: "24", fps: { num: 24, den: 1 } },
  { label: "25", fps: { num: 25, den: 1 } },
  { label: "29.97", fps: { num: 30000, den: 1001 } },
  { label: "30", fps: { num: 30, den: 1 } },
  { label: "50", fps: { num: 50, den: 1 } },
  { label: "59.94", fps: { num: 60000, den: 1001 } },
  { label: "60", fps: { num: 60, den: 1 } },
]

export const sameFps = (a: Fps, b: Fps) => a.num === b.num && a.den === b.den

export const fpsLabel = (fps: Fps) => FRAME_RATES.find((r) => sameFps(r.fps, fps))?.label ?? (fps.num / fps.den).toFixed(2)

const pad = (n: number) => String(n).padStart(2, "0")

export const sec = (t: number) => t / TICKS

export const ticks = (seconds: number) => Math.round(seconds * TICKS)

export const frameTicks = (fps: Fps) => (TICKS * fps.den) / fps.num

export const frameIndex = (t: number, fps: Fps) => Math.round(t / frameTicks(fps))

export const toFrame = (t: number, fps: Fps) => frameIndex(t, fps) * frameTicks(fps)

// Counts frames at the nominal rate, as NTSC timecode does.
export function timecode(t: number, fps: Fps): string {
  const nominal = Math.ceil(fps.num / fps.den)
  const frames = Math.max(0, frameIndex(t, fps))
  const s = Math.floor(frames / nominal)
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}:${pad(frames % nominal)}`
}

export function shortDuration(t: number): string {
  const s = Math.max(0, Math.round(sec(t)))
  const h = Math.floor(s / 3600)
  const m = Math.floor(s / 60) % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`
}

export function rulerLabel(t: number, fps: Fps, withFrames: boolean): string {
  const whole = Math.floor(t / TICKS) * TICKS
  const base = shortDuration(whole)
  return withFrames ? `${base}:${pad(frameIndex(t - whole, fps))}` : base
}
