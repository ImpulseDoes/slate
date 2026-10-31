import { useEffect, useMemo, useRef } from "react"
import { NextIcon, PauseIcon, PlayIcon, PreviousIcon, ArrowLeft01Icon, ArrowRight01Icon, SquareSplitHorizontalIcon, TextIcon } from "@hugeicons/core-free-icons"
import { clipEnd, projectDuration, useEditor } from "../store/editor"
import { FRAME, timecode } from "../lib/time"
import { PROJECT, type Clip, type MediaItem } from "../types"
import type { IconSvgElement } from "@hugeicons/react"
import { openMenu } from "./overlays"
import { Button, Icon, Tip } from "./ui"

const PRELOAD = 1.5
const DRIFT = 0.25

export function Viewer() {
  return (
    <section className="flex min-w-0 flex-1 flex-col gap-2">
      <Stage />
      <Transport />
    </section>
  )
}

function Stage() {

  const playhead = useEditor((s) => s.playhead)
  const clips = useEditor((s) => s.clips)
  const tracks = useEditor((s) => s.tracks)
  const media = useEditor((s) => s.media)

  const mediaById = useMemo(() => new Map(media.map((m) => [m.id, m])), [media])
  const near = (c: Clip) => c.start - PRELOAD <= playhead && clipEnd(c) > playhead
  const active = (c: Clip) => c.start <= playhead && clipEnd(c) > playhead
  const videoTracks = tracks.filter((t) => t.kind === "video").reverse()
  const audioTracks = tracks.filter((t) => t.kind === "audio")

  return (
    <div onContextMenu={stageMenu} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-viewer shadow-card [container-type:size]">
      <div className="relative aspect-video w-[min(100cqw,100cqh*16/9)] overflow-hidden bg-black [container-type:inline-size]">
        {videoTracks.map((t, z) =>
          clips
            .filter((c) => c.trackId === t.id && near(c))
            .map((c) => (
              <Layer key={c.id} clip={c} media={c.mediaId ? mediaById.get(c.mediaId) : undefined} visible={!t.hidden && active(c)} muted={t.muted} z={z} />
            )),
        )}
        {audioTracks.map((t) =>
          clips
            .filter((c) => c.trackId === t.id && near(c))
            .map((c) => {
              const m = c.mediaId ? mediaById.get(c.mediaId) : undefined
              return m ? <SyncedMedia key={c.id} kind="audio" clip={c} media={m} active={active(c)} muted={t.muted} /> : null
            }),
        )}
        {clips.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center text-h-sm text-white/60">Drag footage onto the timeline to see it here.</p>
        )}
      </div>
    </div>
  )
}

function stageMenu(e: React.MouseEvent) {

  const s = useEditor.getState()
  const empty = s.clips.length === 0
  openMenu(e, [
    { label: s.playing ? "Pause" : "Play", icon: s.playing ? PauseIcon : PlayIcon, kbd: "Space", disabled: empty, onSelect: s.togglePlay },
    { label: "Go to start", icon: PreviousIcon, kbd: "Home", disabled: empty, onSelect: () => s.setPlayhead(0) },
    "divider",
    { label: "Split at playhead", icon: SquareSplitHorizontalIcon, kbd: "S", disabled: empty, onSelect: s.splitAtPlayhead },
    { label: "Add title at playhead", icon: TextIcon, kbd: "T", onSelect: s.addTitle },
  ])
}

function Layer({ clip, media, visible, muted, z }: { clip: Clip; media?: MediaItem; visible: boolean; muted: boolean; z: number }) {

  const { x, y, scale, rotation, opacity } = clip.props
  const style: React.CSSProperties = {
    zIndex: z,
    opacity: visible ? opacity / 100 : 0,
    transform: `translate(${(x / PROJECT.width) * 100}%, ${(y / PROJECT.height) * 100}%) scale(${scale / 100}) rotate(${rotation}deg)`,
  }

  if (clip.type === "text" && clip.text) {
    return (
      <div className="absolute inset-0 flex items-center justify-center p-[4cqw] text-center font-semibold whitespace-pre-wrap" style={style}>
        <span style={{ color: clip.text.color, fontSize: `${(clip.text.size / PROJECT.width) * 100}cqw`, lineHeight: 1.1 }}>{clip.text.content}</span>
      </div>
    )
  }

  if (!media) return null
  if (media.kind === "image") {

    return <img src={media.src} alt="" draggable={false} className="absolute inset-0 h-full w-full object-contain" style={style} />

  }

  return <SyncedMedia kind="video" clip={clip} media={media} active={visible} muted={muted || !!clip.audioDetached} style={style} />
}

function SyncedMedia({ kind, clip, media, active, muted, style }: { kind: "video" | "audio"; clip: Clip; media: MediaItem; active: boolean; muted: boolean; style?: React.CSSProperties }) {

  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null)
  const playhead = useEditor((s) => s.playhead)
  const playing = useEditor((s) => s.playing)

  useEffect(() => {

    const el = ref.current

    if (!el) return

    el.muted = muted
    el.volume = Math.min(1, Math.max(0, clip.props.volume / 100))

    if (!active) {

      if (!el.paused) el.pause()
      if (Math.abs(el.currentTime - clip.offset) > 0.05) el.currentTime = clip.offset

      return

    }

    const target = clip.offset + (playhead - clip.start)

    if (playing) {

      if (el.paused) {

        el.currentTime = target

        void el.play().catch(() => { })

      } else if (Math.abs(el.currentTime - target) > DRIFT) {
        el.currentTime = target
      }
    } else {

      if (!el.paused) el.pause()
      if (Math.abs(el.currentTime - target) > FRAME / 2) el.currentTime = target

    }
  }, [playhead, playing, active, muted, clip.offset, clip.start, clip.props.volume])

  if (kind === "audio") return <audio ref={ref} src={media.src} preload="auto" />

  return <video ref={ref} src={media.src} preload="auto" playsInline className="absolute inset-0 h-full w-full object-contain" style={style} />
}

function Transport() {

  const playhead = useEditor((s) => s.playhead)
  const playing = useEditor((s) => s.playing)
  const duration = useEditor((s) => projectDuration(s.clips))
  const { togglePlay, setPlayhead, setPlaying } = useEditor.getState()
  const stepFrame = (dir: number) => {
    setPlaying(false)
    setPlayhead(playhead + dir * FRAME)
  }

  return (
    <div className="flex h-12 shrink-0 items-center rounded-xl bg-surface px-4 shadow-card">
      <span className="tnum w-28 text-body text-fg">{timecode(playhead)}</span>
      <div className="flex flex-1 items-center justify-center gap-0.5">
        <Tip label="Go to start" kbd="Home">
          <Button variant="quiet" aria-label="Go to start" onClick={() => setPlayhead(0)}>
            <Glyph icon={PreviousIcon} />
          </Button>
        </Tip>
        <Tip label="Previous frame" kbd="←">
          <Button variant="quiet" aria-label="Previous frame" onClick={() => stepFrame(-1)}>
            <Glyph icon={ArrowLeft01Icon} />
          </Button>
        </Tip>
        <Tip label={playing ? "Pause" : "Play"} kbd="Space">
          <button aria-label={playing ? "Pause" : "Play"} onClick={togglePlay} className="mx-1 inline-flex h-9 w-9 items-center justify-center rounded-full bg-fg text-white transition-colors hover:bg-[#3a3a3a]">
            <Glyph icon={playing ? PauseIcon : PlayIcon} />
          </button>
        </Tip>
        <Tip label="Next frame" kbd="→">
          <Button variant="quiet" aria-label="Next frame" onClick={() => stepFrame(1)}>
            <Glyph icon={ArrowRight01Icon} />
          </Button>
        </Tip>
        <Tip label="Go to end" kbd="End">
          <Button variant="quiet" aria-label="Go to end" onClick={() => setPlayhead(duration)}>
            <Glyph icon={NextIcon} />
          </Button>
        </Tip>
      </div>
      <span className="tnum w-28 text-right text-body text-muted">{timecode(duration)}</span>
    </div>
  )
}

const Glyph = ({ icon }: { icon: IconSvgElement }) => <Icon icon={icon} size={20} />