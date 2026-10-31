import type { Clip, MediaItem, ProjectSettings, Track } from "../types"
import { audible, placeLayer } from "./compose"
import { frameTicks, sec, TICKS, type Fps } from "./time"

export type Codec = "h264" | "h265" | "prores"
export type Quality = { mode: "quality"; crf: number } | { mode: "bitrate"; mbps: number }
export type Speed = "veryfast" | "medium" | "slow"

export interface ExportOptions {
  codec: Codec
  width: number
  height: number
  fps: Fps
  quality: Quality
  speed: Speed
  range: [number, number]
}

export type ColorMatrix = "bt709" | "bt601"

/**
 * Files that don't say how their color is encoded get read the way the preview's
 * webview reads them, by size. FFmpeg alone would treat them all as standard definition.
 */
export const assumedMatrix = (height: number): ColorMatrix => (height >= 720 ? "bt709" : "bt601")

export interface TitleImage {
  file: string
  width: number
  height: number
}

export interface RenderSource {
  settings: ProjectSettings
  tracks: Track[]
  clips: Clip[]
  media: (Pick<MediaItem, "id" | "path" | "kind" | "width" | "height" | "hasAudio"> & { colorMatrix?: ColorMatrix })[]
  /** A picture of each title, keyed by clip id. */
  titles: Record<string, TitleImage>
}

export interface RenderPlan {
  /** FFmpeg command lines, run in order. `{work}` is the scratch folder. */
  steps: string[][]
  /** Share of the render each step accounts for. */
  weights: number[]
  files: { name: string; text: string }[]
  result: string
  frames: number
}

export const CONTAINER: Record<Codec, string> = { h264: "mp4", h265: "mp4", prores: "mov" }
export const ENCODER: Record<Codec, string> = { h264: "libx264", h265: "libx265", prores: "prores_ks" }

/**
 * Each chunk is rendered by one FFmpeg run, which opens all of its files at once.
 * Capping them keeps a project with thousands of cuts within Windows' command line
 * limit and stops hundreds of decoders running side by side.
 */
export const MAX_CHUNK_INPUTS = 24

const SAMPLE_RATE = 48_000
/** Extra source read past the end of a clip, in case its frames sit slightly late. */
const READ_MARGIN = 1
const COMMON = ["-hide_banner", "-nostdin", "-y", "-v", "error", "-progress", "pipe:1", "-nostats"]
const COLOR = ["-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv"]

interface Piece {
  clip: Clip
  media?: RenderSource["media"][number]
  video: boolean
  audio: boolean
  /** Output frames, end exclusive. */
  first: number
  last: number
  /** Source position of the first frame, in ticks. */
  offset: number
}

const seconds = (t: number) => sec(t).toFixed(6)

function buildPieces(source: RenderSource, options: ExportOptions, frameLength: number): Piece[] {
  const [from, to] = options.range
  const media = new Map(source.media.map((m) => [m.id, m]))
  // Bottom track first: later pieces paint over earlier ones.
  const order = [...source.tracks].reverse()
  return order.flatMap((track) =>
    source.clips
      .filter((c) => c.trackId === track.id)
      .sort((a, b) => a.start - b.start)
      .flatMap((clip): Piece[] => {
        const start = Math.max(clip.start, from)
        const end = Math.min(clip.start + clip.duration, to)
        const first = Math.round((start - from) / frameLength)
        const last = Math.round((end - from) / frameLength)
        const m = clip.mediaId ? media.get(clip.mediaId) : undefined
        const video = track.kind === "video" && !track.hidden && (clip.type === "text" || !!m)
        const audio = audible(clip, track) && !!m && (clip.type === "audio" || m.hasAudio === true)
        if (first >= last || (!video && !audio)) return []
        return [{ clip, media: m, video, audio, first, last, offset: clip.offset + (start - clip.start) }]
      }),
  )
}

/** Split [0, frames) so no stretch needs more inputs than a chunk can hold. Clips may span chunks. */
function chunkRanges(pieces: Piece[], frames: number): [number, number][] {
  const cuts = [...new Set(pieces.flatMap((p) => [p.first, p.last]))].filter((f) => f > 0 && f < frames).sort((a, b) => a - b)
  const within = (a: number, b: number) => pieces.filter((p) => p.first < b && p.last > a).length
  const ranges: [number, number][] = []
  let start = 0
  while (start < frames) {
    if (within(start, frames) <= MAX_CHUNK_INPUTS) {
      ranges.push([start, frames])
      break
    }
    const later = cuts.filter((c) => c > start)
    const end = later.filter((c) => within(start, c) <= MAX_CHUNK_INPUTS).pop() ?? later[0] ?? frames
    ranges.push([start, end])
    start = end
  }
  return ranges
}

function encoderArgs({ codec, quality, speed }: ExportOptions): string[] {
  if (codec === "prores") return ["-c:v", "prores_ks", "-profile:v", "3", "-vendor", "apl0", "-pix_fmt", "yuv422p10le"]
  const rate =
    quality.mode === "quality"
      ? ["-crf", String(quality.crf)]
      : ["-b:v", `${quality.mbps}M`, "-maxrate", `${quality.mbps * 1.5}M`, "-bufsize", `${quality.mbps * 3}M`]
  const common = ["-preset", speed, "-pix_fmt", "yuv420p", ...rate]
  return codec === "h264" ? ["-c:v", "libx264", ...common] : ["-c:v", "libx265", ...common, "-x265-params", "log-level=error", "-tag:v", "hvc1"]
}

function chunkFilter(source: RenderSource, options: ExportOptions, pieces: Piece[], from: number, to: number, audioStreams: boolean, frameLength: number) {
  const { width, height, fps } = options
  const rate = `${fps.num}/${fps.den}`
  const frames = to - from
  const sampleAt = (frame: number) => Math.round((frame * frameLength * SAMPLE_RATE) / TICKS)
  const unit = width / source.settings.width
  const graph = [`color=c=black:s=${width}x${height}:r=${rate}:d=${seconds((frames + 2) * frameLength)},format=yuv444p,trim=end_frame=${frames},setsar=1[base0]`]
  const inputs: string[] = []
  const sounds: string[] = []
  let layers = 0

  pieces.forEach((piece, input) => {
    const first = Math.max(piece.first, from)
    const last = Math.min(piece.last, to)
    const duration = (last - first) * frameLength
    const offset = piece.offset + (first - piece.first) * frameLength
    const image = piece.media?.kind === "image" || piece.clip.type === "text"
    const title = piece.clip.type === "text" ? source.titles[piece.clip.id] : undefined
    const path = title ? `{work}/${title.file}` : piece.media!.path
    const reading = seconds(duration + READ_MARGIN * TICKS)

    if (!image) inputs.push("-ss", seconds(offset), "-t", reading, "-i", path)
    else if (path.toLowerCase().endsWith(".gif")) inputs.push("-ignore_loop", "0", "-t", reading, "-i", path)
    else inputs.push("-loop", "1", "-framerate", rate, "-t", reading, "-i", path)

    if (piece.video) {
      const sourceWidth = title?.width ?? piece.media!.width
      const sourceHeight = title?.height ?? piece.media!.height
      const place = placeLayer(sourceWidth, sourceHeight, width, height, piece.clip.props, unit)
      const opacity = piece.clip.props.opacity / 100
      if (place && opacity > 0) {
        const chain = [`[${input}:v]fps=${rate}:round=near`]
        if (place.crop) chain.push(`crop=${place.crop.width}:${place.crop.height}:${place.crop.x}:${place.crop.y}:exact=1`)
        const matrix = piece.media?.colorMatrix ? `in_color_matrix=${piece.media.colorMatrix}:` : ""
        chain.push(`scale=${place.width}:${place.height}:flags=bicubic+accurate_rnd:${matrix}out_color_matrix=bt709:out_range=tv`, "setsar=1", "format=yuva444p")
        if (place.radians) chain.push(`rotate=a=${place.radians}:ow=rotw(${place.radians}):oh=roth(${place.radians}):c=none`)
        if (opacity < 1) chain.push(`lut=a=val*${opacity}`)
        chain.push("tpad=stop=-1:stop_mode=clone", `trim=end_frame=${last - first}`, `setpts=PTS-STARTPTS+(${first - from})*${fps.den}/${fps.num}/TB[layer${layers}]`)
        graph.push(chain.join(","))
        graph.push(`[base${layers}][layer${layers}]overlay=x=${place.centerX}-w/2:y=${place.centerY}-h/2:format=yuv444:eof_action=pass[base${layers + 1}]`)
        layers++
      }
    }

    if (piece.audio) {
      const samples = sampleAt(last) - sampleAt(first)
      const delay = sampleAt(first) - sampleAt(from)
      const chain = [`[${input}:a]aresample=${SAMPLE_RATE}:async=1:first_pts=0`, "aformat=sample_fmts=fltp:channel_layouts=stereo", `atrim=end_sample=${samples}`, "asetpts=PTS-STARTPTS"]
      if (piece.clip.props.volume !== 100) chain.push(`volume=${piece.clip.props.volume / 100}`)
      if (delay) chain.push(`adelay=delays=${delay}S:all=1`)
      graph.push(`${chain.join(",")}[sound${sounds.length}]`)
      sounds.push(`[sound${sounds.length}]`)
    }
  })

  const pixelFormat = options.codec === "prores" ? "yuv422p10le" : "yuv420p"
  graph.push(`[base${layers}]format=${pixelFormat},setparams=range=tv:color_primaries=bt709:color_trc=bt709:colorspace=bt709[video]`)
  if (audioStreams) {
    const samples = sampleAt(to) - sampleAt(from)
    const mix = sounds.length ? `${sounds.join("")}amix=inputs=${sounds.length}:normalize=0:dropout_transition=0:duration=longest,` : `anullsrc=r=${SAMPLE_RATE}:cl=stereo,`
    graph.push(`${mix}apad,atrim=end_sample=${samples},asetpts=PTS-STARTPTS[audio]`)
  }
  return { graph: graph.join(";\n"), inputs }
}

/**
 * Turn a project into FFmpeg steps. Every chunk becomes a file with exact frame and
 * sample counts, then a last step joins them without re-encoding the picture.
 */
export function planRender(source: RenderSource, options: ExportOptions): RenderPlan {
  const frameLength = frameTicks(options.fps)
  const frames = Math.round((options.range[1] - options.range[0]) / frameLength)
  if (frames < 1) throw new Error("There's nothing to export in that range.")

  const pieces = buildPieces(source, options, frameLength)
  const anyAudio = pieces.some((p) => p.audio)
  const ranges = chunkRanges(pieces, frames)
  const files: RenderPlan["files"] = []
  const steps: string[][] = []
  const weights: number[] = []

  ranges.forEach(([from, to], i) => {
    const used = pieces.filter((p) => p.first < to && p.last > from)
    const { graph, inputs } = chunkFilter(source, options, used, from, to, anyAudio, frameLength)
    files.push({ name: `chunk${i}.filter`, text: graph })
    steps.push([
      ...COMMON,
      ...inputs,
      "-/filter_complex",
      `{work}/chunk${i}.filter`,
      "-map",
      "[video]",
      ...(anyAudio ? ["-map", "[audio]", "-c:a", "pcm_s24le", "-ar", String(SAMPLE_RATE)] : []),
      "-frames:v",
      String(to - from),
      ...encoderArgs(options),
      ...COLOR,
      `{work}/chunk${i}.mov`,
    ])
    weights.push(to - from)
  })

  files.push({ name: "chunks.txt", text: ranges.map((_, i) => `file 'chunk${i}.mov'\n`).join("") })
  const container = CONTAINER[options.codec]
  const result = `final.${container}`
  const audioOut = !anyAudio ? [] : container === "mp4" ? ["-map", "0:a", "-c:a", "aac", "-b:a", "320k"] : ["-map", "0:a", "-c:a", "copy"]
  steps.push([
    ...COMMON,
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    "{work}/chunks.txt",
    "-map",
    "0:v",
    "-c:v",
    "copy",
    ...audioOut,
    ...(options.codec === "h265" ? ["-tag:v", "hvc1"] : []),
    ...(container === "mp4" ? ["-movflags", "+faststart"] : []),
    `{work}/${result}`,
  ])
  weights.push(Math.max(1, frames * 0.03))

  const total = weights.reduce((a, b) => a + b, 0)
  return { steps, weights: weights.map((w) => w / total), files, result, frames }
}