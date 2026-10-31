import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

export function Icon({ icon, size = 16, className }: { icon: IconSvgElement; size?: number; className?: string }) {
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={1.8} className={className} />
}
