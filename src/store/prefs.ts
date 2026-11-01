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

/** Settings of the app itself, kept on this computer rather than in the project. */
export const usePrefs = create<{ guideColor: string }>(() => ({ guideColor: savedGuide() }))

export function setGuideColor(id: string) {
  globalThis.localStorage?.setItem(GUIDE_KEY, id)
  usePrefs.setState({ guideColor: id })
}

export const guideColor = (id: string) => (GUIDE_COLORS.find((g) => g.id === id) ?? GUIDE_COLORS[0]).color