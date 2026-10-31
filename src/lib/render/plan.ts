import type { Clip, MediaItem, ProjectSettings, Track } from "../../types"
import { dipAt, dissolveTails, hasMovement, propsAt, soundAt, visibleAt } from "../animation"
import { clipEnd, sourceAt, speedOf } from "../clips"
import { t } from "../i18n"
import { frameTicks, sec, TICKS, type Fps } from "../time"
import { audible, placeLayer } from "./compose"

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
  media: (Pick<MediaItem, "id" | "path" | "kind" | "width" | "height" | "hasAudio" | "audioStream"> & { colorMatrix?: ColorMatrix })[]
  titles: Record<string, TitleImage>
}

export interface RenderPlan {
  /** `{work}` stands for the scratch folder. */
  steps: string[][]
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
/** Transparent border around a moving layer: past its edge FFmpeg repeats the outermost pixel, which is then invisible. */
const MOVING_MARGIN = 4
/** A moving layer is worked on at up to this many times the output size, so zooming in keeps the source's detail. */
const MAX_DENSITY = 3
const GAIN_STEPS_PER_SECOND = 50
const MAX_EXPRESSION = 3500

interface Piece {
  clip: Clip
  media?: RenderSource["media"][number]
  video: boolean
  audio: boolean
  /** Output frames, end exclusive. */
  first: number
  last: number
  offset: number
  /** How long the clip keeps playing past its end, under the next clip's dissolve. */
  tail: number
}

const seconds = (t: number) => sec(t).toFixed(6)

function buildPieces(source: RenderSource, options: ExportOptions, frameLength: number): Piece[] {
  const [from, to] = options.range
  const media = new Map(source.media.map((m) => [m.id, m]))
  const tails = dissolveTails(source.clips)
  // Bottom track first: later pieces paint over earlier ones.
  const order = [...source.tracks].reverse()
  return order.flatMap((track) =>
    source.clips
      .filter((c) => c.trackId === track.id)
      .sort((a, b) => a.start - b.start)
      .flatMap((clip): Piece[] => {
        const tail = tails.get(clip.id) ?? 0
        const start = Math.max(clip.start, from)
        const end = Math.min(clipEnd(clip) + tail, to)
        const first = Math.round((start - from) / frameLength)
        const last = Math.round((end - from) / frameLength)
        const m = clip.mediaId ? media.get(clip.mediaId) : undefined
        const video = track.kind === "video" && !track.hidden && (clip.type === "text" || !!m)
        const audio = audible(clip, track) && !!m && (clip.type === "audio" || m.hasAudio === true)
        if (first >= last || (!video && !audio)) return []
        return [{ clip, media: m, video, audio, first, last, offset: sourceAt(clip, start), tail }]
      }),
  )
}

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

const number = (v: number) => v.toFixed(3)

/** Where straight lines can replace a list of values without leaving them by more than `tolerance`. */
function fitLines(values: number[], tolerance: number) {

  const knots = [0]
  let from = 0

  while (from < values.length - 1) {

    let to = from + 1

    for (let next = to + 1; next < values.length; next++) {

      const slope = (values[next] - values[from]) / (next - from)
      let fits = true

      for (let i = from + 1; i < next && fits; i++) fits = Math.abs(values[from] + slope * (i - from) - values[i]) <= tolerance

      if (!fits) break

      to = next
    }

    knots.push(to)
    from = to
  }

  return knots
}

/** An FFmpeg expression giving `values[n - shift]`. */
export function curve(values: number[], n: string, tolerance: number, shift = 0) {

  if (values.every((v) => Math.abs(v - values[0]) <= tolerance / 2)) return number(values[0])

  const knots = fitLines(values, tolerance)
  const last = knots[knots.length - 1]
  const lines = knots.slice(0, -1).map((a, i) => {
    const b = knots[i + 1]
    return `gte(${n},${a + shift})*lt(${n},${b + shift})*(${number(values[a])}+(${n}-${a + shift})*(${((values[b] - values[a]) / (b - a)).toFixed(7)}))`
  })

  return [...lines, `gte(${n},${last + shift})*(${number(values[last])})`].join("+")
}

/**
 * The same curves cut into stretches short enough for FFmpeg, which refuses an
 * expression past about 4 KB. Each stretch becomes its own filter, enabled in turn.
 */
export function curveStretches(lists: number[][], n: string, tolerance: number, shift = 0) {

  const cut = (from: number, to: number): { from: number; to: number; expressions: string[] }[] => {

    const expressions = lists.map((values) => curve(values.slice(from, to), n, tolerance, shift + from))

    if (to - from < 2 || expressions.every((e) => e.length <= MAX_EXPRESSION)) return [{ from, to, expressions }]

    const middle = (from + to) >> 1

    return [...cut(from, middle), ...cut(middle, to)]
  }

  return cut(0, lists[0].length)
}

function tempoFilters(speed: number) {

  const filters: string[] = []
  let rest = speed

  while (rest < 0.5) {
    filters.push("atempo=0.5")
    rest /= 0.5
  }

  return rest === 1 ? filters : [...filters, `atempo=${rest}`]
}

function chunkFilter(source: RenderSource, options: ExportOptions, pieces: Piece[], from: number, to: number, audioStreams: boolean, frameLength: number) {
  const { width, height, fps } = options
  const rate = `${fps.num}/${fps.den}`
  const frames = to - from
  const sampleAt = (frame: number) => Math.round((frame * frameLength * SAMPLE_RATE) / TICKS)
  const timeOf = (frame: number) => options.range[0] + frame * frameLength
  const unit = width / source.settings.width
  const graph = [`color=c=black:s=${width}x${height}:r=${rate}:d=${seconds((frames + 2) * frameLength)},format=yuv444p,trim=end_frame=${frames},setsar=1[base0]`]
  const inputs: string[] = []
  const sounds: string[] = []
  let layers = 0
  let solids = 0

  /** A black picture whose alpha follows `levels` frame by frame. Worked out at 2×2, so it costs almost nothing at any size. */
  const solid = (w: number, h: number, levels: number[]) => {
    const stretches = curveStretches([levels.map((v) => v * 255)], "N", 0.4)
    const alpha = stretches.map((s) => `geq=lum=16:cb=128:cr=128:a='${s.expressions[0]}'${stretches.length > 1 ? `:enable='between(n,${s.from},${s.to - 1})'` : ""}`)
    return [`color=c=black:s=2x2:r=${rate}:d=${seconds((levels.length + 2) * frameLength)}`, "format=yuva444p", ...alpha, `scale=${w}:${h}:flags=neighbor`, `trim=end_frame=${levels.length}`].join(",")
  }

  pieces.forEach((piece, input) => {
    const { clip, tail } = piece
    const first = Math.max(piece.first, from)
    const last = Math.min(piece.last, to)
    const count = last - first
    const speed = speedOf(clip)
    const duration = count * frameLength
    const offset = piece.offset + (first - piece.first) * frameLength * speed
    const image = piece.media?.kind === "image" || clip.type === "text"
    const title = clip.type === "text" ? source.titles[clip.id] : undefined
    const path = title ? `{work}/${title.file}` : piece.media!.path
    const reading = seconds(duration * speed + READ_MARGIN * TICKS)
    const everyFrame = <T,>(at: (time: number) => T) => Array.from({ length: count }, (_, i) => at(timeOf(first + i)))

    if (!image) inputs.push("-ss", seconds(offset), "-t", reading, "-i", path)
    else if (path.toLowerCase().endsWith(".gif")) inputs.push("-ignore_loop", "0", "-t", reading, "-i", path)
    else inputs.push("-loop", "1", "-framerate", rate, "-t", reading, "-i", path)

    if (piece.video) {
      const sourceWidth = title?.width ?? piece.media!.width
      const sourceHeight = title?.height ?? piece.media!.height
      const matrix = piece.media?.colorMatrix ? `in_color_matrix=${piece.media.colorMatrix}:` : ""
      const scaleTo = (w: number, h: number) => `scale=${w}:${h}:flags=bicubic+accurate_rnd:${matrix}out_color_matrix=bt709:out_range=tv`
      const opacity = everyFrame((t) => (propsAt(clip, t).opacity / 100) * visibleAt(clip, t, tail))
      const fading = opacity.some((v) => Math.abs(v - opacity[0]) > 0.001)
      const open = `[${input}:v]${speed === 1 ? "" : `setpts=(PTS-STARTPTS)/${speed},`}fps=${rate}:round=near`
      const hold = ["tpad=stop=-1:stop_mode=clone", `trim=end_frame=${count}`]
      const place = `setpts=PTS-STARTPTS+(${first - from})*${fps.den}/${fps.num}/TB`
      const name = `layer${layers}`

      /** Multiplies the layer's alpha by the opacity curve, then runs what's left of its chain. */
      const finish = (chain: string[], w: number, h: number, after: string[]) => {
        if (!fading) {
          const fixed = opacity[0] < 1 ? [`lut=a=val*${opacity[0]}`] : []
          graph.push(`${[...chain, ...after, ...fixed, place].join(",")}[${name}]`)
          return
        }
        const mask = `mask${solids++}`
        graph.push(`${chain.join(",")}[${name}raw]`)
        graph.push(`${solid(w, h, opacity)}[${mask}]`)
        graph.push(`[${name}raw][${mask}]${["blend=c3_mode=multiply:shortest=1", ...after, place].join(",")}[${name}]`)
      }

      if (opacity.some((v) => v > 0)) {

        if (hasMovement(clip)) {

          const props = everyFrame((t) => propsAt(clip, t))
          const baseFit = Math.min(width / sourceWidth, height / sourceHeight)
          const biggest = Math.max(...props.map((p) => p.scale)) / 100
          const density = Math.min(MAX_DENSITY, Math.max(1, Math.ceil(Math.min(biggest, 1 / baseFit) - 0.01)))
          const canvasW = width * density
          const canvasH = height * density
          const fit = Math.min(canvasW / sourceWidth, canvasH / sourceHeight)
          const fitW = Math.max(1, Math.round(sourceWidth * fit))
          const fitH = Math.max(1, Math.round(sourceHeight * fit))
          const paddedW = canvasW + MOVING_MARGIN * 2
          const paddedH = canvasH + MOVING_MARGIN * 2
          const padX = Math.floor((paddedW - fitW) / 2)
          const padY = Math.floor((paddedH - fitH) / 2)
          const chain = [open, scaleTo(fitW, fitH), "setsar=1", "format=yuva444p"]

          if (clip.crop) {
            const cropX = Math.round(clip.crop.left * fitW)
            const cropY = Math.round(clip.crop.top * fitH)
            const keptW = Math.max(1, fitW - cropX - Math.round(clip.crop.right * fitW))
            const keptH = Math.max(1, fitH - cropY - Math.round(clip.crop.bottom * fitH))
            chain.push(`crop=${keptW}:${keptH}:${cropX}:${cropY}:exact=1`, `pad=${fitW}:${fitH}:${cropX}:${cropY}:color=black@0`)
          }

          chain.push(...hold, `pad=${paddedW}:${paddedH}:${padX}:${padY}:color=black@0`)

          const turns = props.map((p) => {
            const radians = (p.rotation * Math.PI) / 180
            return { p, size: p.scale / 100, cos: Math.cos(radians), sin: Math.sin(radians) }
          })
          const corners = [[0, 0], [paddedW, 0], [0, paddedH], [paddedW, paddedH]]
          const axes = corners.flatMap(([x, y]) => {
            const dx = x - (padX + fitW / 2)
            const dy = y - (padY + fitH / 2)
            return [
              turns.map(({ p, size, cos, sin }) => canvasW / 2 + MOVING_MARGIN + p.x * unit * density + size * (cos * dx - sin * dy)),
              turns.map(({ p, size, cos, sin }) => canvasH / 2 + MOVING_MARGIN + p.y * unit * density + size * (sin * dx + cos * dy)),
            ]
          })
          // This filter counts frames from 1.
          const stretches = curveStretches(axes, "in", 0.02, 1)

          for (const { from: start, to: end, expressions } of stretches) {
            const named = expressions.map((e, i) => `${i % 2 ? "y" : "x"}${i >> 1}='${e}'`).join(":")
            chain.push(`perspective=${named}:sense=destination:eval=frame:interpolation=cubic${stretches.length > 1 ? `:enable='between(n,${start},${end - 1})'` : ""}`)
          }

          chain.push(`crop=${canvasW}:${canvasH}:${MOVING_MARGIN}:${MOVING_MARGIN}`)
          if (density > 1) chain.push(`scale=${width}:${height}:flags=bicubic`)

          finish(chain, width, height, [])
          graph.push(`[base${layers}][${name}]overlay=x=0:y=0:format=yuv444:eof_action=pass[base${layers + 1}]`)
          layers++

        } else {

          const at = placeLayer(sourceWidth, sourceHeight, width, height, propsAt(clip, timeOf(first)), unit, clip.crop)

          if (at) {
            const chain = [open]
            if (at.crop) chain.push(`crop=${at.crop.width}:${at.crop.height}:${at.crop.x}:${at.crop.y}:exact=1`)
            chain.push(scaleTo(at.width, at.height), "setsar=1", "format=yuva444p", ...hold)
            finish(chain, at.width, at.height, at.radians ? [`rotate=a=${at.radians}:ow=rotw(${at.radians}):oh=roth(${at.radians}):c=none`] : [])
            graph.push(`[base${layers}][${name}]overlay=x=${at.centerX}-w/2:y=${at.centerY}-h/2:format=yuv444:eof_action=pass[base${layers + 1}]`)
            layers++
          }
        }
      }

      const dip = everyFrame((t) => dipAt(clip, t, tail))

      if (dip.some((v) => v > 0)) {
        graph.push(`${solid(width, height, dip)},${place}[dip${layers}]`)
        graph.push(`[base${layers}][dip${layers}]overlay=x=0:y=0:format=yuv444:eof_action=pass[base${layers + 1}]`)
        layers++
      }
    }

    if (piece.audio) {
      const samples = sampleAt(last) - sampleAt(first)
      const delay = sampleAt(first) - sampleAt(from)
      const stream = piece.media?.audioStream
      const chain = [`[${input}:a${stream === undefined ? "" : `:${stream}`}]aresample=${SAMPLE_RATE}:async=1:first_pts=0`, "aformat=sample_fmts=fltp:channel_layouts=stereo", ...tempoFilters(speed), `atrim=end_sample=${samples}`, "asetpts=PTS-STARTPTS"]
      const start = timeOf(first)
      const steps = Math.max(1, Math.ceil(sec(duration) * GAIN_STEPS_PER_SECOND))
      const gains = Array.from({ length: steps + 1 }, (_, i) => {
        const time = start + (i / steps) * duration
        return (propsAt(clip, time).volume / 100) * soundAt(clip, time, tail)
      })
      if (gains.some((g) => Math.abs(g - gains[0]) >= 0.0005)) {
        const step = `(t*${(steps / sec(duration)).toFixed(6)})`
        const stretches = curveStretches([gains], step, 0.002)
        for (const { from: begin, to: end, expressions } of stretches) {
          const when = `gte(${step},${begin})${end > steps ? "" : `*lt(${step},${end})`}`
          chain.push(`volume=volume='${expressions[0]}':eval=frame${stretches.length > 1 ? `:enable='${when}'` : ""}`)
        }
      } else if (gains[0] !== 1) chain.push(`volume=${gains[0]}`)
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
  if (frames < 1) throw new Error(t("export.nothing"))

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