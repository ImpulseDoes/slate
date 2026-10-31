import type { Clip, MediaItem, ProjectSettings } from "../../types"
import { SyncedMedia } from "./SyncedMedia"

export function Layer({ clip, media, visible, muted, z, settings, onMove }: { clip: Clip; media?: MediaItem; visible: boolean; muted: boolean; z: number; settings: ProjectSettings; onMove: (e: React.PointerEvent, clip: Clip) => void }) {

  const { x, y, scale, rotation, opacity } = clip.props
  const grab = (e: React.PointerEvent) => onMove(e, clip)
  const style: React.CSSProperties = {
    zIndex: z,
    pointerEvents: visible ? "auto" : "none",
    opacity: visible ? opacity / 100 : 0,
    transform: `translate(${(x / settings.width) * 100}%, ${(y / settings.height) * 100}%) scale(${scale / 100}) rotate(${rotation}deg)`,
  }

  if (clip.type === "text" && clip.text) {
    return (
      <div className="absolute inset-0 flex items-center justify-center p-[4cqw] text-center font-semibold whitespace-pre-wrap" style={{ ...style, pointerEvents: "none" }}>
        <span onPointerDown={grab} style={{ pointerEvents: style.pointerEvents, color: clip.text.color, fontSize: `${(clip.text.size / settings.width) * 100}cqw`, lineHeight: 1.1 }}>{clip.text.content}</span>
      </div>
    )
  }

  if (!media) return null
  if (media.status === "missing") {

    return (
      <div className="absolute inset-0 flex items-center justify-center bg-[#2a1214] text-h-sm text-white/80" style={{ zIndex: z, display: visible ? undefined : "none" }}>
        Media offline: {media.name}
      </div>
    )
  }
  if (media.kind === "image") {

    return <img src={media.src} alt="" draggable={false} onPointerDown={grab} className="absolute inset-0 h-full w-full object-contain" style={style} />

  }

  return <SyncedMedia kind="video" clip={clip} media={media} active={visible} muted={muted} style={style} onPointerDown={grab} />
}
