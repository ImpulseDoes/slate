import { memo } from "react"
import { Link01Icon } from "@hugeicons/core-free-icons"
import { speedOf } from "../../lib/clips"
import { useT } from "../../lib/i18n"
import { useEditor } from "../../store/editor"
import type { Clip, MediaItem, Transition } from "../../types"
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

function Wedge({ transition, side, ppt }: { transition: Transition; side: "left" | "right"; ppt: number }) {
  const direction = side === "left" ? "to bottom right" : "to bottom left"
  return <div className="pointer-events-none absolute inset-y-0" style={{ [side]: 0, width: transition.duration * ppt, background: `linear-gradient(${direction}, rgb(0 0 0 / 0.28) 50%, transparent 50%)` }} />
}

export const ClipView = memo(function ClipView({ clip, media, ppt, height, selected, dragging, linked, locked, onDragStart }: ClipViewProps) {
  const t = useT()
  const left = clip.start * ppt
  const width = Math.max(2, clip.duration * ppt)
  const offline = media?.status === "missing"
  const handles = !locked && width > 14
  const speed = speedOf(clip)
  const keyTimes = selected ? [...new Set(Object.values(clip.keys ?? {}).flatMap((list) => list?.map((k) => k.at) ?? []))] : []
  const timeOfKey = (at: number) => clip.start + (at - clip.offset) / speed

  const goToKey = (at: number) => {

    const { setPlaying, setPlayhead } = useEditor.getState()

    setPlaying(false)
    setPlayhead(timeOfKey(at))
  }

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
        <span className="truncate">{offline ? t("clip.offline", { name: clip.name }) : clip.name}</span>
        {speed !== 1 && <span className="tnum shrink-0 opacity-70">{Math.round(speed * 100)}%</span>}
      </div>
      <div className="relative overflow-hidden" style={{ height: height - 4 - CLIP_LABEL_H }}>
        {clip.type === "video" && media && <Filmstrip clip={clip} media={media} ppt={ppt} width={width} height={height - 4 - CLIP_LABEL_H} />}
        {clip.type === "audio" && media?.peaks && <Waveform clip={clip} peaks={media.peaks} />}
        {clip.type === "text" && clip.text && <div className="truncate px-2 text-small opacity-80">{clip.text.content}</div>}
      </div>
      {clip.enter && <Wedge transition={clip.enter} side="left" ppt={ppt} />}
      {clip.exit && <Wedge transition={clip.exit} side="right" ppt={ppt} />}
      {handles && (
        <>
          <div className="absolute inset-y-0 left-0 w-2 cursor-ew-resize group-hover:bg-fg/15" onPointerDown={(e) => onDragStart(e, clip, "trim-l")} />
          <div className="absolute inset-y-0 right-0 w-2 cursor-ew-resize group-hover:bg-fg/15" onPointerDown={(e) => onDragStart(e, clip, "trim-r")} />
        </>
      )}
      {keyTimes.map((at) => (
        <button key={at} aria-label={t("keyframe.jump")} title={t("keyframe.jump")} onPointerDown={(e) => e.stopPropagation()} onClick={() => goToKey(at)} className="absolute bottom-0 flex h-3.5 w-3.5 -translate-x-1/2 items-center justify-center" style={{ left: (timeOfKey(at) - clip.start) * ppt }}>
          <span className="h-2 w-2 rotate-45 bg-primary ring-1 ring-surface" />
        </button>
      ))}
    </div>
  )
})