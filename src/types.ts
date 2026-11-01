import type { Fps, Ticks } from "./lib/time"

export type MediaKind = "video" | "audio" | "image"

export interface MediaItem {
  id: string
  name: string
  path: string
  src: string
  kind: MediaKind
  duration: Ticks
  width: number
  height: number
  frames: string[]
  peaks?: number[]
  hasAudio?: boolean
  /** Playable copy for the viewer when the webview can't decode the recording. Export always reads `path`. */
  proxy?: string
  /** Which audio stream of `path` this is, for the extra tracks of a multi-track recording. */
  audioStream?: number
  /** Media ids of those extra tracks, placed on the timeline together with the video. */
  companions?: string[]
  /** How an HDR recording encodes brightness. The viewer plays a tone-mapped copy. */
  hdr?: "pq" | "hlg"
  /** The sound with the noise taken out, for clips that isolate the voice. Rebuilt from the cache, never saved. */
  voice?: string
  voiceSrc?: string
  voiceProgress?: number
  /** Progress of a running conversion, 0 to 1. */
  progress?: number
  status: "loading" | "ready" | "error" | "missing"
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

export type TextAnimation = "fade" | "pop" | "slide" | "typewriter"

export interface TextProps {
  content: string
  size: number
  color: string
  font?: string
  outline?: number
  outlineColor?: string
  shadow?: boolean
  box?: boolean
  animation?: TextAnimation
}

export type Easing = "linear" | "smooth" | "in" | "out"

export type AnimatedProp = keyof ClipProps

/** `at` is source time, so trimming or splitting a clip leaves its animation where it was. `ease` shapes the way to the next key. */
export interface Keyframe {
  at: Ticks
  value: number
  ease: Easing
}

export type Keyframes = Partial<Record<AnimatedProp, Keyframe[]>>

export type TransitionKind = "fade" | "dip" | "dissolve"

export interface Transition {
  kind: TransitionKind
  duration: Ticks
}

/** Share of the source hidden from each side, 0 to 1. */
export interface Crop {
  left: number
  top: number
  right: number
  bottom: number
}

export interface Clip {
  id: string
  trackId: string
  type: ClipType
  mediaId?: string
  name: string
  start: Ticks
  offset: Ticks
  duration: Ticks
  props: ClipProps
  text?: TextProps
  audioDetached?: boolean
  linkId?: string
  /** Playback rate: 2 plays twice as fast, so the clip covers twice as much of its source. */
  speed?: number
  /** Plays the noise-free copy of the sound, in the viewer and the export alike. */
  voice?: boolean
  keys?: Keyframes
  enter?: Transition
  exit?: Transition
  crop?: Crop
}

export type MarkerColor = "blue" | "green" | "yellow" | "orange" | "red" | "purple"

export interface Marker {
  id: string
  at: Ticks
  name: string
  color: MarkerColor
}

export interface FontRef {
  family: string
  path: string
}

export interface ProjectSettings {
  width: number
  height: number
  fps: Fps
}

export const DEFAULT_SETTINGS: ProjectSettings = { width: 1920, height: 1080, fps: { num: 30, den: 1 } }
export const PEAKS_PER_SECOND = 50