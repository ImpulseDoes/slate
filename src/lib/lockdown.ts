import { reloadWindow } from "./project/session"

const RELOAD = new Set(["F5", "BrowserRefresh"])
const BROWSER = new Set(["F3", "F7", "F12", "BrowserBack", "BrowserForward", "BrowserSearch", "BrowserHome"])
const BROWSER_WITH_MOD = new Set(["f", "g", "h", "j", "p", "u", "=", "+", "-", "0"])
const DEVTOOLS_WITH_MOD_SHIFT = new Set(["i", "j", "c", "k", "m"])

/** The window is an app, not a browser: no devtools and no browser shortcuts. Ctrl+R and F5 reload it with the project kept. */
export function lockDown() {

  window.addEventListener("keydown", (e) => {

    const key = e.key.toLowerCase()
    const mod = e.ctrlKey || e.metaKey

    if (RELOAD.has(e.key) || (mod && key === "r")) {

      e.preventDefault()
      e.stopImmediatePropagation()

      if (!e.repeat) reloadWindow()

      return
    }

    const blocked =
      BROWSER.has(e.key) ||
      (mod && e.shiftKey && DEVTOOLS_WITH_MOD_SHIFT.has(key)) ||
      (mod && !e.shiftKey && BROWSER_WITH_MOD.has(key)) ||
      (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight"))

    if (blocked) e.preventDefault()
  }, { capture: true })
}