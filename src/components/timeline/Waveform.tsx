import { useMemo } from "react"
import { sec } from "../../lib/time"
import { PEAKS_PER_SECOND, type Clip } from "../../types"

export function Waveform({ clip, peaks, width }: { clip: Clip; peaks: number[]; width: number }) {

  const path = useMemo(() => {

    const from = Math.floor(sec(clip.offset) * PEAKS_PER_SECOND)
    const to = Math.min(peaks.length, Math.ceil(sec(clip.offset + clip.duration) * PEAKS_PER_SECOND))
    const bars = Math.max(1, Math.min(to - from, Math.floor(width / 2)))
    const per = (to - from) / bars

    let d = ""

    for (let i = 0; i < bars; i++) {

      let p = 0
      const a = from + Math.floor(i * per)
      const b = Math.max(a + 1, from + Math.floor((i + 1) * per))
      for (let j = a; j < b && j < to; j++) p = Math.max(p, peaks[j])
      const h = Math.max(0.04, p) * 0.5
      d += `M${i + 0.5} ${0.5 - h}V${0.5 + h}`
    }

    return { d, bars }
  }, [clip.offset, clip.duration, peaks, width])
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${path.bars} 1`} preserveAspectRatio="none">
      <path d={path.d} stroke="currentColor" strokeOpacity={0.7} strokeWidth={0.9} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
