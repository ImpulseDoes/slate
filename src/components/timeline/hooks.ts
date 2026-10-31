import { useEffect } from "react"
import { sec } from "../../lib/time"
import { useEditor } from "../../store/editor"
import { HEADER_W } from "./layout"

export function useScrollSync(ref: React.RefObject<HTMLDivElement | null>, set: (v: { left: number; width: number }) => void) {
  useEffect(() => {

    const el = ref.current

    if (!el) return

    const update = () => set({ left: el.scrollLeft, width: el.clientWidth })

    update()
    el.addEventListener("scroll", update, { passive: true })

    const ro = new ResizeObserver(update)

    ro.observe(el)
    return () => {
      el.removeEventListener("scroll", update)
      ro.disconnect()
    }
  }, [ref, set])
}

export function useWheelZoom(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {

    const el = ref.current

    if (!el) return

    const onWheel = (e: WheelEvent) => {

      if (!(e.ctrlKey || e.metaKey)) return

      e.preventDefault()

      const { pxPerSec, setZoom } = useEditor.getState()
      const x = e.clientX - el.getBoundingClientRect().left - HEADER_W + el.scrollLeft
      const seconds = x / pxPerSec

      setZoom(pxPerSec * Math.exp(-e.deltaY * 0.0015))

      const next = useEditor.getState().pxPerSec

      el.scrollLeft += seconds * next - x
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [ref])
}

export function useFollowPlayhead(ref: React.RefObject<HTMLDivElement | null>, view: { left: number; width: number }) {

  const playing = useEditor((s) => s.playing)
  const playhead = useEditor((s) => s.playhead)
  const pps = useEditor((s) => s.pxPerSec)

  useEffect(() => {

    const el = ref.current

    if (!el || !playing) return

    const x = sec(playhead) * pps
    const visible = view.width - HEADER_W

    if (x > view.left + visible - 24 || x < view.left) el.scrollLeft = Math.max(0, x - 24)

  }, [ref, playing, playhead, pps, view])
}
