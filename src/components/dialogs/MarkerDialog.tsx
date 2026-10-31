import { useState } from "react"
import { useT } from "../../lib/i18n"
import { timecode } from "../../lib/time"
import { useEditor } from "../../store/editor"
import { useOverlays } from "../../store/overlays"
import type { MarkerColor } from "../../types"
import { Modal } from "../overlays/Modal"
import { Button, Field, MARKER_COLORS, TimePill } from "../ui"

const COLORS = Object.keys(MARKER_COLORS) as MarkerColor[]

export function MarkerDialog({ onClose }: { onClose: () => void }) {

  const t = useT()
  const marker = useEditor((s) => s.markers.find((m) => m.id === useOverlays.getState().markerId))
  const fps = useEditor((s) => s.settings.fps)
  const [name, setName] = useState(marker?.name ?? "")
  const [color, setColor] = useState<MarkerColor>(marker?.color ?? "blue")

  if (!marker) return null

  const save = () => {
    useEditor.getState().updateMarker(marker.id, { name: name.trim(), color })
    onClose()
  }

  return (
    <Modal
      title={t("marker.title")}
      labelId="marker-title"
      onClose={onClose}
      closeButton
      width={380}
      footer={
        <>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" onClick={save}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="mt-3 flex flex-col gap-3">
        <Field label={t("marker.at")}>
          <TimePill>{timecode(marker.at, fps)}</TimePill>
        </Field>
        <Field label={t("marker.name")}>
          <input
            autoFocus
            aria-label={t("marker.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            className="h-8 w-full min-w-0 rounded-md bg-raised px-2 text-body text-fg outline-none focus:outline-2 focus:outline-primary"
          />
        </Field>
        <Field label={t("marker.color")}>
          <div className="flex gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                aria-label={c}
                aria-pressed={c === color}
                onClick={() => setColor(c)}
                className={`h-6 w-6 rounded-full ${c === color ? "ring-2 ring-primary ring-offset-2" : ""}`}
                style={{ background: MARKER_COLORS[c] }}
              />
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  )
}