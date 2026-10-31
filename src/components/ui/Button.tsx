import type { ButtonHTMLAttributes } from "react"
import type { IconSvgElement } from "@hugeicons/react"
import { Icon } from "./Icon"

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