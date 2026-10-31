import { useRef, useState, type ReactNode } from "react"
import type { IconSvgElement } from "@hugeicons/react"
import {
  AudioWave01Icon,
  Clock01Icon,
  ColorPickerIcon,
  Layers01Icon,
  Move01Icon,
  MoveHorizontalIcon,
  MoveVerticalIcon,
  MusicNote01Icon,
  Refresh01Icon,
  Rotate01Icon,
  Settings02Icon,
  TextFontIcon,
  TextIcon,
  Timer01Icon,
  TransparencyIcon,
  VolumeHighIcon,
  ZoomInIcon,
} from "@hugeicons/core-free-icons"
import { canDetachAudio, DEFAULT_PROPS, projectDuration, useEditor } from "../store/editor"
import { fpsLabel, timecode } from "../lib/time"
import type { Clip, ClipProps, MediaItem } from "../types"
import { openDialog } from "./overlays"
import { Button, Icon, NumberField, Scrub, Segmented, TimePill, TypeChip } from "./ui"

export function Inspector() {

  // Clicking a linked clip selects its partners too, and that still counts as one clip to edit.
  const clip = useEditor((s) => {
    const first = s.clips.find((c) => c.id === s.selectedClipIds[0])
    const one = s.selectedClipIds.length === 1 || (first?.linkId && s.selectedClipIds.every((id) => s.clips.find((c) => c.id === id)?.linkId === first.linkId))
    return one ? first : undefined
  })
  const count = useEditor((s) => s.selectedClipIds.length)
  const media = useEditor((s) => s.media.find((m) => m.id === clip?.mediaId))

  return (
    <aside className="flex w-[320px] shrink-0 flex-col overflow-y-auto rounded-xl bg-surface p-4 shadow-card">
      {clip ? <ClipInspector clip={clip} media={media} /> : <ProjectInspector multi={count > 1 ? count : 0} />}
    </aside>
  )
}

function ProjectInspector({ multi }: { multi: number }) {

  const duration = useEditor((s) => projectDuration(s.clips))
  const { width, height, fps } = useEditor((s) => s.settings)

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-h-md font-semibold">Project</h2>
        <Button icon={Settings02Icon} onClick={() => openDialog("settings")}>
          Settings
        </Button>
      </div>
      <div className="flex flex-col gap-3">
        <InfoRow label="Resolution">
          <span className="tnum">
            {width} × {height}
          </span>
        </InfoRow>
        <InfoRow label="Frame rate">
          <span className="tnum">{fpsLabel(fps)} fps</span>
        </InfoRow>
        <InfoRow label="Duration">
          <TimePill icon={Clock01Icon}>{timecode(duration, fps)}</TimePill>
        </InfoRow>
      </div>
      <p className="mt-6 text-body text-muted">{multi ? `${multi} clips selected.` : "Select a clip to tweak it."}</p>
    </>
  )
}

type Tab = "text" | "transform" | "audio"

function ClipInspector({ clip, media }: { clip: Clip; media?: MediaItem }) {

  const { checkpoint, updateClipProps, updateClipText, resetTransform, detachAudio } = useEditor.getState()
  const locked = useEditor((s) => !!s.tracks.find((t) => t.id === clip.trackId)?.locked)
  const fps = useEditor((s) => s.settings.fps)
  const isImage = media?.kind === "image"
  const [picked, setPicked] = useState<Tab | null>(null)
  const set = (patch: Partial<ClipProps>) => updateClipProps(clip.id, patch)
  const p = clip.props

  const tabs: { id: Tab; label: string; icon: IconSvgElement }[] = []

  if (clip.type === "text") tabs.push({ id: "text", label: "Text", icon: TextIcon })
  if (clip.type !== "audio") tabs.push({ id: "transform", label: "Transform", icon: Move01Icon })
  if (clip.type === "audio" || (clip.type === "video" && !isImage && !clip.audioDetached && media?.hasAudio !== false)) tabs.push({ id: "audio", label: "Audio", icon: MusicNote01Icon })

  const tab = tabs.find((t) => t.id === picked)?.id ?? tabs[0].id

  const fresh = useRef(true)
  const editText = (patch: Parameters<typeof updateClipText>[1]) => {

    if (fresh.current) checkpoint()
    fresh.current = false

    updateClipText(clip.id, patch)
  }

  return (
    <>
      <h2 className="mb-3 truncate text-h-md font-semibold" title={clip.name}>
        {clip.name}
      </h2>
      <div className="flex flex-col gap-3">
        <InfoRow icon={Layers01Icon} label="Type">
          <TypeChip type={isImage ? "image" : clip.type} />
        </InfoRow>
        <InfoRow icon={Clock01Icon} label="Start">
          <TimePill>{timecode(clip.start, fps)}</TimePill>
        </InfoRow>
        <InfoRow icon={Timer01Icon} label="Duration">
          <TimePill>{timecode(clip.duration, fps)}</TimePill>
        </InfoRow>
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
        {tabs.length > 1 && <Segmented value={tab} options={tabs} onChange={setPicked} />}

        {tab === "text" && clip.text && (
          <>
            <textarea
              value={clip.text.content}
              onFocus={() => (fresh.current = true)}
              onChange={(e) => editText({ content: e.target.value })}
              rows={3}
              className="w-full resize-none rounded-md bg-raised px-2.5 py-2 text-body text-fg outline-none focus:outline-2 focus:outline-primary"
            />
            <PropertyRow icon={TextFontIcon} label="Size" value={clip.text.size} step={1} onBegin={checkpoint} onChange={(v) => updateClipText(clip.id, { size: v })} min={8} max={600} unit="px" />
            <div className="flex h-8 items-center">
              <span className="flex w-[112px] shrink-0 items-center gap-2 text-label">
                <Icon icon={ColorPickerIcon} />
                Color
              </span>
              <label className="flex h-8 flex-1 items-center gap-2 rounded-md bg-raised px-2 focus-within:outline-2 focus-within:outline-primary">
                <span className="h-4 w-4 rounded-xs ring-1 ring-border-strong" style={{ background: clip.text.color }} />
                <span className="tnum text-fg uppercase">{clip.text.color}</span>
                <input type="color" className="sr-only" value={clip.text.color} onFocus={() => (fresh.current = true)} onChange={(e) => editText({ color: e.target.value })} />
              </label>
            </div>
          </>
        )}

        {tab === "transform" && (
          <>
            <PropertyRow icon={MoveHorizontalIcon} label="Position X" value={p.x} onBegin={checkpoint} onChange={(x) => set({ x })} unit="px" />
            <PropertyRow icon={MoveVerticalIcon} label="Position Y" value={p.y} onBegin={checkpoint} onChange={(y) => set({ y })} unit="px" />
            <PropertyRow icon={ZoomInIcon} label="Scale" value={p.scale} onBegin={checkpoint} onChange={(scale) => set({ scale })} min={1} max={1000} step={0.5} unit="%" />
            <PropertyRow icon={Rotate01Icon} label="Rotation" value={p.rotation} onBegin={checkpoint} onChange={(rotation) => set({ rotation })} min={-360} max={360} step={0.5} unit="°" />
            <PropertyRow icon={TransparencyIcon} label="Opacity" value={p.opacity} onBegin={checkpoint} onChange={(opacity) => set({ opacity })} min={0} max={100} step={0.5} unit="%" />
            <ResetRow onReset={() => resetTransform(clip.id)} />
          </>
        )}

        {tab === "audio" && (
          <>
            <PropertyRow icon={VolumeHighIcon} label="Volume" value={p.volume} onBegin={checkpoint} onChange={(volume) => set({ volume })} min={0} max={100} step={0.5} unit="%" />
            <ResetRow onReset={() => (checkpoint(), set({ volume: DEFAULT_PROPS.volume }))}>
              {canDetachAudio(clip, media) && (
                <Button icon={AudioWave01Icon} onClick={detachAudio} disabled={locked}>
                  Detach audio
                </Button>
              )}
            </ResetRow>
          </>
        )}
      </div>
    </>
  )
}

function ResetRow({ onReset, children }: { onReset: () => void; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="flex-1">{children}</div>
      <Button variant="quiet" icon={Refresh01Icon} onClick={onReset}>
        Reset
      </Button>
    </div>
  )
}

function InfoRow({ icon, label, children }: { icon?: IconSvgElement; label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-6 items-center">
      <span className="flex w-[112px] shrink-0 items-center gap-2 text-label">
        {icon && <Icon icon={icon} />}
        {label}
      </span>
      <span className="flex flex-1 items-center text-fg">{children}</span>
    </div>
  )
}

interface PropertyRowProps {
  icon: IconSvgElement
  label: string
  value: number
  onChange: (v: number) => void
  onBegin: () => void
  min?: number
  max?: number
  step?: number
  unit?: string
}

function PropertyRow({ icon, label, value, onChange, onBegin, min = -100000, max = 100000, step = 1, unit }: PropertyRowProps) {

  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  const precision = step < 1 ? 1 : 0

  return (
    <div className="flex h-8 items-center">
      <Scrub value={value} step={step} onBegin={onBegin} onChange={(v) => onChange(clamp(Number(v.toFixed(precision))))} className="flex w-[112px] shrink-0 items-center gap-2 text-label hover:text-fg">
        <Icon icon={icon} />
        <span className="truncate">{label}</span>
      </Scrub>
      <div className="flex min-w-0 flex-1">
        <NumberField value={value} onChange={onChange} onBegin={onBegin} min={min} max={max} step={step} unit={unit} precision={precision} />
      </div>
    </div>
  )
}