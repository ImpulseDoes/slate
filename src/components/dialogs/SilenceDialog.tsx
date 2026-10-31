import { useMemo, useState } from "react"
import { silentSpans } from "../../lib/audio/analysis"
import { cutSilence, DEFAULT_SILENCE, selectedWithPeaks } from "../../lib/audio/tools"
import { useT } from "../../lib/i18n"
import { sec, ticks } from "../../lib/time"
import { useEditor } from "../../store/editor"
import { Modal } from "../overlays/Modal"
import { Button, Field, NumberField } from "../ui"

export function SilenceDialog({ onClose }: { onClose: () => void }) {

  const t = useT()
  const clips = useEditor((s) => s.clips)
  const selected = useEditor((s) => s.selectedClipIds)
  const media = useEditor((s) => s.media)
  const [threshold, setThreshold] = useState(DEFAULT_SILENCE.threshold * 100)
  const [minimum, setMinimum] = useState(sec(DEFAULT_SILENCE.minimum))
  const [padding, setPadding] = useState(sec(DEFAULT_SILENCE.padding))
  const options = { threshold: threshold / 100, minimum: ticks(minimum), padding: ticks(padding) }
  const spans = useMemo(() => silentSpans(selectedWithPeaks({ clips, media, selectedClipIds: selected }), options), [clips, media, selected, threshold, minimum, padding])
  const seconds = Math.round(sec(spans.reduce((sum, [s, e]) => sum + e - s, 0)))

  const run = () => {
    cutSilence(options)
    onClose()
  }

  return (
    <Modal
      title={t("silence.title")}
      labelId="silence-title"
      onClose={onClose}
      closeButton
      width={420}
      footer={
        <>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" disabled={!spans.length} onClick={run}>
            {t("silence.cut")}
          </Button>
        </>
      }
    >
      <div className="mt-3 flex flex-col gap-3">
        <Field label={t("silence.threshold")}>
          <NumberField value={threshold} onChange={setThreshold} min={1} max={50} unit="%" />
        </Field>
        <Field label={t("silence.minimum")}>
          <NumberField value={minimum} onChange={setMinimum} min={0.1} max={10} step={0.1} precision={1} unit="s" />
        </Field>
        <Field label={t("silence.padding")}>
          <NumberField value={padding} onChange={setPadding} min={0} max={1} step={0.02} precision={2} unit="s" />
        </Field>
        <p className="text-body text-label">{spans.length ? t("silence.found", { count: spans.length, seconds }) : t("tools.noSilence")}</p>
      </div>
    </Modal>
  )
}