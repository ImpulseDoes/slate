import type { AnimatedProp, Clip, ClipProps, Easing, Keyframe } from "../types"

type ClipKeys = NonNullable<Clip["keys"]>
import { clipEnd, sourceAt } from "./clips"
import { ticks } from "./time"

export const ANIMATED: AnimatedProp[] = ["x", "y", "scale", "rotation", "opacity", "volume"]
const TRANSFORM: AnimatedProp[] = ["x", "y", "scale", "rotation"]

const TEXT_IN = ticks(0.4)
const TYPE_PER_CHARACTER = ticks(0.04)

const CURVES: Record<Easing, (p: number) => number> = {
  linear: (p) => p,
  smooth: (p) => p * p * (3 - 2 * p),
  in: (p) => p * p,
  out: (p) => p * (2 - p),
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Slightly past the end and back, which is what makes a title pop. */
const overshoot = (p: number) => 1 + 2.7 * Math.pow(p - 1, 3) + 1.7 * Math.pow(p - 1, 2)

export const keyNear = (keys: Keyframe[], at: number, tolerance: number) => keys.find((k) => Math.abs(k.at - at) <= tolerance)

export const withoutKey = (keys: Keyframe[], at: number, tolerance: number) => keys.filter((k) => Math.abs(k.at - at) > tolerance)

export function withKey(keys: Keyframe[], at: number, value: number, tolerance: number) {

  const near = keyNear(keys, at, tolerance)
  // A new key keeps the curve of the stretch it lands in, so that stretch doesn't change shape.
  const key = { at: near?.at ?? at, value, ease: near?.ease ?? keys.filter((k) => k.at < at).pop()?.ease ?? "smooth" as const }

  return [...withoutKey(keys, at, tolerance), key].sort((a, b) => a.at - b.at)
}

/** The key that starts the stretch `at` is in. The final key leads nowhere, so on or past it that's the one before. */
export function leadingKey(keys: Keyframe[], at: number) {

  const passed = keys.filter((k) => k.at <= at).length

  return keys[Math.max(0, Math.min(passed - 1, keys.length - 2))]
}

export const shiftKeys = (keys: ClipKeys, by: number): ClipKeys =>
  Object.fromEntries(Object.entries(keys).map(([prop, list]) => [prop, list?.map((k) => ({ ...k, at: k.at + by }))]))

export function valueAt(keys: Keyframe[], at: number) {

  if (at <= keys[0].at) return keys[0].value

  for (let i = 1; i < keys.length; i++) {

    const a = keys[i - 1]
    const b = keys[i]

    if (at < b.at) return a.value + (b.value - a.value) * CURVES[a.ease]((at - a.at) / (b.at - a.at))
  }

  return keys[keys.length - 1].value
}

/** A clip's properties at timeline time `time`, with its keyframes applied: the values a user edits. */
export function keyedPropsAt(clip: Clip, time: number): ClipProps {

  const props = { ...clip.props }

  if (clip.keys) {
    const at = sourceAt(clip, time)
    for (const prop of ANIMATED) {
      const keys = clip.keys[prop]
      if (keys?.length) props[prop] = valueAt(keys, at)
    }
  }

  return props
}

/** What actually shows at `time`: the keyed values plus a title's animation. */
export function propsAt(clip: Clip, time: number): ClipProps {

  const props = keyedPropsAt(clip, time)
  const animation = clip.text?.animation

  if (animation && animation !== "typewriter") {

    const p = clamp01((time - clip.start) / TEXT_IN)

    props.opacity *= animation === "pop" ? clamp01(p * 2) : p
    if (animation === "pop") props.scale *= 0.6 + 0.4 * overshoot(p)
    if (animation === "slide") props.y += (1 - CURVES.out(p)) * clip.text!.size
  }

  return props
}

/** How many characters of a typewriter title show at `time`. */
export const typedAt = (clip: Clip, time: number) => Math.floor(Math.max(0, time - clip.start) / TYPE_PER_CHARACTER) + 1

/** One still per typed character, so a render can treat a typewriter title as a run of short clips. */
export function typewriterSteps(clip: Clip): { clip: Clip; reveal: number }[] {

  const total = clip.text!.content.length
  const end = clipEnd(clip)
  const steps: { clip: Clip; reveal: number }[] = []

  for (let reveal = 1; reveal <= total; reveal++) {

    const start = clip.start + (reveal - 1) * TYPE_PER_CHARACTER
    const stop = reveal === total ? end : Math.min(end, start + TYPE_PER_CHARACTER)

    if (start >= end) break

    steps.push({
      reveal: stop === end ? total : reveal,
      clip: { ...clip, id: `${clip.id}~${reveal}`, start, offset: sourceAt(clip, start), duration: stop - start, enter: reveal === 1 ? clip.enter : undefined, exit: stop === end ? clip.exit : undefined },
    })

    if (stop === end) break
  }

  return steps
}

export const hasMovement = (clip: Clip) =>
  TRANSFORM.some((prop) => new Set(clip.keys?.[prop]?.map((k) => k.value)).size > 1) || clip.text?.animation === "pop" || clip.text?.animation === "slide"

const entering = (clip: Clip, time: number) => (clip.enter ? clamp01((time - clip.start) / Math.min(clip.enter.duration, clip.duration)) : 1)

const leaving = (clip: Clip, time: number) => (clip.exit ? clamp01((clipEnd(clip) - time) / Math.min(clip.exit.duration, clip.duration)) : 1)

/** How much of the picture shows, 0 to 1. A dip goes through black instead, see `dipAt`. */
export function visibleAt(clip: Clip, time: number, tail = 0) {

  const shown = clip.enter && clip.enter.kind !== "dip" ? entering(clip, time) : 1

  return tail || clip.exit?.kind !== "fade" ? shown : shown * leaving(clip, time)
}

/** How far a dip to black has gone at `time`, 0 to 1. */
export function dipAt(clip: Clip, time: number, tail = 0) {

  const before = clip.enter?.kind === "dip" ? 1 - entering(clip, time) : 0
  const after = !tail && clip.exit?.kind === "dip" ? 1 - leaving(clip, time) : 0

  return Math.max(before, after)
}

/** Sound follows every transition. Under a dissolve it hands over to the next clip. */
export function soundAt(clip: Clip, time: number, tail = 0) {

  const end = clipEnd(clip)
  const handover = tail && time > end ? 1 - clamp01((time - end) / tail) : 1

  return entering(clip, time) * (tail ? handover : leaving(clip, time))
}

/**
 * How long each clip keeps playing under the next one's dissolve, by clip id.
 * The clip that comes in fades over the one before, so the cut itself stays where it is.
 */
export function dissolveTails(clips: Clip[]) {

  const ends = new Map<string, Clip>()

  for (const c of clips) ends.set(`${c.trackId}:${clipEnd(c)}`, c)

  const tails = new Map<string, number>()

  for (const c of clips) {

    if (c.enter?.kind !== "dissolve") continue

    const before = ends.get(`${c.trackId}:${c.start}`)

    if (before) tails.set(before.id, Math.min(c.enter.duration, c.duration))
  }

  return tails
}

/** A cover: the source fills the region, and what sticks out is cropped away. Returns the clip's placement. */
export function coverRegion(sourceWidth: number, sourceHeight: number, canvasWidth: number, canvasHeight: number, region: { x: number; y: number; width: number; height: number }) {

  const fit = Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight)
  const scale = Math.max(region.width / sourceWidth, region.height / sourceHeight)
  const left = (1 - region.width / scale / sourceWidth) / 2
  const top = (1 - region.height / scale / sourceHeight) / 2

  return {
    props: { x: region.x + region.width / 2 - canvasWidth / 2, y: region.y + region.height / 2 - canvasHeight / 2, scale: (scale / fit) * 100, rotation: 0 },
    crop: { left, right: left, top, bottom: top },
  }
}