import { useEffect, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { Download04Icon } from "@hugeicons/core-free-icons"
import { useShallow } from "zustand/react/shallow"
import { projectDuration, selectionSpan } from "../../lib/clips"
import { errorText } from "../../lib/errors"
import { fpsText, useT, type Key } from "../../lib/i18n"
import { isTauri } from "../../lib/platform"
import { checkExportable, queueExport } from "../../lib/render/exporter"
import { ENCODER, type Codec, type ExportOptions, type Quality, type Speed } from "../../lib/render/plan"
import { fpsLabel, FRAME_RATES, frameIndex, frameTicks, sameFps, sec, ticks, timecode } from "../../lib/time"
import { useEditor } from "../../store/editor"
import { isVertical } from "../../lib/vertical"
import { openDialog } from "../../store/overlays"
import { Modal } from "../overlays/Modal"
import { Button, Field, NumberField, Select, TimePill } from "../ui"

const PROJECT_VALUE = "project"
const HEIGHTS = [2160, 1440, 1080, 720, 480]
const CRF = { best: 16, high: 20, balanced: 24, small: 29 }

type Preset = { id: string; label: Key; codec: Codec; height: number | null; quality: string; mbps: number; speed: Speed; vertical?: boolean }

const PRESETS: Preset[] = [
  { id: "web", label: "export.preset.web", codec: "h264", height: null, quality: "high", mbps: 12, speed: "medium" },
  { id: "small", label: "export.preset.small", codec: "h265", height: null, quality: "balanced", mbps: 8, speed: "medium" },
  { id: "draft", label: "export.preset.draft", codec: "h264", height: 720, quality: "balanced", mbps: 5, speed: "veryfast" },
  { id: "master", label: "export.preset.master", codec: "prores", height: null, quality: "best", mbps: 0, speed: "medium" },
  { id: "tiktok", label: "export.preset.tiktok", codec: "h264", height: null, quality: "bitrate", mbps: 16, speed: "medium", vertical: true },
  { id: "shorts", label: "export.preset.shorts", codec: "h264", height: null, quality: "bitrate", mbps: 14, speed: "medium", vertical: true },
  { id: "reels", label: "export.preset.reels", codec: "h264", height: null, quality: "bitrate", mbps: 10, speed: "medium", vertical: true },
]
const CUSTOM = "custom"

function sizeFor(height: number, projectWidth: number, projectHeight: number) {
  return { width: Math.round((height * projectWidth) / projectHeight / 2) * 2, height }
}

export function ExportDialog({ onClose }: { onClose: () => void }) {

  const t = useT()
  const duration = useEditor((s) => projectDuration(s.clips))
  const settings = useEditor((s) => s.settings)
  const selection = useEditor(useShallow((s) => selectionSpan(s.clips, s.selectedClipIds)))

  const [encoders, setEncoders] = useState<string[] | null>(null)
  const [unavailable, setUnavailable] = useState<string | null>(isTauri ? null : t("export.needsDesktop"))
  const [presetId, setPresetId] = useState(PRESETS[0].id)
  const [codec, setCodec] = useState<Codec>("h264")
  const [height, setHeight] = useState(PROJECT_VALUE)
  const [rate, setRate] = useState(PROJECT_VALUE)
  const [quality, setQuality] = useState("high")
  const [mbps, setMbps] = useState(12)
  const [speed, setSpeed] = useState<Speed>("medium")
  const [smart, setSmart] = useState("on")
  const [dynamicRange, setDynamicRange] = useState("sdr")
  const hasHdr = useEditor((s) => s.media.some((m) => m.hdr && s.clips.some((c) => c.mediaId === m.id)))
  const [rangeKind, setRangeKind] = useState("all")
  const [customFrom, setCustomFrom] = useState(0)
  const [customTo, setCustomTo] = useState(Math.round(sec(duration) * 100) / 100)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isTauri) return
    invoke<string[]>("render_encoders")
      .then(setEncoders)
      .catch(() => setUnavailable(t("export.noFfmpeg")))
  }, [t])

  const applyPreset = (id: string) => {
    setPresetId(id)
    const preset = PRESETS.find((p) => p.id === id)
    if (!preset) return
    setCodec(preset.codec)
    setHeight(preset.height ? String(preset.height) : PROJECT_VALUE)
    setQuality(preset.quality)
    setMbps(preset.mbps)
    setSpeed(preset.speed)
  }

  const custom = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setPresetId(CUSTOM)
  }

  const fps = FRAME_RATES.find((r) => r.label === rate)?.fps ?? settings.fps
  const size = height === PROJECT_VALUE ? { width: settings.width, height: settings.height } : sizeFor(Number(height), settings.width, settings.height)

  const range: [number, number] = rangeKind === "selection" && selection ? selection : rangeKind === "custom" ? [ticks(customFrom), ticks(customTo)] : [0, duration]

  const frames = Math.max(0, frameIndex(range[1] - range[0], fps))
  const blocker = unavailable ?? (frames < 1 ? t("export.emptyRange") : checkExportable(range))

  const start = async () => {
    const q: Quality = quality === "bitrate" ? { mode: "bitrate", mbps } : { mode: "quality", crf: CRF[quality as keyof typeof CRF] }
    const options: ExportOptions = { codec, ...size, fps, quality: q, speed, range, smart: codec === "h264" && smart === "on", hdr: codec === "h265" && dynamicRange === "hdr" }
    setBusy(true)
    setError(null)
    try {
      if (await queueExport(options)) openDialog("renders")
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t("export.title")}
      labelId="export-title"
      onClose={onClose}
      closeButton
      width={480}
      footer={
        <>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" icon={Download04Icon} disabled={!!blocker || busy} onClick={() => void start()}>
            {t("common.export")}
          </Button>
        </>
      }
    >
      <div className="mt-3 flex flex-col gap-3">
        <Field label={t("export.preset")}>
          <Select label={t("export.preset")} value={presetId} options={[...PRESETS.map((p) => ({ id: p.id, label: t(p.label) })), { id: CUSTOM, label: t("common.custom") }]} onChange={applyPreset} />
        </Field>
        <Field label={t("export.format")}>
          <Select
            label={t("export.format")}
            value={codec}
            onChange={custom(setCodec)}
            options={[
              { id: "h264" as Codec, label: "MP4 · H.264 · AAC" },
              { id: "h265" as Codec, label: "MP4 · H.265 · AAC" },
              { id: "prores" as Codec, label: "MOV · ProRes 422 HQ · PCM" },
            ].map((o) => ({ ...o, disabled: !!encoders && !encoders.includes(ENCODER[o.id]) }))}
          />
        </Field>
        <Field label={t("field.resolution")}>
          <Select
            label={t("field.resolution")}
            value={height}
            onChange={custom(setHeight)}
            options={[
              { id: PROJECT_VALUE, label: t("export.projectValue", { value: `${settings.width} × ${settings.height}` }) },
              ...HEIGHTS.filter((h) => h !== settings.height).map((h) => {
                const s = sizeFor(h, settings.width, settings.height)
                return { id: String(h), label: `${s.width} × ${s.height}` }
              }),
            ]}
          />
        </Field>
        <Field label={t("field.frameRate")}>
          <Select
            label={t("field.frameRate")}
            value={rate}
            onChange={custom(setRate)}
            options={[{ id: PROJECT_VALUE, label: t("export.projectValue", { value: fpsText(fpsLabel(settings.fps)) }) }, ...FRAME_RATES.filter((r) => !sameFps(r.fps, settings.fps)).map((r) => ({ id: r.label, label: fpsText(r.label) }))]}
          />
        </Field>
        {codec !== "prores" && (
          <>
            <Field label={t("export.quality")}>
              <Select
                label={t("export.quality")}
                value={quality}
                onChange={custom(setQuality)}
                options={[
                  { id: "best", label: t("export.quality.best") },
                  { id: "high", label: t("export.quality.high") },
                  { id: "balanced", label: t("export.quality.balanced") },
                  { id: "small", label: t("export.quality.small") },
                  { id: "bitrate", label: t("export.quality.bitrate") },
                ]}
              />
              {quality === "bitrate" && <NumberField value={mbps} onChange={custom(setMbps)} min={1} max={400} unit="Mbps" />}
            </Field>
            <Field label={t("export.encoding")}>
              <Select
                label={t("export.encodingSpeed")}
                value={speed}
                onChange={custom(setSpeed)}
                options={[
                  { id: "veryfast" as Speed, label: t("export.speed.fast") },
                  { id: "medium" as Speed, label: t("export.speed.balanced") },
                  { id: "slow" as Speed, label: t("export.speed.slow") },
                ]}
              />
            </Field>
          </>
        )}
        {codec === "h265" && (
          <Field label={t("export.dynamicRange")}>
            <Select
              label={t("export.dynamicRange")}
              value={dynamicRange}
              onChange={setDynamicRange}
              options={[
                { id: "sdr", label: t("export.sdr") },
                { id: "hdr", label: t("export.hdr") },
              ]}
            />
          </Field>
        )}
        {codec === "h264" && (
          <Field label={t("export.smart")}>
            <Select
              label={t("export.smart")}
              value={smart}
              onChange={setSmart}
              options={[
                { id: "on", label: t("export.smart.on") },
                { id: "off", label: t("export.smart.off") },
              ]}
            />
          </Field>
        )}
        <Field label={t("export.range")}>
          <Select
            label={t("export.range")}
            value={rangeKind}
            onChange={setRangeKind}
            options={[
              { id: "all", label: t("export.range.all") },
              { id: "selection", label: t("export.range.selection"), disabled: !selection },
              { id: "custom", label: t("common.custom") },
            ]}
          />
        </Field>
        {rangeKind === "custom" && (
          <Field label={t("export.fromTo")}>
            <NumberField value={customFrom} onChange={setCustomFrom} min={0} step={sec(frameTicks(fps))} precision={2} unit="s" />
            <NumberField value={customTo} onChange={setCustomTo} min={0} step={sec(frameTicks(fps))} precision={2} unit="s" />
          </Field>
        )}
        <Field label={t("export.length")}>
          <TimePill>{timecode(range[1] - range[0], fps)}</TimePill>
          <span className="tnum text-small text-muted">{t("export.frames", { count: frames })}</span>
        </Field>
      </div>
      {PRESETS.find((p) => p.id === presetId)?.vertical && !isVertical(settings) && (
        <p className="mt-4 flex items-center gap-2 text-body text-label">
          <span className="flex-1">{t("export.notVertical")}</span>
          <Button onClick={() => openDialog("vertical")}>{t("tools.vertical")}</Button>
        </p>
      )}
      {hasHdr && !(codec === "h265" && dynamicRange === "hdr") && <p className="mt-4 text-body text-label">{t("export.hdrToSdr")}</p>}
      {(blocker || error) && <p className="mt-4 text-body text-error">{error ?? blocker}</p>}
    </Modal>
  )
}