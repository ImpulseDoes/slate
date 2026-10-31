import { useMemo, useRef, useState } from "react"
import { dissolveTails, keyedPropsAt } from "../../lib/animation"
import { CrosshairIcon, PauseIcon, PlayIcon, PreviousIcon, SquareSplitHorizontalIcon, TextIcon } from "@hugeicons/core-free-icons"
import { clipEnd } from "../../lib/clips"
import { t, useT } from "../../lib/i18n"
import { trackPointer } from "../../lib/pointer"
import { audible } from "../../lib/render/compose"
import { ticks } from "../../lib/time"
import { useEditor } from "../../store/editor"
import { openMenu } from "../../store/overlays"
import type { Clip } from "../../types"
import { Layer } from "./Layer"
import { SyncedMedia } from "./SyncedMedia"

const PRELOAD = ticks(1.5)
const CENTER_SNAP_PX = 8

export function Stage() {

  const t = useT()
  const playhead = useEditor((s) => s.playhead)
  const clips = useEditor((s) => s.clips)
  const tracks = useEditor((s) => s.tracks)
  const media = useEditor((s) => s.media)
  const showGuides = useEditor((s) => s.showGuides)
  const settings = useEditor((s) => s.settings)
  const frame = useRef<HTMLDivElement>(null)
  const [centered, setCentered] = useState({ x: false, y: false })

  const mediaById = useMemo(() => new Map(media.map((m) => [m.id, m])), [media])
  const tails = useMemo(() => dissolveTails(clips), [clips])
  const byStart = useMemo(() => [...clips].sort((a, b) => a.start - b.start), [clips])

  const beginMove = (e: React.PointerEvent, clip: Clip) => {
    const state = useEditor.getState()
    const rect = frame.current?.getBoundingClientRect()
    if (e.button !== 0 || !rect || state.tracks.find((t) => t.id === clip.trackId)?.locked) return
    e.stopPropagation()
    if (!state.selectedClipIds.includes(clip.id)) state.selectClip(clip.id)
    const { clientX, clientY } = e
    const { x: startX, y: startY } = keyedPropsAt(clip, Math.min(clipEnd(clip) - 1, Math.max(clip.start, state.playhead)))
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
    trackPointer(move, () => setCentered({ x: false, y: false }))
  }
  const tailOf = (c: Clip) => tails.get(c.id) ?? 0
  const near = (c: Clip) => c.start - PRELOAD <= playhead && clipEnd(c) + tailOf(c) > playhead
  const active = (c: Clip) => c.start <= playhead && clipEnd(c) + tailOf(c) > playhead
  const videoTracks = tracks.filter((t) => t.kind === "video").reverse()
  const audioTracks = tracks.filter((t) => t.kind === "audio")

  return (
    <div onContextMenu={stageMenu} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-viewer shadow-card [container-type:size]">
      <div ref={frame} className="relative overflow-hidden bg-black [container-type:inline-size]" style={{ aspectRatio: `${settings.width} / ${settings.height}`, width: `min(100cqw, 100cqh * ${settings.width / settings.height})` }}>
        {videoTracks.map((t, z) =>
          byStart
            .filter((c) => c.trackId === t.id && near(c))
            .map((c) => (
              <Layer key={c.id} clip={c} media={c.mediaId ? mediaById.get(c.mediaId) : undefined} visible={!t.hidden && active(c)} muted={!audible(c, t)} z={z} time={playhead} tail={tailOf(c)} settings={settings} onMove={beginMove} />
            )),
        )}
        {audioTracks.map((t) =>
          clips
            .filter((c) => c.trackId === t.id && near(c))
            .map((c) => {
              const m = c.mediaId ? mediaById.get(c.mediaId) : undefined
              return m ? <SyncedMedia key={c.id} kind="audio" clip={c} media={m} active={active(c)} muted={!audible(c, t)} tail={tailOf(c)} /> : null
            }),
        )}
        {clips.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center text-h-sm text-white/60">{t("viewer.empty")}</p>
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
    { label: t(s.playing ? "viewer.pause" : "viewer.play"), icon: s.playing ? PauseIcon : PlayIcon, kbd: t("key.space"), disabled: empty, onSelect: s.togglePlay },
    { label: t("viewer.goToStart"), icon: PreviousIcon, kbd: "Home", disabled: empty, onSelect: () => s.setPlayhead(0) },
    "divider",
    { label: t("timeline.splitTip"), icon: SquareSplitHorizontalIcon, kbd: "S", disabled: empty, onSelect: s.splitAtPlayhead },
    { label: t("timeline.addTitle"), icon: TextIcon, kbd: "T", onSelect: s.addTitle },
    "divider",
    { label: t("viewer.guides"), icon: CrosshairIcon, kbd: "G", checked: s.showGuides, onSelect: s.toggleGuides },
  ])
}