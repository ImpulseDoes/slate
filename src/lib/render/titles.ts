import type { TextProps } from "../../types"

// Matches the padding around a title in the viewer, as a share of the frame's width.
const PADDING = 0.04
const LINE_HEIGHT = 1.1

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

// FFmpeg has its own text engine, but it would break lines and space letters differently than the viewer.
export async function drawTitle(text: TextProps, width: number, height: number, fontSize: number): Promise<number[]> {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Couldn't draw a title.")
  const font = `600 ${fontSize}px Inter`
  await document.fonts.load(font, text.content)
  ctx.font = font
  ctx.fillStyle = text.color
  ctx.textAlign = "center"
  ctx.textBaseline = "alphabetic"
  ctx.textRendering = "optimizeLegibility"

  const lines = wrap(ctx, text.content, width * (1 - PADDING * 2))
  const lineHeight = fontSize * LINE_HEIGHT
  const { fontBoundingBoxAscent: ascent, fontBoundingBoxDescent: descent } = ctx.measureText("Hg")
  const top = (height - lines.length * lineHeight) / 2
  lines.forEach((line, i) => ctx.fillText(line, width / 2, top + i * lineHeight + (lineHeight - (ascent + descent)) / 2 + ascent))

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
  if (!blob) throw new Error("Couldn't draw a title.")
  return [...new Uint8Array(await blob.arrayBuffer())]
}
