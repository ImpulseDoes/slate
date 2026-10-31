export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

export const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent)

export const MOD = isMac ? "⌘" : "Ctrl"

export const uid = () => Math.random().toString(36).slice(2, 10)
