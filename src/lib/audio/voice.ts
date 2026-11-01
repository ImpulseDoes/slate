import { convertFileSrc, invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { useEditor, type EditorState } from "../../store/editor"
import { notify } from "../../store/overlays"
import type { Clip, MediaItem } from "../../types"
import { errorText } from "../errors"
import { t } from "../i18n"
import { isTauri } from "../platform"
import { sec } from "../time"
import { hasSound } from "./tools"

const running = new Set<string>()
let watching = false
const failed = new Set<string>()

const update = (id: string, patch: Partial<MediaItem>) => useEditor.getState().updateMedia(id, patch)

export const canIsolateVoice = (clip: Clip, media?: MediaItem) => isTauri && hasSound(clip, media)

/** The copy a clip plays instead of its own sound, once it's ready. */
export const voiceSource = (clip: Clip, media?: MediaItem) => (clip.voice && media?.voiceSrc) || undefined

export function setVoice(id: string, on: boolean) {
  failed.clear()
  useEditor.getState().transact((s) => ({ clips: s.clips.map((c) => (c.id === id ? { ...c, voice: on || undefined } : c)) }))
}

/** FFmpeg's RNNoise filter runs over the whole recording once; every clip of it then shares the copy. */
async function isolate(media: MediaItem) {

  running.add(media.id)
  const job = `voice:${media.id}`
  const stop = await listen<{ id: string; progress: number }>("proxy-progress", ({ payload }) => {
    if (payload.id === job) update(media.id, { voiceProgress: payload.progress })
  })

  try {
    update(media.id, { voiceProgress: 0 })
    const path = await invoke<string>("media_proxy", { id: job, path: media.path, mode: "voice", audioStream: media.audioStream ?? null, copyAudio: false, duration: sec(media.duration) })
    update(media.id, { voice: path, voiceSrc: convertFileSrc(path), voiceProgress: undefined })
  } catch (err) {
    failed.add(media.id)
    update(media.id, { voiceProgress: undefined })
    notify(t("voice.failed", { name: media.name, detail: errorText(err) }), "error")
  } finally {
    stop()
    running.delete(media.id)
  }
}

function check(s: EditorState) {

  const wanted = new Set(s.clips.flatMap((c) => (c.voice && c.mediaId ? [c.mediaId] : [])))

  for (const m of s.media) {
    if (wanted.has(m.id) && m.status === "ready" && !m.voice && !running.has(m.id) && !failed.has(m.id)) void isolate(m)
  }
}

/** Makes the copy for any clip that asks for it: a new toggle, an opened project, an undo. */
export function watchVoice() {

  if (!isTauri || watching) return
  watching = true

  useEditor.subscribe((s, prev) => {
    if (s.clips !== prev.clips || s.media !== prev.media) check(s)
  })
  check(useEditor.getState())
}