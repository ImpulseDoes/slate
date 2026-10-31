import { useState, useEffect } from "react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import "./App.css"

const appWindow = getCurrentWindow()

function App() {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    const checkMaximized = async () => {
      setIsMaximized(await appWindow.isMaximized())
    }
    checkMaximized()

    const unlisten = appWindow.onResized(async () => {
      setIsMaximized(await appWindow.isMaximized())
    })

    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])

  return (
    <div className="app-wrapper">
      {/* Custom Titlebar */}
      <div className="titlebar" data-tauri-drag-region>
        <div className="titlebar-title" data-tauri-drag-region>
          Slate
        </div>
        <div className="titlebar-controls">
          <button
            className="titlebar-btn"
            id="titlebar-minimize"
            onClick={() => appWindow.minimize()}
          >
            <svg width="10" height="1" viewBox="0 0 10 1">
              <rect width="10" height="1" fill="currentColor" />
            </svg>
          </button>
          <button
            className="titlebar-btn"
            id="titlebar-maximize"
            onClick={() => appWindow.toggleMaximize()}
          >
            {isMaximized ? (
              <svg width="10" height="10" viewBox="0 0 10 10">
                <path
                  d="M2 0h6v2h2v6H8v2H0V4h2V0zm1 1v2h5v5h1V2H3zm-2 3v5h6V4H1z"
                  fill="currentColor"
                />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10">
                <rect
                  x="0.5"
                  y="0.5"
                  width="9"
                  height="9"
                  stroke="currentColor"
                  fill="none"
                  strokeWidth="1"
                />
              </svg>
            )}
          </button>
          <button
            className="titlebar-btn titlebar-btn-close"
            id="titlebar-close"
            onClick={() => appWindow.close()}
          >
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path
                d="M1 0L5 4L9 0L10 1L6 5L10 9L9 10L5 6L1 10L0 9L4 5L0 1Z"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <main className="container">
      </main>
    </div>
  )
}

export default App