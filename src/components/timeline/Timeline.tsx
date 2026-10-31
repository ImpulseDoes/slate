import { useCallback, useMemo, useRef, useState } from "react"
import { projectDuration, selectionSpan } from "../../lib/clips"
import { sec, ticks, TICKS } from "../../lib/time"
import { useEditor, type ClipEdit } from "../../store/editor"
import type { Clip } from "../../types"
import { ClipView } from "./ClipView"
import { DropPreview } from "./DropPreview"
import { beginClipDrag, scrub, type DragMode } from "./gestures"
import { useFollowPlayhead, useScrollSync, useWheelZoom } from "./hooks"
import { HEADER_W, TRACK_H } from "./layout"
import { laneMenu, trackMenu } from "./menus"
import { Playhead, Ruler } from "./Ruler"
import { Toolbar } from "./Toolbar"
import { TrackHeader } from "./TrackHeader"

const TAIL = ticks(30)

export function Timeline({ height }: { height: number }) {
  const tracks = useEditor((s) => s.tracks)
  const clips = useEditor((s) => s.clips)
  const media = useEditor((s) => s.media)
  const ppt = useEditor((s) => s.pxPerSec) / TICKS
  const selected = useEditor((s) => s.selectedClipIds)
  const fps = useEditor((s) => s.settings.fps)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ left: 0, width: 1000 })
  const [draft, setDraft] = useState<ClipEdit[] | null>(null)

  const mediaById = useMemo(() => new Map(media.map((m) => [m.id, m])), [media])
  const duration = projectDuration(clips)
  const contentTicks = Math.max(duration + TAIL, (view.width - HEADER_W) / ppt)
  const contentW = Math.ceil(contentTicks * ppt)

  useScrollSync(scrollRef, setView)
  useWheelZoom(scrollRef)
  useFollowPlayhead(scrollRef, view)

  const fit = () => {
    const el = scrollRef.current
    const { clips: all, setZoom } = useEditor.getState()
    const end = projectDuration(all)
    if (!el || end <= 0) return
    setZoom((el.clientWidth - HEADER_W - 32) / sec(end))
    el.scrollLeft = 0
  }

  const startDrag = useCallback((e: React.PointerEvent, clip: Clip, mode: DragMode) => beginClipDrag(e, clip, mode, setDraft), [])

  const shown = draft ? clips.map((c) => ({ ...c, ...draft.find((d) => d.id === c.id) })) : clips
  const linkSizes = new Map<string, number>()
  for (const c of clips) if (c.linkId) linkSizes.set(c.linkId, (linkSizes.get(c.linkId) ?? 0) + 1)

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-surface shadow-card" style={{ height }}>
      <Toolbar onFit={fit} />
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto">
        <div className="relative min-h-full" style={{ width: HEADER_W + contentW }}>
          <Ruler ppt={ppt} fps={fps} width={contentW} view={view} selection={selectionSpan(clips, selected)} onScrub={scrub} />
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
                onContextMenu={(e) => laneMenu(e, t, (e.clientX - e.currentTarget.getBoundingClientRect().left) / ppt, fit)}
              >
                {shown
                  .filter((c) => c.trackId === t.id)
                  .map((c) => (
                    <ClipView
                      key={c.id}
                      clip={c}
                      media={c.mediaId ? mediaById.get(c.mediaId) : undefined}
                      ppt={ppt}
                      height={TRACK_H[t.kind]}
                      selected={selected.includes(c.id)}
                      dragging={!!draft?.some((d) => d.id === c.id)}
                      linked={(linkSizes.get(c.linkId ?? "") ?? 0) > 1}
                      locked={t.locked}
                      onDragStart={startDrag}
                    />
                  ))}
                <DropPreview track={t} ppt={ppt} />
              </div>
            </div>
          ))}
          <Playhead ppt={ppt} />
        </div>
      </div>
    </section>
  )
}