import { CheckmarkCircle02Icon, Clock01Icon, Download04Icon, File01Icon, FilePlusIcon, FloppyDiskIcon, Folder01Icon, FolderOpenIcon, LanguageSquareIcon, LoaderPinwheelIcon, Mic01Icon, Redo02Icon, ScissorIcon, Settings02Icon, SmartPhone01Icon, SubtitleIcon, Undo02Icon, VolumeHighIcon, VolumeLowIcon } from "@hugeicons/core-free-icons"
import { toggleRecording } from "../../lib/audio/recorder"
import { canUseSoundTools, duckSelected, normalizeSelected } from "../../lib/audio/tools"
import { t, useT } from "../../lib/i18n"
import { isMac, isTauri, MOD } from "../../lib/platform"
import { openProject, recentProjects, saveProject, saveProjectAs, startNewProject } from "../../lib/project/session"
import { importCaptions } from "../../lib/text/captions"
import { recordingsToTranscribe } from "../../lib/text/transcribe"
import { useEditor } from "../../store/editor"
import { openDialog, openMenuBelow, type MenuEntry } from "../../store/overlays"
import { runningRenders, useRenders } from "../../store/renders"
import { isDirty } from "../../store/selectors"
import { Button, StatusTag, Tip } from "../ui"
import { WindowControls } from "./WindowControls"

function fileMenu(e: React.MouseEvent) {
  const hasClips = useEditor.getState().clips.length > 0
  const recent = recentProjects().map((r): MenuEntry => ({ label: r.name, icon: Clock01Icon, onSelect: () => void openProject(r.path) }))
  openMenuBelow(e, [
    { label: t("file.new"), icon: FilePlusIcon, kbd: `${MOD} N`, onSelect: startNewProject },
    { label: t("file.open"), icon: FolderOpenIcon, kbd: `${MOD} O`, disabled: !isTauri, onSelect: () => void openProject() },
    "divider",
    { label: t("common.save"), icon: FloppyDiskIcon, kbd: `${MOD} S`, disabled: !isTauri, onSelect: () => void saveProject() },
    { label: t("file.saveAs"), icon: Folder01Icon, kbd: `${MOD} ⇧ S`, disabled: !isTauri, onSelect: () => void saveProjectAs() },
    "divider",
    { label: t("file.projectSettings"), icon: Settings02Icon, onSelect: () => openDialog("settings") },
    { label: t("file.language"), icon: LanguageSquareIcon, onSelect: () => openDialog("language") },
    { label: t("file.export"), icon: Download04Icon, kbd: `${MOD} E`, disabled: !hasClips, onSelect: () => openDialog("export") },
    ...(recent.length ? (["divider", ...recent] as MenuEntry[]) : []),
  ])
}

function toolsMenu(e: React.MouseEvent) {
  const state = useEditor.getState()
  const sound = canUseSoundTools(state)
  openMenuBelow(e, [
    { label: t("tools.autoCaptions"), icon: SubtitleIcon, disabled: !isTauri || !recordingsToTranscribe(state).length, onSelect: () => openDialog("autoCaptions") },
    { label: t("tools.captions"), icon: SubtitleIcon, disabled: !isTauri, onSelect: () => void importCaptions() },
    "divider",
    { label: t("record.start"), icon: Mic01Icon, kbd: "R", disabled: !isTauri, onSelect: toggleRecording },
    { label: t("tools.level"), icon: VolumeHighIcon, disabled: !sound || !isTauri, onSelect: () => void normalizeSelected() },
    { label: t("tools.duck"), icon: VolumeLowIcon, disabled: !sound, onSelect: duckSelected },
    { label: t("tools.silence"), icon: ScissorIcon, disabled: !sound, onSelect: () => openDialog("silence") },
    "divider",
    { label: t("tools.vertical"), icon: SmartPhone01Icon, onSelect: () => openDialog("vertical") },
  ])
}

function SaveState() {
  const t = useT()
  const dirty = useEditor(isDirty)
  const saved = useEditor((s) => !!s.projectPath)
  if (dirty) return <StatusTag tone="progress" icon={LoaderPinwheelIcon}>{t("state.unsaved")}</StatusTag>
  return saved ? <StatusTag icon={CheckmarkCircle02Icon}>{t("state.saved")}</StatusTag> : <StatusTag icon={File01Icon}>{t("state.draft")}</StatusTag>
}

function ExportProgress() {
  const t = useT()
  const running = useRenders(runningRenders)
  const progress = useRenders((s) => s.jobs.find((j) => j.status === "running")?.progress ?? 0)
  const any = useRenders((s) => s.jobs.length > 0)
  if (!any) return null
  return (
    <Button variant="quiet" onClick={() => openDialog("renders")}>
      <span className="tnum">{running ? t("topbar.exporting", { percent: Math.round(progress * 100) }) : t("topbar.exports")}</span>
    </Button>
  )
}

export function TopBar() {
  const t = useT()
  const projectName = useEditor((s) => s.projectName)
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
  const hasClips = useEditor((s) => s.clips.length > 0)

  return (
    <header data-tauri-drag-region className="flex h-12 shrink-0 items-center gap-3 pr-0 select-none" style={{ paddingLeft: isMac && isTauri ? 80 : 16 }}>
      <div data-tauri-drag-region className="flex min-w-0 flex-1 items-center gap-2">
        <Button variant="quiet" onClick={fileMenu}>
          {t("menu.file")}
        </Button>
        <Button variant="quiet" onClick={toolsMenu}>
          {t("menu.tools")}
        </Button>
        <span data-tauri-drag-region className="truncate text-h-sm font-semibold text-fg">
          {projectName}
        </span>
        <SaveState />
        <div className="ml-2 flex items-center gap-0.5">
          <Tip label={t("edit.undo")} kbd={`${MOD} Z`} side="bottom">
            <Button variant="quiet" icon={Undo02Icon} onClick={undo} disabled={!canUndo} aria-label={t("edit.undo")} />
          </Tip>
          <Tip label={t("edit.redo")} kbd={`${MOD} ⇧ Z`} side="bottom">
            <Button variant="quiet" icon={Redo02Icon} onClick={redo} disabled={!canRedo} aria-label={t("edit.redo")} />
          </Tip>
        </div>
      </div>

      <div className={`flex items-center gap-1.5 ${isMac || !isTauri ? "pr-2" : ""}`}>
        <ExportProgress />
        <Button variant="primary" icon={Download04Icon} onClick={() => openDialog("export")} disabled={!hasClips}>
          {t("common.export")}
        </Button>
      </div>

      {isTauri && !isMac && <WindowControls />}
    </header>
  )
}