import { convertFileSrc, invoke } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { open, save } from "@tauri-apps/plugin-dialog"
import { newProject, useEditor, type EditorState } from "../../store/editor"
import { confirmAction, notify } from "../../store/overlays"
import { runningRenders, useRenders } from "../../store/renders"
import { isDirty } from "../../store/selectors"
import type { MediaItem } from "../../types"
import { errorText } from "../errors"
import { relinkMissing, unresolvedMedia } from "../media/importer"
import { probe } from "../media/probe"
import { baseName, dirName, joinPath, stem } from "../paths"
import { isTauri } from "../platform"
import { parseProject, PROJECT_EXTENSION, toProjectFile, type ProjectFile } from "./file"

const AUTOSAVE_EVERY_MS = 15_000
const RECENT_KEY = "slate.recent"
const RECENT_LIMIT = 6

interface Autosave {
  savedAt: number
  path: string | null
  project: ProjectFile
}

export interface RecentProject {
  path: string
  name: string
}

const serialized = (s: EditorState) => JSON.stringify(toProjectFile(s), null, 2)

export function recentProjects(): RecentProject[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]")
  } catch {
    return []
  }
}

function remember(path: string, name: string) {
  const rest = recentProjects().filter((r) => r.path !== path)
  localStorage.setItem(RECENT_KEY, JSON.stringify([{ path, name }, ...rest].slice(0, RECENT_LIMIT)))
}

function forget(path: string) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(recentProjects().filter((r) => r.path !== path)))
}

const dropAutosave = (id: string) => invoke("autosave_remove", { id }).catch(() => { })

async function writeTo(path: string, name: string): Promise<boolean> {
  const state = useEditor.getState()
  try {
    await invoke("project_write", { path, contents: serialized({ ...state, projectName: name }) })
  } catch (err) {
    notify(`Couldn't save the project: ${errorText(err)}`, "error")
    return false
  }
  useEditor.getState().markSaved(path, name)
  remember(path, name)
  void dropAutosave(state.projectId)
  return true
}

export async function saveProjectAs(): Promise<boolean> {
  const { projectName, projectPath } = useEditor.getState()
  const path = await save({
    title: "Save project",
    defaultPath: projectPath ?? `${projectName}.${PROJECT_EXTENSION}`,
    filters: [{ name: "Slate project", extensions: [PROJECT_EXTENSION] }],
  })
  return path ? writeTo(path, stem(path)) : false
}

export function saveProject(): Promise<boolean> {
  const { projectPath, projectName } = useEditor.getState()
  return projectPath ? writeTo(projectPath, projectName) : saveProjectAs()
}

// Asks what to do with unsaved work, then carries on unless the user backs out.
function whenSettled(then: () => void) {
  const state = useEditor.getState()
  if (!isDirty(state)) {
    then()
    return
  }
  const discard = () => {
    void dropAutosave(state.projectId)
    then()
  }
  confirmAction({
    title: "Save your changes?",
    body: `${state.projectName} has changes that aren't saved yet.`,
    action: "Save",
    tone: "primary",
    alternate: { label: "Don't save", onSelect: discard },
    onConfirm: () => void saveProject().then((saved) => saved && then()),
  })
}

export function startNewProject() {
  whenSettled(() => useEditor.getState().loadDocument(newProject()))
}

function toMediaItem(ref: ProjectFile["media"][number], exists: boolean): MediaItem {
  return { ...ref, src: convertFileSrc(ref.path), frames: [], status: exists ? "loading" : "missing" }
}

async function resolveMedia(project: ProjectFile, path: string | null): Promise<MediaItem[]> {
  const exists = await invoke<boolean[]>("paths_exist", { paths: project.media.map((m) => m.path) })
  const moved = project.media.map((m, i) => (!exists[i] && path ? joinPath(dirName(path), m.name) : null))
  const nearby = await invoke<boolean[]>("paths_exist", { paths: moved.map((p) => p ?? "") })
  return project.media.map((m, i) => (nearby[i] ? toMediaItem({ ...m, path: moved[i]! }, true) : toMediaItem(m, exists[i])))
}

async function adopt(project: ProjectFile, path: string | null, dirty: boolean) {
  const media = await resolveMedia(project, path)
  useEditor.getState().loadDocument(
    {
      id: project.id,
      path,
      name: project.name,
      settings: project.settings,
      media,
      tracks: project.tracks,
      clips: project.clips,
      playhead: project.view.playhead,
      pxPerSec: project.view.pxPerSec,
      snapping: project.view.snapping,
    },
    dirty,
  )
  media.filter((m) => m.status === "loading").forEach((m) => void probe(m))
  promptMissing()
}

function promptMissing() {
  const missing = unresolvedMedia()
  if (!missing.length) return
  confirmAction({
    title: `${missing.length} ${missing.length === 1 ? "file is" : "files are"} missing`,
    body: `Slate can't find ${missing.length === 1 ? missing[0].name : `${missing[0].name} and ${missing.length - 1} more`}. Clips stay on the timeline and show as offline until you locate the ${missing.length === 1 ? "file" : "files"}.`,
    action: "Locate",
    tone: "primary",
    cancelLabel: "Later",
    onConfirm: () => void relinkMissing(missing[0]),
  })
}

export async function openProject(known?: string) {
  const path = known ?? (await open({ title: "Open project", filters: [{ name: "Slate project", extensions: [PROJECT_EXTENSION] }] }))
  if (!path) return
  whenSettled(async () => {
    try {
      const project = parseProject(await invoke<string>("project_read", { path }))
      await adopt(project, path, false)
      remember(path, project.name)
    } catch (err) {
      if (known) forget(known)
      notify(`Couldn't open ${baseName(path)}: ${errorText(err)}`, "error")
    }
  })
}

async function offerRecovery() {
  const entries = await invoke<string[]>("autosave_list").catch(() => [])
  const newest = entries[0]
  if (!newest) return
  let autosave: Autosave
  let project: ProjectFile
  try {
    autosave = JSON.parse(newest)
    project = parseProject(JSON.stringify(autosave.project))
  } catch {
    return
  }
  const when = new Date(autosave.savedAt).toLocaleString()
  confirmAction({
    title: "Recover your work?",
    body: `${project.name} didn't close cleanly. Slate kept a copy from ${when}.`,
    action: "Recover",
    tone: "primary",
    cancelLabel: "Discard",
    onCancel: () => void dropAutosave(project.id),
    onConfirm: () => void adopt(project, autosave.path, true),
  })
}

function startAutosave() {
  let written: string | null = null
  setInterval(() => {
    const state = useEditor.getState()
    if (!isDirty(state)) {
      // Undoing back to the saved state leaves nothing worth recovering.
      if (written) void dropAutosave(state.projectId)
      written = null
      return
    }
    const contents = serialized(state)
    if (contents === written) return
    const autosave = `{"savedAt":${Date.now()},"path":${JSON.stringify(state.projectPath)},"project":${contents}}`
    void invoke("autosave_write", { id: state.projectId, contents: autosave })
      .then(() => (written = contents))
      .catch(() => { })
  }, AUTOSAVE_EVERY_MS)
}

function guardClose() {
  const win = getCurrentWindow()
  void win.onCloseRequested((event) => {
    const running = runningRenders(useRenders.getState())
    const state = useEditor.getState()
    if (!running && !isDirty(state)) return
    event.preventDefault()
    const close = () => whenSettled(() => void win.destroy())
    if (!running) return close()
    confirmAction({
      title: "Stop exporting?",
      body: `Closing Slate cancels ${running === 1 ? "the export" : `${running} exports`} still in progress.`,
      action: "Stop and close",
      onConfirm: close,
    })
  })
}

let started = false

export function startSession() {
  if (!isTauri || started) return
  started = true
  guardClose()
  startAutosave()
  void offerRecovery()
}