import { useEditor } from "../store/editor"
import type { Keyframe } from "../types"
import { keyedPropsAt } from "./animation"
import { clipEnd, sourceAt } from "./clips"
import { ticks } from "./time"

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

  const start = clip.start
  const end = clipEnd(clip) - 1
  const at = Math.min(end, Math.max(start, state.playhead))
  const base = keyedPropsAt(clip, at).scale
  const key = (time: number, value: number): Keyframe => ({ at: sourceAt(clip, Math.min(end, time)), value, ease: "smooth" })
  const keys = {
    in: () => [key(start, base), key(end, base * DRIFT)],
    out: () => [key(start, base * DRIFT), key(end, base)],
    punch: () => [key(at, base), key(at + PUNCH_RAMP, base * PUNCH), key(at + PUNCH_RAMP + PUNCH_HOLD, base * PUNCH), key(at + PUNCH_RAMP * 2 + PUNCH_HOLD, base)],
  }[kind]()

  state.transact((s) => ({ clips: s.clips.map((c) => (c.id === id ? { ...c, keys: { ...c.keys, scale: keys } } : c)) }))
}