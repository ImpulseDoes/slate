/** True inside the Tauri shell, false in a plain browser (e.g. `bun run dev`). */
export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

export const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent)

/** Label for the primary modifier key in shortcuts. */
export const MOD = isMac ? "⌘" : "Ctrl"

export const uid = () => Math.random().toString(36).slice(2, 10)