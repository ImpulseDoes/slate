import { useEffect, useRef } from "react"
import { propsAt, soundAt } from "../../lib/animation"
import { setGain, routeToBus } from "../../lib/audio/mixer"
import { sourceAt, speedOf } from "../../lib/clips"
import { frameTicks, sec } from "../../lib/time"
import { useEditor } from "../../store/editor"
import type { Clip, MediaItem } from "../../types"

const DRIFT = 0.25

export function SyncedMedia({ kind, clip, media, active, muted, tail, style, onPointerDown }: { kind: "video" | "audio"; clip: Clip; media: MediaItem; active: boolean; muted: boolean; tail: number; style?: React.CSSProperties; onPointerDown?: React.PointerEventHandler }) {

  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null)
  const playhead = useEditor((s) => s.playhead)
  const playing = useEditor((s) => s.playing)
  const fps = useEditor((s) => s.settings.fps)
  const speed = speedOf(clip)

  useEffect(() => {
    if (ref.current) routeToBus(ref.current)
  }, [])

  useEffect(() => {

    const el = ref.current

    if (!el) return

    el.muted = muted
    el.playbackRate = speed
    setGain(el, (propsAt(clip, playhead).volume / 100) * soundAt(clip, playhead, tail))

    if (!active) {

      if (!el.paused) el.pause()
      if (Math.abs(el.currentTime - sec(clip.offset)) > 0.05) el.currentTime = sec(clip.offset)

      return

    }

    // Past the end of its source, under a dissolve, the clip holds its last frame.
    const target = Math.min(sec(sourceAt(clip, playhead)), sec(media.duration))

    if (playing) {

      if (el.paused) {

        el.currentTime = target

        void el.play().catch(() => { })

      } else if (Math.abs(el.currentTime - target) > DRIFT * Math.max(1, speed)) {
        el.currentTime = target
      }
    } else {

      if (!el.paused) el.pause()
      if (Math.abs(el.currentTime - target) > (sec(frameTicks(fps)) * speed) / 2) el.currentTime = target

    }
  }, [playhead, playing, active, muted, clip, speed, tail, media.duration, fps])

  if (kind === "audio") return <audio ref={ref} crossOrigin="anonymous" src={media.src} preload="auto" />

  return <video ref={ref} crossOrigin="anonymous" src={media.src} preload="auto" playsInline onPointerDown={onPointerDown} className="absolute inset-0 h-full w-full object-contain" style={style} />
}