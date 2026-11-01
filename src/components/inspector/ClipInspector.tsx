import { useRef, useState } from "react"
import type { IconSvgElement } from "@hugeicons/react"
import {
  Add01Icon,
  AudioWave01Icon,
  Clock01Icon,
  ColorPickerIcon,
  DashboardSpeed01Icon,
  Layers01Icon,
  Mic01Icon,
  Move01Icon,
  MoveHorizontalIcon,
  MoveVerticalIcon,
  MusicNote01Icon,
  PaintBoardIcon,
  Rotate01Icon,
  TextFontIcon,
  TextIcon,
  Timer01Icon,
  TransparencyIcon,
  VolumeHighIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "@hugeicons/core-free-icons"
import { keyedPropsAt, keyNear } from "../../lib/animation"
import { MAX_VOLUME } from "../../lib/audio/tools"
import { canIsolateVoice, setVoice } from "../../lib/audio/voice"
import { canDetachAudio, clipEnd, DEFAULT_PROPS, MAX_SPEED, MIN_SPEED, sourceAt, speedOf } from "../../lib/clips"
import { useT } from "../../lib/i18n"
import { isTauri } from "../../lib/platform"
import { styleLikeThis } from "../../lib/text/captions"
import { pickFont } from "../../lib/text/fonts"
import { frameTicks, sec, ticks, timecode } from "../../lib/time"
import { addZoom } from "../../lib/zoom"
import { useEditor } from "../../store/editor"
import type { AnimatedProp, Clip, ClipProps, Easing, MediaItem, TextAnimation, Transition, TransitionKind } from "../../types"
import { Button, Field, Icon, NumberField, Segmented, Select, TimePill, TypeChip } from "../ui"
import { InfoRow, PropertyRow, ResetRow } from "./rows"

type Tab = "text" | "transform" | "audio" | "motion"

const NONE = "none"
const OTHER_FONT = "other"
const DEFAULT_TRANSITION = ticks(0.5)

export function ClipInspector({ clip, media }: { clip: Clip; media?: MediaItem }) {

  const t = useT()
  const { checkpoint, updateClipProps, updateClipText, resetTransform, detachAudio, toggleKeyframe, setClipSpeed, setTransition, setEasing } = useEditor.getState()
  const locked = useEditor((s) => !!s.tracks.find((t) => t.id === clip.trackId)?.locked)
  const fps = useEditor((s) => s.settings.fps)
  const fonts = useEditor((s) => s.fonts)
  const animated = !!clip.keys && Object.values(clip.keys).some((k) => k?.length)
  const playhead = useEditor((s) => s.playhead)
  const inside = playhead >= clip.start && playhead < clipEnd(clip)
  const now = Math.min(clipEnd(clip) - 1, Math.max(clip.start, playhead))
  const isImage = media?.kind === "image"
  const timed = clip.type !== "text" && !isImage
  const [picked, setPicked] = useState<Tab | null>(null)
  const set = (patch: Partial<ClipProps>) => updateClipProps(clip.id, patch)
  const p = animated ? keyedPropsAt(clip, now) : clip.props
  const tolerance = (frameTicks(fps) * speedOf(clip)) / 2

  const keyFor = (prop: AnimatedProp) => ({
    active: !!clip.keys?.[prop]?.length,
    here: !!keyNear(clip.keys?.[prop] ?? [], sourceAt(clip, now), tolerance),
    disabled: !inside || locked,
    onToggle: () => toggleKeyframe(clip.id, prop),
  })

  const tabs: { id: Tab; label: string; icon: IconSvgElement }[] = []

  if (clip.type === "text") tabs.push({ id: "text", label: t("type.text"), icon: TextIcon })
  if (clip.type !== "audio") tabs.push({ id: "transform", label: t("inspector.transform"), icon: Move01Icon })
  if (clip.type === "audio" || (clip.type === "video" && !isImage && !clip.audioDetached && media?.hasAudio !== false)) tabs.push({ id: "audio", label: t("type.audio"), icon: MusicNote01Icon })
  tabs.push({ id: "motion", label: t("inspector.motion"), icon: DashboardSpeed01Icon })

  const tab = tabs.find((t) => t.id === picked)?.id ?? tabs[0].id

  const fresh = useRef(true)
  const editText = (patch: Parameters<typeof updateClipText>[1]) => {

    if (fresh.current) checkpoint()
    fresh.current = false

    updateClipText(clip.id, patch)
  }
  const once = (patch: Parameters<typeof updateClipText>[1]) => {
    checkpoint()
    updateClipText(clip.id, patch)
  }

  const transitionKinds = (side: "enter" | "exit") => {
    const kinds: { id: string; label: string }[] = [{ id: NONE, label: t("transition.none") }, { id: "fade", label: t("transition.fade") }]
    if (clip.type !== "audio") kinds.push({ id: "dip", label: t("transition.dip") })
    if (side === "enter") kinds.push({ id: "dissolve", label: t("transition.dissolve") })
    return kinds
  }

  const setKind = (side: "enter" | "exit", kind: string) => {
    checkpoint()
    const next: Transition | undefined = kind === NONE ? undefined : { kind: kind as TransitionKind, duration: clip[side]?.duration ?? Math.min(DEFAULT_TRANSITION, clip.duration) }
    setTransition(clip.id, side, next)
  }

  const transitionRow = (side: "enter" | "exit", label: string) => (
    <Field label={label}>
      <Select label={label} value={clip[side]?.kind ?? NONE} options={transitionKinds(side)} onChange={(kind) => setKind(side, kind)} />
      {clip[side] && (
        <div className="w-24 shrink-0">
          <NumberField value={sec(clip[side]!.duration)} onBegin={checkpoint} onChange={(v) => setTransition(clip.id, side, { ...clip[side]!, duration: Math.min(clip.duration, ticks(v)) })} min={0.1} max={sec(clip.duration)} step={0.1} precision={1} unit="s" />
        </div>
      )}
    </Field>
  )

  const fontOptions = [{ id: "", label: "Inter" }, ...fonts.map((f) => ({ id: f.family, label: f.family })), ...(isTauri ? [{ id: OTHER_FONT, label: t("font.import") }] : [])]

  const chooseFont = async (id: string) => {
    if (id !== OTHER_FONT) return once({ font: id || undefined })
    const family = await pickFont()
    if (family) once({ font: family })
  }

  const ease = (() => {
    const list = Object.values(clip.keys ?? {}).find((k) => k?.length)
    if (!list) return "smooth"
    const at = sourceAt(clip, now)
    return (list.filter((k) => k.at <= at).pop() ?? list[0]).ease
  })()

  return (
    <>
      <h2 className="mb-3 shrink-0 truncate text-h-md font-semibold" title={clip.name}>
        {clip.name}
      </h2>
      <div className="flex flex-col gap-3">
        <InfoRow icon={Layers01Icon} label={t("inspector.type")}>
          <TypeChip type={isImage ? "image" : clip.type} />
        </InfoRow>
        <InfoRow icon={Clock01Icon} label={t("inspector.start")}>
          <TimePill>{timecode(clip.start, fps)}</TimePill>
        </InfoRow>
        <InfoRow icon={Timer01Icon} label={t("field.duration")}>
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
            <Field label={t("font.label")}>
              <Select label={t("font.label")} value={clip.text.font ?? ""} options={fontOptions} onChange={(id) => void chooseFont(id)} />
            </Field>
            <PropertyRow icon={TextFontIcon} label={t("inspector.size")} value={clip.text.size} step={1} onBegin={checkpoint} onChange={(v) => updateClipText(clip.id, { size: v })} min={8} max={600} unit="px" />
            <ColorRow icon={ColorPickerIcon} label={t("inspector.color")} value={clip.text.color} onFocus={() => (fresh.current = true)} onChange={(color) => editText({ color })} />
            <PropertyRow icon={PaintBoardIcon} label={t("text.outline")} value={clip.text.outline ?? 0} step={1} onBegin={checkpoint} onChange={(v) => updateClipText(clip.id, { outline: v })} min={0} max={40} unit="px" />
            {!!clip.text.outline && <ColorRow icon={ColorPickerIcon} label={t("text.outlineColor")} value={clip.text.outlineColor ?? "#000000"} onFocus={() => (fresh.current = true)} onChange={(outlineColor) => editText({ outlineColor })} />}
            <div className="flex gap-1.5">
              <Button active={!!clip.text.shadow} aria-pressed={!!clip.text.shadow} onClick={() => once({ shadow: !clip.text!.shadow })} className="flex-1">
                {t("text.shadow")}
              </Button>
              <Button active={!!clip.text.box} aria-pressed={!!clip.text.box} onClick={() => once({ box: !clip.text!.box })} className="flex-1">
                {t("text.box")}
              </Button>
            </div>
            <Field label={t("text.animation")}>
              <Select
                label={t("text.animation")}
                value={clip.text.animation ?? NONE}
                onChange={(id) => once({ animation: id === NONE ? undefined : (id as TextAnimation) })}
                options={[
                  { id: NONE, label: t("transition.none") },
                  { id: "fade", label: t("text.animation.fade") },
                  { id: "pop", label: t("text.animation.pop") },
                  { id: "slide", label: t("text.animation.slide") },
                  { id: "typewriter", label: t("text.animation.typewriter") },
                ]}
              />
            </Field>
            <Button onClick={() => styleLikeThis(clip.id)} disabled={locked}>
              {t("text.applyToTrack")}
            </Button>
          </>
        )}

        {tab === "transform" && (
          <>
            <PropertyRow icon={MoveHorizontalIcon} label={t("inspector.positionX")} value={p.x} onBegin={checkpoint} onChange={(x) => set({ x })} unit="px" keyframe={keyFor("x")} />
            <PropertyRow icon={MoveVerticalIcon} label={t("inspector.positionY")} value={p.y} onBegin={checkpoint} onChange={(y) => set({ y })} unit="px" keyframe={keyFor("y")} />
            <PropertyRow icon={ZoomInIcon} label={t("inspector.scale")} value={p.scale} onBegin={checkpoint} onChange={(scale) => set({ scale })} min={1} max={1000} step={0.5} unit="%" keyframe={keyFor("scale")} />
            <PropertyRow icon={Rotate01Icon} label={t("inspector.rotation")} value={p.rotation} onBegin={checkpoint} onChange={(rotation) => set({ rotation })} min={-360} max={360} step={0.5} unit="°" keyframe={keyFor("rotation")} />
            <PropertyRow icon={TransparencyIcon} label={t("inspector.opacity")} value={p.opacity} onBegin={checkpoint} onChange={(opacity) => set({ opacity })} min={0} max={100} step={0.5} unit="%" keyframe={keyFor("opacity")} />
            <ResetRow onReset={() => resetTransform(clip.id)} />
          </>
        )}

        {tab === "audio" && (
          <>
            <PropertyRow icon={VolumeHighIcon} label={t("inspector.volume")} value={p.volume} onBegin={checkpoint} onChange={(volume) => set({ volume })} min={0} max={MAX_VOLUME} step={0.5} unit="%" keyframe={keyFor("volume")} />
            {canIsolateVoice(clip, media) && <VoiceRow clip={clip} media={media!} disabled={locked} />}
            <ResetRow onReset={() => (checkpoint(), set({ volume: DEFAULT_PROPS.volume }))}>
              {canDetachAudio(clip, media) && (
                <Button icon={AudioWave01Icon} onClick={detachAudio} disabled={locked}>
                  {t("timeline.detach")}
                </Button>
              )}
            </ResetRow>
          </>
        )}

        {tab === "motion" && (
          <>
            {timed && <PropertyRow icon={DashboardSpeed01Icon} label={t("motion.speed")} value={Math.round(speedOf(clip) * 1000) / 10} step={1} min={MIN_SPEED * 100} max={MAX_SPEED * 100} unit="%" onBegin={checkpoint} onChange={(v) => setClipSpeed(clip.id, v / 100)} />}
            {transitionRow("enter", t("motion.enter"))}
            {transitionRow("exit", t("motion.exit"))}
            {clip.type !== "audio" && (
              <div className="flex gap-1.5">
                <Button icon={ZoomInIcon} onClick={() => addZoom(clip.id, "in")} disabled={locked} className="flex-1">
                  {t("motion.zoomIn")}
                </Button>
                <Button icon={ZoomOutIcon} onClick={() => addZoom(clip.id, "out")} disabled={locked} className="flex-1">
                  {t("motion.zoomOut")}
                </Button>
                <Button icon={Add01Icon} onClick={() => addZoom(clip.id, "punch")} disabled={locked || !inside} className="flex-1">
                  {t("motion.punch")}
                </Button>
              </div>
            )}
            {animated && (
              <Field label={t("motion.easing")}>
                <Select
                  label={t("motion.easing")}
                  value={ease}
                  onChange={(id: Easing) => setEasing(clip.id, id)}
                  options={[
                    { id: "smooth" as Easing, label: t("easing.smooth") },
                    { id: "linear" as Easing, label: t("easing.linear") },
                    { id: "in" as Easing, label: t("easing.in") },
                    { id: "out" as Easing, label: t("easing.out") },
                  ]}
                />
              </Field>
            )}
          </>
        )}
      </div>
    </>
  )
}

function VoiceRow({ clip, media, disabled }: { clip: Clip; media: MediaItem; disabled: boolean }) {

  const t = useT()
  const on = !!clip.voice
  const progress = media.voiceProgress
  const option = (value: boolean, label: string) => (
    <button
      aria-pressed={on === value}
      disabled={disabled}
      onClick={() => on !== value && setVoice(clip.id, value)}
      className={`h-7 flex-1 rounded-sm text-body transition-colors disabled:opacity-40 ${on === value ? "bg-surface text-fg shadow-control ring-1 ring-border" : "text-label hover:text-fg"}`}
    >
      {label}
    </button>
  )

  return (
    <>
      <div className="flex h-8 items-center">
        <span className="flex w-[112px] shrink-0 items-center gap-2 text-label">
          <Icon icon={Mic01Icon} />
          <span className="truncate">{t("voice.isolate")}</span>
        </span>
        <div className="flex flex-1 gap-0.5 rounded-md bg-raised p-0.5">
          {option(false, t("voice.off"))}
          {option(true, t("voice.on"))}
        </div>
      </div>
      {on && (progress !== undefined || media.voice) && (
        <p className="text-small text-muted tnum">{progress !== undefined ? t("voice.working", { percent: Math.round(progress * 100) }) : t("voice.ready")}</p>
      )}
    </>
  )
}

function ColorRow({ icon, label, value, onChange, onFocus }: { icon: IconSvgElement; label: string; value: string; onChange: (color: string) => void; onFocus: () => void }) {
  return (
    <div className="flex h-8 items-center">
      <span className="flex w-[112px] shrink-0 items-center gap-2 text-label">
        <Icon icon={icon} />
        <span className="truncate">{label}</span>
      </span>
      <label className="flex h-8 flex-1 items-center gap-2 rounded-md bg-raised px-2 focus-within:outline-2 focus-within:outline-primary">
        <span className="h-4 w-4 rounded-xs ring-1 ring-border-strong" style={{ background: value }} />
        <span className="tnum text-fg uppercase">{value}</span>
        <input type="color" className="sr-only" value={value} onFocus={onFocus} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  )
}