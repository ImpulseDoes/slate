export type MediaKind = "video" | "audio" | "image"

export interface MediaItem {
  id: string
  name: string
  path: string
  src: string
  kind: MediaKind
  duration: number
  width: number
  height: number
  frames: string[]
  peaks?: number[]
  hasAudio?: boolean
  status: "loading" | "ready" | "error"
  error?: string
}

export type TrackKind = "video" | "audio"

export interface Track {
  id: string
  kind: TrackKind
  name: string
  hidden: boolean
  muted: boolean
  locked: boolean
}

export type ClipType = "video" | "audio" | "text"

export interface ClipProps {
  x: number
  y: number
  scale: number
  rotation: number
  opacity: number
  volume: number
}

export interface TextProps {
  content: string
  size: number
  color: string
}

export interface Clip {
  id: string
  trackId: string
  type: ClipType
  mediaId?: string
  name: string
  start: number
  offset: number
  duration: number
  props: ClipProps
  text?: TextProps
  audioDetached?: boolean
  linkId?: string
}

export const PROJECT = { width: 1920, height: 1080, fps: 30 } as const
export const PEAKS_PER_SECOND = 50