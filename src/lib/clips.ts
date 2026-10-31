import type { Clip, ClipProps, ClipType, Marker, MediaItem, Track, TrackKind } from "../types"
import { uid } from "./platform"
import { frameTicks, toFrame, type Fps } from "./time"

export const DEFAULT_PROPS: ClipProps = { x: 0, y: 0, scale: 100, rotation: 0, opacity: 100, volume: 100 }

export const makeTrack = (id: string, kind: TrackKind, name: string): Track => ({ id, kind, name, hidden: false, muted: false, locked: false })

export const clipEnd = (c: Clip) => c.start + c.duration

export const MIN_SPEED = 0.1
export const MAX_SPEED = 10

export const speedOf = (c: Pick<Clip, "speed">) => c.speed ?? 1

/** How much of its source a clip plays through. */
export const sourceSpan = (c: Clip) => c.duration * speedOf(c)

/** The source time shown at timeline time t. */
export const sourceAt = (c: Clip, t: number) => Math.round(c.offset + (t - c.start) * speedOf(c))

export const projectDuration = (clips: Clip[]) => clips.reduce((max, c) => Math.max(max, clipEnd(c)), 0)

export function selectionSpan(clips: Clip[], ids: string[]): [number, number] | null {
  const picked = clips.filter((c) => ids.includes(c.id))
  if (!picked.length) return null
  return [Math.min(...picked.map((c) => c.start)), Math.max(...picked.map(clipEnd))]
}

export const trackKindFor = (type: ClipType): TrackKind => (type === "audio" ? "audio" : "video")

export const clipTypeForMedia = (m: MediaItem): ClipType => (m.kind === "audio" ? "audio" : "video")

export const lockedTrackIds = (tracks: Track[]) => new Set(tracks.filter((t) => t.locked).map((t) => t.id))

export const linkedWith = (clips: Clip[], clip: Clip) => (clip.linkId ? clips.filter((c) => c.linkId === clip.linkId && c.id !== clip.id) : [])

export const canDetachAudio = (clip: Clip, media?: MediaItem) => clip.type === "video" && !clip.audioDetached && media?.kind === "video" && media.hasAudio !== false

/** Whether b picks up exactly where a stops, looking the same, so joining them changes nothing on screen. */
export function continues(a: Clip, b: Clip, media: MediaItem[], fps: Fps) {

  const tolerance = frameTicks(fps) / 2
  const look = (c: Clip) => JSON.stringify([c.props, c.text, !!c.audioDetached, speedOf(c), c.keys, c.crop])
  const sameLook = look(a) === look(b)

  if (a.type !== b.type || a.mediaId !== b.mediaId || !sameLook || Math.abs(clipEnd(a) - b.start) > tolerance) return false

  const timed = media.find((m) => m.id === a.mediaId)?.kind !== "image" && a.type !== "text"

  return !timed || Math.abs(a.offset + sourceSpan(a) - b.offset) <= tolerance * speedOf(a)
}

/** Clear [s, e) on a track: clips inside go, clips crossing an edge are trimmed, a clip covering it all is split. */
export function overwriteRange(clips: Clip[], trackId: string, s: number, e: number): Clip[] {
  return clips.flatMap((c): Clip[] => {

    const end = clipEnd(c)

    if (c.trackId !== trackId || end <= s || c.start >= e) return [c]

    const tail = { ...c, start: e, offset: sourceAt(c, e), duration: end - e, enter: undefined }

    if (c.start >= s) return end <= e ? [] : [tail]

    const head = { ...c, duration: s - c.start, exit: undefined }

    return end > e ? [head, { ...tail, id: uid() }] : [head]
  })
}

export function maxDurationFor(clip: Clip, media: MediaItem[], fps: Fps): number {

  if (!clip.mediaId) return Infinity

  const m = media.find((x) => x.id === clip.mediaId)

  if (!m || m.kind === "image") return Infinity

  return Math.max(frameTicks(fps), (m.duration - clip.offset) / speedOf(clip))
}

export function regrid(clips: Clip[], fps: Fps): Clip[] {
  return clips.map((c) => {
    const start = toFrame(c.start, fps)
    return { ...c, start, duration: Math.max(frameTicks(fps), toFrame(clipEnd(c), fps) - start) }
  })
}

/** Joins overlapping spans so a shift is never counted twice. */
export function mergeSpans(spans: [number, number][]): [number, number][] {

  const sorted = [...spans].sort((a, b) => a[0] - b[0])
  const out: [number, number][] = []

  for (const [s, e] of sorted) {

    const last = out[out.length - 1]

    if (last && s <= last[1]) last[1] = Math.max(last[1], e)
    else out.push([s, e])
  }

  return out
}

/**
 * Moves everything at or after `at` by `delta`, keeping the tracks in sync. A track
 * stays put if a clip crosses that point or the move would land on one: it has
 * nowhere to go without rewriting what's on it.
 */
export function shiftAfter(clips: Clip[], at: number, delta: number, locked: Set<string>, ignore: Set<string> = new Set()): Clip[] {

  const landing = delta < 0 ? at + delta : at
  const blocked = new Set(
    clips.filter((c) => !ignore.has(c.id) && c.start < at && clipEnd(c) > landing).map((c) => c.trackId),
  )

  return clips.map((c) => (!ignore.has(c.id) && c.start >= at && !locked.has(c.trackId) && !blocked.has(c.trackId) ? { ...c, start: c.start + delta } : c))
}

/** Closes each span, last one first so earlier spans keep their positions. */
export function closeSpans(clips: Clip[], markers: Marker[], spans: [number, number][], locked: Set<string>) {

  let nextClips = clips
  let nextMarkers = markers

  for (const [s, e] of [...mergeSpans(spans)].reverse()) {
    nextClips = shiftAfter(nextClips, e, s - e, locked)
    nextMarkers = nextMarkers.map((m) => (m.at >= e ? { ...m, at: m.at + s - e } : m))
  }

  return { clips: nextClips, markers: nextMarkers }
}

/** The next free name for a new track of this kind: V3, A4… */
export function nextTrackName(tracks: Track[], kind: TrackKind) {

  const letter = kind === "video" ? "V" : "A"
  const used = new Set(tracks.map((t) => t.name))

  let n = tracks.filter((t) => t.kind === kind).length + 1

  while (used.has(`${letter}${n}`)) n++

  return `${letter}${n}`
}