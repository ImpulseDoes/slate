import type { IconSvgElement } from "@hugeicons/react"
import { create } from "zustand"

export type MenuEntry =
  | "divider"
  | {
    label: string
    icon?: IconSvgElement
    kbd?: string
    danger?: boolean
    disabled?: boolean
    checked?: boolean
    /** A color dot in place of the icon. */
    swatch?: string
    onSelect: () => void
  }

export interface MenuState {
  x: number
  y: number
  entries: MenuEntry[]
}

export interface ConfirmState {
  title: string
  body: string
  action: string
  onConfirm: () => void
  tone?: "danger" | "primary"
  cancelLabel?: string
  onCancel?: () => void
  alternate?: { label: string; onSelect: () => void }
}

export type DialogName = "export" | "settings" | "renders" | "language" | "marker" | "silence" | "vertical" | "autoCaptions"

export interface Notice {
  id: number
  text: string
  tone: "info" | "error"
}

export const useOverlays = create<{ menu: MenuState | null; confirm: ConfirmState | null; dialog: DialogName | null; markerId: string | null; notices: Notice[] }>(() => ({ menu: null, confirm: null, dialog: null, markerId: null, notices: [] }))

const NOTICE_MS = 7000
let noticeId = 0

export const openDialog = (dialog: DialogName | null) => useOverlays.setState({ dialog })

export const editMarker = (markerId: string) => useOverlays.setState({ dialog: "marker", markerId })

export function notify(text: string, tone: Notice["tone"] = "info") {
  const id = ++noticeId
  useOverlays.setState((s) => ({ notices: [...s.notices, { id, text, tone }] }))
  setTimeout(() => useOverlays.setState((s) => ({ notices: s.notices.filter((n) => n.id !== id) })), NOTICE_MS)
}

export function openMenuBelow(e: React.MouseEvent, entries: MenuEntry[]) {
  const r = e.currentTarget.getBoundingClientRect()
  useOverlays.setState({ menu: { x: r.left, y: r.bottom + 4, entries } })
}

export function openMenu(e: React.MouseEvent, entries: MenuEntry[]) {
  e.preventDefault()
  e.stopPropagation()
  useOverlays.setState({ menu: { x: e.clientX, y: e.clientY, entries } })
}

export const closeMenu = () => useOverlays.setState({ menu: null })

export const confirmAction = (confirm: ConfirmState) => useOverlays.setState({ confirm })

export const closeConfirm = () => useOverlays.setState({ confirm: null })