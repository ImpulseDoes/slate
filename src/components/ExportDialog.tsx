import { projectDuration, useEditor } from "../store/editor"
import { timecode } from "../lib/time"
import { PROJECT } from "../types"
import { Modal } from "./overlays"
import { Button, TimePill } from "./ui"

export function ExportDialog({ onClose }: { onClose: () => void }) {

  const duration = useEditor((s) => projectDuration(s.clips))
  const name = useEditor((s) => s.projectName)

  const rows: [string, React.ReactNode][] = [
    ["File", `${name}.mp4`],
    ["Format", "MP4 · H.264 · AAC"],
    ["Resolution", `${PROJECT.width} × ${PROJECT.height}`],
    ["Frame rate", `${PROJECT.fps} fps`],
    ["Duration", <TimePill key="d">{timecode(duration)}</TimePill>],
  ]

  return (
    <Modal
      title="Export"
      labelId="export-title"
      onClose={onClose}
      closeButton
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled>
            Export {Math.round(duration) > 0 ? `· ${timecode(duration).slice(3, 8)}` : ""}
          </Button>
        </>
      }
    >
      <div className="mt-3 flex flex-col gap-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex min-h-6 items-center">
            <span className="w-24 shrink-0 text-label">{label}</span>
            <span className="tnum flex-1 truncate text-fg">{value}</span>
          </div>
        ))}
      </div>
      {/* TODO: add rendering */}
      <p className="mt-4 text-body text-muted">Rendering isn't wired up yet. It's next on the list, once the FFmpeg engine lands.</p>
    </Modal>
  )
}