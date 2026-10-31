import { useEffect, useState } from "react"
import { getCurrentWebview } from "@tauri-apps/api/webview"
import { projectDuration, useEditor } from "./store/editor"
import { importFiles, importPaths, pickAndImport } from "./lib/media"
import { FRAME } from "./lib/time"
import { isTauri } from "./lib/platform"

export function usePlaybackClock() {

  const playing = useEditor((s) => s.playing)

  useEffect(() => {

    if (!playing) return

    let last = performance.now()

    let raf = requestAnimationFrame(function tick(now) {

      const { playhead, clips, setPlayhead, setPlaying } = useEditor.getState()
      const end = projectDuration(clips)
      const next = playhead + (now - last) / 1000

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

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {

      const target = e.target as HTMLElement

      if (document.querySelector("[role=dialog], [role=menu]")) return
      if (target.closest("input:not([type=range], [type=color]), textarea, [contenteditable]")) return

      const s = useEditor.getState()
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()

      if (mod && key === "z") {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
        return
      }
      if (mod && key === "y") {
        e.preventDefault()
        s.redo()
        return
      }
      if (mod && key === "i") {
        e.preventDefault()
        void pickAndImport()
        return
      }
      if (mod) {
        if (key === "l") {
          e.preventDefault()
          if (e.shiftKey) s.unlinkSelected()
          else s.linkSelected()
          return
        }
        const actions: Record<string, () => void> = {
          a: s.selectAll,
          c: s.copySelected,
          x: s.cutSelected,
          v: () => s.pasteAt(s.playhead),
          d: s.duplicateSelected,
        }
        if (actions[key]) {
          e.preventDefault()
          actions[key]()
        }
        return
      }

      const step = e.shiftKey ? 1 : FRAME
      switch (e.key) {
        case " ":
          e.preventDefault()
          s.togglePlay()
          break
        case "ArrowLeft":
          e.preventDefault()
          s.setPlaying(false)
          s.setPlayhead(s.playhead - step)
          break
        case "ArrowRight":
          e.preventDefault()
          s.setPlaying(false)
          s.setPlayhead(s.playhead + step)
          break
        case "Home":
          s.setPlayhead(0)
          break
        case "End":
          s.setPlayhead(projectDuration(s.clips))
          break
        case "Delete":
        case "Backspace":
          s.deleteSelected()
          break
        case "Escape":
          s.clearSelection()
          break
        case "+":
        case "=":
          s.setZoom(s.pxPerSec * 1.5)
          break
        case "-":
          s.setZoom(s.pxPerSec / 1.5)
          break
        default:
          if (key === "s") s.splitAtPlayhead()
          else if (key === "a") s.detachAudio()
          else if (key === "m") s.mergeSelected()
          else if (key === "g") s.toggleGuides()
          else if (key === "t") s.addTitle()
          else if (key === "n") s.toggleSnapping()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
}

export function useFileDrop() {
  const [over, setOver] = useState(false)
  useEffect(() => {
    if (isTauri) {
      const unlisten = getCurrentWebview().onDragDropEvent((e) => {
        const p = e.payload
        if (p.type === "enter" || p.type === "over") setOver(true)
        else if (p.type === "leave") setOver(false)
        else if (p.type === "drop") {
          setOver(false)
          importPaths(p.paths)
        }
      })
      return () => void unlisten.then((fn) => fn())
    }
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files")
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      setOver(true)
    }
    const onLeave = (e: DragEvent) => {
      if (!e.relatedTarget) setOver(false)
    }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      setOver(false)
      importFiles([...(e.dataTransfer?.files ?? [])])
    }
    window.addEventListener("dragover", onOver)
    window.addEventListener("dragleave", onLeave)
    window.addEventListener("drop", onDrop)
    return () => {
      window.removeEventListener("dragover", onOver)
      window.removeEventListener("dragleave", onLeave)
      window.removeEventListener("drop", onDrop)
    }
  }, [])
  return over
}