import { memo } from "react"
import { Link01Icon } from "@hugeicons/core-free-icons"
import type { Clip, MediaItem } from "../../types"
import { CLIP_COLORS, Icon } from "../ui"
import { Filmstrip } from "./Filmstrip"
import type { DragMode } from "./gestures"
import { CLIP_LABEL_H } from "./layout"
import { clipMenu } from "./menus"
import { Waveform } from "./Waveform"

interface ClipViewProps {
  clip: Clip
  media?: MediaItem
  ppt: number
  height: number
  selected: boolean
  dragging: boolean
  linked: boolean
  locked: boolean
  onDragStart: (e: React.PointerEvent, clip: Clip, mode: DragMode) => void
}

export const ClipView = memo(function ClipView({ clip, media, ppt, height, selected, dragging, linked, locked, onDragStart }: ClipViewProps) {
  const left = clip.start * ppt
  const width = Math.max(2, clip.duration * ppt)
  const offline = media?.status === "missing"
  const handles = !locked && width > 14

  return (
    <div
      className={`group absolute overflow-hidden rounded-sm ${offline ? "bg-danger-soft text-error" : CLIP_COLORS[media?.kind === "image" ? "image" : clip.type]} ${selected ? "z-[5] outline-2 outline-offset-1 outline-primary" : ""} ${dragging ? "z-[6] opacity-90 shadow-float" : ""} ${locked ? "cursor-not-allowed" : ""}`}
      style={{ left, width, top: 2, height: height - 4 }}
      onPointerDown={(e) => onDragStart(e, clip, "move")}
      onContextMenu={(e) => clipMenu(e, clip, locked)}
      title={clip.name}
    >
      <div className="flex items-center gap-1 px-2 text-small font-semibold" style={{ height: CLIP_LABEL_H }}>
        {linked && <Icon icon={Link01Icon} size={12} className="shrink-0" />}
        <span className="truncate">{offline ? `Offline: ${clip.name}` : clip.name}</span>
      </div>
      <div className="relative overflow-hidden" style={{ height: height - 4 - CLIP_LABEL_H }}>
        {clip.type === "video" && media && <Filmstrip clip={clip} media={media} ppt={ppt} width={width} height={height - 4 - CLIP_LABEL_H} />}
        {clip.type === "audio" && media?.peaks && <Waveform clip={clip} peaks={media.peaks} width={width} />}
        {clip.type === "text" && clip.text && <div className="truncate px-2 text-small opacity-80">{clip.text.content}</div>}
      </div>
      {handles && (
        <>
          <div className="absolute inset-y-0 left-0 w-2 cursor-ew-resize group-hover:bg-black/15" onPointerDown={(e) => onDragStart(e, clip, "trim-l")} />
          <div className="absolute inset-y-0 right-0 w-2 cursor-ew-resize group-hover:bg-black/15" onPointerDown={(e) => onDragStart(e, clip, "trim-r")} />
        </>
      )}
    </div>
  )
})
