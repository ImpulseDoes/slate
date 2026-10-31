import type { ReactNode } from "react"
import type { IconSvgElement } from "@hugeicons/react"
import { Refresh01Icon } from "@hugeicons/core-free-icons"
import { Button, Icon, NumberField, Scrub } from "../ui"

export function ResetRow({ onReset, children }: { onReset: () => void; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="flex-1">{children}</div>
      <Button variant="quiet" icon={Refresh01Icon} onClick={onReset}>
        Reset
      </Button>
    </div>
  )
}

export function InfoRow({ icon, label, children }: { icon?: IconSvgElement; label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-6 items-center">
      <span className="flex w-[112px] shrink-0 items-center gap-2 text-label">
        {icon && <Icon icon={icon} />}
        {label}
      </span>
      <span className="flex flex-1 items-center text-fg">{children}</span>
    </div>
  )
}

interface PropertyRowProps {
  icon: IconSvgElement
  label: string
  value: number
  onChange: (v: number) => void
  onBegin: () => void
  min?: number
  max?: number
  step?: number
  unit?: string
}

export function PropertyRow({ icon, label, value, onChange, onBegin, min = -100000, max = 100000, step = 1, unit }: PropertyRowProps) {

  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  const precision = step < 1 ? 1 : 0

  return (
    <div className="flex h-8 items-center">
      <Scrub value={value} step={step} onBegin={onBegin} onChange={(v) => onChange(clamp(Number(v.toFixed(precision))))} className="flex w-[112px] shrink-0 items-center gap-2 text-label hover:text-fg">
        <Icon icon={icon} />
        <span className="truncate">{label}</span>
      </Scrub>
      <div className="flex min-w-0 flex-1">
        <NumberField value={value} onChange={onChange} onBegin={onBegin} min={min} max={max} step={step} unit={unit} precision={precision} />
      </div>
    </div>
  )
}
