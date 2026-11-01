import { useT } from "../../lib/i18n"
import { setTheme, THEMES, usePrefs } from "../../store/prefs"
import { Modal } from "../overlays/Modal"
import { Button, Select } from "../ui"

export function ThemeDialog({ onClose }: { onClose: () => void }) {

  const t = useT()
  const theme = usePrefs((s) => s.theme)

  return (
    <Modal
      title={t("theme.title")}
      labelId="theme-title"
      onClose={onClose}
      closeButton
      width={360}
      footer={
        <Button variant="primary" onClick={onClose}>
          {t("common.done")}
        </Button>
      }
    >
      <div className="mt-3">
        <Select label={t("theme.title")} value={theme} options={THEMES.map((o) => ({ id: o.id, label: t(o.label) }))} onChange={setTheme} />
      </div>
    </Modal>
  )
}