import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { selectedClips } from "../../store/selectors"
import type { EditorState } from "../../store/editor"
import { PEAKS_PER_SECOND, type Clip, type MediaItem } from "../../types"
import { hasSound } from "../audio/tools"
import { sourceSpan, speedOf } from "../clips"
import { audible } from "../render/compose"
import { sec } from "../time"
import { parseSrt, type Cue } from "./srt"

export const MAX_LINE = 42
export const MAX_LINE_VERTICAL = 24

const JOINED = 0.04
// The model loses track of time in long silence and invents speech there, and it cuts sentences at a fixed length.
// So it gets one stretch of talking at a time, ending at a pause.
const QUIET = 0.02
const LONG_PAUSE = 0.8
const MARGIN = 0.15
const SHORTEST = 0.25
const LONGEST = 28
const REPEAT_GAP = 1
const NOISE = /^[[(♪*].*[\])♪*]$/

export interface Recording {
  media: MediaItem
  clips: Clip[]
  /** Seconds of the source to listen to. */
  start: number
  duration: number
}

/** Where to cut a stretch that's too long: the quietest moment towards its end. */
function quietestBefore(peaks: number[], from: number, limit: number) {

  let best = limit

  for (let i = limit; i > from + (limit - from) * 0.6; i--) if ((peaks[i] ?? 0) < (peaks[best] ?? 0)) best = i

  return best
}

/** The stretches of talking in part of a recording, in seconds. With no peaks it can only cut at a fixed length. */
export function speechChunks(peaks: number[] | undefined, start: number, duration: number): [number, number][] {

  const end = start + duration
  const rate = PEAKS_PER_SECOND
  const longest = LONGEST * rate
  const first = Math.floor(start * rate)
  const last = Math.ceil(end * rate)
  const levels = peaks?.length ? peaks : new Array<number>(last).fill(1)
  const talks: [number, number][] = []

  let open: number | null = null
  let lastLoud = first

  for (let i = first; i <= last; i++) {

    const loud = i < last && (levels[i] ?? 0) >= QUIET

    if (loud) {

      open ??= i
      lastLoud = i
    }
    if (open !== null && (i === last || i - lastLoud >= LONG_PAUSE * rate)) {
      talks.push([open, lastLoud + 1])
      open = null
    }
  }

  const chunks = talks.flatMap(([from, to]) => {

    const parts: [number, number][] = []

    let at = from

    while (to - at > longest) {

      const cut = quietestBefore(levels, at, at + longest)

      parts.push([at, cut])
      at = cut
    }
    return [...parts, [at, to] as [number, number]]
  })

  return chunks
    .filter(([from, to]) => (to - from) / rate >= SHORTEST)
    .map(([from, to]) => [Math.max(start, from / rate - MARGIN), Math.min(end, to / rate + MARGIN)])
}

/** What to listen to: the selection, or everything audible. Each recording goes once, so a talk in pieces still reads as whole sentences. */
export function recordingsToTranscribe(s: Pick<EditorState, "clips" | "media" | "tracks" | "selectedClipIds">): Recording[] {

  const picked = selectedClips(s)
  const pool = picked.length ? picked : s.clips.filter((c) => {
    const track = s.tracks.find((t) => t.id === c.trackId)
    return !!track && audible(c, track)
  })
  const recordings = new Map<string, Recording>()

  for (const clip of pool) {

    const media = s.media.find((m) => m.id === clip.mediaId)

    if (!media || !hasSound(clip, media)) continue

    const from = sec(clip.offset)
    const to = sec(clip.offset + sourceSpan(clip))
    const known = recordings.get(media.id)

    if (!known) {
      recordings.set(media.id, { media, clips: [clip], start: from, duration: to - from })
      continue
    }

    const end = Math.max(known.start + known.duration, to)

    known.start = Math.min(known.start, from)
    known.duration = end - known.start
    known.clips.push(clip)
  }
  return [...recordings.values()]
}

interface Shown {
  start: number
  end: number
  /** The stretch of the source this part of the timeline plays. */
  from: number
  to: number
}

/** Each part shows the words spoken during it. They have no times of their own, so they're spaced evenly through the cue. */
function wordsIn(cue: Cue, from: number, to: number, shown: Shown[]): Cue[] {

  const words = cue.text.split(/\s+/).filter(Boolean)
  const wordAt = (i: number) => from + ((i + 0.5) / words.length) * (to - from)

  return shown.flatMap((part) => {

    const text = words.filter((_, i) => wordAt(i) >= part.from && wordAt(i) < part.to).join(" ")

    return text ? [{ start: part.start, end: part.end, text }] : []
  })
}

/** Moves cues from source time onto the timeline, through whatever cuts and speed changes the clips have. */
export function placeOnTimeline(cues: Cue[], recording: Pick<Recording, "clips" | "start">): Cue[] {

  const clips = [...recording.clips].sort((a, b) => a.start - b.start)

  return cues.flatMap((cue) => {

    const from = cue.start + recording.start
    const to = cue.end + recording.start
    const shown: Shown[] = []

    for (const clip of clips) {

      const first = sec(clip.offset)
      const shownFrom = Math.max(from, first)
      const shownTo = Math.min(to, sec(clip.offset + sourceSpan(clip)))

      if (shownTo <= shownFrom) continue

      const start = sec(clip.start) + (shownFrom - first) / speedOf(clip)
      const end = sec(clip.start) + (shownTo - first) / speedOf(clip)
      const last = shown[shown.length - 1]

      if (last && Math.abs(start - last.end) < JOINED && Math.abs(shownFrom - last.to) < JOINED) {
        last.end = end
        last.to = shownTo
      } else {
        shown.push({ start, end, from: shownFrom, to: shownTo })
      }
    }
    return wordsIn(cue, from, to, shown)
  })
}

function lines(text: string, width: number) {

  const out: string[] = []

  let line = ""

  for (const word of text.split(/\s+/).filter(Boolean)) {

    if (line && line.length + 1 + word.length > width) {
      out.push(line)
      line = ""
    }

    line = line ? `${line} ${word}` : word

    if (/[.!?…]$/.test(word) && line.length >= width / 2) {
      out.push(line)
      line = ""
    }
  }
  if (line) out.push(line)

  return out
}

/** Long sentences become a run of short captions, timed by how much text each one has. */
export function shortenCues(cues: Cue[], width: number): Cue[] {

  return cues.flatMap((cue) => {

    if (cue.text.length <= width) return [cue]

    const parts = lines(cue.text, width)
    const total = parts.reduce((sum, p) => sum + p.length, 0)
    const span = cue.end - cue.start

    let at = cue.start

    return parts.map((text) => {
      const end = at + (span * text.length) / total
      const part = { start: at, end, text }
      at = end
      return part
    })
  })
}

/** Whisper's notes on what it hears, like [music], aren't speech. */
export const spokenCues = (cues: Cue[]) => cues.filter((c) => !NOISE.test(c.text.trim()))

export function captionsFrom(srt: string, recording: Pick<Recording, "clips" | "start">, width: number) {
  return shortenCues(placeOnTimeline(spokenCues(parseSrt(srt)), recording), width)
}

/** Silence and the end of a stretch can make the model say the last line again. */
export const withoutRepeats = (cues: Cue[]) => cues.filter((cue, i) => !(cues[i - 1]?.text === cue.text && cue.start - cues[i - 1].end < REPEAT_GAP))

export async function transcribe(recordings: Recording[], language: string, id: string, width: number, onProgress: (progress: number) => void, stopped: () => boolean) {

  const jobs = recordings.flatMap((recording) => speechChunks(recording.media.peaks, recording.start, recording.duration).map(([start, end]) => ({ recording, start, duration: end - start })))
  const total = jobs.reduce((sum, job) => sum + job.duration, 0)
  const cues: Cue[] = []

  let finished = 0
  let current = 0

  const stop = await listen<{ id: string; progress: number }>("captions-progress", ({ payload }) => {
    if (payload.id === id) onProgress((finished + payload.progress * current) / total)
  })

  try {

    for (const { recording, start, duration } of jobs) {

      if (stopped()) throw "cancelled"

      current = duration

      const srt = await invoke<string>("media_transcribe", { id, path: recording.media.path, audioStream: recording.media.audioStream ?? null, start, duration, language, width })

      cues.push(...captionsFrom(srt, { clips: recording.clips, start }, width))
      finished += duration
    }
  } finally {
    stop()
  }
  return withoutRepeats(cues.sort((a, b) => a.start - b.start))
}