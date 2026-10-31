import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { useEffect, useMemo, useRef, useState } from "react"
import { errorText } from "../../lib/errors"
import { useLanguage, useT } from "../../lib/i18n"
import { uid } from "../../lib/platform"
import { placeCaptions } from "../../lib/text/captions"
import { MAX_LINE, MAX_LINE_VERTICAL, recordingsToTranscribe, transcribe } from "../../lib/text/transcribe"
import { isVertical } from "../../lib/vertical"
import { useEditor } from "../../store/editor"
import { notify } from "../../store/overlays"
import { Modal } from "../overlays/Modal"
import { Button, Field, Select } from "../ui"

type Spoken = "pl" | "en" | "auto"
type Stage = "idle" | "download" | "listen"

async function downloadModel(id: string, onProgress: (progress: number) => void) {

  const stop = await listen<{ id: string; progress: number }>("captions-progress", ({ payload }) => {
    if (payload.id === id) onProgress(payload.progress)
  })

  try {
    await invoke("model_download", { id })
  } finally {
    stop()
  }
}

export function AutoCaptionsDialog({ onClose }: { onClose: () => void }) {

  const t = useT()
  const clips = useEditor((s) => s.clips)
  const media = useEditor((s) => s.media)
  const tracks = useEditor((s) => s.tracks)
  const selectedClipIds = useEditor((s) => s.selectedClipIds)
  const settings = useEditor((s) => s.settings)
  const appLanguage = useLanguage((s) => s.language)
  const recordings = useMemo(() => recordingsToTranscribe({ clips, media, tracks, selectedClipIds }), [clips, media, tracks, selectedClipIds])
  const [language, setLanguage] = useState<Spoken>(appLanguage === "pl" ? "pl" : "en")
  const [ready, setReady] = useState<boolean | null>(null)
  const [stage, setStage] = useState<Stage>("idle")
  const [progress, setProgress] = useState(0)
  const running = useRef<string | null>(null)

  useEffect(() => {
    void invoke<boolean>("model_ready").then(setReady, () => setReady(false))
  }, [])

  const cancel = () => {

    if (!running.current) return

    void invoke("render_cancel", { id: running.current })

    running.current = null
  }

  useEffect(() => cancel, [])

  const run = async () => {

    const id = uid()

    running.current = id

    try {

      if (!ready) {
        setStage("download")
        setProgress(0)
        await downloadModel(id, setProgress)
        setReady(true)
      }

      setStage("listen")
      setProgress(0)

      const cues = await transcribe(recordings, language, id, isVertical(settings) ? MAX_LINE_VERTICAL : MAX_LINE, setProgress, () => running.current !== id)

      if (cues.length) {
        placeCaptions(cues)
        notify(t("autoCaptions.done", { count: cues.length }))
      } else {
        notify(t("autoCaptions.none"), "error")
      }

      running.current = null
      onClose()

    } catch (err) {

      running.current = null
      setStage("idle")

      if (err !== "cancelled") notify(t("autoCaptions.failed", { detail: errorText(err) }), "error")
    }
  }

  const busy = stage !== "idle"
  const percent = Math.round(progress * 100)

  return (
    <Modal
      title={t("autoCaptions.title")}
      labelId="auto-captions-title"
      onClose={onClose}
      closeButton
      width={440}
      footer={
        <>
          <Button onClick={busy ? cancel : onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" disabled={busy || ready === null || !recordings.length} onClick={() => void run()}>
            {ready === false ? t("autoCaptions.downloadAndCreate") : t("autoCaptions.create")}
          </Button>
        </>
      }
    >
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-body text-label">{t("autoCaptions.hint")}</p>
        <Field label={t("autoCaptions.language")}>
          <Select
            label={t("autoCaptions.language")}
            value={language}
            onChange={setLanguage}
            options={[
              { id: "pl" as Spoken, label: "Polski" },
              { id: "en" as Spoken, label: "English" },
              { id: "auto" as Spoken, label: t("autoCaptions.detect") },
            ]}
          />
        </Field>
        <p className="text-body text-label">{recordings.length ? t("autoCaptions.scope", { count: recordings.length }) : t("autoCaptions.nothing")}</p>
        {ready === false && !busy && <p className="text-body text-label">{t("autoCaptions.model")}</p>}
        {busy && (
          <div>
            <div className="h-1.5 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
            </div>
            <p className="tnum mt-1.5 text-small text-muted">{t(stage === "download" ? "autoCaptions.downloading" : "autoCaptions.listening", { percent })}</p>
          </div>
        )}
      </div>
    </Modal>
  )
}