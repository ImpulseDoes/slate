import { dipAt, propsAt, typedAt, visibleAt } from "../../lib/animation"
import { useT } from "../../lib/i18n"
import { titleStyle } from "../../lib/text/style"
import type { Clip, MediaItem, ProjectSettings } from "../../types"
import { SyncedMedia } from "./SyncedMedia"

/** A crop in percent of the layer's own box, which the fitted picture may not fill. */
function cropPath(clip: Clip, media: MediaItem, settings: ProjectSettings) {

  if (!clip.crop || !media.width) return undefined

  const fit = Math.min(settings.width / media.width, settings.height / media.height)
  const boxW = (media.width * fit) / settings.width
  const boxH = (media.height * fit) / settings.height
  const across = (side: number) => ((1 - boxW) / 2 + side * boxW) * 100
  const down = (side: number) => ((1 - boxH) / 2 + side * boxH) * 100

  return `inset(${down(clip.crop.top)}% ${across(clip.crop.right)}% ${down(clip.crop.bottom)}% ${across(clip.crop.left)}%)`
}

export function Layer({ clip, media, visible, muted, z, time, tail, settings, onMove }: { clip: Clip; media?: MediaItem; visible: boolean; muted: boolean; z: number; time: number; tail: number; settings: ProjectSettings; onMove: (e: React.PointerEvent, clip: Clip) => void }) {

  const t = useT()
  const { x, y, scale, rotation, opacity } = propsAt(clip, time)
  const grab = (e: React.PointerEvent) => onMove(e, clip)
  const dip = visible ? dipAt(clip, time, tail) : 0
  const style: React.CSSProperties = {
    zIndex: z,
    pointerEvents: visible ? "auto" : "none",
    opacity: visible ? (opacity / 100) * visibleAt(clip, time, tail) : 0,
    transform: `translate(${(x / settings.width) * 100}%, ${(y / settings.height) * 100}%) scale(${scale / 100}) rotate(${rotation}deg)`,
    clipPath: media ? cropPath(clip, media, settings) : undefined,
  }
  const black = dip > 0 && <div className="pointer-events-none absolute inset-0 bg-black" style={{ zIndex: z, opacity: dip }} />

  if (clip.type === "text" && clip.text) {

    const typing = clip.text.animation === "typewriter"
    const shown = typing ? typedAt(clip, time) : clip.text.content.length

    return (
      <>
        <div className="absolute inset-0 flex items-center justify-center p-[4cqw] text-center font-semibold whitespace-pre-wrap" style={{ ...style, pointerEvents: "none" }}>
          <span onPointerDown={grab} style={{ pointerEvents: style.pointerEvents, ...titleStyle(clip.text, settings.width) }}>
            {clip.text.content.slice(0, shown)}
            {shown < clip.text.content.length && <span style={{ visibility: "hidden" }}>{clip.text.content.slice(shown)}</span>}
          </span>
        </div>
        {black}
      </>
    )
  }

  if (!media) return null
  if (media.status === "missing") {

    return (
      <div className="absolute inset-0 flex items-center justify-center bg-[#2a1214] text-h-sm text-white/80" style={{ zIndex: z, display: visible ? undefined : "none" }}>
        {t("viewer.offline", { name: media.name })}
      </div>
    )
  }
  if (media.kind === "image") {

    return (
      <>
        <img src={media.src} alt="" draggable={false} onPointerDown={grab} className="absolute inset-0 h-full w-full object-contain" style={style} />
        {black}
      </>
    )
  }

  return (
    <>
      <SyncedMedia kind="video" clip={clip} media={media} active={visible} muted={muted} tail={tail} style={style} onPointerDown={grab} />
      {black}
    </>
  )
}