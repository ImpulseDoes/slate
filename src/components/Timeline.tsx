import { memo, useEffect, useMemo, useRef, useState } from "react"
import {
  AudioWave01Icon,
  ClipboardPasteIcon,
  CombineIcon,
  Copy01Icon,
  CopyPlusIcon,
  Cursor01Icon,
  Delete02Icon,
  FitToScreenIcon,
  Link01Icon,
  Magnet01Icon,
  Refresh01Icon,
  Scissor01Icon,
  SquareSplitHorizontalIcon,
  SquareLock02Icon,
  SquareUnlock02Icon,
  TextIcon,
  Unlink01Icon,
  ViewIcon,
  ViewOffSlashIcon,
  VolumeHighIcon,
  VolumeMute02Icon,
  ZoomInAreaIcon,
  ZoomOutAreaIcon,
} from "@hugeicons/core-free-icons"
import { canDetachAudio, canLinkSelection, clipEnd, clipTypeForMedia, detachableClips, hasLinkedSelection, linkedWith, maxDurationFor, mergeableRuns, MAX_ZOOM, MIN_ZOOM, projectDuration, trackKindFor, useEditor, useMediaDrag } from "../store/editor"
import { FRAME, rulerLabel, toFrame } from "../lib/time"
import { PEAKS_PER_SECOND, type Clip, type MediaItem, type Track } from "../types"
import type { ClipEdit } from "../store/editor"
import { MOD } from "../lib/platform"
import { openMenu, type MenuEntry } from "./overlays"
import { Button, Icon, Tip } from "./ui"

const HEADER_W = 128
const RULER_H = 28
const TRACK_H = { video: 60, audio: 44 } as const
const CLIP_LABEL_H = 18
const SNAP_PX = 8
/** Extra room after the last clip so there's always somewhere to drop. */
const TAIL_SECONDS = 30

const CLIP_STYLE = {
  video: "bg-clip-video text-clip-video-strong",
  image: "bg-clip-image text-clip-image-strong",
  audio: "bg-clip-audio text-clip-audio-strong",
  text: "bg-clip-text text-clip-text-strong",
} as const

type DragMode = "move" | "trim-l" | "trim-r"

export function Timeline({ height }: { height: number }) {
  const tracks = useEditor((s) => s.tracks)
  const clips = useEditor((s) => s.clips)
  const media = useEditor((s) => s.media)
  const pps = useEditor((s) => s.pxPerSec)
  const selected = useEditor((s) => s.selectedClipIds)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ left: 0, width: 1000 })
  const [draft, setDraft] = useState<ClipEdit[] | null>(null)

  const mediaById = useMemo(() => new Map(media.map((m) => [m.id, m])), [media])
  const duration = projectDuration(clips)
  const contentSeconds = Math.max(duration + TAIL_SECONDS, (view.width - HEADER_W) / pps)
  const contentW = Math.ceil(contentSeconds * pps)

  useScrollSync(scrollRef, setView)
  useWheelZoom(scrollRef)
  useFollowPlayhead(scrollRef, view)

  const fit = () => {
    const el = scrollRef.current
    const { clips: all, setZoom } = useEditor.getState()
    const end = projectDuration(all)
    if (!el || end <= 0) return
    setZoom((el.clientWidth - HEADER_W - 32) / end)
    el.scrollLeft = 0
  }

  /** Scrub the playhead from a pointer event on the ruler or an empty lane. */
  const scrub = (e: React.PointerEvent, el: HTMLElement) => {
    const rect = el.getBoundingClientRect()
    const at = (x: number) => useEditor.getState().setPlayhead((x - rect.left) / useEditor.getState().pxPerSec)
    useEditor.getState().setPlaying(false)
    at(e.clientX)
    el.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => at(ev.clientX)
    const up = () => {
      el.removeEventListener("pointermove", move)
      el.removeEventListener("pointerup", up)
    }
    el.addEventListener("pointermove", move)
    el.addEventListener("pointerup", up)
  }

  const beginClipDrag = (e: React.PointerEvent, clip: Clip, mode: DragMode) => {
    const state = useEditor.getState()
    const track = state.tracks.find((t) => t.id === clip.trackId)
    if (e.button !== 0 || !track || track.locked) return
    e.stopPropagation()
    // Ctrl/⌘ works on this one clip, ignoring its links and the rest of the selection.
    const solo = e.ctrlKey || e.metaKey
    if (solo) state.selectClip(clip.id, "solo")
    else if (e.shiftKey) state.selectClip(clip.id, "add")
    else if (!state.selectedClipIds.includes(clip.id)) state.selectClip(clip.id)

    const { clips: all, selectedClipIds, tracks: allTracks, media } = useEditor.getState()
    const locked = new Set(allTracks.filter((t) => t.locked).map((t) => t.id))
    const linked = linkedWith(all, clip)
    const others = solo ? [] : all.filter((c) => c.id !== clip.id && !locked.has(c.trackId) && (selectedClipIds.includes(c.id) || linked.includes(c)))
    const group = [clip, ...others]
    const earliest = Math.min(...group.map((c) => c.start))
    // A trim takes along only the clips whose edge lines up with the one being dragged.
    const edge = mode === "trim-l" ? (c: Clip) => c.start : clipEnd
    const trimmed = group.filter((c) => Math.abs(edge(c) - edge(clip)) < FRAME / 2)
    const earliestStart = Math.max(0, ...trimmed.map((c) => (maxDurationFor(c, media) === Infinity ? 0 : c.start - c.offset)))
    const latestStart = Math.min(...trimmed.map((c) => clipEnd(c) - FRAME))
    const earliestEnd = Math.max(...trimmed.map((c) => c.start + FRAME))
    const latestEnd = Math.min(...trimmed.map((c) => c.start + maxDurationFor(c, media)))
    const toEdit = (c: Clip): ClipEdit => ({ id: c.id, trackId: c.trackId, start: c.start, offset: c.offset, duration: c.duration })

    // Listen on window: moving to another track remounts the clip element.
    const startX = e.clientX
    const scale = state.pxPerSec
    const snapPoints = state.snapping
      ? [0, state.playhead, ...all.filter((c) => !group.includes(c)).flatMap((c) => [c.start, clipEnd(c)])]
      : []
    const snap = (t: number) => {
      let best = t
      let bestDist = SNAP_PX / scale
      for (const p of snapPoints) {
        const d = Math.abs(p - t)
        if (d < bestDist) {
          best = p
          bestDist = d
        }
      }
      return best
    }

    let current = group.map(toEdit)
    let trackId = clip.trackId
    let moved = false

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      if (!moved && Math.abs(dx) < 3 && mode === "move" && Math.abs(ev.clientY - e.clientY) < 3) return
      moved = true
      const dt = dx / scale
      if (mode === "move") {
        const lowest = clip.start - earliest
        let start = Math.max(lowest, clip.start + dt)
        // Snap whichever edge lands closer. An edge with nothing nearby reports 0, so it can't win.
        const byStart = snap(start) - start
        const byEnd = snap(start + clip.duration) - (start + clip.duration)
        start += !byStart ? byEnd : !byEnd || Math.abs(byStart) <= Math.abs(byEnd) ? byStart : byEnd
        const lane = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("[data-track-id]")
        const target = lane && useEditor.getState().tracks.find((t) => t.id === lane.dataset.trackId)
        if (target && !target.locked && target.kind === trackKindFor(clip.type)) trackId = target.id
        const shift = toFrame(Math.max(lowest, start)) - clip.start
        current = group.map((c) => ({ ...toEdit(c), start: toFrame(c.start + shift), trackId: c.id === clip.id ? trackId : c.trackId }))
      } else if (mode === "trim-l") {
        const shift = toFrame(Math.min(latestStart, Math.max(earliestStart, snap(clip.start + dt)))) - clip.start
        current = trimmed.map((c) => ({ ...toEdit(c), start: c.start + shift, offset: Math.max(0, c.offset + shift), duration: c.duration - shift }))
      } else {
        const change = toFrame(Math.min(latestEnd, Math.max(earliestEnd, snap(clipEnd(clip) + dt)))) - clipEnd(clip)
        current = trimmed.map((c) => ({ ...toEdit(c), duration: c.duration + change }))
      }
      setDraft(current)
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      setDraft(null)
      if (!moved) return
      useEditor.getState().applyClipEdits(current)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  const shown = draft ? clips.map((c) => ({ ...c, ...draft.find((d) => d.id === c.id) })) : clips
  const linkSizes = new Map<string, number>()
  for (const c of clips) if (c.linkId) linkSizes.set(c.linkId, (linkSizes.get(c.linkId) ?? 0) + 1)

  return (
    <section className="flex shrink-0 flex-col overflow-hidden rounded-xl bg-surface shadow-card" style={{ height }}>
      <Toolbar onFit={fit} />
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto">
        <div className="relative min-h-full" style={{ width: HEADER_W + contentW }}>
          <Ruler pps={pps} width={contentW} view={view} selection={selectionRange(clips, selected)} onScrub={scrub} />
          {tracks.map((t) => (
            <div key={t.id} className="flex border-b border-border" style={{ height: TRACK_H[t.kind] }}>
              <TrackHeader track={t} onContextMenu={(e) => trackMenu(e, t)} />
              <div
                data-track-id={t.id}
                className={`relative shrink-0 ${t.hidden ? "opacity-50" : ""}`}
                style={{ width: contentW }}
                onPointerDown={(e) => {
                  if (e.button !== 0) return
                  useEditor.getState().clearSelection()
                  scrub(e, e.currentTarget)
                }}
                onContextMenu={(e) => laneMenu(e, t, (e.clientX - e.currentTarget.getBoundingClientRect().left) / pps, fit)}
              >
                {shown
                  .filter((c) => c.trackId === t.id)
                  .map((c) => (
                    <ClipView
                      key={c.id}
                      clip={c}
                      media={c.mediaId ? mediaById.get(c.mediaId) : undefined}
                      pps={pps}
                      height={TRACK_H[t.kind]}
                      selected={selected.includes(c.id)}
                      dragging={!!draft?.some((d) => d.id === c.id)}
                      linked={(linkSizes.get(c.linkId ?? "") ?? 0) > 1}
                      locked={t.locked}
                      onDragStart={beginClipDrag}
                    />
                  ))}
                <DropPreview track={t} pps={pps} />
              </div>
            </div>
          ))}
          <Playhead pps={pps} />
        </div>
      </div>
    </section>
  )
}

function selectionRange(clips: Clip[], ids: string[]): [number, number] | null {
  const sel = clips.filter((c) => ids.includes(c.id))
  if (!sel.length) return null
  return [Math.min(...sel.map((c) => c.start)), Math.max(...sel.map(clipEnd))]
}

function clipMenu(e: React.MouseEvent, clip: Clip, locked: boolean) {
  const s = useEditor.getState()
  if (!s.selectedClipIds.includes(clip.id)) s.selectClip(clip.id)
  const now = useEditor.getState()
  const links: MenuEntry[] = [
    ...(canLinkSelection(now) ? [{ label: "Link clips", icon: Link01Icon, kbd: `${MOD} L`, onSelect: s.linkSelected }] : []),
    ...(hasLinkedSelection(now) ? [{ label: "Unlink", icon: Unlink01Icon, kbd: `${MOD} ⇧ L`, onSelect: s.unlinkSelected }] : []),
  ]
  const underPlayhead = s.playhead > clip.start && s.playhead < clipEnd(clip)
  const media = s.media.find((m) => m.id === clip.mediaId)
  const audio: MenuEntry[] = clip.audioDetached
    ? [{ label: "Restore clip audio", icon: VolumeHighIcon, disabled: locked, onSelect: () => s.restoreAudio(clip.id) }]
    : clip.type === "video" && media?.kind === "video"
      ? [{ label: "Detach audio", icon: AudioWave01Icon, kbd: "A", disabled: locked || !canDetachAudio(clip, media), onSelect: s.detachAudio }]
      : []
  openMenu(e, [
    { label: "Cut", icon: Scissor01Icon, kbd: `${MOD} X`, disabled: locked, onSelect: s.cutSelected },
    { label: "Copy", icon: Copy01Icon, kbd: `${MOD} C`, onSelect: s.copySelected },
    { label: "Duplicate", icon: CopyPlusIcon, kbd: `${MOD} D`, disabled: locked, onSelect: s.duplicateSelected },
    "divider",
    { label: "Split at playhead", icon: SquareSplitHorizontalIcon, kbd: "S", disabled: locked || !underPlayhead, onSelect: s.splitAtPlayhead },
    { label: "Merge clips", icon: CombineIcon, kbd: "M", disabled: locked || !mergeableRuns(now).length, onSelect: s.mergeSelected },
    ...audio,
    ...links,
    ...(clip.type === "audio" ? [] : [{ label: "Reset transform", icon: Refresh01Icon, disabled: locked, onSelect: () => s.resetTransform(clip.id) }]),
    "divider",
    { label: "Delete", icon: Delete02Icon, kbd: "Del", danger: true, disabled: locked, onSelect: s.deleteSelected },
  ])
}

function laneMenu(e: React.MouseEvent, track: Track, at: number, fit: () => void) {
  const s = useEditor.getState()
  const title: MenuEntry[] = track.kind === "video" ? [{ label: "Add title here", icon: TextIcon, disabled: track.locked, onSelect: () => s.insertClip(null, track.id, at) }] : []
  openMenu(e, [
    { label: "Paste here", icon: ClipboardPasteIcon, kbd: `${MOD} V`, disabled: !s.clipboard.length, onSelect: () => s.pasteAt(at) },
    ...title,
    { label: "Move playhead here", icon: Cursor01Icon, onSelect: () => s.setPlayhead(at) },
    "divider",
    { label: "Snapping", icon: Magnet01Icon, kbd: "N", checked: s.snapping, onSelect: s.toggleSnapping },
    { label: "Fit timeline to window", icon: FitToScreenIcon, disabled: !s.clips.length, onSelect: fit },
  ])
}

function trackMenu(e: React.MouseEvent, track: Track) {
  const s = useEditor.getState()
  const visual = track.kind === "video"
  openMenu(e, [
    ...(visual ? [{ label: track.hidden ? "Show track" : "Hide track", icon: track.hidden ? ViewIcon : ViewOffSlashIcon, onSelect: () => s.toggleTrack(track.id, "hidden") }] : []),
    { label: track.muted ? "Unmute track" : "Mute track", icon: track.muted ? VolumeHighIcon : VolumeMute02Icon, onSelect: () => s.toggleTrack(track.id, "muted") },
    { label: track.locked ? "Unlock track" : "Lock track", icon: track.locked ? SquareUnlock02Icon : SquareLock02Icon, onSelect: () => s.toggleTrack(track.id, "locked") },
    "divider",
    { label: "Clear track", icon: Delete02Icon, danger: true, disabled: track.locked || !s.clips.some((c) => c.trackId === track.id), onSelect: () => s.clearTrack(track.id) },
  ])
}

function Toolbar({ onFit }: { onFit: () => void }) {
  const snapping = useEditor((s) => s.snapping)
  const pps = useEditor((s) => s.pxPerSec)
  const hasSelection = useEditor((s) => s.selectedClipIds.length > 0)
  const hasClips = useEditor((s) => s.clips.length > 0)
  const canDetach = useEditor((s) => detachableClips(s).length > 0)
  const canLink = useEditor(canLinkSelection)
  const canUnlink = useEditor(hasLinkedSelection)
  const canMerge = useEditor((s) => mergeableRuns(s).length > 0)
  const { splitAtPlayhead, detachAudio, linkSelected, unlinkSelected, mergeSelected, deleteSelected, addTitle, toggleSnapping, setZoom } = useEditor.getState()
  // Zoom slider works on a log scale so both ends feel equally fine-grained.
  const toSlider = (v: number) => Math.log(v / MIN_ZOOM) / Math.log(MAX_ZOOM / MIN_ZOOM)
  const fromSlider = (v: number) => MIN_ZOOM * Math.pow(MAX_ZOOM / MIN_ZOOM, v)

  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-3">
      <Tip label="Split at playhead" kbd="S">
        <Button variant="quiet" icon={SquareSplitHorizontalIcon} onClick={splitAtPlayhead} disabled={!hasClips}>
          Split
        </Button>
      </Tip>
      <Tip label="Move the sound to its own track" kbd="A">
        <Button variant="quiet" icon={AudioWave01Icon} onClick={detachAudio} disabled={!canDetach}>
          Detach audio
        </Button>
      </Tip>
      {canLink || !canUnlink ? (
        <Tip label="Cut and move these clips together" kbd={`${MOD} L`}>
          <Button variant="quiet" icon={Link01Icon} onClick={linkSelected} disabled={!canLink}>
            Link
          </Button>
        </Tip>
      ) : (
        <Tip label="Let these clips move on their own" kbd={`${MOD} ⇧ L`}>
          <Button variant="quiet" icon={Unlink01Icon} onClick={unlinkSelected}>
            Unlink
          </Button>
        </Tip>
      )}
      <Tip label="Rejoin clips cut from the same source" kbd="M">
        <Button variant="quiet" icon={CombineIcon} onClick={mergeSelected} disabled={!canMerge}>
          Merge
        </Button>
      </Tip>
      <Tip label="Delete" kbd="Del">
        <Button variant="quiet" icon={Delete02Icon} onClick={deleteSelected} disabled={!hasSelection}>
          Delete
        </Button>
      </Tip>
      <Tip label="Add title at playhead" kbd="T">
        <Button variant="quiet" icon={TextIcon} onClick={addTitle}>
          Title
        </Button>
      </Tip>
      <div className="flex-1" />
      <Tip label={snapping ? "Snapping on" : "Snapping off"} kbd="N">
        <Button variant="quiet" icon={Magnet01Icon} active={snapping} onClick={toggleSnapping} aria-pressed={snapping} aria-label="Snapping" />
      </Tip>
      <Tip label="Fit timeline to window">
        <Button variant="quiet" icon={FitToScreenIcon} onClick={onFit} disabled={!hasClips} aria-label="Fit timeline to window" />
      </Tip>
      <div className="mx-1 h-5 w-px bg-border" />
      <Tip label="Zoom out" kbd="−">
        <Button variant="quiet" icon={ZoomOutAreaIcon} onClick={() => setZoom(pps / 1.5)} aria-label="Zoom out" />
      </Tip>
      <input
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={toSlider(pps)}
        onChange={(e) => setZoom(fromSlider(Number(e.target.value)))}
        aria-label="Zoom"
        className="h-1 w-28 accent-primary"
      />
      <Tip label="Zoom in" kbd="+">
        <Button variant="quiet" icon={ZoomInAreaIcon} onClick={() => setZoom(pps * 1.5)} aria-label="Zoom in" />
      </Tip>
    </div>
  )
}

const TICK_STEPS = [FRAME, 2 * FRAME, 5 * FRAME, 10 * FRAME, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800]

function Ruler({ pps, width, view, selection, onScrub }: { pps: number; width: number; view: { left: number; width: number }; selection: [number, number] | null; onScrub: (e: React.PointerEvent, el: HTMLElement) => void }) {
  const major = TICK_STEPS.find((s) => s * pps >= 72) ?? 1800
  const minor = major / (major * pps >= 100 ? 5 : 2)
  const from = Math.max(0, Math.floor((view.left - HEADER_W) / pps / major) * major)
  const to = Math.min(width / pps, (view.left + view.width) / pps)
  const ticks: { t: number; major: boolean }[] = []
  for (let t = from; t <= to + major; t += minor) {
    const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6
    ticks.push({ t, major: isMajor })
  }
  const withFrames = major < 1

  return (
    <div className="sticky top-0 z-30 flex bg-surface" style={{ height: RULER_H }}>
      <div className="sticky left-0 z-40 shrink-0 border-r border-b border-border bg-surface" style={{ width: HEADER_W }} />
      <div className="relative shrink-0 overflow-hidden border-b border-border" style={{ width }} onPointerDown={(e) => e.button === 0 && onScrub(e, e.currentTarget)}>
        {selection && <div className="absolute top-0 bottom-0 bg-primary-highlight" style={{ left: selection[0] * pps, width: (selection[1] - selection[0]) * pps }} />}
        {ticks.map(({ t, major: isMajor }) => (
          <div key={t.toFixed(4)} className="absolute bottom-0" style={{ left: t * pps }}>
            <div className={`w-px ${isMajor ? "h-2 bg-muted" : "h-1 bg-border"}`} />
            {isMajor && <span className="tnum absolute bottom-2.5 left-1 text-caps whitespace-nowrap text-muted">{rulerLabel(t, withFrames)}</span>}
          </div>
        ))}
        <PlayheadHandle pps={pps} />
      </div>
    </div>
  )
}

function PlayheadHandle({ pps }: { pps: number }) {
  const playhead = useEditor((s) => s.playhead)
  return <div className="pointer-events-none absolute bottom-0 z-10 h-3 w-3 -translate-x-1/2 translate-y-1/2 rounded-full bg-primary ring-2 ring-surface" style={{ left: playhead * pps + 1 }} />
}

function Playhead({ pps }: { pps: number }) {
  const playhead = useEditor((s) => s.playhead)
  return <div className="pointer-events-none absolute bottom-0 z-10 w-0.5 bg-primary" style={{ left: HEADER_W + playhead * pps, top: RULER_H }} />
}

function TrackHeader({ track, onContextMenu }: { track: Track; onContextMenu: (e: React.MouseEvent) => void }) {
  const toggle = useEditor((s) => s.toggleTrack)
  const visual = track.kind === "video"
  const off = visual ? track.hidden : track.muted
  return (
    <div onContextMenu={onContextMenu} className="sticky left-0 z-20 flex shrink-0 items-center gap-0.5 border-r border-border bg-surface pr-1.5 pl-4" style={{ width: HEADER_W }}>
      <span className="flex-1 text-h-sm font-semibold text-fg">{track.name}</span>
      <Tip label={visual ? (off ? "Show track" : "Hide track") : off ? "Unmute track" : "Mute track"}>
        <Button
          variant="quiet"
          aria-pressed={off}
          aria-label={visual ? "Toggle visibility" : "Toggle mute"}
          icon={visual ? (off ? ViewOffSlashIcon : ViewIcon) : off ? VolumeMute02Icon : VolumeHighIcon}
          active={off}
          onClick={() => toggle(track.id, visual ? "hidden" : "muted")}
        />
      </Tip>
      <Tip label={track.locked ? "Unlock track" : "Lock track"}>
        <Button
          variant="quiet"
          aria-pressed={track.locked}
          aria-label="Toggle lock"
          icon={track.locked ? SquareLock02Icon : SquareUnlock02Icon}
          active={track.locked}
          onClick={() => toggle(track.id, "locked")}
        />
      </Tip>
    </div>
  )
}

interface ClipViewProps {
  clip: Clip
  media?: MediaItem
  pps: number
  height: number
  selected: boolean
  dragging: boolean
  linked: boolean
  locked: boolean
  onDragStart: (e: React.PointerEvent, clip: Clip, mode: DragMode) => void
}

const ClipView = memo(function ClipView({ clip, media, pps, height, selected, dragging, linked, locked, onDragStart }: ClipViewProps) {
  const left = clip.start * pps
  const width = Math.max(2, clip.duration * pps)
  const handles = !locked && width > 14

  return (
    <div
      className={`group absolute overflow-hidden rounded-sm ${CLIP_STYLE[media?.kind === "image" ? "image" : clip.type]} ${selected ? "z-[5] outline-2 outline-offset-1 outline-primary" : ""} ${dragging ? "z-[6] opacity-90 shadow-float" : ""} ${locked ? "cursor-not-allowed" : ""}`}
      style={{ left, width, top: 2, height: height - 4 }}
      onPointerDown={(e) => onDragStart(e, clip, "move")}
      onContextMenu={(e) => clipMenu(e, clip, locked)}
      title={clip.name}
    >
      <div className="flex items-center gap-1 px-2 text-small font-semibold" style={{ height: CLIP_LABEL_H }}>
        {linked && <Icon icon={Link01Icon} size={12} className="shrink-0" />}
        <span className="truncate">{clip.name}</span>
      </div>
      <div className="relative overflow-hidden" style={{ height: height - 4 - CLIP_LABEL_H }}>
        {clip.type === "video" && media && <Filmstrip clip={clip} media={media} pps={pps} width={width} height={height - 4 - CLIP_LABEL_H} />}
        {clip.type === "audio" && media?.peaks && <Waveform clip={clip} peaks={media.peaks} width={width} />}
        {clip.type === "text" && clip.text && <div className="truncate px-2 text-small opacity-80">{clip.text.content}</div>}
      </div>
      {handles && (
        <>
          <div className="absolute inset-y-0 left-0 w-2 cursor-ew-resize group-hover:bg-black/15" onPointerDown={(e) => onDragStart(e, clip, "trim-l")} />
          <div className="absolute inset-y-0 right-0 w-2 cursor-ew-resize group-hover:bg-black/15" onPointerDown={(e) => onDragStart(e, clip, "trim-r")} />
        </>
      )}
    </div>
  )
})

/** Thumbnails across the clip, each tile showing the frame closest to its source time. */
function Filmstrip({ clip, media, pps, width, height }: { clip: Clip; media: MediaItem; pps: number; width: number; height: number }) {
  if (!media.frames.length || height < 8) return null
  const aspect = media.width && media.height ? media.width / media.height : 16 / 9
  const tileW = Math.max(16, height * aspect)
  const count = Math.min(400, Math.ceil(width / tileW))
  const tiles = []
  for (let i = 0; i < count; i++) {
    let src = media.frames[0]
    if (media.kind === "video" && media.duration > 0) {
      const t = clip.offset + (i * tileW + tileW / 2) / pps
      const idx = Math.min(media.frames.length - 1, Math.max(0, Math.floor((t / media.duration) * media.frames.length)))
      src = media.frames[idx]
    }
    tiles.push(<div key={i} className="h-full shrink-0 bg-cover bg-center" style={{ width: tileW, backgroundImage: `url(${src})` }} />)
  }
  return <div className="flex h-full">{tiles}</div>
}

function Waveform({ clip, peaks, width }: { clip: Clip; peaks: number[]; width: number }) {
  const path = useMemo(() => {
    const from = Math.floor(clip.offset * PEAKS_PER_SECOND)
    const to = Math.min(peaks.length, Math.ceil((clip.offset + clip.duration) * PEAKS_PER_SECOND))
    const bars = Math.max(1, Math.min(to - from, Math.floor(width / 2)))
    const per = (to - from) / bars
    let d = ""
    for (let i = 0; i < bars; i++) {
      let p = 0
      const a = from + Math.floor(i * per)
      const b = Math.max(a + 1, from + Math.floor((i + 1) * per))
      for (let j = a; j < b && j < to; j++) p = Math.max(p, peaks[j])
      const h = Math.max(0.04, p) * 0.5
      d += `M${i + 0.5} ${0.5 - h}V${0.5 + h}`
    }
    return { d, bars }
  }, [clip.offset, clip.duration, peaks, width])
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${path.bars} 1`} preserveAspectRatio="none">
      <path d={path.d} stroke="currentColor" strokeOpacity={0.7} strokeWidth={0.9} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** Where a media item dragged from the bin would land on this track. */
function DropPreview({ track, pps }: { track: Track; pps: number }) {
  const drag = useMediaDrag((s) => s.drag)
  const media = useEditor((s) => (drag ? s.media.find((m) => m.id === drag.mediaId) : undefined))
  const ref = useRef<HTMLDivElement>(null)
  const [left, setLeft] = useState<number | null>(null)

  useEffect(() => {
    const laneEl = ref.current?.parentElement
    if (!drag || !media || !laneEl || track.locked || trackKindFor(clipTypeForMedia(media)) !== track.kind) return setLeft(null)
    const hit = document.elementFromPoint(drag.x, drag.y)?.closest<HTMLElement>("[data-track-id]")
    if (hit !== laneEl) return setLeft(null)
    setLeft(Math.max(0, drag.x - laneEl.getBoundingClientRect().left))
  }, [drag, media, track])

  const dur = media ? (media.kind === "image" ? 5 : media.duration) : 0
  return (
    <div ref={ref} className="contents">
      {left !== null && media && (
        <div
          className={`pointer-events-none absolute rounded-sm opacity-70 ${CLIP_STYLE[media.kind]}`}
          style={{ left, width: Math.max(4, dur * pps), top: 2, bottom: 2 }}
        />
      )}
    </div>
  )
}

function useScrollSync(ref: React.RefObject<HTMLDivElement | null>, set: (v: { left: number; width: number }) => void) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => set({ left: el.scrollLeft, width: el.clientWidth })
    update()
    el.addEventListener("scroll", update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener("scroll", update)
      ro.disconnect()
    }
  }, [ref, set])
}

/** Ctrl/⌘ + wheel zooms around the pointer; plain wheel scrolls tracks, Shift + wheel scrolls time. */
function useWheelZoom(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const { pxPerSec, setZoom } = useEditor.getState()
      const x = e.clientX - el.getBoundingClientRect().left - HEADER_W + el.scrollLeft
      const t = x / pxPerSec
      setZoom(pxPerSec * Math.exp(-e.deltaY * 0.0015))
      const next = useEditor.getState().pxPerSec
      el.scrollLeft += t * next - x
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [ref])
}

/** Page the view along with the playhead during playback. */
function useFollowPlayhead(ref: React.RefObject<HTMLDivElement | null>, view: { left: number; width: number }) {
  const playing = useEditor((s) => s.playing)
  const playhead = useEditor((s) => s.playhead)
  const pps = useEditor((s) => s.pxPerSec)
  useEffect(() => {
    const el = ref.current
    if (!el || !playing) return
    const x = playhead * pps
    const visible = view.width - HEADER_W
    if (x > view.left + visible - 24 || x < view.left) el.scrollLeft = Math.max(0, x - 24)
  }, [ref, playing, playhead, pps, view])
}