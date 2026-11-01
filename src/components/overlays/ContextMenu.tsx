import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Tick02Icon } from "@hugeicons/core-free-icons"
import { closeMenu, type MenuState } from "../../store/overlays"
import { Icon } from "../ui"

const EDGE = 8

export function ContextMenu({ x, y, entries }: MenuState) {

  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useLayoutEffect(() => {

    const el = ref.current

    if (!el) return
    const { width, height } = el.getBoundingClientRect()

    setPos({
      left: Math.max(EDGE, Math.min(x, window.innerWidth - width - EDGE)),
      top: Math.max(EDGE, Math.min(y, window.innerHeight - height - EDGE)),
    })
    el.focus()
  }, [x, y])

  useEffect(() => {

    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) closeMenu()
    }
    window.addEventListener("pointerdown", onDown, true)
    window.addEventListener("resize", closeMenu)
    window.addEventListener("blur", closeMenu)
    window.addEventListener("wheel", closeMenu, { passive: true })
    return () => {
      window.removeEventListener("pointerdown", onDown, true)
      window.removeEventListener("resize", closeMenu)
      window.removeEventListener("blur", closeMenu)
      window.removeEventListener("wheel", closeMenu)
    }
  }, [])

  const moveFocus = (dir: number) => {

    const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])]

    if (!items.length) return

    const at = items.indexOf(document.activeElement as HTMLButtonElement)
    const from = at === -1 && dir < 0 ? 0 : at
    items[(from + dir + items.length) % items.length].focus()
  }

  return createPortal(
    <div
      ref={ref}
      role="menu"
      tabIndex={-1}
      className="fixed z-[60] min-w-[220px] rounded-lg bg-surface p-1.5 shadow-float ring-1 ring-border outline-none"
      style={pos}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === "Escape") closeMenu()
        else if (e.key === "ArrowDown") moveFocus(1)
        else if (e.key === "ArrowUp") moveFocus(-1)
        else return
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      {entries.map((entry, i) =>
        entry === "divider" ? (
          <div key={i} role="separator" className="mx-2 my-1.5 h-px bg-border" />
        ) : (
          <button
            key={i}
            role="menuitem"
            disabled={entry.disabled}
            onClick={() => {
              closeMenu()
              entry.onSelect()
            }}
            className={`flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-body outline-none disabled:opacity-40 ${entry.danger ? "text-error hover:bg-danger-soft focus-visible:bg-danger-soft" : "text-fg hover:bg-raised focus-visible:bg-raised"}`}
          >
            <span className={`flex w-4 shrink-0 justify-center ${entry.danger ? "" : "text-label"}`}>
              {entry.swatch ? <span className="h-3 w-3 rounded-full ring-1 ring-black/15" style={{ background: entry.swatch }} /> : entry.checked ? <Icon icon={Tick02Icon} /> : entry.icon ? <Icon icon={entry.icon} /> : null}
            </span>
            <span className="min-w-0 flex-1 truncate">{entry.label}</span>
            {entry.swatch && entry.checked && <span className="text-label"><Icon icon={Tick02Icon} /></span>}
            {entry.kbd && <span className="ml-6 text-small text-muted">{entry.kbd}</span>}
          </button>
        ),
      )}
    </div>,
    document.body,
  )
}