import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import type { IconSvgElement } from "@hugeicons/react"
import { Cancel01Icon, Delete02Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { create } from "zustand"
import { Button, Icon } from "./ui"

export type MenuEntry =
  | "divider"
  | {
    label: string
    icon?: IconSvgElement
    kbd?: string
    danger?: boolean
    disabled?: boolean
    checked?: boolean
    onSelect: () => void
  }

interface MenuState {
  x: number
  y: number
  entries: MenuEntry[]
}

interface ConfirmState {
  title: string
  body: string
  action: string
  onConfirm: () => void
  /** Danger by default. Primary suits an action that loses nothing. */
  tone?: "danger" | "primary"
  cancelLabel?: string
  onCancel?: () => void
  /** A third way out, such as closing without saving. */
  alternate?: { label: string; onSelect: () => void }
}

export type DialogName = "export" | "settings" | "renders"

interface Notice {
  id: number
  text: string
  tone: "info" | "error"
}

const useOverlays = create<{ menu: MenuState | null; confirm: ConfirmState | null; dialog: DialogName | null; notices: Notice[] }>(() => ({ menu: null, confirm: null, dialog: null, notices: [] }))

const NOTICE_MS = 7000
let noticeId = 0

export const useOpenDialog = () => useOverlays((s) => s.dialog)
export const openDialog = (dialog: DialogName | null) => useOverlays.setState({ dialog })

export function notify(text: string, tone: Notice["tone"] = "info") {
  const id = ++noticeId
  useOverlays.setState((s) => ({ notices: [...s.notices, { id, text, tone }] }))
  setTimeout(() => useOverlays.setState((s) => ({ notices: s.notices.filter((n) => n.id !== id) })), NOTICE_MS)
}

/** Open a menu just below a button rather than at the pointer. */
export function openMenuBelow(e: React.MouseEvent, entries: MenuEntry[]) {
  const r = e.currentTarget.getBoundingClientRect()
  useOverlays.setState({ menu: { x: r.left, y: r.bottom + 4, entries } })
}

export function openMenu(e: React.MouseEvent, entries: MenuEntry[]) {
  e.preventDefault()
  e.stopPropagation()
  useOverlays.setState({ menu: { x: e.clientX, y: e.clientY, entries } })
}

export function confirmAction(confirm: ConfirmState) {
  useOverlays.setState({ confirm })
}

const closeMenu = () => useOverlays.setState({ menu: null })

export function Overlays() {

  const menu = useOverlays((s) => s.menu)
  const confirm = useOverlays((s) => s.confirm)

  useEffect(() => {

    const onContext = (e: MouseEvent) => {

      if (!(e.target as HTMLElement).closest("input, textarea")) e.preventDefault()
    }

    window.addEventListener("contextmenu", onContext)

    return () => window.removeEventListener("contextmenu", onContext)
  }, [])

  return (
    <>
      {menu && <ContextMenu key={`${menu.x},${menu.y}`} {...menu} />}
      {confirm && <ConfirmDialog {...confirm} onClose={() => useOverlays.setState({ confirm: null })} />}
      <Notices />
    </>
  )
}

function Notices() {
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

const EDGE = 8

function ContextMenu({ x, y, entries }: MenuState) {

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
              {entry.checked ? <Icon icon={Tick02Icon} /> : entry.icon ? <Icon icon={entry.icon} /> : null}
            </span>
            <span className="min-w-0 flex-1 truncate">{entry.label}</span>
            {entry.kbd && <span className="ml-6 text-small text-muted">{entry.kbd}</span>}
          </button>
        ),
      )}
    </div>,
    document.body,
  )
}

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

function ConfirmDialog({ title, body, action, onConfirm, onClose, tone = "danger", cancelLabel = "Cancel", onCancel, alternate }: ConfirmState & { onClose: () => void }) {
  return (
    <Modal
      title={title}
      labelId="confirm-title"
      onClose={onClose}
      footer={
        <>
          {alternate && (
            <Button
              className="mr-auto"
              onClick={() => {
                onClose()
                alternate.onSelect()
              }}
            >
              {alternate.label}
            </Button>
          )}
          <Button
            onClick={() => {
              onClose()
              onCancel?.()
            }}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={tone}
            icon={tone === "danger" ? Delete02Icon : undefined}
            autoFocus
            onClick={() => {
              onClose()
              onConfirm()
            }}
          >
            {action}
          </Button>
        </>
      }
    >
      <p className="text-h-sm leading-snug font-normal text-label">{body}</p>
    </Modal>
  )
}