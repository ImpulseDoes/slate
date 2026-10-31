import { useCallback, useState } from "react"
import { TopBar } from "./components/TopBar"
import { MediaBin } from "./components/MediaBin"
import { Viewer } from "./components/Viewer"
import { Inspector } from "./components/Inspector"
import { Timeline } from "./components/Timeline"
import { ExportDialog } from "./components/ExportDialog"
import { Overlays } from "./components/overlays"
import { useEditor, useMediaDrag } from "./store/editor"
import { useFileDrop, usePlaybackClock, useShortcuts } from "./hooks"

const TOP_BAR = 48
const MIN_TIMELINE = 200
const MIN_UPPER = 300

export default function App() {

  const [exportOpen, setExportOpen] = useState(false)
  const [timelineH, setTimelineH] = useState(() => Math.round((window.innerHeight - TOP_BAR) * 0.42))
  const fileOver = useFileDrop()

  usePlaybackClock()
  useShortcuts()

  const startResize = useCallback((e: React.PointerEvent) => {

    const el = e.currentTarget as HTMLElement

    el.setPointerCapture(e.pointerId)

    const startY = e.clientY
    const startH = timelineH
    const move = (ev: PointerEvent) => {
      const max = window.innerHeight - TOP_BAR - MIN_UPPER
      setTimelineH(Math.min(max, Math.max(MIN_TIMELINE, startH - (ev.clientY - startY))))
    }
    const up = () => {
      el.removeEventListener("pointermove", move)
      el.removeEventListener("pointerup", up)
    }
    el.addEventListener("pointermove", move)
    el.addEventListener("pointerup", up)
  }, [timelineH])

  return (
    <div className="flex h-screen flex-col bg-app">
      <TopBar onExport={() => setExportOpen(true)} />
      <main className="flex min-h-0 flex-1 flex-col px-2 pb-2">
        <div className="flex min-h-0 flex-1 gap-2">
          <MediaBin dropActive={fileOver} />
          <Viewer />
          <Inspector />
        </div>
        <div className="h-2 shrink-0 cursor-row-resize" onPointerDown={startResize} role="separator" aria-orientation="horizontal" aria-label="Resize timeline" />
        <Timeline height={timelineH} />
      </main>
      <DragGhost />
      {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} />}
      <Overlays />
    </div>
  )
}

function DragGhost() {

  const drag = useMediaDrag((s) => s.drag)
  const name = useEditor((s) => (drag ? s.media.find((m) => m.id === drag.mediaId)?.name : undefined))

  if (!drag || !name) return null

  return (
    <div className="pointer-events-none fixed z-50 rounded-md bg-tooltip px-2 py-1.5 text-small text-white shadow-float" style={{ left: drag.x + 12, top: drag.y + 12 }}>
      {name}
    </div>
  )
}