import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { Image01Icon, MusicNote01Icon, TextIcon, Video01Icon } from "@hugeicons/core-free-icons"
import type { ClipType, MediaKind } from "../types"

export function Icon({ icon, size = 16, className }: { icon: IconSvgElement; size?: number; className?: string }) {
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={1.8} className={className} />
}

type ButtonVariant = "primary" | "secondary" | "quiet" | "danger"

const buttonStyles: Record<ButtonVariant, string> = {
  primary: "px-3 bg-primary text-on-primary shadow-control hover:bg-primary-strong",
  secondary: "px-3 bg-surface text-fg shadow-control ring-1 ring-border-strong hover:bg-raised",
  quiet: "px-2 text-label hover:text-fg hover:bg-raised",
  danger: "px-3 bg-danger text-white shadow-control hover:brightness-95",
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  icon?: IconSvgElement
  active?: boolean
}

export function Button({ variant = "secondary", icon, active, className = "", children, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={`inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md text-body font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-40 ${buttonStyles[variant]} ${active ? "bg-primary-soft text-on-primary-soft hover:bg-primary-soft hover:text-on-primary-soft" : ""} ${className}`}
    >
      {icon && <Icon icon={icon} />}
      {children}
    </button>
  )
}

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

export function TimePill({ children, icon, className = "" }: { children: ReactNode; icon?: IconSvgElement; className?: string }) {
  return (
    <span className={`tnum inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-raised px-2 text-small leading-none text-label ${className}`}>
      {icon && <Icon icon={icon} size={14} />}
      {children}
    </span>
  )
}

const chipMeta: Record<ClipType | MediaKind, { label: string; icon: IconSvgElement; color: string }> = {
  video: { label: "Video", icon: Video01Icon, color: "bg-clip-video text-clip-video-strong" },
  image: { label: "Image", icon: Image01Icon, color: "bg-clip-image text-clip-image-strong" },
  audio: { label: "Audio", icon: MusicNote01Icon, color: "bg-clip-audio text-clip-audio-strong" },
  text: { label: "Text", icon: TextIcon, color: "bg-clip-text text-clip-text-strong" },
}
export function TypeChip({ type, compact }: { type: ClipType | MediaKind; compact?: boolean }) {

  const m = chipMeta[type]

  return (
    <span className={`inline-flex shrink-0 items-center gap-1 font-semibold uppercase text-caps ${m.color} ${compact ? "h-5 rounded-xs px-1" : "h-6 rounded-sm px-1.5"}`}>
      <Icon icon={m.icon} size={compact ? 12 : 14} />
      {m.label}
    </span>
  )
}

export function StatusTag({ children, icon, tone = "muted" }: { children: ReactNode; icon?: IconSvgElement; tone?: "muted" | "error" | "progress" }) {
  const tones = {
    muted: "bg-raised text-label",
    error: "bg-danger-soft text-error",
    progress: "bg-clip-text text-clip-text-strong",
  }
  return (
    <span className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-sm px-1.5 font-semibold uppercase text-caps ${tones[tone]}`}>
      {icon && <Icon icon={icon} size={14} />}
      {children}
    </span>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string; icon: IconSvgElement }[]; onChange: (id: T) => void }) {
  return (
    <div role="tablist" className="flex gap-0.5 rounded-lg bg-raised p-1">
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={o.id === value}
          onClick={() => onChange(o.id)}
          className={`inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md text-body transition-colors ${o.id === value ? "bg-surface text-fg shadow-control ring-1 ring-border" : "text-label hover:text-fg"}`}
        >
          <Icon icon={o.icon} />
          <span className="truncate">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

interface NumberFieldProps {
  value: number
  onChange: (v: number) => void
  onBegin?: () => void
  min?: number
  max?: number
  step?: number
  unit?: string
  precision?: number
  disabled?: boolean
}

export function NumberField({ value, onChange, onBegin, min = -Infinity, max = Infinity, step = 1, unit, precision = 0, disabled }: NumberFieldProps) {

  const [draft, setDraft] = useState<string | null>(null)
  const cancelled = useRef(false)
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  const shown = draft ?? value.toFixed(precision)

  const commit = () => {

    if (draft === null) return

    const v = Number(draft)

    setDraft(null)

    if (cancelled.current) {
      cancelled.current = false
      return
    }

    if (Number.isFinite(v) && v !== value) {
      onBegin?.()
      onChange(clamp(v))
    }
  }

  return (
    <div className={`group flex h-8 min-w-0 flex-1 items-center rounded-md bg-raised focus-within:outline-2 focus-within:outline-primary ${disabled ? "opacity-40" : ""}`}>
      <input
        type="number"
        disabled={disabled}
        className="tnum h-full w-full min-w-0 bg-transparent px-2 text-body text-fg outline-none"
        value={shown}
        step={step}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur()
          if (e.key === "Escape") {
            cancelled.current = draft !== null
            setDraft(null)
              ; (e.target as HTMLInputElement).blur()
          }
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault()
            onBegin?.()
            const d = (e.key === "ArrowUp" ? 1 : -1) * step * (e.shiftKey ? 10 : 1)
            onChange(clamp(Number((value + d).toFixed(precision))))
            setDraft(null)
          }
        }}
      />
      {unit && <span className="pr-2 text-body text-muted">{unit}</span>}
    </div>
  )
}

export function Select<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string; disabled?: boolean }[]; onChange: (id: T) => void; label: string }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="h-8 w-full min-w-0 rounded-md bg-raised px-2 text-body text-fg outline-none focus-visible:outline-2 focus-visible:outline-primary"
    >
      {options.map((o) => (
        <option key={o.id} value={o.id} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center">
      <span className="w-28 shrink-0 text-label">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
    </div>
  )
}

interface ScrubProps {
  value: number
  step: number
  onChange: (v: number) => void
  onBegin?: () => void
  disabled?: boolean
  children: ReactNode
  className?: string
}

export function Scrub({ value, step, onChange, onBegin, disabled, children, className = "" }: ScrubProps) {
  return (
    <span
      className={`${disabled ? "" : "cursor-ew-resize"} ${className}`}
      onPointerDown={(e) => {

        if (disabled) return

        e.preventDefault()

        const el = e.currentTarget

        el.setPointerCapture(e.pointerId)

        const startX = e.clientX
        const startValue = value

        let begun = false

        const move = (ev: PointerEvent) => {

          const dx = ev.clientX - startX

          if (!begun) {

            if (Math.abs(dx) < 2) return

            begun = true
            onBegin?.()
          }
          const mult = ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1
          onChange(startValue + dx * step * mult)
        }
        const up = () => {
          el.removeEventListener("pointermove", move)
          el.removeEventListener("pointerup", up)
        }
        el.addEventListener("pointermove", move)
        el.addEventListener("pointerup", up)
      }}
    >
      {children}
    </span>
  )
}