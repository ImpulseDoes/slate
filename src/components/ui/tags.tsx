import type { ReactNode } from "react"
import type { IconSvgElement } from "@hugeicons/react"
import { Image01Icon, MusicNote01Icon, TextIcon, Video01Icon } from "@hugeicons/core-free-icons"
import type { ClipType, MediaKind } from "../../types"
import { CLIP_COLORS } from "./clipColors"
import { Icon } from "./Icon"

export function TimePill({ children, icon, className = "" }: { children: ReactNode; icon?: IconSvgElement; className?: string }) {
  return (
    <span className={`tnum inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-raised px-2 text-small leading-none text-label ${className}`}>
      {icon && <Icon icon={icon} size={14} />}
      {children}
    </span>
  )
}

const chipMeta: Record<ClipType | MediaKind, { label: string; icon: IconSvgElement }> = {
  video: { label: "Video", icon: Video01Icon },
  image: { label: "Image", icon: Image01Icon },
  audio: { label: "Audio", icon: MusicNote01Icon },
  text: { label: "Text", icon: TextIcon },
}

export function TypeChip({ type, compact }: { type: ClipType | MediaKind; compact?: boolean }) {

  const m = chipMeta[type]

  return (
    <span className={`inline-flex shrink-0 items-center gap-1 font-semibold uppercase text-caps ${CLIP_COLORS[type]} ${compact ? "h-5 rounded-xs px-1" : "h-6 rounded-sm px-1.5"}`}>
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