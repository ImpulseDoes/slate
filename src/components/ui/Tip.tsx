import { useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

export function Tip({ label, kbd, children, side = "top" }: { label: string; kbd?: string; children: ReactNode; side?: "top" | "bottom" }) {

  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const anchor = useRef<HTMLSpanElement>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const hide = () => {
    clearTimeout(timer.current)
    setAt(null)
  }

  return (
    <span
      ref={anchor}
      className="inline-flex"
      onPointerEnter={() => {
        timer.current = window.setTimeout(() => {

          const r = anchor.current?.getBoundingClientRect()

          if (r) setAt({ x: r.left + r.width / 2, y: side === "top" ? r.top : r.bottom })

        }, 450)
      }}
      onPointerLeave={hide}
      onPointerDown={hide}
    >
      {children}
      {at &&
        createPortal(
          <span
            role="tooltip"
            className={`pointer-events-none fixed z-[70] -translate-x-1/2 rounded-md bg-tooltip px-2 py-1.5 text-small whitespace-nowrap text-white shadow-float ${side === "top" ? "-translate-y-full" : ""}`}
            style={{ left: at.x, top: at.y + (side === "top" ? -6 : 6) }}
          >
            {label}
            {kbd && <span className="ml-2 text-white/60">{kbd}</span>}
          </span>,
          document.body,
        )}
    </span>
  )
}