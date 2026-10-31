import { useEffect, useRef } from "react"
import { frameTicks, sec } from "../../lib/time"
import { useEditor } from "../../store/editor"
import type { Clip, MediaItem } from "../../types"

const DRIFT = 0.25

export function SyncedMedia({ kind, clip, media, active, muted, style, onPointerDown }: { kind: "video" | "audio"; clip: Clip; media: MediaItem; active: boolean; muted: boolean; style?: React.CSSProperties; onPointerDown?: React.PointerEventHandler }) {

  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null)
  const playhead = useEditor((s) => s.playhead)
  const playing = useEditor((s) => s.playing)
  const fps = useEditor((s) => s.settings.fps)

  useEffect(() => {

    const el = ref.current

    if (!el) return

    el.muted = muted
    el.volume = Math.min(1, Math.max(0, clip.props.volume / 100))

    if (!active) {

      if (!el.paused) el.pause()
      if (Math.abs(el.currentTime - sec(clip.offset)) > 0.05) el.currentTime = sec(clip.offset)

      return

    }

    const target = sec(clip.offset + (playhead - clip.start))

    if (playing) {

      if (el.paused) {

        el.currentTime = target

        void el.play().catch(() => { })

      } else if (Math.abs(el.currentTime - target) > DRIFT) {
        el.currentTime = target
      }
    } else {

      if (!el.paused) el.pause()
      if (Math.abs(el.currentTime - target) > sec(frameTicks(fps)) / 2) el.currentTime = target

    }
  }, [playhead, playing, active, muted, clip.offset, clip.start, clip.props.volume, fps])

  if (kind === "audio") return <audio ref={ref} src={media.src} preload="auto" />

  return <video ref={ref} src={media.src} preload="auto" playsInline onPointerDown={onPointerDown} className="absolute inset-0 h-full w-full object-contain" style={style} />
}
