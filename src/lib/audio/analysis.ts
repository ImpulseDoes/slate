import { PEAKS_PER_SECOND, type Clip, type Keyframe } from "../../types"
import { clipEnd, mergeSpans, sourceAt, speedOf } from "../clips"
import { TICKS } from "../time"

export type Span = [number, number]

const peakAt = (peaks: number[], source: number) => peaks[Math.floor((source / TICKS) * PEAKS_PER_SECOND)] ?? 0

/** The parts of a clip where something louder than `threshold` plays, in timeline time. */
export function loudSpans(clip: Clip, peaks: number[], threshold: number): Span[] {

  const step = TICKS / PEAKS_PER_SECOND / speedOf(clip)
  const end = clipEnd(clip)
  const spans: Span[] = []
  let open: number | null = null

  for (let t = clip.start; t < end; t += step) {

    const loud = peakAt(peaks, sourceAt(clip, t)) >= threshold

    if (loud && open === null) open = t

    if (!loud && open !== null) {
      spans.push([open, t])
      open = null
    }
  }

  if (open !== null) spans.push([open, end])

  return spans
}

/** What's left of `ranges` once `taken` is removed. */
export function subtractSpans(ranges: Span[], taken: Span[]): Span[] {

  const blocks = mergeSpans(taken)

  return mergeSpans(ranges).flatMap(([from, to]) => {

    const left: Span[] = []
    let at = from

    for (const [s, e] of blocks) {

      if (e <= at || s >= to) continue
      if (s > at) left.push([at, s])

      at = Math.max(at, e)
    }

    return at < to ? [...left, [at, to] as Span] : left
  })
}

export interface SilenceOptions {
  threshold: number
  minimum: number
  padding: number
}

/** The stretches worth cutting: quiet for long enough, keeping a little air on both sides. */
export function silentSpans(sources: { clip: Clip; peaks: number[] }[], { threshold, minimum, padding }: SilenceOptions): Span[] {

  const ranges = sources.map(({ clip }): Span => [clip.start, clipEnd(clip)])
  const loud = sources.flatMap(({ clip, peaks }) => loudSpans(clip, peaks, threshold))

  return subtractSpans(ranges, loud)
    .filter(([s, e]) => e - s >= minimum)
    .map(([s, e]): Span => [s + padding, e - padding])
    .filter(([s, e]) => e > s)
}

export interface DuckOptions {
  /** How far the music drops, as a share of its normal volume. */
  level: number
  fade: number
}

/** Volume keys that dip a clip under `speech` and bring it back up after. */
export function duckKeys(clip: Clip, speech: Span[], { level, fade }: DuckOptions): Keyframe[] {

  const start = clip.start
  const end = clipEnd(clip)
  const full = clip.props.volume
  const low = full * level
  const spans = bridge(speech, fade * 2)
  const keys: { time: number; value: number }[] = []

  for (const [s, e] of spans) {

    if (e <= start || s >= end) continue

    if (s - fade > start) keys.push({ time: s - fade, value: full })
    keys.push({ time: Math.max(start, s), value: low })
    keys.push({ time: Math.min(end, e), value: low })
    if (e + fade < end) keys.push({ time: e + fade, value: full })
  }

  return keys.map(({ time, value }) => ({ at: sourceAt(clip, time), value, ease: "smooth" }))
}

/** Joins spans closer together than `gap`, so the music doesn't bob up between two sentences. */
export function bridge(spans: Span[], gap: number): Span[] {

  const out: Span[] = []

  for (const [s, e] of mergeSpans(spans)) {

    const last = out[out.length - 1]

    if (last && s - last[1] <= gap) last[1] = e
    else out.push([s, e])
  }

  return out
}

/** The clip volume, in percent, that brings a measured loudness to the target. */
export const volumeFor = (loudness: number, target: number, max: number) => Math.min(max, Math.round(100 * Math.pow(10, (target - loudness) / 20)))