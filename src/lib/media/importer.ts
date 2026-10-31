import { convertFileSrc, invoke } from "@tauri-apps/api/core"
import { open } from "@tauri-apps/plugin-dialog"
import { liveMedia } from "../../store/selectors"
import { useEditor } from "../../store/editor"
import type { MediaItem, MediaKind } from "../../types"
import { t } from "../i18n"
import { baseName, dirName, joinPath } from "../paths"
import { isTauri, uid } from "../platform"
import { probe } from "./probe"

const EXTENSIONS: Record<MediaKind, string[]> = {
  video: ["mp4", "mov", "m4v", "webm", "mkv", "avi"],
  audio: ["mp3", "wav", "m4a", "aac", "ogg", "flac", "opus"],
  image: ["png", "jpg", "jpeg", "webp", "gif", "bmp"],
}
const ALL_EXTENSIONS = Object.values(EXTENSIONS).flat()

function kindOf(name: string): MediaKind | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? ""
  for (const [kind, list] of Object.entries(EXTENSIONS)) if (list.includes(ext)) return kind as MediaKind
  return null
}

export async function pickAndImport() {

  if (isTauri) {

    const picked = await open({
      multiple: true,
      title: t("media.importMedia"),
      filters: [{ name: t("media.title"), extensions: ALL_EXTENSIONS }],
    })
    if (picked) importPaths(Array.isArray(picked) ? picked : [picked])
    return
  }

  const input = document.createElement("input")

  input.type = "file"
  input.multiple = true
  input.accept = ALL_EXTENSIONS.map((e) => `.${e}`).join(",")
  input.onchange = () => input.files && importFiles([...input.files])
  input.click()
}

export function importPaths(paths: string[]) {
  importSources(paths.map((p) => ({ name: baseName(p), path: p, src: convertFileSrc(p) })))
}

export function importFiles(files: File[]) {
  importSources(files.map((f) => ({ name: f.name, path: f.name, src: URL.createObjectURL(f), size: f.size })))
}

function importSources(sources: { name: string; path: string; src: string; size?: number }[]) {

  const state = useEditor.getState()
  const known = new Set(liveMedia(state).map((m) => m.path))
  const items: MediaItem[] = []

  for (const s of sources) {

    const kind = kindOf(s.name)

    if (!kind || known.has(s.path)) continue

    items.push({ id: uid(), ...s, kind, duration: 0, width: 0, height: 0, frames: [], status: "loading" })
  }

  if (!items.length) return

  state.addMedia(items)

  for (const item of items) void probe(item)
}

export const unresolvedMedia = () => liveMedia(useEditor.getState()).filter((m) => m.status === "missing")

export async function relinkMissing(item: MediaItem) {
  const picked = await open({
    title: t("media.locateTitle", { name: item.name }),
    filters: [{ name: t(`type.${item.kind}`), extensions: EXTENSIONS[item.kind] }],
  })
  if (!picked) return
  relink(item, picked)
  const folder = dirName(picked)
  const others = unresolvedMedia()
  const paths = others.map((m) => joinPath(folder, m.name))
  const found = await invoke<boolean[]>("paths_exist", { paths })
  others.forEach((m, i) => found[i] && relink(m, paths[i]))
}

function relink(item: MediaItem, path: string) {
  const patch = { name: baseName(path), path, src: convertFileSrc(path), status: "loading" as const, error: undefined }
  useEditor.getState().relinkMedia(item.id, patch)
  void probe({ ...item, ...patch })
}