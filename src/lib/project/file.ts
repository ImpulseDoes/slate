import type { Clip, MediaKind, ProjectSettings, Track } from "../../types"
import { t, type Key } from "../i18n"
import { TICKS } from "../time"

export const PROJECT_EXTENSION = "slate"
const FORMAT = "slate-project"
const VERSION = 1

// Each entry upgrades a file by one version: the first takes version 1 to 2, and so on.
const MIGRATIONS: ((file: Record<string, unknown>) => Record<string, unknown>)[] = []

export interface MediaRef {
  id: string
  name: string
  path: string
  kind: MediaKind
  duration: number
  width: number
  height: number
  hasAudio?: boolean
}

export interface ProjectFile {
  format: typeof FORMAT
  version: number
  timebase: number
  id: string
  name: string
  settings: ProjectSettings
  media: MediaRef[]
  tracks: Track[]
  clips: Clip[]
  view: { playhead: number; pxPerSec: number; snapping: boolean }
}

interface Source {
  projectId: string
  projectName: string
  settings: ProjectSettings
  media: MediaRef[]
  removedMediaIds: string[]
  tracks: Track[]
  clips: Clip[]
  playhead: number
  pxPerSec: number
  snapping: boolean
}

export function toProjectFile(s: Source): ProjectFile {
  return {
    format: FORMAT,
    version: VERSION,
    timebase: TICKS,
    id: s.projectId,
    name: s.projectName,
    settings: s.settings,
    media: s.media
      .filter((m) => !s.removedMediaIds.includes(m.id))
      .map(({ id, name, path, kind, duration, width, height, hasAudio }) => ({ id, name, path, kind, duration, width, height, hasAudio })),
    tracks: s.tracks,
    clips: s.clips,
    view: { playhead: s.playhead, pxPerSec: s.pxPerSec, snapping: s.snapping },
  }
}

const damaged = (detail: Key) => new Error(t("file.damaged", { detail: t(detail) }))

export function parseProject(text: string): ProjectFile {
  let file: Record<string, unknown>
  try {
    file = JSON.parse(text)
  } catch {
    throw new Error(t("file.notProject"))
  }
  if (file?.format !== FORMAT || typeof file.version !== "number") throw new Error(t("file.notProject"))
  if (file.version > VERSION) throw new Error(t("file.newer"))
  if (file.timebase !== TICKS) throw damaged("file.damaged.timebase")
  for (let v = file.version; v < VERSION; v++) file = { ...MIGRATIONS[v - 1](file), version: v + 1 }

  const project = file as unknown as ProjectFile
  if (!Array.isArray(project.media) || !Array.isArray(project.tracks) || !Array.isArray(project.clips)) throw damaged("file.damaged.lists")
  if (!project.settings?.fps?.num || !project.settings.width || !project.settings.height) throw damaged("file.damaged.settings")
  const media = new Set(project.media.map((m) => m.id))
  const tracks = new Set(project.tracks.map((t) => t.id))
  for (const clip of project.clips) {
    if (!tracks.has(clip.trackId)) throw damaged("file.damaged.track")
    if (clip.mediaId && !media.has(clip.mediaId)) throw damaged("file.damaged.media")
    if (![clip.start, clip.offset, clip.duration].every(Number.isFinite)) throw damaged("file.damaged.position")
  }
  return project
}