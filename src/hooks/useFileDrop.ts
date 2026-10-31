import { useEffect, useState } from "react"
import { getCurrentWebview } from "@tauri-apps/api/webview"
import { importFiles, importPaths } from "../lib/media/importer"
import { isTauri } from "../lib/platform"

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
