import { useState } from "react"
import { useT } from "../../lib/i18n"
import { applyLayout, isVertical, layoutCandidates, reframeToVertical, VERTICAL, type Layout } from "../../lib/vertical"
import { useEditor } from "../../store/editor"
import { Modal } from "../overlays/Modal"
import { Button, Field, Select } from "../ui"

export function VerticalDialog({ onClose }: { onClose: () => void }) {

  const t = useT()
  const settings = useEditor((s) => s.settings)
  const clips = useEditor((s) => s.clips)
  const tracks = useEditor((s) => s.tracks)
  const media = useEditor((s) => s.media)
  const playhead = useEditor((s) => s.playhead)
  const order = tracks.map((tr) => tr.id)
  const candidates = layoutCandidates(clips, media, playhead).sort((a, b) => order.indexOf(a.trackId) - order.indexOf(b.trackId))
  const names = candidates.map((c) => ({ id: c.id, label: c.name }))
  const [layout, setLayout] = useState<Layout>("stack")
  const [facecam, setFacecam] = useState(candidates[0]?.id ?? "")
  const [gameplay, setGameplay] = useState(candidates[1]?.id ?? "")
  const ready = names.some((n) => n.id === facecam) && names.some((n) => n.id === gameplay) && facecam !== gameplay

  const apply = () => {
    applyLayout(layout, gameplay, facecam)
    onClose()
  }

  return (
    <Modal
      title={t("vertical.title")}
      labelId="vertical-title"
      onClose={onClose}
      closeButton
      width={460}
      footer={<Button onClick={onClose}>{t("common.close")}</Button>}
    >
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-body text-label">{t("vertical.reframeHint")}</p>
        <Button variant="primary" disabled={isVertical(settings)} onClick={reframeToVertical}>
          {isVertical(settings) ? t("vertical.already") : t("vertical.reframe", { size: `${VERTICAL.width} × ${VERTICAL.height}` })}
        </Button>
        <div className="mt-2 flex flex-col gap-3 border-t border-border pt-4">
          <p className="text-body text-label">{t("vertical.layoutHint")}</p>
          {names.length < 2 ? (
            <p className="text-body text-muted">{t("vertical.needTwo")}</p>
          ) : (
            <>
              <Field label={t("vertical.layout")}>
                <Select
                  label={t("vertical.layout")}
                  value={layout}
                  onChange={setLayout}
                  options={[
                    { id: "stack" as Layout, label: t("vertical.stack") },
                    { id: "even" as Layout, label: t("vertical.even") },
                    { id: "corner" as Layout, label: t("vertical.corner") },
                  ]}
                />
              </Field>
              <Field label={t("vertical.facecam")}>
                <Select label={t("vertical.facecam")} value={facecam} options={names} onChange={setFacecam} />
              </Field>
              <Field label={t("vertical.gameplay")}>
                <Select label={t("vertical.gameplay")} value={gameplay} options={names} onChange={setGameplay} />
              </Field>
              <Button disabled={!ready} onClick={apply}>
                {t("vertical.apply")}
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}