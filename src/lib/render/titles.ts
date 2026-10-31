import type { TextProps } from "../../types"
import { t } from "../i18n"
import { BOX_COLOR, BOX_PAD_X, BOX_PAD_Y, canvasFont, LINE_HEIGHT, SHADOW_COLOR, SHADOW_OFFSET } from "../text/style"

// Matches the padding around a title in the viewer, as a share of the frame's width.
const PADDING = 0.04

function wrap(ctx: CanvasRenderingContext2D, content: string, maxWidth: number): string[] {
  return content.split("\n").flatMap((paragraph) => {
    const lines: string[] = []
    let line = ""
    for (const word of paragraph.split(/(?<=\s)/)) {
      if (line && ctx.measureText((line + word).trimEnd()).width > maxWidth) {
        lines.push(line.trimEnd())
        line = word
      } else {
        line += word
      }
    }
    return [...lines, line.trimEnd()]
  })
}

/**
 * FFmpeg has its own text engine, but it would break lines and space letters differently
 * than the viewer. `reveal` draws only that many characters, leaving the layout untouched.
 */
export async function drawTitle(text: TextProps, width: number, height: number, unit: number, reveal = Infinity): Promise<number[]> {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error(t("export.drawFailed"))
  const fontSize = text.size * unit
  const font = canvasFont(text, fontSize)
  await document.fonts.load(font, text.content)
  ctx.font = font
  ctx.textAlign = "left"
  ctx.textBaseline = "alphabetic"
  ctx.textRendering = "optimizeLegibility"
  ctx.lineJoin = "round"

  const lines = wrap(ctx, text.content, width * (1 - PADDING * 2))
  const lineHeight = fontSize * LINE_HEIGHT
  const { fontBoundingBoxAscent: ascent, fontBoundingBoxDescent: descent } = ctx.measureText("Hg")
  const top = (height - lines.length * lineHeight) / 2
  let left = reveal

  lines.forEach((line, i) => {
    const shown = line.slice(0, Math.max(0, left))
    const fullWidth = ctx.measureText(line).width
    const x = (width - fullWidth) / 2
    const y = top + i * lineHeight + (lineHeight - (ascent + descent)) / 2 + ascent
    left -= line.length + 1

    if (!shown) return

    if (text.box) {
      const { width: shownWidth } = ctx.measureText(shown)
      ctx.fillStyle = BOX_COLOR
      ctx.fillRect(x - BOX_PAD_X * fontSize, y - ascent - BOX_PAD_Y * fontSize, shownWidth + BOX_PAD_X * 2 * fontSize, ascent + descent + BOX_PAD_Y * 2 * fontSize)
    }

    if (text.shadow) {
      ctx.fillStyle = SHADOW_COLOR
      ctx.fillText(shown, x + SHADOW_OFFSET * fontSize, y + SHADOW_OFFSET * fontSize)
    }

    if (text.outline) {
      ctx.strokeStyle = text.outlineColor ?? "#000000"
      ctx.lineWidth = text.outline * 2 * unit
      ctx.strokeText(shown, x, y)
    }

    ctx.fillStyle = text.color
    ctx.fillText(shown, x, y)
  })

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
  if (!blob) throw new Error(t("export.drawFailed"))
  return [...new Uint8Array(await blob.arrayBuffer())]
}