import { create } from "zustand"
import { ANIMATED, keyedPropsAt, keyNear, withKey, withoutKey } from "../lib/animation"
import { clipEnd, clipTypeForMedia, closeSpans, DEFAULT_PROPS, linkedWith, lockedTrackIds, makeTrack, MAX_SPEED, MIN_SPEED, nextTrackName, overwriteRange, projectDuration, regrid, shiftAfter, sourceAt, sourceSpan, speedOf, trackKindFor } from "../lib/clips"
import { t, translate, useLanguage } from "../lib/i18n"
import { uid } from "../lib/platform"
import { frameTicks, sameFps, ticks, toFrame } from "../lib/time"
import { DEFAULT_SETTINGS, type AnimatedProp, type Clip, type ClipProps, type Easing, type FontRef, type Marker, type MediaItem, type ProjectSettings, type TextProps, type Track, type TrackKind, type Transition } from "../types"
import { canLinkSelection, detachableClips, hasLinkedSelection, liveMedia, mergeableRuns, selectedClips } from "./selectors"

interface Snapshot {
  tracks: Track[]
  clips: Clip[]
  markers: Marker[]
  removedMediaIds: string[]
  settings: ProjectSettings
}

export interface ProjectDocument {
  id: string
  path: string | null
  name: string
  settings: ProjectSettings
  media: MediaItem[]
  tracks: Track[]
  clips: Clip[]
  markers: Marker[]
  fonts: FontRef[]
  playhead: number
  pxPerSec: number
  snapping: boolean
}

export interface EditorState {
  projectId: string
  projectPath: string | null
  projectName: string
  settings: ProjectSettings
  /** Compared by reference, so undoing back to the last save counts as clean. */
  saved: SavedMark
  mediaRevision: number
  media: MediaItem[]
  /** Kept so undo can bring the media and its clips back. */
  removedMediaIds: string[]
  tracks: Track[]
  clips: Clip[]
  markers: Marker[]
  fonts: FontRef[]
  selectedClipIds: string[]
  selectedMediaId: string | null
  playhead: number
  playing: boolean
  pxPerSec: number
  snapping: boolean
  showGuides: boolean
  past: Snapshot[]
  future: Snapshot[]
  clipboard: Clip[]

  loadDocument: (doc: ProjectDocument, dirty?: boolean) => void
  markSaved: (path: string, name: string) => void
  updateSettings: (name: string, settings: ProjectSettings) => void

  addMedia: (items: MediaItem[]) => void
  updateMedia: (id: string, patch: Partial<MediaItem>) => void
  relinkMedia: (id: string, patch: Partial<MediaItem>) => void
  removeMedia: (id: string) => void
  selectMedia: (id: string | null) => void

  setPlayhead: (t: number) => void
  setPlaying: (playing: boolean) => void
  togglePlay: () => void
  setZoom: (pxPerSec: number) => void
  toggleSnapping: () => void
  toggleGuides: () => void

  selectClip: (id: string, mode?: "add" | "solo") => void
  clearSelection: () => void

  checkpoint: () => void
  undo: () => void
  redo: () => void

  insertClip: (mediaId: string | null, trackId: string, start: number) => void
  addTitle: () => void
  applyClipEdits: (edits: ClipEdit[]) => void
  /** Live update without a checkpoint; call checkpoint() once before a drag. */
  updateClipProps: (id: string, patch: Partial<ClipProps>) => void
  updateClipText: (id: string, patch: Partial<TextProps>) => void
  splitAtPlayhead: () => void
  deleteSelected: () => void
  toggleTrack: (id: string, key: "hidden" | "muted" | "locked") => void
  clearTrack: (id: string) => void

  selectAll: () => void
  copySelected: () => void
  cutSelected: () => void
  pasteAt: (at: number) => void
  duplicateSelected: () => void
  resetTransform: (id: string) => void
  detachAudio: () => void
  restoreAudio: (id: string) => void
  linkSelected: () => void
  unlinkSelected: () => void
  mergeSelected: () => void

  addMarker: (at?: number) => string | null
  updateMarker: (id: string, patch: Partial<Marker>) => void
  removeMarker: (id: string) => void
  jumpToMarker: (direction: 1 | -1) => void

  addTrack: (kind: TrackKind) => void
  removeTrack: (id: string) => void

  rippleDelete: () => void
  closeGapAt: (trackId: string, at: number) => void
  /** Live update without a checkpoint; call checkpoint() once before a drag. */
  setClipSpeed: (id: string, speed: number) => void

  toggleKeyframe: (id: string, prop: AnimatedProp) => void
  clearKeyframes: (id: string, prop: AnimatedProp) => void
  setEasing: (id: string, ease: Easing) => void
  setTransition: (id: string, side: "enter" | "exit", transition?: Transition) => void
  addFont: (font: FontRef) => void
  /** Any edit from the tools outside the store, as one undo step. */
  transact: (change: (s: EditorState) => Partial<EditorState>) => void
}

export interface ClipEdit {
  id: string
  trackId: string
  start: number
  offset: number
  duration: number
}

export interface SavedMark {
  name: string
  tracks: Track[]
  clips: Clip[]
  markers: Marker[]
  settings: ProjectSettings
  mediaRevision: number
}

export const MIN_ZOOM = 4
export const MAX_ZOOM = 600
const HISTORY_LIMIT = 200
const TITLE_DURATION = ticks(3)

const defaultTracks: Track[] = [makeTrack("v2", "video", "V2"), makeTrack("v1", "video", "V1"), makeTrack("a1", "audio", "A1"), makeTrack("a2", "audio", "A2")]

const snapshotOf = ({ tracks, clips, markers, removedMediaIds, settings }: Snapshot): Snapshot => ({ tracks, clips, markers, removedMediaIds, settings })

const markOf = (s: Pick<EditorState, "projectName" | "tracks" | "clips" | "markers" | "settings" | "mediaRevision">): SavedMark => ({
  name: s.projectName,
  tracks: s.tracks,
  clips: s.clips,
  markers: s.markers,
  settings: s.settings,
  mediaRevision: s.mediaRevision,
})

export const newProject = (): ProjectDocument => ({
  id: crypto.randomUUID(),
  path: null,
  name: t("project.untitled"),
  settings: DEFAULT_SETTINGS,
  media: [],
  tracks: defaultTracks,
  clips: [],
  markers: [],
  fonts: [],
  playhead: 0,
  pxPerSec: 60,
  snapping: true,
})

const patchMedia = (media: MediaItem[], id: string, patch: Partial<MediaItem>) => media.map((m) => (m.id === id ? { ...m, ...patch } : m))

function documentState(doc: ProjectDocument) {
  const fresh = {
    projectId: doc.id,
    projectPath: doc.path,
    projectName: doc.name,
    settings: doc.settings,
    mediaRevision: 0,
    media: doc.media,
    removedMediaIds: [],
    tracks: doc.tracks,
    clips: doc.clips,
    markers: doc.markers,
    fonts: doc.fonts,
    selectedClipIds: [],
    selectedMediaId: null,
    playhead: doc.playhead,
    playing: false,
    pxPerSec: doc.pxPerSec,
    snapping: doc.snapping,
    past: [],
    future: [],
  }
  return { ...fresh, saved: markOf(fresh) }
}

export const useEditor = create<EditorState>((set, get) => ({
  ...documentState(newProject()),
  showGuides: false,
  clipboard: [],

  loadDocument: (doc, dirty) => {
    const state = documentState(doc)
    set({ ...state, saved: dirty ? { ...state.saved, mediaRevision: -1 } : state.saved })
  },
  markSaved: (path, name) => set((s) => ({ projectPath: path, projectName: name, saved: markOf({ ...s, projectName: name }) })),
  updateSettings: (name, settings) => {
    const { settings: old, projectName } = get()
    const changed = old.width !== settings.width || old.height !== settings.height || !sameFps(old.fps, settings.fps)
    if (changed) {
      get().checkpoint()
      set((s) => ({ settings, clips: sameFps(old.fps, settings.fps) ? s.clips : regrid(s.clips, settings.fps), markers: s.markers.map((m) => ({ ...m, at: toFrame(m.at, settings.fps) })), playhead: toFrame(s.playhead, settings.fps) }))
    }
    if (name !== projectName) set({ projectName: name })
  },

  addMedia: (items) => set((s) => ({ media: [...s.media, ...items], mediaRevision: s.mediaRevision + 1 })),
  updateMedia: (id, patch) => set((s) => ({ media: patchMedia(s.media, id, patch) })),
  relinkMedia: (id, patch) => set((s) => ({ media: patchMedia(s.media, id, patch), mediaRevision: s.mediaRevision + 1 })),
  removeMedia: (id) => {
    get().checkpoint()
    set((s) => {
      const extra = s.media.find((m) => m.id === id)?.companions ?? []
      const gone = [id, ...extra]
      const clips = s.clips.filter((c) => !c.mediaId || !gone.includes(c.mediaId))
      return {
        removedMediaIds: [...s.removedMediaIds, ...gone],
        clips,
        selectedClipIds: s.selectedClipIds.filter((x) => clips.some((c) => c.id === x)),
        selectedMediaId: s.selectedMediaId === id ? null : s.selectedMediaId,
      }
    })
  },
  selectMedia: (id) => set({ selectedMediaId: id }),

  setPlayhead: (t) => set((s) => ({ playhead: Math.max(0, toFrame(t, s.settings.fps)) })),
  setPlaying: (playing) => set({ playing }),
  togglePlay: () => {
    const { playing, playhead, clips, settings } = get()
    const end = projectDuration(clips)
    if (!playing && end > 0 && playhead >= end - frameTicks(settings.fps)) set({ playhead: 0 })
    set({ playing: !playing && end > 0 })
  },
  setZoom: (pxPerSec) => set({ pxPerSec: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pxPerSec)) }),
  toggleSnapping: () => set((s) => ({ snapping: !s.snapping })),
  toggleGuides: () => set((s) => ({ showGuides: !s.showGuides })),

  selectClip: (id, mode) =>
    set((s) => {
      const clip = s.clips.find((c) => c.id === id)
      if (!clip) return {}
      const ids = mode === "solo" ? [id] : [id, ...linkedWith(s.clips, clip).map((c) => c.id)]
      if (mode !== "add") return { selectedClipIds: ids }
      if (s.selectedClipIds.includes(id)) return { selectedClipIds: s.selectedClipIds.filter((x) => !ids.includes(x)) }
      return { selectedClipIds: [...new Set([...s.selectedClipIds, ...ids])] }
    }),
  clearSelection: () => set({ selectedClipIds: [] }),

  checkpoint: () =>
    set((s) => ({
      past: [...s.past.slice(-HISTORY_LIMIT + 1), snapshotOf(s)],
      future: [],
    })),
  undo: () => {
    const s = get()
    const prev = s.past[s.past.length - 1]
    if (!prev) return
    set({ ...prev, past: s.past.slice(0, -1), future: [snapshotOf(s), ...s.future], selectedClipIds: [] })
  },
  redo: () => {
    const s = get()
    const next = s.future[0]
    if (!next) return
    set({ ...next, future: s.future.slice(1), past: [...s.past, snapshotOf(s)], selectedClipIds: [] })
  },

  insertClip: (mediaId, trackId, start) => {
    const { media, tracks, settings } = get()
    const { fps } = settings
    const track = tracks.find((t) => t.id === trackId)
    if (!track || track.locked) return
    const base = { id: uid(), trackId, start: toFrame(Math.max(0, start), fps), offset: 0, props: { ...DEFAULT_PROPS } }
    let clip: Clip
    if (mediaId) {
      const m = media.find((x) => x.id === mediaId)
      if (!m || m.status !== "ready") return
      const type = clipTypeForMedia(m)
      if (trackKindFor(type) !== track.kind) return
      clip = { ...base, type, mediaId, name: m.name, duration: Math.max(frameTicks(fps), toFrame(m.duration, fps)) }
    } else {
      if (track.kind !== "video") return
      clip = { ...base, type: "text", name: t("clip.defaultName"), duration: toFrame(TITLE_DURATION, fps), text: { content: t("clip.defaultText"), size: 96, color: "#ffffff" } }
    }
    get().checkpoint()
    set((s) => ({
      clips: [...overwriteRange(s.clips, trackId, clip.start, clipEnd(clip)), clip],
      selectedClipIds: [clip.id],
    }))
    if (clip.mediaId) placeCompanions(get, set, clip)
  },

  addTitle: () => {
    const { tracks, playhead } = get()
    const track = tracks.find((t) => t.kind === "video" && !t.locked)
    if (track) get().insertClip(null, track.id, playhead)
  },

  applyClipEdits: (edits) => {
    const { clips, settings } = get()
    const { fps } = settings
    const edited: Clip[] = []
    for (const e of edits) {
      const clip = clips.find((c) => c.id === e.id)
      if (!clip) continue
      const next = { ...clip, trackId: e.trackId, start: toFrame(Math.max(0, e.start), fps), offset: Math.max(0, e.offset), duration: Math.max(frameTicks(fps), toFrame(e.duration, fps)) }
      if (next.trackId !== clip.trackId || next.start !== clip.start || next.duration !== clip.duration) edited.push(next)
    }
    if (!edited.length) return
    get().checkpoint()
    set((s) => {
      const ids = new Set(edited.map((c) => c.id))
      const rest = edited.reduce(
        (kept, c) => overwriteRange(kept, c.trackId, c.start, clipEnd(c)),
        s.clips.filter((c) => !ids.has(c.id)),
      )
      return { clips: [...rest, ...edited] }
    })
  },

  updateClipProps: (id, patch) =>
    set((s) => {
      const tolerance = (c: Clip) => (frameTicks(s.settings.fps) * speedOf(c)) / 2
      return {
        clips: s.clips.map((c) => {
          if (c.id !== id) return c
          // A property that's animated takes the change as a keyframe here.
          const inside = Math.min(clipEnd(c) - 1, Math.max(c.start, s.playhead))
          const animated = (Object.keys(patch) as AnimatedProp[]).filter((prop) => c.keys?.[prop]?.length)
          const keys = animated.reduce((all, prop) => ({ ...all, [prop]: withKey(all[prop]!, sourceAt(c, inside), patch[prop]!, tolerance(c)) }), c.keys ?? {})
          return { ...c, props: { ...c.props, ...patch }, keys: c.keys && keys }
        }),
      }
    }),

  updateClipText: (id, patch) =>
    set((s) => ({
      clips: s.clips.map((c) =>
        c.id === id && c.text
          ? { ...c, text: { ...c.text, ...patch }, name: patch.content !== undefined ? patch.content.split("\n")[0] || t("clip.defaultName") : c.name }
          : c,
      ),
    })),

  splitAtPlayhead: () => {
    const { clips, selectedClipIds, tracks, settings } = get()
    const playhead = toFrame(get().playhead, settings.fps)
    const frame = frameTicks(settings.fps)
    const locked = lockedTrackIds(tracks)
    const under = clips.filter((c) => !locked.has(c.trackId) && c.start + frame <= playhead && clipEnd(c) - frame >= playhead)
    const targets = selectedClipIds.length ? under.filter((c) => selectedClipIds.includes(c.id)) : under
    if (!targets.length) return
    get().checkpoint()
    const ids = new Set(targets.map((c) => c.id))
    const rightIds: string[] = []
    // Each side of a cut stays linked within itself, so either one can be unlinked alone.
    const rightLinks = new Map<string, string>()
    const rightLink = (linkId: string) => {
      if (!rightLinks.has(linkId)) rightLinks.set(linkId, uid())
      return rightLinks.get(linkId)
    }
    set((s) => ({
      clips: s.clips.flatMap((c) => {
        if (!ids.has(c.id)) return [c]
        const cut = playhead - c.start
        const right = { ...c, id: uid(), start: playhead, offset: sourceAt(c, playhead), duration: c.duration - cut, enter: undefined, linkId: c.linkId && rightLink(c.linkId) }
        rightIds.push(right.id)
        return [{ ...c, duration: cut, exit: undefined }, right]
      }),
      selectedClipIds: rightIds,
    }))
  },

  deleteSelected: () => {
    const locked = lockedTrackIds(get().tracks)
    const ids = new Set(selectedClips(get()).filter((c) => !locked.has(c.trackId)).map((c) => c.id))
    if (!ids.size) return
    get().checkpoint()
    set((s) => ({ clips: s.clips.filter((c) => !ids.has(c.id)), selectedClipIds: [] }))
  },

  toggleTrack: (id, key) => {
    get().checkpoint()
    set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, [key]: !t[key] } : t)) }))
  },

  clearTrack: (id) => {
    const { clips, tracks } = get()
    if (tracks.find((t) => t.id === id)?.locked || !clips.some((c) => c.trackId === id)) return
    get().checkpoint()
    set((s) => {
      const rest = s.clips.filter((c) => c.trackId !== id)
      return { clips: rest, selectedClipIds: s.selectedClipIds.filter((x) => rest.some((c) => c.id === x)) }
    })
  },

  selectAll: () => set((s) => ({ selectedClipIds: s.clips.map((c) => c.id) })),

  copySelected: () => {
    const picked = selectedClips(get())
    if (picked.length) set({ clipboard: picked })
  },

  cutSelected: () => {
    get().copySelected()
    get().deleteSelected()
  },

  pasteAt: (at) => placeCopies(get, set, get().clipboard, at),

  duplicateSelected: () => {
    const picked = selectedClips(get())
    if (picked.length) placeCopies(get, set, picked, Math.max(...picked.map(clipEnd)))
  },

  resetTransform: (id) => {
    get().checkpoint()
    set((s) => ({
      clips: s.clips.map((c) => (c.id === id ? { ...c, crop: undefined, keys: c.keys && Object.fromEntries(Object.entries(c.keys).filter(([prop]) => prop === "opacity" || prop === "volume")) } : c)),
    }))
    get().updateClipProps(id, { x: 0, y: 0, scale: 100, rotation: 0 })
  },

  detachAudio: () => {
    const targets = detachableClips(get())
    if (!targets.length) return
    get().checkpoint()
    let { tracks, clips } = get()
    const ids = new Set(targets.map((c) => c.id))
    clips = clips.map((c) => (ids.has(c.id) ? { ...c, audioDetached: true } : c))
    const detached: Clip[] = []
    const links = new Map<string, string>()
    for (const c of targets) {
      const linkId = c.linkId ?? uid()
      links.set(c.id, linkId)
      const start = c.start
      const end = clipEnd(c)
      const busy = (t: Track) => [...clips, ...detached].some((x) => x.trackId === t.id && x.start < end && clipEnd(x) > start)
      let track = tracks.find((t) => t.kind === "audio" && !t.locked && !busy(t))
      if (!track) {
        track = makeTrack(uid(), "audio", nextTrackName(tracks, "audio"))
        tracks = [...tracks, track]
      }
      detached.push({ ...c, id: uid(), trackId: track.id, type: "audio", props: { ...DEFAULT_PROPS, volume: c.props.volume }, audioDetached: false, linkId })
    }
    set({
      tracks,
      clips: [...clips.map((c) => (links.has(c.id) ? { ...c, linkId: links.get(c.id) } : c)), ...detached],
      selectedClipIds: [...detached.map((c) => c.id), ...targets.map((c) => c.id)],
    })
  },

  restoreAudio: (id) => {
    get().checkpoint()
    set((s) => ({ clips: s.clips.map((c) => (c.id === id ? { ...c, audioDetached: false } : c)) }))
  },

  linkSelected: () => {
    if (!canLinkSelection(get())) return
    get().checkpoint()
    const linkId = uid()
    set((s) => ({ clips: s.clips.map((c) => (s.selectedClipIds.includes(c.id) ? { ...c, linkId } : c)) }))
  },

  unlinkSelected: () => {
    if (!hasLinkedSelection(get())) return
    get().checkpoint()
    // Keep one clip selected, or the next drag would still move them all together.
    set((s) => ({
      clips: s.clips.map((c) => (s.selectedClipIds.includes(c.id) ? { ...c, linkId: undefined } : c)),
      selectedClipIds: s.selectedClipIds.slice(0, 1),
    }))
  },

  mergeSelected: () => {
    const runs = mergeableRuns(get())
    if (!runs.length) return
    get().checkpoint()
    const gone = new Set(runs.flatMap((run) => run.slice(1).map((c) => c.id)))
    const lasts = new Map(runs.map((run) => [run[0].id, run[run.length - 1]]))
    set((s) => ({
      clips: s.clips.filter((c) => !gone.has(c.id)).map((c) => {
        const last = lasts.get(c.id)
        return last ? { ...c, duration: clipEnd(last) - c.start, exit: last.exit } : c
      }),
      selectedClipIds: runs.map((run) => run[0].id),
    }))
  },

  addMarker: (at) => {
    const { markers, settings, playhead } = get()
    const frame = toFrame(at ?? playhead, settings.fps)
    if (markers.some((m) => m.at === frame)) return null
    get().checkpoint()
    const id = uid()
    set((s) => ({ markers: [...s.markers, { id, at: frame, name: "", color: "blue" as const }].sort((a, b) => a.at - b.at) }))
    return id
  },

  updateMarker: (id, patch) => {
    get().checkpoint()
    set((s) => ({ markers: s.markers.map((m) => (m.id === id ? { ...m, ...patch } : m)).sort((a, b) => a.at - b.at) }))
  },

  removeMarker: (id) => {
    get().checkpoint()
    set((s) => ({ markers: s.markers.filter((m) => m.id !== id) }))
  },

  jumpToMarker: (direction) => {
    const { markers, playhead, setPlayhead, setPlaying } = get()
    const stops = markers.map((m) => m.at)
    const next = direction > 0 ? stops.find((at) => at > playhead) : stops.filter((at) => at < playhead).pop()
    if (next === undefined) return
    setPlaying(false)
    setPlayhead(next)
  },

  addTrack: (kind) => {
    get().checkpoint()
    // The stack reads top down, so a new video track goes on top of the picture.
    set((s) => {
      const track = makeTrack(uid(), kind, nextTrackName(s.tracks, kind))
      return { tracks: kind === "video" ? [track, ...s.tracks] : [...s.tracks, track] }
    })
  },

  removeTrack: (id) => {
    const { tracks } = get()
    const track = tracks.find((t) => t.id === id)
    if (!track || track.locked || tracks.filter((t) => t.kind === track.kind).length < 2) return
    get().checkpoint()
    set((s) => {
      const clips = s.clips.filter((c) => c.trackId !== id)
      return { tracks: s.tracks.filter((t) => t.id !== id), clips, selectedClipIds: s.selectedClipIds.filter((x) => clips.some((c) => c.id === x)) }
    })
  },

  rippleDelete: () => {
    const locked = lockedTrackIds(get().tracks)
    const picked = selectedClips(get()).filter((c) => !locked.has(c.trackId))
    if (!picked.length) return
    get().checkpoint()
    const ids = new Set(picked.map((c) => c.id))
    const spans = picked.map((c): [number, number] => [c.start, clipEnd(c)])
    set((s) => ({ ...closeSpans(s.clips.filter((c) => !ids.has(c.id)), s.markers, spans, locked), selectedClipIds: [] }))
  },

  closeGapAt: (trackId, at) => {
    const { clips, tracks, markers } = get()
    const onTrack = clips.filter((c) => c.trackId === trackId)
    if (onTrack.some((c) => c.start <= at && clipEnd(c) > at)) return
    const next = Math.min(...onTrack.filter((c) => c.start > at).map((c) => c.start))
    if (!Number.isFinite(next)) return
    const before = Math.max(0, ...onTrack.filter((c) => clipEnd(c) <= at).map(clipEnd))
    get().checkpoint()
    set(closeSpans(clips, markers, [[before, next]], lockedTrackIds(tracks)))
  },

  setClipSpeed: (id, speed) => {
    const { clips, tracks, settings } = get()
    const clip = clips.find((c) => c.id === id)
    if (!clip) return
    const rate = Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed))
    const group = [clip, ...linkedWith(clips, clip)]
    const ids = new Set(group.map((c) => c.id))
    const resize = (c: Clip) => ({ ...c, speed: rate, duration: Math.max(frameTicks(settings.fps), toFrame(sourceSpan(c) / rate, settings.fps)) })
    const delta = resize(clip).duration - clip.duration
    const resized = clips.map((c) => (ids.has(c.id) ? resize(c) : c))
    // The clips after it follow, so a timelapse leaves no hole and a slowdown overwrites nothing.
    set({ clips: shiftAfter(resized, clipEnd(clip), delta, lockedTrackIds(tracks), ids) })
  },

  toggleKeyframe: (id, prop) => {
    const { clips, playhead, settings } = get()
    const clip = clips.find((c) => c.id === id)
    if (!clip || playhead < clip.start || playhead >= clipEnd(clip)) return
    const at = sourceAt(clip, playhead)
    const tolerance = (frameTicks(settings.fps) * speedOf(clip)) / 2
    const keys = clip.keys?.[prop] ?? []
    const value = keyedPropsAt(clip, playhead)[prop]
    const next = keyNear(keys, at, tolerance) ? withoutKey(keys, at, tolerance) : withKey(keys, at, value, tolerance)
    get().checkpoint()
    set((s) => ({ clips: s.clips.map((c) => (c.id === id ? { ...c, props: { ...c.props, [prop]: value }, keys: { ...c.keys, [prop]: next } } : c)) }))
  },

  clearKeyframes: (id, prop) => {
    get().checkpoint()
    set((s) => ({
      clips: s.clips.map((c) => {
        if (c.id !== id) return c
        const value = keyedPropsAt(c, Math.min(clipEnd(c) - 1, Math.max(c.start, s.playhead)))[prop]
        return { ...c, props: { ...c.props, [prop]: value }, keys: { ...c.keys, [prop]: [] } }
      }),
    }))
  },

  setEasing: (id, ease) => {
    const { clips, playhead } = get()
    const clip = clips.find((c) => c.id === id)
    if (!clip?.keys) return
    const at = sourceAt(clip, playhead)
    const keys = Object.fromEntries(
      ANIMATED.flatMap((prop) => {
        const list = clip.keys?.[prop]
        if (!list?.length) return []
        const last = list.filter((k) => k.at <= at).pop() ?? list[0]
        return [[prop, list.map((k) => (k === last ? { ...k, ease } : k))]]
      }),
    )
    get().checkpoint()
    set((s) => ({ clips: s.clips.map((c) => (c.id === id ? { ...c, keys: { ...c.keys, ...keys } } : c)) }))
  },

  setTransition: (id, side, transition) => {
    set((s) => ({ clips: s.clips.map((c) => (c.id === id ? { ...c, [side]: transition } : c)) }))
  },

  addFont: (font) => set((s) => ({ fonts: [...s.fonts.filter((f) => f.family !== font.family), font], mediaRevision: s.mediaRevision + 1 })),

  transact: (change) => {
    get().checkpoint()
    set(change)
  },
}))

/** The other audio tracks of a multi-track recording land under the video, linked to it. */
function placeCompanions(get: () => EditorState, set: (patch: Partial<EditorState>) => void, clip: Clip) {

  const { media, tracks, clips } = get()
  const main = media.find((m) => m.id === clip.mediaId)
  const extra = (main?.companions ?? []).map((id) => media.find((m) => m.id === id)).filter((m) => m?.status === "ready")

  if (!extra.length) return

  const linkId = uid()
  const end = clipEnd(clip)
  let allTracks = tracks
  const placed: Clip[] = []

  for (const m of extra) {

    const busy = (t: Track) => [...clips, ...placed].some((c) => c.trackId === t.id && c.start < end && clipEnd(c) > clip.start)
    let track = allTracks.find((t) => t.kind === "audio" && !t.locked && !busy(t))

    if (!track) {
      track = makeTrack(uid(), "audio", nextTrackName(allTracks, "audio"))
      allTracks = [...allTracks, track]
    }

    placed.push({ ...clip, id: uid(), trackId: track.id, type: "audio", mediaId: m!.id, name: m!.name, props: { ...DEFAULT_PROPS }, linkId })
  }

  set({ tracks: allTracks, clips: [...clips.map((c) => (c.id === clip.id ? { ...c, linkId } : c)), ...placed], selectedClipIds: [clip.id, ...placed.map((c) => c.id)] })
}

function placeCopies(get: () => EditorState, set: (patch: (s: EditorState) => Partial<EditorState>) => void, source: Clip[], at: number) {
  const state = get()
  const live = new Set(liveMedia(state).map((m) => m.id))
  const usable = source.filter((c) => state.tracks.some((t) => t.id === c.trackId && !t.locked) && (!c.mediaId || live.has(c.mediaId)))
  if (!usable.length) return
  const first = Math.min(...usable.map((c) => c.start))
  // Copies link to each other, never back to the originals.
  const links = new Map<string, string>()
  const copyLink = (linkId: string) => {
    if (!links.has(linkId)) links.set(linkId, uid())
    return links.get(linkId)
  }
  const copies = usable.map((c) => ({
    ...c,
    id: uid(),
    linkId: c.linkId && copyLink(c.linkId),
    start: toFrame(Math.max(0, at) + (c.start - first), state.settings.fps),
    props: { ...c.props },
    text: c.text && { ...c.text },
  }))
  state.checkpoint()
  set((s) => ({
    clips: copies.reduce((clips, c) => [...overwriteRange(clips, c.trackId, c.start, clipEnd(c)), c], s.clips),
    selectedClipIds: copies.map((c) => c.id),
  }))
}

// An unsaved project's default name is Slate's wording, not the user's, so it follows the language.
useLanguage.subscribe(({ language }, previous) => {
  const { projectPath, projectName, saved } = useEditor.getState()
  if (projectPath || projectName !== translate(previous.language, "project.untitled")) return
  const name = translate(language, "project.untitled")
  useEditor.setState({ projectName: name, saved: { ...saved, name } })
})