import { create } from "zustand"
import enUk from "../locales/en-uk.json"
import enUs from "../locales/en-us.json"
import pl from "../locales/pl.json"

export type Key = keyof typeof enUs
export type Language = "pl" | "en-us" | "en-uk"

type Plural = { other: string } & Partial<Record<Intl.LDMLPluralRule, string>>
type Strings = Record<Key, string | Plural>

const STORAGE_KEY = "slate.language"

const LOCALES: Record<Language, { tag: string; strings: Strings }> = {
  pl: { tag: "pl-PL", strings: pl },
  "en-us": { tag: "en-US", strings: enUs },
  "en-uk": { tag: "en-GB", strings: enUk },
}

export const LANGUAGES: { id: Language; label: string }[] = [
  { id: "pl", label: "Polski" },
  { id: "en-us", label: "English (US)" },
  { id: "en-uk", label: "English (UK)" },
]

function initialLanguage(): Language {
  const saved = globalThis.localStorage?.getItem(STORAGE_KEY)
  return saved && saved in LOCALES ? (saved as Language) : "en-us"
}

export const useLanguage = create<{ language: Language }>(() => ({ language: initialLanguage() }))

const showLanguage = (language: Language) => {
  if (typeof document !== "undefined") document.documentElement.lang = LOCALES[language].tag
}

showLanguage(useLanguage.getState().language)

export function setLanguage(language: Language) {
  globalThis.localStorage?.setItem(STORAGE_KEY, language)
  showLanguage(language)
  useLanguage.setState({ language })
}

const currentTag = () => LOCALES[useLanguage.getState().language].tag

export const formatNumber = (n: number) => new Intl.NumberFormat(currentTag()).format(n)

export const formatDate = (time: number) => new Date(time).toLocaleString(currentTag())

export function translate(language: Language, key: Key, params: Record<string, string | number> = {}): string {
  const { tag, strings } = LOCALES[language]
  const entry = strings[key]
  const count = Number(params.count)
  const text = typeof entry === "string" ? entry : (entry[new Intl.PluralRules(tag).select(count)] ?? entry.other)
  // Only {count} is grouped: sizes like 1920 must never read "1,920".
  return text.replace(/\{(\w+)\}/g, (match, name) => (name === "count" ? new Intl.NumberFormat(tag).format(count) : String(params[name] ?? match)))
}

/** For code that runs on demand. Anything rendered goes through useT, so it follows a language change. */
export const t = (key: Key, params?: Record<string, string | number>) => translate(useLanguage.getState().language, key, params)

export function useT() {
  useLanguage((s) => s.language)
  return t
}

export const fpsText = (rate: string) => t("unit.fps", { rate: formatNumber(Number(rate)) })