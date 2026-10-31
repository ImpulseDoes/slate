import { FileImportIcon } from "@hugeicons/core-free-icons"
import { useShallow } from "zustand/react/shallow"
import { useT } from "../../lib/i18n"
import { pickAndImport } from "../../lib/media/importer"
import { MOD } from "../../lib/platform"
import { useEditor } from "../../store/editor"
import { openMenu } from "../../store/overlays"
import { liveMedia } from "../../store/selectors"
import { Button, Icon, Tip } from "../ui"
import { MediaRow } from "./MediaRow"

export function MediaBin({ dropActive }: { dropActive: boolean }) {

  const t = useT()
  const media = useEditor(useShallow(liveMedia))

  return (
    <section
      onContextMenu={(e) => openMenu(e, [{ label: t("media.importMedia"), icon: FileImportIcon, kbd: `${MOD} I`, onSelect: () => void pickAndImport() }])}
      className={`flex w-[300px] shrink-0 flex-col rounded-xl bg-surface p-4 shadow-card transition-[outline-color] ${dropActive ? "outline-2 outline-primary" : "outline-2 outline-transparent"}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-h-md font-semibold">{t("media.title")}</h2>
        <Tip label={t("media.importMedia")} kbd={`${MOD} I`} side="bottom">
          <Button icon={FileImportIcon} onClick={() => void pickAndImport()}>
            {t("media.import")}
          </Button>
        </Tip>
      </div>

      {media.length === 0 ? (
        <EmptyBin />
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between text-small text-muted">
            <span>{t("media.footage")}</span>
            <span className="tnum">{media.length}</span>
          </div>
          <ul className="-mx-1.5 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
            {media.map((m) => (
              <MediaRow key={m.id} item={m} />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function EmptyBin() {
  const t = useT()
  return (
    <button
      onClick={() => void pickAndImport()}
      className="flex flex-1 flex-col items-center justify-center gap-2.5 rounded-lg border border-dashed border-border-strong px-6 text-center text-body text-label hover:bg-raised hover:text-fg"
    >
      <Icon icon={FileImportIcon} size={24} />
      <span>{t("media.empty")}</span>
    </button>
  )
}