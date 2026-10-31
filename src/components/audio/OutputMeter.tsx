import { useEffect, useMemo } from "react"
import { createPpmBallistics, type MeterFrame } from "@audio-ui/core/meter"
import { Meter } from "@audio-ui/react/meter"
import { createSource } from "@audio-ui/react/source"
import { readPeaks } from "../../lib/audio/mixer"
import { formatNumber, useT } from "../../lib/i18n"
import { useEditor } from "../../store/editor"

const MIN = -60
const MARKS = [0, -6, -12, -24, -48]
const HOLD_SECONDS = 1.5
const HOLD_FALL_DB_PER_SECOND = 20

const toDb = (amplitude: number) => (amplitude > 0 ? Math.max(MIN, 20 * Math.log10(amplitude)) : MIN)
const SILENT: MeterFrame = { levels: [MIN, MIN] }

/** The stereo level of the preview, read from the audio bus while it plays. */
export function OutputMeter() {

  const t = useT()
  const source = useMemo(() => createSource<MeterFrame>(SILENT), [])

  useEffect(() => {

    const ballistics = [createPpmBallistics(), createPpmBallistics()]
    const hold = [MIN, MIN]
    const heldAt = [0, 0]
    const peaks: [number, number] = [0, 0]
    let frame = 0
    let last = 0

    const tick = (now: number) => {

      const seconds = last ? (now - last) / 1000 : 0
      last = now
      const playing = useEditor.getState().playing
      readPeaks(peaks)

      const levels = ballistics.map((b, side) => b.step(playing ? toDb(peaks[side]) : MIN, seconds))

      levels.forEach((level, side) => {
        if (level >= hold[side]) {
          hold[side] = level
          heldAt[side] = now
        } else if (now - heldAt[side] > HOLD_SECONDS * 1000) {
          hold[side] = Math.max(MIN, hold[side] - HOLD_FALL_DB_PER_SECOND * seconds)
        }
      })

      const resting = hold.every((h) => h <= MIN)
      source.set(resting ? SILENT : { levels, peaks: [...hold] })

      // Keep painting until the bars have fallen after a stop, then sleep until the next play.
      frame = playing || !resting ? requestAnimationFrame(tick) : 0
      if (!frame) last = 0
    }

    const start = () => {
      if (!frame) frame = requestAnimationFrame(tick)
    }

    if (useEditor.getState().playing) start()
    const unsubscribe = useEditor.subscribe((s, prev) => {
      if (s.playing && !prev.playing) start()
    })

    return () => {
      unsubscribe()
      cancelAnimationFrame(frame)
    }
  }, [source])

  const sides = [t("meter.left"), t("meter.right")]

  return (
    <section className="flex w-[72px] shrink-0 flex-col rounded-xl bg-surface px-2 pt-3 pb-2 shadow-card">
      <span className="mb-3 text-center text-caps font-semibold text-muted">dB</span>
      <Meter.Root
        source={source}
        min={MIN}
        max={0}
        scale="iec"
        warnThreshold={-6}
        clipThreshold={0}
        locale={document.documentElement.lang}
        aria-label={t("meter.label")}
        className="relative mx-auto flex min-h-0 w-12 flex-1 justify-end gap-1"
      >
        {MARKS.map((mark) => (
          <Meter.Mark key={mark} value={mark} className="absolute left-0 w-7 translate-y-1/2 pr-1 text-right text-[10px] leading-none text-muted tnum">
            {mark === 0 ? "0" : `−${formatNumber(-mark)}`}
          </Meter.Mark>
        ))}
        <Meter.Channels>
          {(index) => (
            <Meter.Channel
              key={index}
              index={index}
              aria-label={sides[index]}
              className="relative w-2.5 cursor-pointer overflow-visible before:absolute before:inset-x-0 before:-top-2 before:h-1 before:rounded-full before:bg-raised data-[clipped]:before:bg-error"
            >
              <Meter.Track className="absolute inset-0 overflow-hidden rounded-full bg-raised">
                <Meter.Indicator className="absolute inset-0 origin-bottom bg-clip-audio-strong data-[warning]:bg-clip-text-strong data-[clipping]:bg-error" />
              </Meter.Track>
              <Meter.Peak className="absolute inset-x-0 h-0.5 translate-y-1/2 rounded-full bg-fg data-[clipping]:bg-error" />
            </Meter.Channel>
          )}
        </Meter.Channels>
      </Meter.Root>
      <div className="mx-auto mt-1.5 flex w-12 justify-end gap-1 text-[10px] leading-none font-semibold text-muted">
        {sides.map((side) => (
          <span key={side} className="w-2.5 text-center">{side.charAt(0)}</span>
        ))}
      </div>
    </section>
  )
}