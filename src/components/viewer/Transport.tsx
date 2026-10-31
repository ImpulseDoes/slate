import type { IconSvgElement } from "@hugeicons/react"
import { ArrowLeft01Icon, ArrowRight01Icon, CrosshairIcon, NextIcon, PauseIcon, PlayIcon, PreviousIcon } from "@hugeicons/core-free-icons"
import { projectDuration } from "../../lib/clips"
import { frameTicks, timecode } from "../../lib/time"
import { useEditor } from "../../store/editor"
import { Button, Icon, Tip } from "../ui"

export function Transport() {

  const playhead = useEditor((s) => s.playhead)
  const playing = useEditor((s) => s.playing)
  const duration = useEditor((s) => projectDuration(s.clips))
  const showGuides = useEditor((s) => s.showGuides)
  const fps = useEditor((s) => s.settings.fps)
  const { togglePlay, setPlayhead, setPlaying, toggleGuides } = useEditor.getState()
  const stepFrame = (dir: number) => {
    setPlaying(false)
    setPlayhead(playhead + dir * frameTicks(fps))
  }

  return (
    <div className="flex h-12 shrink-0 items-center rounded-xl bg-surface px-4 shadow-card">
      <span className="tnum w-28 text-body text-fg">{timecode(playhead, fps)}</span>
      <div className="flex flex-1 items-center justify-center gap-0.5">
        <Tip label="Go to start" kbd="Home">
          <Button variant="quiet" aria-label="Go to start" onClick={() => setPlayhead(0)}>
            <Glyph icon={PreviousIcon} />
          </Button>
        </Tip>
        <Tip label="Previous frame" kbd="←">
          <Button variant="quiet" aria-label="Previous frame" onClick={() => stepFrame(-1)}>
            <Glyph icon={ArrowLeft01Icon} />
          </Button>
        </Tip>
        <Tip label={playing ? "Pause" : "Play"} kbd="Space">
          <button aria-label={playing ? "Pause" : "Play"} onClick={togglePlay} className="mx-1 inline-flex h-9 w-9 items-center justify-center rounded-full bg-fg text-white transition-colors hover:bg-[#3a3a3a]">
            <Glyph icon={playing ? PauseIcon : PlayIcon} />
          </button>
        </Tip>
        <Tip label="Next frame" kbd="→">
          <Button variant="quiet" aria-label="Next frame" onClick={() => stepFrame(1)}>
            <Glyph icon={ArrowRight01Icon} />
          </Button>
        </Tip>
        <Tip label="Go to end" kbd="End">
          <Button variant="quiet" aria-label="Go to end" onClick={() => setPlayhead(duration)}>
            <Glyph icon={NextIcon} />
          </Button>
        </Tip>
      </div>
      <div className="flex w-28 items-center justify-end gap-2">
        <Tip label="Center guides" kbd="G">
          <Button variant="quiet" icon={CrosshairIcon} active={showGuides} onClick={toggleGuides} aria-pressed={showGuides} aria-label="Center guides" />
        </Tip>
        <span className="tnum text-body text-muted">{timecode(duration, fps)}</span>
      </div>
    </div>
  )
}

const Glyph = ({ icon }: { icon: IconSvgElement }) => <Icon icon={icon} size={20} />