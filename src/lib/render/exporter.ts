import { invoke } from "@tauri-apps/api/core"
import { save } from "@tauri-apps/plugin-dialog"
import { useEditor } from "../../store/editor"
import { notify } from "../../store/overlays"
import { useRenders } from "../../store/renders"
import { liveMedia } from "../../store/selectors"
import { typewriterSteps } from "../animation"
import { clipEnd } from "../clips"
import { errorText } from "../errors"
import { t } from "../i18n"
import { baseName } from "../paths"
import type { Clip } from "../../types"
import { assumedMatrix, CONTAINER, planRender, type ExportOptions, type TitleImage } from "./plan"
import { drawTitle } from "./titles"

const MAX_TITLE_SCALE = 3

/** The largest size a title ever reaches, including its animation's overshoot. */
const largestScale = (clip: Clip) => Math.max(clip.props.scale, ...(clip.keys?.scale ?? []).map((k) => k.value)) * (clip.text?.animation === "pop" ? 1.1 : 1)

export function checkExportable(range: [number, number]): string | null {

  const state = useEditor.getState()
  const media = new Map(state.media.map((m) => [m.id, m]))
  const used = state.clips.filter((c) => c.mediaId && c.start < range[1] && clipEnd(c) > range[0]).map((c) => media.get(c.mediaId!))
  const missing = [...new Set(used.filter((m) => m?.status === "missing" || m?.status === "error").map((m) => m!.name))]

  if (missing.length) return t("export.offline", { names: missing.join(", "), count: missing.length })
  if (used.some((m) => m?.status === "loading")) return t("export.stillReading")

  return null
}

export async function queueExport(options: ExportOptions): Promise<boolean> {

  const state = useEditor.getState()
  const extension = CONTAINER[options.codec]
  const output = await save({
    title: t("export.saveTitle"),
    defaultPath: `${state.projectName}.${extension}`,
    filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
  })

  if (!output) return false

  const used = new Set(state.clips.map((c) => c.mediaId))
  const media = await Promise.all(
    liveMedia(state)
      .filter((m) => used.has(m.id))
      .map(async (m) => {
        if (m.kind === "image") return { ...m, hasAudio: false }
        const streams = await invoke<{ hasAudio: boolean; colorTagged: boolean }>("render_probe", { path: m.path })
        return { ...m, hasAudio: streams.hasAudio, colorMatrix: m.kind === "video" && !streams.colorTagged ? assumedMatrix(m.height) : undefined }
      }),
  )

  const titles: Record<string, TitleImage> = {}
  const images: { name: string; bytes: number[] }[] = []
  const drawn = new Map<string, TitleImage>()
  const unit = options.width / state.settings.width
  const clips = state.clips.flatMap((c) => (c.text?.animation === "typewriter" ? typewriterSteps(c).map((step) => step.clip) : [c]))
  const reveals = new Map(state.clips.flatMap((c) => (c.text?.animation === "typewriter" ? typewriterSteps(c).map((step): [string, number] => [step.clip.id, step.reveal]) : [])))

  for (const clip of clips) {

    if (!clip.text || clip.start >= options.range[1] || clipEnd(clip) <= options.range[0]) continue

    const sharpness = Math.min(MAX_TITLE_SCALE, Math.max(1, largestScale(clip) / 100))
    const reveal = reveals.get(clip.id)
    const key = JSON.stringify([clip.text, sharpness, reveal])

    if (!drawn.has(key)) {

      const image = { file: `title${drawn.size}.png`, width: Math.round(options.width * sharpness), height: Math.round(options.height * sharpness) }
      images.push({ name: image.file, bytes: await drawTitle(clip.text, image.width, image.height, unit * sharpness, reveal) })
      drawn.set(key, image)
    }
    titles[clip.id] = drawn.get(key)!
  }

  try {

    const plan = planRender({ settings: state.settings, tracks: state.tracks, clips, media, titles }, options)

    useRenders.getState().enqueue({ name: baseName(output), output, plan, images })

    return true

  } catch (err) {
    notify(errorText(err), "error")
    return false
  }
}