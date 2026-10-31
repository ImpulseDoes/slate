import type { Clip, ClipProps, Track } from "../../types"

// A detached video clip has handed its sound to its audio clip.
export const audible = (clip: Clip, track: Track) => !track.muted && !track.hidden && !clip.audioDetached && clip.type !== "text"

export interface Layer {
  crop: { x: number; y: number; width: number; height: number } | null
  width: number
  height: number
  centerX: number
  centerY: number
  radians: number
}

/**
 * Only the part that can reach the canvas is kept, so a clip zoomed to 1000% costs
 * no more than one at 100%. Null means none of it shows. `unit` converts project
 * pixels, which positions are stored in, to canvas pixels.
 */
export function placeLayer(sourceWidth: number, sourceHeight: number, canvasWidth: number, canvasHeight: number, props: ClipProps, unit: number): Layer | null {

  const scale = (Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight) * props.scale) / 100
  const halfWidth = (sourceWidth * scale) / 2
  const halfHeight = (sourceHeight * scale) / 2
  const radians = (props.rotation * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const moveX = props.x * unit
  const moveY = props.y * unit

  const seen = [-1, 1].flatMap((sx) =>
    [-1, 1].map((sy) => {
      const px = (sx * canvasWidth) / 2 - moveX
      const py = (sy * canvasHeight) / 2 - moveY
      return { u: px * cos + py * sin, v: -px * sin + py * cos }
    }),
  )

  const left = Math.max(-halfWidth, Math.min(...seen.map((p) => p.u)))
  const right = Math.min(halfWidth, Math.max(...seen.map((p) => p.u)))
  const top = Math.max(-halfHeight, Math.min(...seen.map((p) => p.v)))
  const bottom = Math.min(halfHeight, Math.max(...seen.map((p) => p.v)))

  if (left >= right || top >= bottom) return null

  const x = Math.max(0, Math.floor((left + halfWidth) / scale))
  const y = Math.max(0, Math.floor((top + halfHeight) / scale))
  const width = Math.min(sourceWidth - x, Math.ceil((right + halfWidth) / scale) - x)
  const height = Math.min(sourceHeight - y, Math.ceil((bottom + halfHeight) / scale) - y)
  const whole = x === 0 && y === 0 && width === sourceWidth && height === sourceHeight

  const shiftU = (x + width / 2) * scale - halfWidth
  const shiftV = (y + height / 2) * scale - halfHeight

  return {
    crop: whole ? null : { x, y, width, height },
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    centerX: canvasWidth / 2 + moveX + shiftU * cos - shiftV * sin,
    centerY: canvasHeight / 2 + moveY + shiftU * sin + shiftV * cos,
    radians,
  }
}