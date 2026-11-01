import { clipEnd, linkedWith, lockedTrackIds, maxDurationFor, speedOf, trackKindFor } from "../../lib/clips"
import { trackPointer } from "../../lib/pointer"
import { frameTicks, TICKS, toFrame } from "../../lib/time"
import { useEditor, type ClipEdit } from "../../store/editor"
import type { Clip } from "../../types"
import { laneAt } from "./layout"

const SNAP_PX = 8

export type DragMode = "move" | "trim-l" | "trim-r"

export function scrub(e: React.PointerEvent, el: HTMLElement) {
  const rect = el.getBoundingClientRect()
  const at = (x: number) => {
    const { pxPerSec, setPlayhead } = useEditor.getState()
    setPlayhead(((x - rect.left) / pxPerSec) * TICKS)
  }
  useEditor.getState().setPlaying(false)
  at(e.clientX)
  el.setPointerCapture(e.pointerId)
  trackPointer((ev) => at(ev.clientX))
}

export function beginClipDrag(e: React.PointerEvent, clip: Clip, mode: DragMode, setDraft: (edits: ClipEdit[] | null) => void) {
  const state = useEditor.getState()
  const track = state.tracks.find((t) => t.id === clip.trackId)
  if (e.button !== 0 || !track || track.locked) return
  e.stopPropagation()
  // Ctrl/⌘ works on this one clip, ignoring its links and the rest of the selection.
  const solo = e.ctrlKey || e.metaKey
  if (solo) state.selectClip(clip.id, "solo")
  else if (e.shiftKey) state.selectClip(clip.id, "add")
  else if (!state.selectedClipIds.includes(clip.id)) state.selectClip(clip.id)

  const { clips: all, selectedClipIds, tracks: allTracks, media, settings } = useEditor.getState()
  const { fps } = settings
  const frame = frameTicks(fps)
  const locked = lockedTrackIds(allTracks)
  const linked = linkedWith(all, clip)
  const others = solo ? [] : all.filter((c) => c.id !== clip.id && !locked.has(c.trackId) && (selectedClipIds.includes(c.id) || linked.includes(c)))
  const group = [clip, ...others]
  const earliest = Math.min(...group.map((c) => c.start))
  // A trim takes along only the clips whose edge lines up with the one being dragged.
  const edge = mode === "trim-l" ? (c: Clip) => c.start : clipEnd
  const trimmed = group.filter((c) => Math.abs(edge(c) - edge(clip)) < frame / 2)
  const earliestStart = Math.max(0, ...trimmed.map((c) => (maxDurationFor(c, media, fps) === Infinity ? 0 : c.start - c.offset / speedOf(c))))
  const latestStart = Math.min(...trimmed.map((c) => clipEnd(c) - frame))
  const earliestEnd = Math.max(...trimmed.map((c) => c.start + frame))
  const latestEnd = Math.min(...trimmed.map((c) => c.start + maxDurationFor(c, media, fps)))
  const toEdit = (c: Clip): ClipEdit => ({ id: c.id, trackId: c.trackId, start: c.start, offset: c.offset, duration: c.duration })

  // Listen on window: moving to another track remounts the clip element.
  const startX = e.clientX
  const scale = state.pxPerSec / TICKS
  const snapPoints = state.snapping
    ? [0, state.playhead, ...state.markers.map((m) => m.at), ...all.filter((c) => !group.includes(c)).flatMap((c) => [c.start, clipEnd(c)])]
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
      const lane = laneAt(ev.clientX, ev.clientY)
      const target = lane && useEditor.getState().tracks.find((t) => t.id === lane.dataset.trackId)
      if (target && !target.locked && target.kind === trackKindFor(clip.type)) trackId = target.id
      const shift = toFrame(Math.max(lowest, start), fps) - clip.start
      current = group.map((c) => ({ ...toEdit(c), start: toFrame(c.start + shift, fps), trackId: c.id === clip.id ? trackId : c.trackId }))
    } else if (mode === "trim-l") {
      const shift = toFrame(Math.min(latestStart, Math.max(earliestStart, snap(clip.start + dt))), fps) - clip.start
      current = trimmed.map((c) => ({ ...toEdit(c), start: c.start + shift, offset: Math.round(c.offset + shift * speedOf(c)), duration: c.duration - shift }))
    } else {
      const change = toFrame(Math.min(latestEnd, Math.max(earliestEnd, snap(clipEnd(clip) + dt))), fps) - clipEnd(clip)
      current = trimmed.map((c) => ({ ...toEdit(c), duration: c.duration + change }))
    }
    setDraft(current)
  }
  trackPointer(move, () => {
    setDraft(null)
    if (moved) useEditor.getState().applyClipEdits(current)
  })
}