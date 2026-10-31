import { create } from "zustand"
import { clipEnd, clipTypeForMedia, DEFAULT_PROPS, linkedWith, lockedTrackIds, makeTrack, overwriteRange, projectDuration, regrid, trackKindFor } from "../lib/clips"
import { t, translate, useLanguage } from "../lib/i18n"
import { uid } from "../lib/platform"
import { frameTicks, sameFps, ticks, toFrame } from "../lib/time"
import { DEFAULT_SETTINGS, type Clip, type ClipProps, type MediaItem, type ProjectSettings, type TextProps, type Track } from "../types"
import { canLinkSelection, detachableClips, hasLinkedSelection, liveMedia, mergeableRuns, selectedClips } from "./selectors"

interface Snapshot {
  tracks: Track[]
  clips: Clip[]
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
  settings: ProjectSettings
  mediaRevision: number
}

export const MIN_ZOOM = 4
export const MAX_ZOOM = 600
const HISTORY_LIMIT = 200
const TITLE_DURATION = ticks(3)

const defaultTracks: Track[] = [makeTrack("v2", "video", "V2"), makeTrack("v1", "video", "V1"), makeTrack("a1", "audio", "A1"), makeTrack("a2", "audio", "A2")]

const snapshotOf = ({ tracks, clips, removedMediaIds, settings }: Snapshot): Snapshot => ({ tracks, clips, removedMediaIds, settings })

const markOf = (s: Pick<EditorState, "projectName" | "tracks" | "clips" | "settings" | "mediaRevision">): SavedMark => ({
  name: s.projectName,
  tracks: s.tracks,
  clips: s.clips,
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
  updateMedia: (id, patch) => set((s) => ({ media: patchMedia(s.media, id, patch) })),
  relinkMedia: (id, patch) => set((s) => ({ media: patchMedia(s.media, id, patch), mediaRevision: s.mediaRevision + 1 })),
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
        const right = { ...c, id: uid(), start: playhead, offset: c.offset + cut, duration: c.duration - cut, linkId: c.linkId && rightLink(c.linkId) }
        rightIds.push(right.id)
        return [{ ...c, duration: cut }, right]
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
        const n = tracks.filter((t) => t.kind === "audio").length + 1
        track = makeTrack(uid(), "audio", `A${n}`)
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