import type { Clip, ClipProps, ClipType, MediaItem, Track, TrackKind } from "../types"
import { uid } from "./platform"
import { frameTicks, toFrame, type Fps } from "./time"

export const DEFAULT_PROPS: ClipProps = { x: 0, y: 0, scale: 100, rotation: 0, opacity: 100, volume: 100 }

export const makeTrack = (id: string, kind: TrackKind, name: string): Track => ({ id, kind, name, hidden: false, muted: false, locked: false })

export const clipEnd = (c: Clip) => c.start + c.duration

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
  const sameLook = JSON.stringify([a.props, a.text, !!a.audioDetached]) === JSON.stringify([b.props, b.text, !!b.audioDetached])
  if (a.type !== b.type || a.mediaId !== b.mediaId || !sameLook || Math.abs(clipEnd(a) - b.start) > tolerance) return false
  const timed = media.find((m) => m.id === a.mediaId)?.kind !== "image" && a.type !== "text"
  return !timed || Math.abs(a.offset + a.duration - b.offset) <= tolerance
}

/** Clear [s, e) on a track: clips inside go, clips crossing an edge are trimmed, a clip covering it all is split. */
export function overwriteRange(clips: Clip[], trackId: string, s: number, e: number): Clip[] {
  return clips.flatMap((c): Clip[] => {
    const end = clipEnd(c)
    if (c.trackId !== trackId || end <= s || c.start >= e) return [c]
    const tail = { ...c, start: e, offset: c.offset + (e - c.start), duration: end - e }
    if (c.start >= s) return end <= e ? [] : [tail]
    const head = { ...c, duration: s - c.start }
    return end > e ? [head, { ...tail, id: uid() }] : [head]
  })
}

export function maxDurationFor(clip: Clip, media: MediaItem[], fps: Fps): number {
  if (!clip.mediaId) return Infinity
  const m = media.find((x) => x.id === clip.mediaId)
  if (!m || m.kind === "image") return Infinity
  return Math.max(frameTicks(fps), m.duration - clip.offset)
}

export function regrid(clips: Clip[], fps: Fps): Clip[] {
  return clips.map((c) => {
    const start = toFrame(c.start, fps)
    return { ...c, start, duration: Math.max(frameTicks(fps), toFrame(clipEnd(c), fps) - start) }
  })
}