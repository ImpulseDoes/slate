import type { Clip, MediaKind, ProjectSettings, Track } from "../../types"
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

const damaged = (detail: string) => new Error(`This project file is damaged: ${detail}`)

export function parseProject(text: string): ProjectFile {
  let file: Record<string, unknown>
  try {
    file = JSON.parse(text)
  } catch {
    throw new Error("This isn't a Slate project file.")
  }
  if (file?.format !== FORMAT || typeof file.version !== "number") throw new Error("This isn't a Slate project file.")
  if (file.version > VERSION) throw new Error("This project was saved by a newer version of Slate.")
  if (file.timebase !== TICKS) throw damaged("unknown timebase.")
  for (let v = file.version; v < VERSION; v++) file = { ...MIGRATIONS[v - 1](file), version: v + 1 }

  const project = file as unknown as ProjectFile
  if (!Array.isArray(project.media) || !Array.isArray(project.tracks) || !Array.isArray(project.clips)) throw damaged("its lists are missing.")
  if (!project.settings?.fps?.num || !project.settings.width || !project.settings.height) throw damaged("its settings are missing.")
  const media = new Set(project.media.map((m) => m.id))
  const tracks = new Set(project.tracks.map((t) => t.id))
  for (const clip of project.clips) {
    if (!tracks.has(clip.trackId)) throw damaged(`a clip sits on a track that doesn't exist.`)
    if (clip.mediaId && !media.has(clip.mediaId)) throw damaged(`a clip uses media that doesn't exist.`)
    if (![clip.start, clip.offset, clip.duration].every(Number.isFinite)) throw damaged("a clip has no position.")
  }
  return project
}