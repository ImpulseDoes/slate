import { create } from "zustand"
import { DEFAULT_SETTINGS, type Clip, type ClipProps, type ClipType, type MediaItem, type ProjectSettings, type TextProps, type Track, type TrackKind } from "../types"
import { frameTicks, sameFps, ticks, toFrame, type Fps } from "../lib/time"
import { uid } from "../lib/platform"

interface Snapshot {
  tracks: Track[]
  clips: Clip[]
  removedMediaIds: string[]
  settings: ProjectSettings
}

/** A whole project, as opened from disk or started fresh. */
export interface ProjectDocument {
  id: string
  path: string | null
  name: string
  settings: ProjectSettings
  media: MediaItem[]
  tracks: Track[]
  clips: Clip[]
  playhead: number
  pxPerSec: number
  snapping: boolean
}

export interface EditorState {
  /** Stable across renames and moves; names the autosave file. */
  projectId: string
  projectPath: string | null
  projectName: string
  settings: ProjectSettings
  /** The document as last saved, compared by reference to tell whether it changed. */
  saved: SavedMark
  /** Bumped when the media list changes in a way worth saving. */
  mediaRevision: number
  media: MediaItem[]
  /** Media taken out of the project but kept so undo can bring it and its clips back. */
  removedMediaIds: string[]
  tracks: Track[]
  clips: Clip[]
  selectedClipIds: string[]
  selectedMediaId: string | null
  playhead: number
  playing: boolean
  /** Timeline zoom, pixels per second. */
  pxPerSec: number
  snapping: boolean
  /** Always show the center lines on the viewer, not just while dragging. */
  showGuides: boolean
  past: Snapshot[]
  future: Snapshot[]
  /** Clips held by Copy or Cut, ready to paste. */
  clipboard: Clip[]

  /** Replace the whole project. Dirty marks it as differing from what's on disk, as a recovered project does. */
  loadDocument: (doc: ProjectDocument, dirty?: boolean) => void
  markSaved: (path: string, name: string) => void
  /** Change resolution, frame rate or name. A new frame rate moves clips onto its grid. */
  updateSettings: (name: string, settings: ProjectSettings) => void

  addMedia: (items: MediaItem[]) => void
  updateMedia: (id: string, patch: Partial<MediaItem>) => void
  /** Point media at a new file, keeping every clip that uses it. */
  relinkMedia: (id: string, patch: Partial<MediaItem>) => void
  removeMedia: (id: string) => void
  selectMedia: (id: string | null) => void

  setPlayhead: (t: number) => void
  setPlaying: (playing: boolean) => void
  togglePlay: () => void
  setZoom: (pxPerSec: number) => void
  toggleSnapping: () => void
  toggleGuides: () => void

  /** Selects the clip with its linked clips. "add" extends the selection; "solo" ignores links. */
  selectClip: (id: string, mode?: "add" | "solo") => void
  clearSelection: () => void

  /** Save the current timeline so the next change can be undone. */
  checkpoint: () => void
  undo: () => void
  redo: () => void

  /** Place media (or a title when mediaId is null) on a track. Overwrites what's underneath. */
  insertClip: (mediaId: string | null, trackId: string, start: number) => void
  addTitle: () => void
  /** Commit a drag: one undo step, overwriting whatever the clips landed on. */
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
  /** Paste the clipboard so its first clip begins at `at`, on the tracks it came from. */
  pasteAt: (at: number) => void
  /** Copy the selection to just after its own end. */
  duplicateSelected: () => void
  resetTransform: (id: string) => void
  /** Move the sound of the selected video clips into audio clips of their own. */
  detachAudio: () => void
  /** Let a detached video clip play its own sound again. */
  restoreAudio: (id: string) => void
  linkSelected: () => void
  unlinkSelected: () => void
  /** Rejoin neighboring clips cut from the same source, the reverse of a split. */
  mergeSelected: () => void
}

export interface ClipEdit {
  id: string
  trackId: string
  start: number
  offset: number
  duration: number
}

/** The parts of a project that make it differ from what's on disk. */
export interface SavedMark {
  name: string
  tracks: Track[]
  clips: Clip[]
  settings: ProjectSettings
  mediaRevision: number
}

export const MIN_ZOOM = 4
export const MAX_ZOOM = 600
const HISTORY_LIMIT = 200
const STILL_DURATION = ticks(5)
const TITLE_DURATION = ticks(3)

export const DEFAULT_PROPS: ClipProps = { x: 0, y: 0, scale: 100, rotation: 0, opacity: 100, volume: 100 }

export const defaultTracks: Track[] = [
  { id: "v2", kind: "video", name: "V2", hidden: false, muted: false, locked: false },
  { id: "v1", kind: "video", name: "V1", hidden: false, muted: false, locked: false },
  { id: "a1", kind: "audio", name: "A1", hidden: false, muted: false, locked: false },
  { id: "a2", kind: "audio", name: "A2", hidden: false, muted: false, locked: false },
]

export const clipEnd = (c: Clip) => c.start + c.duration

const markOf = (s: Pick<EditorState, "projectName" | "tracks" | "clips" | "settings" | "mediaRevision">): SavedMark => ({
  name: s.projectName,
  tracks: s.tracks,
  clips: s.clips,
  settings: s.settings,
  mediaRevision: s.mediaRevision,
})

/** Whether the project differs from its last save. Undoing back to that save counts as clean. */
export const isDirty = (s: EditorState) =>
  s.saved.name !== s.projectName ||
  s.saved.tracks !== s.tracks ||
  s.saved.clips !== s.clips ||
  s.saved.settings !== s.settings ||
  s.saved.mediaRevision !== s.mediaRevision

export const newProject = (): ProjectDocument => ({
  id: crypto.randomUUID(),
  path: null,
  name: "Untitled project",
  settings: DEFAULT_SETTINGS,
  media: [],
  tracks: defaultTracks,
  clips: [],
  playhead: 0,
  pxPerSec: 60,
  snapping: true,
})

/** Which kind of track a clip type lives on. Titles sit on video tracks. */
export const trackKindFor = (type: ClipType): TrackKind => (type === "audio" ? "audio" : "video")

export const clipTypeForMedia = (m: MediaItem): ClipType => (m.kind === "audio" ? "audio" : "video")

/** Media still in the project, for anything that lists it. */
export const liveMedia = (s: Pick<EditorState, "media" | "removedMediaIds">) => s.media.filter((m) => !s.removedMediaIds.includes(m.id))

/** Other clips that cut and move together with this one. */
export const linkedWith = (clips: Clip[], clip: Clip) => (clip.linkId ? clips.filter((c) => c.linkId === clip.linkId && c.id !== clip.id) : [])

export function canLinkSelection(s: Pick<EditorState, "clips" | "selectedClipIds">) {
  const picked = s.clips.filter((c) => s.selectedClipIds.includes(c.id))
  return picked.length > 1 && !picked.every((c) => c.linkId && c.linkId === picked[0].linkId)
}

export const hasLinkedSelection = (s: Pick<EditorState, "clips" | "selectedClipIds">) =>
  s.clips.some((c) => s.selectedClipIds.includes(c.id) && linkedWith(s.clips, c).length > 0)

/** Whether b picks up exactly where a stops, looking the same, so joining them changes nothing on screen. */
function continues(a: Clip, b: Clip, media: MediaItem[], fps: Fps) {
  const tolerance = frameTicks(fps) / 2
  const sameLook = JSON.stringify([a.props, a.text, !!a.audioDetached]) === JSON.stringify([b.props, b.text, !!b.audioDetached])
  if (a.type !== b.type || a.mediaId !== b.mediaId || !sameLook || Math.abs(clipEnd(a) - b.start) > tolerance) return false
  const timed = media.find((m) => m.id === a.mediaId)?.kind !== "image" && a.type !== "text"
  return !timed || Math.abs(a.offset + a.duration - b.offset) <= tolerance
}

/**
 * Runs of clips the selection can merge. One selected clip on a track reaches
 * both neighbors; with several, only the selected ones join.
 */
export function mergeableRuns(s: Pick<EditorState, "clips" | "media" | "tracks" | "selectedClipIds" | "settings">): Clip[][] {
  const selected = new Set(s.selectedClipIds)
  const runs: Clip[][] = []
  for (const track of s.tracks) {
    if (track.locked) continue
    const onTrack = s.clips.filter((c) => c.trackId === track.id).sort((a, b) => a.start - b.start)
    const single = onTrack.filter((c) => selected.has(c.id)).length === 1
    let run: Clip[] = []
    const flush = () => {
      if (run.length > 1 && run.some((c) => selected.has(c.id))) runs.push(run)
    }
    for (const c of onTrack) {
      const last = run[run.length - 1]
      if (last && continues(last, c, s.media, s.settings.fps) && (single || (selected.has(last.id) && selected.has(c.id)))) {
        run.push(c)
      } else {
        flush()
        run = [c]
      }
    }
    flush()
  }
  return runs
}

/** A video clip that still carries its own sound. */
export const canDetachAudio = (clip: Clip, media?: MediaItem) => clip.type === "video" && !clip.audioDetached && media?.kind === "video" && media.hasAudio !== false

/** Selected clips whose audio can be detached right now. */
export function detachableClips(s: Pick<EditorState, "clips" | "media" | "tracks" | "selectedClipIds">): Clip[] {
  return s.clips.filter(
    (c) =>
      s.selectedClipIds.includes(c.id) &&
      canDetachAudio(c, s.media.find((m) => m.id === c.mediaId)) &&
      !s.tracks.find((t) => t.id === c.trackId)?.locked,
  )
}

export function projectDuration(clips: Clip[]): number {
  return clips.reduce((max, c) => Math.max(max, clipEnd(c)), 0)
}

/**
 * Clear [s, e) on a track the way an overwrite edit does: clips fully inside are
 * removed, clips crossing an edge are trimmed, a clip covering the whole range is split.
 */
export function overwriteRange(clips: Clip[], trackId: string, s: number, e: number, excludeId?: string): Clip[] {
  const out: Clip[] = []
  for (const c of clips) {
    if (c.trackId !== trackId || c.id === excludeId) {
      out.push(c)
      continue
    }
    const cs = c.start
    const ce = clipEnd(c)
    if (ce <= s || cs >= e) {
      out.push(c)
    } else if (cs >= s && ce <= e) {
      // fully covered: drop it
    } else if (cs < s && ce > e) {
      out.push({ ...c, duration: s - cs })
      out.push({ ...c, id: uid(), start: e, offset: c.offset + (e - cs), duration: ce - e })
    } else if (cs < s) {
      out.push({ ...c, duration: s - cs })
    } else {
      out.push({ ...c, start: e, offset: c.offset + (e - cs), duration: ce - e })
    }
  }
  return out
}

/** Longest a clip may run from a given source offset. Infinity for stills and titles. */
export function maxDurationFor(clip: Clip, media: MediaItem[], fps: Fps): number {
  if (!clip.mediaId) return Infinity
  const m = media.find((x) => x.id === clip.mediaId)
  if (!m || m.kind === "image") return Infinity
  return Math.max(frameTicks(fps), m.duration - clip.offset)
}

/** The same clips on a new frame grid: both edges snap, and none shrinks to nothing. */
function regrid(clips: Clip[], fps: Fps): Clip[] {
  return clips.map((c) => {
    const start = toFrame(c.start, fps)
    return { ...c, start, duration: Math.max(frameTicks(fps), toFrame(clipEnd(c), fps) - start) }
  })
}

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
      set((s) => ({ settings, clips: sameFps(old.fps, settings.fps) ? s.clips : regrid(s.clips, settings.fps), playhead: toFrame(s.playhead, settings.fps) }))
    }
    if (name !== projectName) set({ projectName: name })
  },

  addMedia: (items) => set((s) => ({ media: [...s.media, ...items], mediaRevision: s.mediaRevision + 1 })),
  updateMedia: (id, patch) => set((s) => ({ media: s.media.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
  relinkMedia: (id, patch) => set((s) => ({ media: s.media.map((m) => (m.id === id ? { ...m, ...patch } : m)), mediaRevision: s.mediaRevision + 1 })),
  removeMedia: (id) => {
    get().checkpoint()
    set((s) => {
      const clips = s.clips.filter((c) => c.mediaId !== id)
      return {
        removedMediaIds: [...s.removedMediaIds, id],
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
      past: [...s.past.slice(-HISTORY_LIMIT + 1), { tracks: s.tracks, clips: s.clips, removedMediaIds: s.removedMediaIds, settings: s.settings }],
      future: [],
    })),
  undo: () => {
    const { past, tracks, clips, removedMediaIds, settings, future } = get()
    const prev = past[past.length - 1]
    if (!prev) return
    set({ ...prev, past: past.slice(0, -1), future: [{ tracks, clips, removedMediaIds, settings }, ...future], selectedClipIds: [] })
  },
  redo: () => {
    const { past, tracks, clips, removedMediaIds, settings, future } = get()
    const next = future[0]
    if (!next) return
    set({ ...next, future: future.slice(1), past: [...past, { tracks, clips, removedMediaIds, settings }], selectedClipIds: [] })
  },

  insertClip: (mediaId, trackId, start) => {
    const { media, tracks, settings } = get()
    const { fps } = settings
    const track = tracks.find((t) => t.id === trackId)
    if (!track || track.locked) return
    let clip: Clip
    if (mediaId) {
      const m = media.find((x) => x.id === mediaId)
      if (!m || m.status !== "ready") return
      const type = clipTypeForMedia(m)
      if (trackKindFor(type) !== track.kind) return
      clip = {
        id: uid(),
        trackId,
        type,
        mediaId,
        name: m.name,
        start: toFrame(Math.max(0, start), fps),
        offset: 0,
        duration: Math.max(frameTicks(fps), toFrame(m.kind === "image" ? STILL_DURATION : m.duration, fps)),
        props: { ...DEFAULT_PROPS },
      }
    } else {
      if (track.kind !== "video") return
      clip = {
        id: uid(),
        trackId,
        type: "text",
        name: "Title",
        start: toFrame(Math.max(0, start), fps),
        offset: 0,
        duration: toFrame(TITLE_DURATION, fps),
        props: { ...DEFAULT_PROPS },
        text: { content: "Your title here", size: 96, color: "#ffffff" },
      }
    }
    get().checkpoint()
    set((s) => ({
      clips: [...overwriteRange(s.clips, trackId, clip.start, clipEnd(clip)), clip],
      selectedClipIds: [clip.id],
    }))
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
    set((s) => ({ clips: s.clips.map((c) => (c.id === id ? { ...c, props: { ...c.props, ...patch } } : c)) })),

  updateClipText: (id, patch) =>
    set((s) => ({
      clips: s.clips.map((c) =>
        c.id === id && c.text
          ? { ...c, text: { ...c.text, ...patch }, name: patch.content !== undefined ? patch.content.split("\n")[0] || "Title" : c.name }
          : c,
      ),
    })),

  splitAtPlayhead: () => {
    const { clips, selectedClipIds, tracks, settings } = get()
    const playhead = toFrame(get().playhead, settings.fps)
    const frame = frameTicks(settings.fps)
    const locked = new Set(tracks.filter((t) => t.locked).map((t) => t.id))
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
        const right = { ...c, id: uid(), start: playhead, offset: c.offset + cut, duration: c.duration - cut, linkId: c.linkId && rightLink(c.linkId) }
        rightIds.push(right.id)
        return [{ ...c, duration: cut }, right]
      }),
      selectedClipIds: rightIds,
    }))
  },

  deleteSelected: () => {
    const { selectedClipIds, clips, tracks } = get()
    const locked = new Set(tracks.filter((t) => t.locked).map((t) => t.id))
    const ids = new Set(clips.filter((c) => selectedClipIds.includes(c.id) && !locked.has(c.trackId)).map((c) => c.id))
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
    const { clips, selectedClipIds } = get()
    const picked = clips.filter((c) => selectedClipIds.includes(c.id))
    if (picked.length) set({ clipboard: picked })
  },

  cutSelected: () => {
    get().copySelected()
    get().deleteSelected()
  },

  pasteAt: (at) => placeCopies(get, set, get().clipboard, at),

  duplicateSelected: () => {
    const { clips, selectedClipIds } = get()
    const picked = clips.filter((c) => selectedClipIds.includes(c.id))
    if (picked.length) placeCopies(get, set, picked, Math.max(...picked.map(clipEnd)))
  },

  resetTransform: (id) => {
    get().checkpoint()
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
      // Stay in sync by default; Unlink frees them.
      const linkId = c.linkId ?? uid()
      links.set(c.id, linkId)
      const start = c.start
      const end = clipEnd(c)
      const busy = (t: Track) => [...clips, ...detached].some((x) => x.trackId === t.id && x.start < end && clipEnd(x) > start)
      let track = tracks.find((t) => t.kind === "audio" && !t.locked && !busy(t))
      if (!track) {
        const n = tracks.filter((t) => t.kind === "audio").length + 1
        track = { id: uid(), kind: "audio", name: `A${n}`, hidden: false, muted: false, locked: false }
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
    const ends = new Map(runs.map((run) => [run[0].id, clipEnd(run[run.length - 1])]))
    set((s) => ({
      clips: s.clips.filter((c) => !gone.has(c.id)).map((c) => (ends.has(c.id) ? { ...c, duration: ends.get(c.id)! - c.start } : c)),
      selectedClipIds: runs.map((run) => run[0].id),
    }))
  },
}))

/**
 * Drop fresh copies of clips onto their own tracks, keeping their spacing, with
 * the earliest landing at `at`. Clips on locked tracks or whose media is gone are skipped.
 */
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

/** Drag of a media-bin item toward the timeline, tracked outside React's tree. */
interface MediaDrag {
  mediaId: string
  x: number
  y: number
}
export const useMediaDrag = create<{ drag: MediaDrag | null; set: (d: MediaDrag | null) => void }>((set) => ({
  drag: null,
  set: (drag) => set({ drag }),
}))