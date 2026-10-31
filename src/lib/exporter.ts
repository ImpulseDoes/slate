import { invoke } from "@tauri-apps/api/core"
import { save } from "@tauri-apps/plugin-dialog"
import { notify } from "../components/overlays"
import { clipEnd, liveMedia, useEditor } from "../store/editor"
import { useRenders } from "../store/renders"
import { assumedMatrix, CONTAINER, planRender, type ExportOptions, type TitleImage } from "./render"
import { drawTitle } from "./titles"

const MAX_TITLE_SCALE = 3

export function checkExportable(range: [number, number]): string | null {

  const state = useEditor.getState()
  const media = new Map(state.media.map((m) => [m.id, m]))
  const used = state.clips.filter((c) => c.mediaId && c.start < range[1] && clipEnd(c) > range[0]).map((c) => media.get(c.mediaId!))
  const missing = [...new Set(used.filter((m) => m?.status === "missing" || m?.status === "error").map((m) => m!.name))]

  if (missing.length) return `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} offline. Locate ${missing.length === 1 ? "it" : "them"} before exporting.`
  if (used.some((m) => m?.status === "loading")) return "Still reading your media. Try again in a moment."

  return null
}

export async function queueExport(options: ExportOptions): Promise<boolean> {

  const state = useEditor.getState()
  const extension = CONTAINER[options.codec]
  const output = await save({
    title: "Export video",
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

  for (const clip of state.clips) {

    if (!clip.text || clip.start >= options.range[1] || clipEnd(clip) <= options.range[0]) continue

    const sharpness = Math.min(MAX_TITLE_SCALE, Math.max(1, clip.props.scale / 100))
    const key = JSON.stringify([clip.text, sharpness])

    if (!drawn.has(key)) {

      const image = { file: `title${drawn.size}.png`, width: Math.round(options.width * sharpness), height: Math.round(options.height * sharpness) }
      images.push({ name: image.file, bytes: await drawTitle(clip.text, image.width, image.height, clip.text.size * unit * sharpness) })
      drawn.set(key, image)
    }
    titles[clip.id] = drawn.get(key)!
  }

  try {

    const plan = planRender({ settings: state.settings, tracks: state.tracks, clips: state.clips, media, titles }, options)

    useRenders.getState().enqueue({ name: output.split(/[\\/]/).pop() ?? output, output, plan, images })

    return true

  } catch (err) {
    notify(err instanceof Error ? err.message : String(err), "error")
    return false
  }
}