import { useEffect, useMemo, useRef, useState } from "react"
import { NextIcon, PauseIcon, PlayIcon, PreviousIcon, ArrowLeft01Icon, ArrowRight01Icon, CrosshairIcon, SquareSplitHorizontalIcon, TextIcon } from "@hugeicons/core-free-icons"
import { clipEnd, projectDuration, useEditor } from "../store/editor"
import { audible } from "../lib/compose"
import { frameTicks, sec, ticks, timecode } from "../lib/time"
import type { Clip, MediaItem, ProjectSettings } from "../types"
import type { IconSvgElement } from "@hugeicons/react"
import { openMenu } from "./overlays"
import { Button, Icon, Tip } from "./ui"

const PRELOAD = ticks(1.5)
const DRIFT = 0.25
const CENTER_SNAP_PX = 8

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
  const showGuides = useEditor((s) => s.showGuides)
  const settings = useEditor((s) => s.settings)
  const frame = useRef<HTMLDivElement>(null)
  const [centered, setCentered] = useState({ x: false, y: false })

  const mediaById = useMemo(() => new Map(media.map((m) => [m.id, m])), [media])

  const beginMove = (e: React.PointerEvent, clip: Clip) => {
    const state = useEditor.getState()
    const rect = frame.current?.getBoundingClientRect()
    if (e.button !== 0 || !rect || state.tracks.find((t) => t.id === clip.trackId)?.locked) return
    e.stopPropagation()
    if (!state.selectedClipIds.includes(clip.id)) state.selectClip(clip.id)
    const { clientX, clientY } = e
    const { x: startX, y: startY } = clip.props
    const toProject = settings.width / rect.width
    let begun = false
    const move = (ev: PointerEvent) => {
      if (!begun && Math.hypot(ev.clientX - clientX, ev.clientY - clientY) < 3) return
      if (!begun) state.checkpoint()
      begun = true
      const x = startX + (ev.clientX - clientX) * toProject
      const y = startY + (ev.clientY - clientY) * toProject
      const free = ev.ctrlKey || ev.metaKey
      const onX = !free && Math.abs(x) < CENTER_SNAP_PX * toProject
      const onY = !free && Math.abs(y) < CENTER_SNAP_PX * toProject
      state.updateClipProps(clip.id, { x: onX ? 0 : Math.round(x), y: onY ? 0 : Math.round(y) })
      setCentered({ x: onX, y: onY })
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      setCentered({ x: false, y: false })
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }
  const near = (c: Clip) => c.start - PRELOAD <= playhead && clipEnd(c) > playhead
  const active = (c: Clip) => c.start <= playhead && clipEnd(c) > playhead
  const videoTracks = tracks.filter((t) => t.kind === "video").reverse()
  const audioTracks = tracks.filter((t) => t.kind === "audio")

  return (
    <div onContextMenu={stageMenu} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-viewer shadow-card [container-type:size]">
      <div ref={frame} className="relative overflow-hidden bg-black [container-type:inline-size]" style={{ aspectRatio: `${settings.width} / ${settings.height}`, width: `min(100cqw, 100cqh * ${settings.width / settings.height})` }}>
        {videoTracks.map((t, z) =>
          clips
            .filter((c) => c.trackId === t.id && near(c))
            .map((c) => (
              <Layer key={c.id} clip={c} media={c.mediaId ? mediaById.get(c.mediaId) : undefined} visible={!t.hidden && active(c)} muted={!audible(c, t)} z={z} settings={settings} onMove={beginMove} />
            )),
        )}
        {audioTracks.map((t) =>
          clips
            .filter((c) => c.trackId === t.id && near(c))
            .map((c) => {
              const m = c.mediaId ? mediaById.get(c.mediaId) : undefined
              return m ? <SyncedMedia key={c.id} kind="audio" clip={c} media={m} active={active(c)} muted={!audible(c, t)} /> : null
            }),
        )}
        {clips.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center text-h-sm text-white/60">Drag footage onto the timeline to see it here.</p>
        )}
        {(showGuides || centered.x) && <div className={`pointer-events-none absolute inset-y-0 left-1/2 z-40 w-px -translate-x-1/2 ${centered.x ? "bg-guide" : "bg-white/40"}`} />}
        {(showGuides || centered.y) && <div className={`pointer-events-none absolute inset-x-0 top-1/2 z-40 h-px -translate-y-1/2 ${centered.y ? "bg-guide" : "bg-white/40"}`} />}
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
    "divider",
    { label: "Center guides", icon: CrosshairIcon, kbd: "G", checked: s.showGuides, onSelect: s.toggleGuides },
  ])
}

function Layer({ clip, media, visible, muted, z, settings, onMove }: { clip: Clip; media?: MediaItem; visible: boolean; muted: boolean; z: number; settings: ProjectSettings; onMove: (e: React.PointerEvent, clip: Clip) => void }) {

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

function SyncedMedia({ kind, clip, media, active, muted, style, onPointerDown }: { kind: "video" | "audio"; clip: Clip; media: MediaItem; active: boolean; muted: boolean; style?: React.CSSProperties; onPointerDown?: React.PointerEventHandler }) {

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

function Transport() {

  const playhead = useEditor((s) => s.playhead)
  const playing = useEditor((s) => s.playing)
  const duration = useEditor((s) => projectDuration(s.clips))
  const showGuides = useEditor((s) => s.showGuides)
  const fps = useEditor((s) => s.settings.fps)
  const { togglePlay, setPlayhead, setPlaying, toggleGuides } = useEditor.getState()
  const stepFrame = (dir: number) => {
    setPlaying(false)
    setPlayhead(playhead + dir * frameTicks(fps))
  }

  return (
    <div className="flex h-12 shrink-0 items-center rounded-xl bg-surface px-4 shadow-card">
      <span className="tnum w-28 text-body text-fg">{timecode(playhead, fps)}</span>
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
      <div className="flex w-28 items-center justify-end gap-2">
        <Tip label="Center guides" kbd="G">
          <Button variant="quiet" icon={CrosshairIcon} active={showGuides} onClick={toggleGuides} aria-pressed={showGuides} aria-label="Center guides" />
        </Tip>
        <span className="tnum text-body text-muted">{timecode(duration, fps)}</span>
      </div>
    </div>
  )
}

const Glyph = ({ icon }: { icon: IconSvgElement }) => <Icon icon={icon} size={20} />