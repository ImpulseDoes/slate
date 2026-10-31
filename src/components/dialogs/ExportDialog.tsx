import { useEffect, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { Download04Icon } from "@hugeicons/core-free-icons"
import { useShallow } from "zustand/react/shallow"
import { projectDuration, selectionSpan } from "../../lib/clips"
import { errorText } from "../../lib/errors"
import { isTauri } from "../../lib/platform"
import { checkExportable, queueExport } from "../../lib/render/exporter"
import { ENCODER, type Codec, type ExportOptions, type Quality, type Speed } from "../../lib/render/plan"
import { fpsLabel, FRAME_RATES, frameIndex, frameTicks, sameFps, sec, ticks, timecode } from "../../lib/time"
import { useEditor } from "../../store/editor"
import { openDialog } from "../../store/overlays"
import { Modal } from "../overlays/Modal"
import { Button, Field, NumberField, Select, TimePill } from "../ui"

const PROJECT_VALUE = "project"
const HEIGHTS = [2160, 1440, 1080, 720, 480]
const CRF = { best: 16, high: 20, balanced: 24, small: 29 }

type Preset = { id: string; label: string; codec: Codec; height: number | null; quality: string; mbps: number; speed: Speed }

const PRESETS: Preset[] = [
  { id: "web", label: "Web · H.264", codec: "h264", height: null, quality: "high", mbps: 12, speed: "medium" },
  { id: "small", label: "Small file · H.265", codec: "h265", height: null, quality: "balanced", mbps: 8, speed: "medium" },
  { id: "draft", label: "Quick draft · 720p", codec: "h264", height: 720, quality: "balanced", mbps: 5, speed: "veryfast" },
  { id: "master", label: "Master · ProRes 422 HQ", codec: "prores", height: null, quality: "best", mbps: 0, speed: "medium" },
]
const CUSTOM = "custom"

function sizeFor(height: number, projectWidth: number, projectHeight: number) {
  return { width: Math.round((height * projectWidth) / projectHeight / 2) * 2, height }
}

export function ExportDialog({ onClose }: { onClose: () => void }) {

  const duration = useEditor((s) => projectDuration(s.clips))
  const settings = useEditor((s) => s.settings)
  const selection = useEditor(useShallow((s) => selectionSpan(s.clips, s.selectedClipIds)))

  const [encoders, setEncoders] = useState<string[] | null>(null)
  const [unavailable, setUnavailable] = useState<string | null>(isTauri ? null : "Exporting needs the desktop app.")
  const [presetId, setPresetId] = useState(PRESETS[0].id)
  const [codec, setCodec] = useState<Codec>("h264")
  const [height, setHeight] = useState(PROJECT_VALUE)
  const [rate, setRate] = useState(PROJECT_VALUE)
  const [quality, setQuality] = useState("high")
  const [mbps, setMbps] = useState(12)
  const [speed, setSpeed] = useState<Speed>("medium")
  const [rangeKind, setRangeKind] = useState("all")
  const [customFrom, setCustomFrom] = useState(0)
  const [customTo, setCustomTo] = useState(Math.round(sec(duration) * 100) / 100)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isTauri) return
    invoke<string[]>("render_encoders")
      .then(setEncoders)
      .catch(() => setUnavailable("FFmpeg isn't available, so Slate can't export. Run scripts/fetch-ffmpeg.ts."))
  }, [])

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
  const blocker = unavailable ?? (frames < 1 ? "That range is empty." : checkExportable(range))

  const start = async () => {
    const q: Quality = quality === "bitrate" ? { mode: "bitrate", mbps } : { mode: "quality", crf: CRF[quality as keyof typeof CRF] }
    const options: ExportOptions = { codec, ...size, fps, quality: q, speed, range }
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
      title="Export"
      labelId="export-title"
      onClose={onClose}
      closeButton
      width={480}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Download04Icon} disabled={!!blocker || busy} onClick={() => void start()}>
            Export
          </Button>
        </>
      }
    >
      <div className="mt-3 flex flex-col gap-3">
        <Field label="Preset">
          <Select label="Preset" value={presetId} options={[...PRESETS.map((p) => ({ id: p.id, label: p.label })), { id: CUSTOM, label: "Custom" }]} onChange={applyPreset} />
        </Field>
        <Field label="Format">
          <Select
            label="Format"
            value={codec}
            onChange={custom(setCodec)}
            options={[
              { id: "h264" as Codec, label: "MP4 · H.264 · AAC" },
              { id: "h265" as Codec, label: "MP4 · H.265 · AAC" },
              { id: "prores" as Codec, label: "MOV · ProRes 422 HQ · PCM" },
            ].map((o) => ({ ...o, disabled: !!encoders && !encoders.includes(ENCODER[o.id]) }))}
          />
        </Field>
        <Field label="Resolution">
          <Select
            label="Resolution"
            value={height}
            onChange={custom(setHeight)}
            options={[
              { id: PROJECT_VALUE, label: `Project · ${settings.width} × ${settings.height}` },
              ...HEIGHTS.filter((h) => h !== settings.height).map((h) => {
                const s = sizeFor(h, settings.width, settings.height)
                return { id: String(h), label: `${s.width} × ${s.height}` }
              }),
            ]}
          />
        </Field>
        <Field label="Frame rate">
          <Select
            label="Frame rate"
            value={rate}
            onChange={custom(setRate)}
            options={[{ id: PROJECT_VALUE, label: `Project · ${fpsLabel(settings.fps)} fps` }, ...FRAME_RATES.filter((r) => !sameFps(r.fps, settings.fps)).map((r) => ({ id: r.label, label: `${r.label} fps` }))]}
          />
        </Field>
        {codec !== "prores" && (
          <>
            <Field label="Quality">
              <Select
                label="Quality"
                value={quality}
                onChange={custom(setQuality)}
                options={[
                  { id: "best", label: "Best" },
                  { id: "high", label: "High" },
                  { id: "balanced", label: "Balanced" },
                  { id: "small", label: "Smallest file" },
                  { id: "bitrate", label: "Set a bitrate" },
                ]}
              />
              {quality === "bitrate" && <NumberField value={mbps} onChange={custom(setMbps)} min={1} max={400} unit="Mbps" />}
            </Field>
            <Field label="Encoding">
              <Select
                label="Encoding speed"
                value={speed}
                onChange={custom(setSpeed)}
                options={[
                  { id: "veryfast" as Speed, label: "Fast, larger file" },
                  { id: "medium" as Speed, label: "Balanced" },
                  { id: "slow" as Speed, label: "Slow, smaller file" },
                ]}
              />
            </Field>
          </>
        )}
        <Field label="Range">
          <Select
            label="Range"
            value={rangeKind}
            onChange={setRangeKind}
            options={[
              { id: "all", label: "Whole timeline" },
              { id: "selection", label: "Selected clips", disabled: !selection },
              { id: "custom", label: "Custom" },
            ]}
          />
        </Field>
        {rangeKind === "custom" && (
          <Field label="From, to">
            <NumberField value={customFrom} onChange={setCustomFrom} min={0} step={sec(frameTicks(fps))} precision={2} unit="s" />
            <NumberField value={customTo} onChange={setCustomTo} min={0} step={sec(frameTicks(fps))} precision={2} unit="s" />
          </Field>
        )}
        <Field label="Length">
          <TimePill>{timecode(range[1] - range[0], fps)}</TimePill>
          <span className="tnum text-small text-muted">{frames.toLocaleString()} frames</span>
        </Field>
      </div>
      {(blocker || error) && <p className="mt-4 text-body text-error">{error ?? blocker}</p>}
    </Modal>
  )
}
