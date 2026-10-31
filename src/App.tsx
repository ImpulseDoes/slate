import { useCallback, useEffect, useState } from "react"
import { ExportDialog } from "./components/dialogs/ExportDialog"
import { ProjectSettingsDialog } from "./components/dialogs/ProjectSettingsDialog"
import { RendersDialog } from "./components/dialogs/RendersDialog"
import { Inspector } from "./components/inspector/Inspector"
import { TopBar } from "./components/layout/TopBar"
import { DragGhost } from "./components/media/DragGhost"
import { MediaBin } from "./components/media/MediaBin"
import { Overlays } from "./components/overlays/Overlays"
import { Timeline } from "./components/timeline/Timeline"
import { Viewer } from "./components/viewer/Viewer"
import { useFileDrop } from "./hooks/useFileDrop"
import { usePlaybackClock } from "./hooks/usePlaybackClock"
import { useShortcuts } from "./hooks/useShortcuts"
import { trackPointer } from "./lib/pointer"
import { startSession } from "./lib/project/session"
import { openDialog, useOverlays } from "./store/overlays"
import { listenForRenderProgress } from "./store/renders"

const TOP_BAR = 48
const MIN_TIMELINE = 200
const MIN_UPPER = 300

export default function App() {

  const dialog = useOverlays((s) => s.dialog)
  const closeDialog = useCallback(() => openDialog(null), [])
  const [timelineH, setTimelineH] = useState(() => Math.round((window.innerHeight - TOP_BAR) * 0.42))
  const fileOver = useFileDrop()

  usePlaybackClock()
  useShortcuts()

  useEffect(() => {
    startSession()
    listenForRenderProgress()
  }, [])

  const startResize = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const startY = e.clientY
    const startH = timelineH
    trackPointer((ev) => {
      const max = window.innerHeight - TOP_BAR - MIN_UPPER
      setTimelineH(Math.min(max, Math.max(MIN_TIMELINE, startH - (ev.clientY - startY))))
    })
  }

  return (
    <div className="flex h-screen flex-col bg-app">
      <TopBar />
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
      {dialog === "export" && <ExportDialog onClose={closeDialog} />}
      {dialog === "settings" && <ProjectSettingsDialog onClose={closeDialog} />}
      {dialog === "renders" && <RendersDialog onClose={closeDialog} />}
      <Overlays />
    </div>
  )
}