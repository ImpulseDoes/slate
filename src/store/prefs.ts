import { create } from "zustand"
import type { Key } from "../lib/i18n"

export const GUIDE_COLORS: { id: string; color: string; label: Key }[] = [
  { id: "red", color: "#ff3b30", label: "guides.red" },
  { id: "yellow", color: "#ffd60a", label: "guides.yellow" },
  { id: "green", color: "#30d158", label: "guides.green" },
  { id: "cyan", color: "#32c5ff", label: "guides.cyan" },
  { id: "pink", color: "#ff2fb5", label: "guides.pink" },
  { id: "white", color: "#ffffff", label: "guides.white" },
]

const GUIDE_KEY = "slate.guideColor"

const savedGuide = () => {
  const saved = globalThis.localStorage?.getItem(GUIDE_KEY)
  return GUIDE_COLORS.some((g) => g.id === saved) ? saved! : GUIDE_COLORS[0].id
}

export type Theme = "system" | "light" | "dark"

export const THEMES: { id: Theme; label: Key }[] = [
  { id: "system", label: "theme.system" },
  { id: "light", label: "theme.light" },
  { id: "dark", label: "theme.dark" },
]

const THEME_KEY = "slate.theme"

const savedTheme = () => {
  const saved = globalThis.localStorage?.getItem(THEME_KEY)
  return THEMES.find((theme) => theme.id === saved)?.id ?? "system"
}

/** Settings of the app itself, kept on this computer rather than in the project. */
export const usePrefs = create<{ guideColor: string; theme: Theme }>(() => ({ guideColor: savedGuide(), theme: savedTheme() }))

const systemDark = globalThis.matchMedia?.("(prefers-color-scheme: dark)")

const showTheme = () => {

  const { theme } = usePrefs.getState()

  if (typeof document !== "undefined") document.documentElement.dataset.theme = theme === "dark" || (theme === "system" && systemDark?.matches) ? "dark" : "light"
}

showTheme()
systemDark?.addEventListener("change", showTheme)

export function setTheme(theme: Theme) {
  globalThis.localStorage?.setItem(THEME_KEY, theme)
  usePrefs.setState({ theme })
  showTheme()
}

export function setGuideColor(id: string) {
  globalThis.localStorage?.setItem(GUIDE_KEY, id)
  usePrefs.setState({ guideColor: id })
}

export const guideColor = (id: string) => (GUIDE_COLORS.find((g) => g.id === id) ?? GUIDE_COLORS[0]).color