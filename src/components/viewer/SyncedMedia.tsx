import { useEffect, useReducer, useRef } from "react"
import { propsAt, soundAt } from "../../lib/animation"
import { setGain, routeToBus } from "../../lib/audio/mixer"
import { sourceAt, speedOf } from "../../lib/clips"
import { watchMedia } from "../../lib/media/onScreen"
import { frameTicks, sec } from "../../lib/time"
import { useEditor } from "../../store/editor"
import type { Clip, MediaItem } from "../../types"

const DRIFT = 0.25
const CLOSE = 0.05

/** One seek at a time: a new one would throw away the frame still being decoded. Finishing triggers the next. */
function seek(el: HTMLMediaElement, to: number, tolerance: number) {

  if (!el.seeking && Math.abs(el.currentTime - to) > tolerance) el.currentTime = to
}

export function SyncedMedia({ kind, clip, media, src = media.src, active, muted, tail, style, onPointerDown }: { kind: "video" | "audio"; clip: Clip; media: MediaItem; src?: string; active: boolean; muted: boolean; tail: number; style?: React.CSSProperties; onPointerDown?: React.PointerEventHandler }) {

  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null)
  const playhead = useEditor((s) => s.playhead)
  const playing = useEditor((s) => s.playing)
  const fps = useEditor((s) => s.settings.fps)
  const speed = speedOf(clip)
  const [settled, settle] = useReducer((n: number) => n + 1, 0)

  useEffect(() => {

    const el = ref.current

    if (!el) return

    routeToBus(el)
    el.addEventListener("seeked", settle)

    return () => el.removeEventListener("seeked", settle)
  }, [])

  useEffect(() => {
    if (active && ref.current) return watchMedia(ref.current)
  }, [active])

  useEffect(() => {

    const el = ref.current

    if (!el) return

    el.muted = muted
    el.playbackRate = speed
    setGain(el, (propsAt(clip, playhead).volume / 100) * soundAt(clip, playhead, tail))

    if (!active) {

      if (!el.paused) el.pause()
      seek(el, sec(clip.offset), CLOSE)

      return

    }

    // Past the end of its source, under a dissolve, the clip holds its last frame.
    const last = Number.isFinite(el.duration) ? Math.min(el.duration, sec(media.duration)) : sec(media.duration)
    const target = Math.min(sec(sourceAt(clip, playhead)), last)

    if (playing && target < last) {

      if (el.paused) {

        seek(el, target, CLOSE)

        void el.play().catch(() => { })

      } else {
        seek(el, target, DRIFT * Math.max(1, speed))
      }
    } else {

      if (!el.paused) el.pause()

      seek(el, target, (sec(frameTicks(fps)) * speed) / 2)

    }
  }, [playhead, playing, active, muted, clip, speed, tail, src, media.duration, fps, settled])

  if (kind === "audio") return <audio ref={ref} crossOrigin="anonymous" src={src} preload="auto" />

  return <video ref={ref} crossOrigin="anonymous" src={src} preload="auto" playsInline onPointerDown={onPointerDown} className="absolute inset-0 h-full w-full object-contain" style={style} />
}