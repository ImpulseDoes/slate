import { useRef, useState, type ReactNode } from "react"
import { trackPointer } from "../../lib/pointer"

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
          if (e.key === "Enter") e.currentTarget.blur()
          if (e.key === "Escape") {
            cancelled.current = draft !== null
            setDraft(null)
            e.currentTarget.blur()
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

        e.currentTarget.setPointerCapture(e.pointerId)

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
        trackPointer(move)
      }}
    >
      {children}
    </span>
  )
}
