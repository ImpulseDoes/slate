import { invoke } from "@tauri-apps/api/core"
import { open } from "@tauri-apps/plugin-dialog"
import { useEditor, type EditorState } from "../../store/editor"
import { notify } from "../../store/overlays"
import type { Clip, ProjectSettings, TextProps } from "../../types"
import { DEFAULT_PROPS, makeTrack, nextTrackName } from "../clips"
import { errorText } from "../errors"
import { t } from "../i18n"
import { isTauri, uid } from "../platform"
import { frameTicks, ticks, toFrame } from "../time"
import { captionStyle, decodeText, parseSrt, type Cue } from "./srt"

/** Clips for a list of cues. They never overlap, so each one always shows whole. */
export function captionClips(cues: Cue[], trackId: string, settings: ProjectSettings): Clip[] {

  const { fps, height } = settings
  const frame = frameTicks(fps)
  const text = captionStyle(settings)
  const clips: Clip[] = []

  cues.forEach((cue, i) => {

    const start = toFrame(ticks(cue.start), fps)
    const next = cues[i + 1] ? toFrame(ticks(cues[i + 1].start), fps) : Infinity
    const end = Math.min(next, toFrame(ticks(cue.end), fps))

    if (end - start < frame) return

    clips.push({
      id: uid(),
      trackId,
      type: "text",
      name: cue.text.split("\n")[0],
      start,
      offset: 0,
      duration: end - start,
      props: { ...DEFAULT_PROPS, y: Math.round(height * 0.34) },
      text: { ...text, content: cue.text },
    })
  })

  return clips
}

export function placeCaptions(cues: Cue[]) {

  useEditor.getState().transact((s) => {
    const track = makeTrack(uid(), "video", nextTrackName(s.tracks, "video"))
    const made = captionClips(cues, track.id, s.settings)
    return { tracks: [track, ...s.tracks], clips: [...s.clips, ...made], selectedClipIds: made.map((c) => c.id) }
  })
}

export async function importCaptions() {

  if (!isTauri) {
    notify(t("export.needsDesktop"), "error")
    return
  }

  const path = await open({ title: t("captions.pick"), filters: [{ name: t("captions.files"), extensions: ["srt"] }] })

  if (!path) return

  try {

    const bytes = await invoke<number[]>("file_bytes", { path })
    const cues = parseSrt(decodeText(new Uint8Array(bytes)))

    if (!cues.length) {
      notify(t("captions.empty"), "error")
      return
    }

    placeCaptions(cues)

  } catch (err) {
    notify(t("captions.failed", { detail: errorText(err) }), "error")
  }
}

const STYLE_KEYS: (keyof TextProps)[] = ["size", "color", "font", "outline", "outlineColor", "shadow", "box", "animation"]

/** Gives every title on a clip's track that clip's look, keeping each one's own words. */
export function styleLikeThis(id: string) {

  const state: EditorState = useEditor.getState()
  const source = state.clips.find((c) => c.id === id)

  if (!source?.text) return

  const look = Object.fromEntries(STYLE_KEYS.map((key) => [key, source.text![key]]))

  state.transact((s) => ({
    clips: s.clips.map((c) => (c.trackId === source.trackId && c.text ? { ...c, text: { ...c.text, ...look }, props: { ...c.props, x: source.props.x, y: source.props.y, scale: source.props.scale } } : c)),
  }))
}