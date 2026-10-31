import { useState } from "react"
import { FRAME_RATES, sameFps } from "../../lib/time"
import { useEditor } from "../../store/editor"
import { Modal } from "../overlays/Modal"
import { Button, Field, NumberField, Select } from "../ui"

const SIZES = [
  { id: "1920x1080", label: "1920 × 1080 · Full HD" },
  { id: "3840x2160", label: "3840 × 2160 · 4K" },
  { id: "2560x1440", label: "2560 × 1440 · QHD" },
  { id: "1280x720", label: "1280 × 720 · HD" },
  { id: "1080x1920", label: "1080 × 1920 · Vertical" },
  { id: "1080x1350", label: "1080 × 1350 · Portrait" },
  { id: "1080x1080", label: "1080 × 1080 · Square" },
]
const CUSTOM = "custom"
const MIN_SIDE = 16
const MAX_SIDE = 8192

const even = (n: number) => Math.round(n / 2) * 2

export function ProjectSettingsDialog({ onClose }: { onClose: () => void }) {

  const settings = useEditor((s) => s.settings)
  const projectName = useEditor((s) => s.projectName)
  const updateSettings = useEditor((s) => s.updateSettings)
  const [name, setName] = useState(projectName)
  const [width, setWidth] = useState(settings.width)
  const [height, setHeight] = useState(settings.height)
  const [fps, setFps] = useState(FRAME_RATES.find((r) => sameFps(r.fps, settings.fps)) ?? FRAME_RATES[4])
  const size = `${width}x${height}`
  const known = SIZES.some((s) => s.id === size)
  const [custom, setCustom] = useState(!known)

  const apply = () => {
    updateSettings(name.trim() || projectName, { width: even(width), height: even(height), fps: fps.fps })
    onClose()
  }

  return (
    <Modal
      title="Project settings"
      labelId="settings-title"
      onClose={onClose}
      closeButton
      width={440}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={apply}>
            Apply
          </Button>
        </>
      }
    >
      <div className="mt-3 flex flex-col gap-3">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Project name" className="h-8 w-full min-w-0 rounded-md bg-raised px-2 text-body text-fg outline-none focus-visible:outline-2 focus-visible:outline-primary" />
        </Field>
        <Field label="Resolution">
          <Select
            label="Resolution"
            value={custom ? CUSTOM : size}
            options={[...SIZES, { id: CUSTOM, label: "Custom" }]}
            onChange={(id) => {
              setCustom(id === CUSTOM)
              if (id === CUSTOM) return
              const [w, h] = id.split("x").map(Number)
              setWidth(w)
              setHeight(h)
            }}
          />
        </Field>
        {custom && (
          <Field label="Size">
            <NumberField value={width} onChange={setWidth} min={MIN_SIDE} max={MAX_SIDE} unit="W" />
            <NumberField value={height} onChange={setHeight} min={MIN_SIDE} max={MAX_SIDE} unit="H" />
          </Field>
        )}
        <Field label="Frame rate">
          <Select label="Frame rate" value={fps.label} options={FRAME_RATES.map((r) => ({ id: r.label, label: `${r.label} fps` }))} onChange={(id) => setFps(FRAME_RATES.find((r) => r.label === id)!)} />
        </Field>
      </div>
    </Modal>
  )
}