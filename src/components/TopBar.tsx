import { useEffect, useState } from "react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { CheckmarkCircle02Icon, Clock01Icon, Download04Icon, File01Icon, FilePlusIcon, FloppyDiskIcon, Folder01Icon, FolderOpenIcon, LoaderPinwheelIcon, Redo02Icon, Settings02Icon, Undo02Icon } from "@hugeicons/core-free-icons"
import { isDirty, useEditor } from "../store/editor"
import { runningRenders, useRenders } from "../store/renders"
import { isMac, isTauri, MOD } from "../lib/platform"
import { openProject, recentProjects, saveProject, saveProjectAs, startNewProject } from "../lib/session"
import { openDialog, openMenuBelow, type MenuEntry } from "./overlays"
import { Button, StatusTag, Tip } from "./ui"

function fileMenu(e: React.MouseEvent) {
  const hasClips = useEditor.getState().clips.length > 0
  const recent = recentProjects().map((r): MenuEntry => ({ label: r.name, icon: Clock01Icon, onSelect: () => void openProject(r.path) }))
  openMenuBelow(e, [
    { label: "New project", icon: FilePlusIcon, kbd: `${MOD} N`, onSelect: startNewProject },
    { label: "Open…", icon: FolderOpenIcon, kbd: `${MOD} O`, disabled: !isTauri, onSelect: () => void openProject() },
    "divider",
    { label: "Save", icon: FloppyDiskIcon, kbd: `${MOD} S`, disabled: !isTauri, onSelect: () => void saveProject() },
    { label: "Save as…", icon: Folder01Icon, kbd: `${MOD} ⇧ S`, disabled: !isTauri, onSelect: () => void saveProjectAs() },
    "divider",
    { label: "Project settings…", icon: Settings02Icon, onSelect: () => openDialog("settings") },
    { label: "Export…", icon: Download04Icon, kbd: `${MOD} E`, disabled: !hasClips, onSelect: () => openDialog("export") },
    ...(recent.length ? (["divider", ...recent] as MenuEntry[]) : []),
  ])
}

function SaveState() {
  const dirty = useEditor(isDirty)
  const saved = useEditor((s) => !!s.projectPath)
  if (dirty) return <StatusTag tone="progress" icon={LoaderPinwheelIcon}>Unsaved</StatusTag>
  return saved ? <StatusTag icon={CheckmarkCircle02Icon}>Saved</StatusTag> : <StatusTag icon={File01Icon}>Draft</StatusTag>
}

function ExportProgress() {
  const running = useRenders(runningRenders)
  const progress = useRenders((s) => s.jobs.find((j) => j.status === "running")?.progress ?? 0)
  const any = useRenders((s) => s.jobs.length > 0)
  if (!any) return null
  return (
    <Button variant="quiet" onClick={() => openDialog("renders")}>
      <span className="tnum">{running ? `Exporting ${Math.round(progress * 100)}%` : "Exports"}</span>
    </Button>
  )
}

export function TopBar() {
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
          File
        </Button>
        <span data-tauri-drag-region className="truncate text-h-sm font-semibold text-fg">
          {projectName}
        </span>
        <SaveState />
        <div className="ml-2 flex items-center gap-0.5">
          <Tip label="Undo" kbd={`${MOD} Z`} side="bottom">
            <Button variant="quiet" icon={Undo02Icon} onClick={undo} disabled={!canUndo} aria-label="Undo" />
          </Tip>
          <Tip label="Redo" kbd={`${MOD} ⇧ Z`} side="bottom">
            <Button variant="quiet" icon={Redo02Icon} onClick={redo} disabled={!canRedo} aria-label="Redo" />
          </Tip>
        </div>
      </div>

      <div className={`flex items-center gap-1.5 ${isMac || !isTauri ? "pr-2" : ""}`}>
        <ExportProgress />
        <Button variant="primary" icon={Download04Icon} onClick={() => openDialog("export")} disabled={!hasClips}>
          Export
        </Button>
      </div>

      {isTauri && !isMac && <WindowControls />}
    </header>
  )
}

function WindowControls() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    const win = getCurrentWindow()
    void win.isMaximized().then(setMaximized)
    const unlisten = win.onResized(async () => setMaximized(await win.isMaximized()))
    return () => void unlisten.then((fn) => fn())
  }, [])

  const win = () => getCurrentWindow()
  const base = "inline-flex h-12 w-[46px] items-center justify-center text-label transition-colors hover:bg-raised-hover hover:text-fg"

  return (
    <div className="flex h-full">
      <button className={base} aria-label="Minimize" onClick={() => win().minimize()}>
        <svg width="10" height="10" viewBox="0 0 10 10">
          <rect y="4.5" width="10" height="1" fill="currentColor" />
        </svg>
      </button>
      <button className={base} aria-label={maximized ? "Restore" : "Maximize"} onClick={() => win().toggleMaximize()}>
        {maximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor">
            <rect x="0.5" y="2.5" width="7" height="7" />
            <path d="M2.5 2.5V0.5H9.5V7.5H7.5" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor">
            <rect x="0.5" y="0.5" width="9" height="9" />
          </svg>
        )}
      </button>
      <button className={`${base} hover:bg-[#c42b1c]! hover:text-white!`} aria-label="Close" onClick={() => win().close()}>
        <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.1">
          <path d="M0.5 0.5L9.5 9.5M9.5 0.5L0.5 9.5" />
        </svg>
      </button>
    </div>
  )
}