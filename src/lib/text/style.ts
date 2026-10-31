import type { TextProps } from "../../types"

export const DEFAULT_FONT = "Inter"
export const TITLE_WEIGHT = 600
export const LINE_HEIGHT = 1.1
/** Offset of the hard drop shadow, and the padding of the caption box, as shares of the text size. */
export const SHADOW_OFFSET = 0.07
export const SHADOW_COLOR = "rgba(0,0,0,0.75)"
export const BOX_PAD_X = 0.3
export const BOX_PAD_Y = 0.06
export const BOX_COLOR = "rgba(0,0,0,0.65)"

const familyOf = (text: TextProps) => `"${text.font ?? DEFAULT_FONT}", ${DEFAULT_FONT}, sans-serif`

export const canvasFont = (text: TextProps, size: number) => `${TITLE_WEIGHT} ${size}px ${familyOf(text)}`

/** The title's look in the viewer. Sizes are shares of the frame's width, so it scales with the viewer. */
export function titleStyle(text: TextProps, frameWidth: number): React.CSSProperties {

  const cqw = (px: number) => `${(px / frameWidth) * 100}cqw`

  return {
    color: text.color,
    fontFamily: familyOf(text),
    fontSize: cqw(text.size),
    lineHeight: LINE_HEIGHT,
    WebkitTextStroke: text.outline ? `${cqw(text.outline * 2)} ${text.outlineColor ?? "#000000"}` : undefined,
    paintOrder: "stroke fill",
    textShadow: text.shadow ? `${SHADOW_OFFSET}em ${SHADOW_OFFSET}em 0 ${SHADOW_COLOR}` : undefined,
    background: text.box ? BOX_COLOR : undefined,
    padding: text.box ? `${BOX_PAD_Y}em ${BOX_PAD_X}em` : undefined,
    boxDecorationBreak: text.box ? "clone" : undefined,
    WebkitBoxDecorationBreak: text.box ? "clone" : undefined,
  }
}