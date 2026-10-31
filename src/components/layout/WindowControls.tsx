import { useEffect, useState } from "react"
import { getCurrentWindow } from "@tauri-apps/api/window"

export function WindowControls() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    const win = getCurrentWindow()
    void win.isMaximized().then(setMaximized)
    const unlisten = win.onResized(async () => setMaximized(await win.isMaximized()))
    return () => void unlisten.then((fn) => fn())
  }, [])

  const win = () => getCurrentWindow()
  const base = "inline-flex h-12 w-[46px] items-center justify-center text-label transition-colors hover:bg-raised-hover hover:text-fg"

  return (
    <div className="flex h-full">
      <button className={base} aria-label="Minimize" onClick={() => win().minimize()}>
        <svg width="10" height="10" viewBox="0 0 10 10">
          <rect y="4.5" width="10" height="1" fill="currentColor" />
        </svg>
      </button>
      <button className={base} aria-label={maximized ? "Restore" : "Maximize"} onClick={() => win().toggleMaximize()}>
        {maximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor">
            <rect x="0.5" y="2.5" width="7" height="7" />
            <path d="M2.5 2.5V0.5H9.5V7.5H7.5" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor">
            <rect x="0.5" y="0.5" width="9" height="9" />
          </svg>
        )}
      </button>
      <button className={`${base} hover:bg-[#c42b1c]! hover:text-white!`} aria-label="Close" onClick={() => win().close()}>
        <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.1">
          <path d="M0.5 0.5L9.5 9.5M9.5 0.5L0.5 9.5" />
        </svg>
      </button>
    </div>
  )
}
