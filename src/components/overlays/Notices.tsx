import { createPortal } from "react-dom"
import { useOverlays } from "../../store/overlays"

export function Notices() {
  const notices = useOverlays((s) => s.notices)
  if (!notices.length) return null
  return createPortal(
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[80] flex -translate-x-1/2 flex-col items-center gap-2">
      {notices.map((n) => (
        <div key={n.id} role="status" className={`max-w-[560px] rounded-md px-3 py-2 text-body shadow-float ${n.tone === "error" ? "bg-error text-white" : "bg-tooltip text-white"}`}>
          {n.text}
        </div>
      ))}
    </div>,
    document.body,
  )
}