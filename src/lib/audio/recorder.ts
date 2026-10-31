import { invoke } from "@tauri-apps/api/core"
import { create } from "zustand"
import { useEditor } from "../../store/editor"
import { notify } from "../../store/overlays"
import { clipEnd } from "../clips"
import { errorText } from "../errors"
import { t } from "../i18n"
import { importAndWait } from "../media/importer"
import { dirName } from "../paths"
import { isTauri } from "../platform"

interface Recorder {
  recording: boolean
  saving: boolean
  startedAt: number
}

export const useRecorder = create<Recorder>(() => ({ recording: false, saving: false, startedAt: 0 }))

let session: { recorder: MediaRecorder; stream: MediaStream; chunks: Blob[]; start: number } | null = null

/** Puts a finished take on the first audio track free for its whole length. */
function placeTake(mediaId: string, start: number) {

  const state = useEditor.getState()
  const duration = state.media.find((m) => m.id === mediaId)?.duration ?? 0
  const free = (trackId: string) => !state.clips.some((c) => c.trackId === trackId && c.start < start + duration && clipEnd(c) > start)
  const track = state.tracks.find((tr) => tr.kind === "audio" && !tr.locked && free(tr.id))

  if (!track) state.addTrack("audio")

  const target = track ?? useEditor.getState().tracks.filter((tr) => tr.kind === "audio").pop()

  if (target) useEditor.getState().insertClip(mediaId, target.id, start)
}

async function finish(blob: Blob, start: number) {

  useRecorder.setState({ recording: false, saving: true })

  try {

    const { projectPath } = useEditor.getState()
    const name = `voice-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`
    const path = await invoke<string>("recording_save", {
      folder: projectPath ? dirName(projectPath) : null,
      name,
      bytes: [...new Uint8Array(await blob.arrayBuffer())],
    })
    const id = await importAndWait(path)

    if (id) placeTake(id, start)

  } catch (err) {
    notify(t("record.failed", { detail: errorText(err) }), "error")
  } finally {
    useRecorder.setState({ saving: false })
  }
}

export async function startRecording() {

  if (session || !isTauri) {
    if (!isTauri) notify(t("export.needsDesktop"), "error")
    return
  }

  try {

    // Voice processing is for calls. In a recording it pumps and eats quiet words.
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
    const recorder = new MediaRecorder(stream)
    const chunks: Blob[] = []
    const start = useEditor.getState().playhead

    recorder.ondataavailable = (e) => chunks.push(e.data)
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop())
      session = null
      void finish(new Blob(chunks, { type: recorder.mimeType }), start)
    }

    session = { recorder, stream, chunks, start }
    recorder.start()
    useRecorder.setState({ recording: true, startedAt: Date.now() })
    useEditor.getState().setPlaying(useEditor.getState().clips.length > 0)

  } catch (err) {
    notify(t("record.noMicrophone", { detail: errorText(err) }), "error")
  }
}

export function stopRecording() {

  if (!session) return

  session.recorder.stop()
  useEditor.getState().setPlaying(false)
}

export const toggleRecording = () => (useRecorder.getState().recording ? stopRecording() : void startRecording())