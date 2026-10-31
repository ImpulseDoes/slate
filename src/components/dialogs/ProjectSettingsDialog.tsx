import { useState } from "react"
import { fpsText, useT, type Key } from "../../lib/i18n"
import { FRAME_RATES, sameFps } from "../../lib/time"
import { useEditor } from "../../store/editor"
import { Modal } from "../overlays/Modal"
import { Button, Field, NumberField, Select } from "../ui"

const SIZES: { id: string; label: Key }[] = [
  { id: "1920x1080", label: "settings.size.fullHd" },
  { id: "3840x2160", label: "settings.size.4k" },
  { id: "2560x1440", label: "settings.size.qhd" },
  { id: "1280x720", label: "settings.size.hd" },
  { id: "1080x1920", label: "settings.size.vertical" },
  { id: "1080x1350", label: "settings.size.portrait" },
  { id: "1080x1080", label: "settings.size.square" },
]
const CUSTOM = "custom"
const MIN_SIDE = 16
const MAX_SIDE = 8192

const even = (n: number) => Math.round(n / 2) * 2

export function ProjectSettingsDialog({ onClose }: { onClose: () => void }) {

  const t = useT()
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
      title={t("settings.title")}
      labelId="settings-title"
      onClose={onClose}
      closeButton
      width={440}
      footer={
        <>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" onClick={apply}>
            {t("settings.apply")}
          </Button>
        </>
      }
    >
      <div className="mt-3 flex flex-col gap-3">
        <Field label={t("settings.name")}>
          <input value={name} onChange={(e) => setName(e.target.value)} aria-label={t("settings.projectName")} className="h-8 w-full min-w-0 rounded-md bg-raised px-2 text-body text-fg outline-none focus-visible:outline-2 focus-visible:outline-primary" />
        </Field>
        <Field label={t("field.resolution")}>
          <Select
            label={t("field.resolution")}
            value={custom ? CUSTOM : size}
            options={[...SIZES.map((s) => ({ id: s.id, label: t(s.label) })), { id: CUSTOM, label: t("common.custom") }]}
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
          <Field label={t("settings.size")}>
            <NumberField value={width} onChange={setWidth} min={MIN_SIDE} max={MAX_SIDE} unit={t("settings.unitWidth")} />
            <NumberField value={height} onChange={setHeight} min={MIN_SIDE} max={MAX_SIDE} unit={t("settings.unitHeight")} />
          </Field>
        )}
        <Field label={t("field.frameRate")}>
          <Select label={t("field.frameRate")} value={fps.label} options={FRAME_RATES.map((r) => ({ id: r.label, label: fpsText(r.label) }))} onChange={(id) => setFps(FRAME_RATES.find((r) => r.label === id)!)} />
        </Field>
      </div>
    </Modal>
  )
}