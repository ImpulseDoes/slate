import { LANGUAGES, setLanguage, useLanguage, useT } from "../../lib/i18n"
import { Modal } from "../overlays/Modal"
import { Button, Select } from "../ui"

export function LanguageDialog({ onClose }: { onClose: () => void }) {

  const t = useT()
  const language = useLanguage((s) => s.language)

  return (
    <Modal
      title={t("language.title")}
      labelId="language-title"
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
        <Select label={t("language.title")} value={language} options={LANGUAGES} onChange={setLanguage} />
      </div>
    </Modal>
  )
}