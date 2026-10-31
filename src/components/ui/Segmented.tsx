import type { IconSvgElement } from "@hugeicons/react"
import { Icon } from "./Icon"

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
