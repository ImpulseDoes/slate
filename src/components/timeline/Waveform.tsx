import { useMemo } from "react"
import { Waveform as Wave } from "@audio-ui/react/waveform"
import { sec } from "../../lib/time"
import { useEditor } from "../../store/editor"
import { PEAKS_PER_SECOND, type Clip } from "../../types"

/**
 * A clip's slice of its source's peaks. The part already played is drawn
 * solid, the rest faded, following the playhead outside React.
 */
export function Waveform({ clip, peaks }: { clip: Clip; peaks: number[] }) {

  const length = peaks.length / PEAKS_PER_SECOND
  const from = sec(clip.offset)
  const to = sec(clip.offset + clip.duration)

  const position = useMemo(() => {

    const at = (playhead: number) => sec(clip.offset + playhead - clip.start)

    return {
      getSnapshot: () => at(useEditor.getState().playhead),
      subscribe: (listener: () => void) => useEditor.subscribe((s, prev) => {
        if (s.playhead !== prev.playhead) listener()
      }),
    }
  }, [clip.offset, clip.start])

  return (
    <Wave.Root peaks={peaks} duration={length} range={[from, Math.min(to, length)]} source={position} className="absolute inset-x-0 inset-y-1">
      <Wave.Canvas
        barWidth={2}
        barGap={1}
        barRadius={1}
        minBarHeight={2}
        className="block h-full w-full [--waveform-color:var(--color-clip-audio-faded)] [--waveform-progress-color:var(--color-clip-audio-strong)]"
      />
    </Wave.Root>
  )
}