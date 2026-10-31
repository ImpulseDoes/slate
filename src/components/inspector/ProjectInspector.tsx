import { Clock01Icon, Settings02Icon } from "@hugeicons/core-free-icons"
import { projectDuration } from "../../lib/clips"
import { fpsText, useT } from "../../lib/i18n"
import { fpsLabel, timecode } from "../../lib/time"
import { useEditor } from "../../store/editor"
import { openDialog } from "../../store/overlays"
import { Button, TimePill } from "../ui"
import { InfoRow } from "./rows"

export function ProjectInspector({ multi }: { multi: number }) {

  const t = useT()
  const duration = useEditor((s) => projectDuration(s.clips))
  const { width, height, fps } = useEditor((s) => s.settings)

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-h-md font-semibold">{t("inspector.project")}</h2>
        <Button icon={Settings02Icon} onClick={() => openDialog("settings")}>
          {t("inspector.settings")}
        </Button>
      </div>
      <div className="flex flex-col gap-3">
        <InfoRow label={t("field.resolution")}>
          <span className="tnum">
            {width} × {height}
          </span>
        </InfoRow>
        <InfoRow label={t("field.frameRate")}>
          <span className="tnum">{fpsText(fpsLabel(fps))}</span>
        </InfoRow>
        <InfoRow label={t("field.duration")}>
          <TimePill icon={Clock01Icon}>{timecode(duration, fps)}</TimePill>
        </InfoRow>
      </div>
      <p className="mt-6 text-body text-muted">{multi ? t("inspector.selected", { count: multi }) : t("inspector.hint")}</p>
    </>
  )
}