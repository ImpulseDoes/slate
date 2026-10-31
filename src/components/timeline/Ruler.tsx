import { Add01Icon } from "@hugeicons/core-free-icons"
import { useT } from "../../lib/i18n"
import { frameTicks, rulerLabel, ticks, TICKS, type Fps } from "../../lib/time"
import { useEditor } from "../../store/editor"
import type { Marker } from "../../types"
import { Button, MARKER_COLORS, Tip } from "../ui"
import { HEADER_W, RULER_H } from "./layout"
import { addTrackMenu, markerMenu } from "./menus"

const SECOND_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800].map(ticks)

function MarkerFlag({ marker, ppt }: { marker: Marker; ppt: number }) {
  return (
    <button
      aria-label={marker.name || rulerLabel(marker.at, useEditor.getState().settings.fps, true)}
      title={marker.name}
      className="absolute top-0 z-10 flex h-3.5 w-3 -translate-x-1/2 items-start"
      style={{ left: marker.at * ppt, color: MARKER_COLORS[marker.color] }}
      onPointerDown={(e) => {
        e.stopPropagation()
        if (e.button === 0) useEditor.getState().setPlayhead(marker.at)
      }}
      onContextMenu={(e) => markerMenu(e, marker)}
    >
      <svg viewBox="0 0 12 14" className="h-full w-full fill-current">
        <path d="M0 0h12v9l-6 5-6-5z" />
      </svg>
    </button>
  )
}

export function Ruler({ ppt, fps, width, view, selection, onScrub }: { ppt: number; fps: Fps; width: number; view: { left: number; width: number }; selection: [number, number] | null; onScrub: (e: React.PointerEvent, el: HTMLElement) => void }) {
  const t = useT()
  const markers = useEditor((s) => s.markers)
  const frame = frameTicks(fps)
  const steps = [frame, 2 * frame, 5 * frame, 10 * frame, ...SECOND_STEPS]
  const major = steps.find((s) => s * ppt >= 72) ?? steps[steps.length - 1]
  const divisions = major * ppt >= 100 ? 5 : 2
  const minor = major / divisions
  const from = Math.max(0, Math.floor((view.left - HEADER_W) / ppt / major) * major)
  const to = Math.min(width / ppt, (view.left + view.width) / ppt)
  const marks: { t: number; major: boolean }[] = []
  for (let i = 0; from + i * minor <= to + major; i++) marks.push({ t: from + i * minor, major: i % divisions === 0 })
  const withFrames = major < TICKS

  return (
    <div className="sticky top-0 z-30 flex bg-surface" style={{ height: RULER_H }}>
      <div className="sticky left-0 z-40 flex shrink-0 items-center justify-end border-r border-b border-border bg-surface pr-1.5" style={{ width: HEADER_W }}>
        <Tip label={t("track.add")}>
          <Button variant="quiet" icon={Add01Icon} onClick={addTrackMenu} aria-label={t("track.add")} className="h-6" />
        </Tip>
      </div>
      <div className="relative shrink-0 overflow-hidden border-b border-border" style={{ width }} onPointerDown={(e) => e.button === 0 && onScrub(e, e.currentTarget)}>
        {selection && <div className="absolute top-0 bottom-0 bg-primary-highlight" style={{ left: selection[0] * ppt, width: (selection[1] - selection[0]) * ppt }} />}
        {marks.map(({ t, major: isMajor }) => (
          <div key={t} className="absolute bottom-0" style={{ left: t * ppt }}>
            <div className={`w-px ${isMajor ? "h-2 bg-muted" : "h-1 bg-border"}`} />
            {isMajor && <span className="tnum absolute bottom-2.5 left-1 text-caps whitespace-nowrap text-muted">{rulerLabel(t, fps, withFrames)}</span>}
          </div>
        ))}
        {markers.map((m) => (
          <MarkerFlag key={m.id} marker={m} ppt={ppt} />
        ))}
        <PlayheadHandle ppt={ppt} />
      </div>
    </div>
  )
}

function PlayheadHandle({ ppt }: { ppt: number }) {
  const playhead = useEditor((s) => s.playhead)
  return <div className="pointer-events-none absolute bottom-0 z-10 h-3 w-3 -translate-x-1/2 translate-y-1/2 rounded-full bg-primary ring-2 ring-surface" style={{ left: playhead * ppt + 1 }} />
}

export function Playhead({ ppt }: { ppt: number }) {
  const playhead = useEditor((s) => s.playhead)
  return <div className="pointer-events-none absolute bottom-0 z-10 w-0.5 bg-primary" style={{ left: HEADER_W + playhead * ppt, top: RULER_H }} />
}