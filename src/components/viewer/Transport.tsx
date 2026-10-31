import type { IconSvgElement } from "@hugeicons/react"
import { ArrowLeft01Icon, ArrowRight01Icon, CrosshairIcon, Mic01Icon, NextIcon, PauseIcon, PlayIcon, PreviousIcon } from "@hugeicons/core-free-icons"
import { toggleRecording, useRecorder } from "../../lib/audio/recorder"
import { projectDuration } from "../../lib/clips"
import { useT } from "../../lib/i18n"
import { frameTicks, timecode } from "../../lib/time"
import { useEditor } from "../../store/editor"
import { Button, Icon, Tip } from "../ui"

export function Transport() {

  const t = useT()
  const playhead = useEditor((s) => s.playhead)
  const playing = useEditor((s) => s.playing)
  const duration = useEditor((s) => projectDuration(s.clips))
  const showGuides = useEditor((s) => s.showGuides)
  const fps = useEditor((s) => s.settings.fps)
  const recording = useRecorder((s) => s.recording)
  const saving = useRecorder((s) => s.saving)
  const { togglePlay, setPlayhead, setPlaying, toggleGuides } = useEditor.getState()
  const stepFrame = (dir: number) => {
    setPlaying(false)
    setPlayhead(playhead + dir * frameTicks(fps))
  }

  return (
    <div className="flex h-12 shrink-0 items-center rounded-xl bg-surface px-4 shadow-card">
      <span className="tnum w-36 text-body text-fg">{timecode(playhead, fps)}</span>
      <div className="flex flex-1 items-center justify-center gap-0.5">
        <Tip label={t("viewer.goToStart")} kbd="Home">
          <Button variant="quiet" aria-label={t("viewer.goToStart")} onClick={() => setPlayhead(0)}>
            <Glyph icon={PreviousIcon} />
          </Button>
        </Tip>
        <Tip label={t("viewer.previousFrame")} kbd="←">
          <Button variant="quiet" aria-label={t("viewer.previousFrame")} onClick={() => stepFrame(-1)}>
            <Glyph icon={ArrowLeft01Icon} />
          </Button>
        </Tip>
        <Tip label={t(playing ? "viewer.pause" : "viewer.play")} kbd={t("key.space")}>
          <button aria-label={t(playing ? "viewer.pause" : "viewer.play")} onClick={togglePlay} className="mx-1 inline-flex h-9 w-9 items-center justify-center rounded-full bg-fg text-white transition-colors hover:bg-[#3a3a3a]">
            <Glyph icon={playing ? PauseIcon : PlayIcon} />
          </button>
        </Tip>
        <Tip label={t("viewer.nextFrame")} kbd="→">
          <Button variant="quiet" aria-label={t("viewer.nextFrame")} onClick={() => stepFrame(1)}>
            <Glyph icon={ArrowRight01Icon} />
          </Button>
        </Tip>
        <Tip label={t("viewer.goToEnd")} kbd="End">
          <Button variant="quiet" aria-label={t("viewer.goToEnd")} onClick={() => setPlayhead(duration)}>
            <Glyph icon={NextIcon} />
          </Button>
        </Tip>
      </div>
      <div className="flex w-36 items-center justify-end gap-2">
        <Tip label={t(recording ? "record.stop" : "record.start")} kbd="R">
          <Button variant="quiet" icon={Mic01Icon} onClick={toggleRecording} disabled={saving} aria-pressed={recording} aria-label={t(recording ? "record.stop" : "record.start")} className={recording ? "text-error hover:text-error" : ""} />
        </Tip>
        <Tip label={t("viewer.guides")} kbd="G">
          <Button variant="quiet" icon={CrosshairIcon} active={showGuides} onClick={toggleGuides} aria-pressed={showGuides} aria-label={t("viewer.guides")} />
        </Tip>
        <span className="tnum text-body text-muted">{timecode(duration, fps)}</span>
      </div>
    </div>
  )
}

const Glyph = ({ icon }: { icon: IconSvgElement }) => <Icon icon={icon} size={20} />