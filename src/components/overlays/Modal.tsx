import { useEffect, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { Button } from "../ui"

export function Modal({ title, labelId, onClose, footer, children, width = 400, closeButton }: { title: string; labelId: string; onClose: () => void; footer: ReactNode; children: ReactNode; width?: number; closeButton?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal aria-labelledby={labelId} className="rounded-2xl bg-surface shadow-float" style={{ width }}>
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <h1 id={labelId} className="text-h-md font-semibold">
              {title}
            </h1>
            {closeButton && <Button variant="quiet" icon={Cancel01Icon} onClick={onClose} aria-label="Close" className="-mt-1 -mr-1" />}
          </div>
          <div className="mt-2">{children}</div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-3 py-3">{footer}</div>
      </div>
    </div>,
    document.body,
  )
}