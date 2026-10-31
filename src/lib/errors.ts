import { t, type Key } from "./i18n"

// The backend reports these as `code: detail`, so they can be worded here.
const BACKEND: Record<string, Key> = { "ffmpeg-start": "error.ffmpegStart", "ffmpeg-exit": "error.ffmpegStopped" }

export function errorText(err: unknown) {
  const text = err instanceof Error ? err.message : String(err)
  const [, code, detail] = text.match(/^([a-z-]+): (.*)$/s) ?? []
  return BACKEND[code] ? t(BACKEND[code], { detail }) : text
}