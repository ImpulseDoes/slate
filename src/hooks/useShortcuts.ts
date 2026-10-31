import { useEffect } from "react"
import { projectDuration } from "../lib/clips"
import { pickAndImport } from "../lib/media/importer"
import { isTauri } from "../lib/platform"
import { openProject, saveProject, saveProjectAs, startNewProject } from "../lib/project/session"
import { frameTicks, ticks } from "../lib/time"
import { useEditor, type EditorState } from "../store/editor"
import { openDialog } from "../store/overlays"

function modShortcut(key: string, shift: boolean, s: EditorState): (() => void) | undefined {
  const actions: Record<string, () => void> = {
    z: shift ? s.redo : s.undo,
    y: s.redo,
    i: () => void pickAndImport(),
    n: startNewProject,
    e: () => s.clips.length && openDialog("export"),
    l: shift ? s.unlinkSelected : s.linkSelected,
    a: s.selectAll,
    c: s.copySelected,
    x: s.cutSelected,
    v: () => s.pasteAt(s.playhead),
    d: s.duplicateSelected,
  }
  if (isTauri) {
    actions.s = () => void (shift ? saveProjectAs() : saveProject())
    actions.o = () => void openProject()
  }
  return actions[key]
}

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {

      const target = e.target as HTMLElement

      if (document.querySelector("[role=dialog], [role=menu]")) return
      if (target.closest("input:not([type=range], [type=color]), textarea, [contenteditable]")) return

      const s = useEditor.getState()
      const key = e.key.toLowerCase()

      if (e.ctrlKey || e.metaKey) {
        const action = modShortcut(key, e.shiftKey, s)
        if (action) {
          e.preventDefault()
          action()
        }
        return
      }

      const step = e.shiftKey ? ticks(1) : frameTicks(s.settings.fps)
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