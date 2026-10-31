import { useEffect, useRef, useState } from "react"
import { clipTypeForMedia, trackKindFor } from "../../lib/clips"
import { useEditor } from "../../store/editor"
import { useMediaDrag } from "../../store/mediaDrag"
import type { Track } from "../../types"
import { CLIP_COLORS } from "../ui"
import { laneAt } from "./layout"

export function DropPreview({ track, ppt }: { track: Track; ppt: number }) {

  const drag = useMediaDrag((s) => s.drag)
  const media = useEditor((s) => (drag ? s.media.find((m) => m.id === drag.mediaId) : undefined))
  const ref = useRef<HTMLDivElement>(null)
  const [left, setLeft] = useState<number | null>(null)

  useEffect(() => {

    const laneEl = ref.current?.parentElement

    if (!drag || !media || !laneEl || track.locked || trackKindFor(clipTypeForMedia(media)) !== track.kind) return setLeft(null)
    if (laneAt(drag.x, drag.y) !== laneEl) return setLeft(null)
    setLeft(Math.max(0, drag.x - laneEl.getBoundingClientRect().left))
  }, [drag, media, track])

  return (
    <div ref={ref} className="contents">
      {left !== null && media && (
        <div
          className={`pointer-events-none absolute rounded-sm opacity-70 ${CLIP_COLORS[media.kind]}`}
          style={{ left, width: Math.max(4, media.duration * ppt), top: 2, bottom: 2 }}
        />
      )}
    </div>
  )
}
