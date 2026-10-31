import type { Clip, MediaItem } from "../../types"

export function Filmstrip({ clip, media, ppt, width, height }: { clip: Clip; media: MediaItem; ppt: number; width: number; height: number }) {

  if (!media.frames.length || height < 8) return null

  const aspect = media.width && media.height ? media.width / media.height : 16 / 9
  const tileW = Math.max(16, height * aspect)
  const count = Math.min(400, Math.ceil(width / tileW))
  const tiles = []

  for (let i = 0; i < count; i++) {

    let src = media.frames[0]

    if (media.kind === "video" && media.duration > 0) {

      const t = clip.offset + (i * tileW + tileW / 2) / ppt

      const idx = Math.min(media.frames.length - 1, Math.max(0, Math.floor((t / media.duration) * media.frames.length)))

      src = media.frames[idx]

    }
    tiles.push(<div key={i} className="h-full shrink-0 bg-cover bg-center" style={{ width: tileW, backgroundImage: `url(${src})` }} />)
  }

  return <div className="flex h-full">{tiles}</div>
}
