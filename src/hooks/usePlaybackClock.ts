import { useEffect } from "react"
import { projectDuration } from "../lib/clips"
import { TICKS } from "../lib/time"
import { useEditor } from "../store/editor"

export function usePlaybackClock() {

  const playing = useEditor((s) => s.playing)

  useEffect(() => {

    if (!playing) return

    let last = performance.now()

    let raf = requestAnimationFrame(function tick(now) {

      const { playhead, clips, setPlayhead, setPlaying } = useEditor.getState()
      const end = projectDuration(clips)
      const next = Math.round(playhead + ((now - last) / 1000) * TICKS)

      last = now

      if (next >= end) {
        setPlayhead(end)
        setPlaying(false)

        return
      }

      useEditor.setState({ playhead: next })
      raf = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(raf)
  }, [playing])
}