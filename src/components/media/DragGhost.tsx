import { useEditor } from "../../store/editor"
import { useMediaDrag } from "../../store/mediaDrag"

export function DragGhost() {

  const drag = useMediaDrag((s) => s.drag)
  const name = useEditor((s) => (drag ? s.media.find((m) => m.id === drag.mediaId)?.name : undefined))

  if (!drag || !name) return null

  return (
    <div className="pointer-events-none fixed z-50 rounded-md bg-tooltip px-2 py-1.5 text-small text-white shadow-float" style={{ left: drag.x + 12, top: drag.y + 12 }}>
      {name}
    </div>
  )
}