import { useEffect } from "react"
import { projectDuration } from "../lib/clips"
import { mediaCatchingUp } from "../lib/media/onScreen"
import { TICKS } from "../lib/time"
import { useEditor } from "../store/editor"

// Long enough for a slow seek, short enough that a stuck file can't stop playback.
const MAX_WAIT = 1000

export function usePlaybackClock() {

  const playing = useEditor((s) => s.playing)

  useEffect(() => {

    if (!playing) return

    let last = performance.now()
    let ready = last

    let raf = requestAnimationFrame(function tick(now) {

      if (!mediaCatchingUp()) ready = now
      else if (now - ready < MAX_WAIT) {
        last = now
        raf = requestAnimationFrame(tick)

        return
      }

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