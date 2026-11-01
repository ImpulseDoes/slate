import { useEditor } from "../store/editor"
import type { Keyframe } from "../types"
import { keyedPropsAt, leadingKey } from "./animation"
import { clipEnd, sourceAt, speedOf } from "./clips"
import { frameTicks, ticks } from "./time"

export type ZoomKind = "in" | "out" | "punch"

const DRIFT = 1.3
const PUNCH = 1.5
const PUNCH_RAMP = ticks(0.25)
const PUNCH_HOLD = ticks(1.5)

/** Ready-made zooms. They're plain keyframes, so they can be adjusted like any others. */
export function addZoom(id: string, kind: ZoomKind) {

  const state = useEditor.getState()
  const clip = state.clips.find((c) => c.id === id)

  if (!clip) return

  const frame = frameTicks(state.settings.fps)
  const start = clip.start
  // The last frame, not the last tick: the playhead can stop on it, so the key can be edited.
  const end = Math.max(start, clipEnd(clip) - frame)
  const at = Math.min(end, Math.max(start, state.playhead))
  const sizeAt = (time: number) => keyedPropsAt(clip, Math.min(end, time)).scale
  const key = (time: number, value: number): Keyframe => ({ at: sourceAt(clip, Math.min(end, time)), value, ease: "smooth" })

  // Doing a zoom again replaces it from the same size, instead of zooming further each time.
  const base = () => Math.min(sizeAt(start), sizeAt(end))

  // A punch-in is a moment, so it goes in among the keys around it and hands back to their curve.
  const punch = () => {

    const size = sizeAt(at)
    const hold = at + PUNCH_RAMP + PUNCH_HOLD
    const back = hold + PUNCH_RAMP
    const stops = [key(at, size), key(at + PUNCH_RAMP, size * PUNCH), key(hold, size * PUNCH), key(back, sizeAt(back))]
    const placed = stops.filter((k, i) => !i || k.at !== stops[i - 1].at)
    const around = clip.keys?.scale ?? []
    const reach = (frame * speedOf(clip)) / 2
    const last = placed[placed.length - 1]
    const kept = around.filter((k) => k.at < placed[0].at - reach || k.at > last.at + reach)

    if (around.length) last.ease = leadingKey(around, last.at).ease

    return [...kept, ...placed].sort((a, b) => a.at - b.at)
  }

  const keys = {
    in: () => [key(start, base()), key(end, base() * DRIFT)],
    out: () => [key(start, base() * DRIFT), key(end, base())],
    punch,
  }[kind]()

  state.transact((s) => ({ clips: s.clips.map((c) => (c.id === id ? { ...c, keys: { ...c.keys, scale: keys } } : c)) }))
}