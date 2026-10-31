import type { ProjectSettings, TextProps } from "../../types"

export interface Cue {
  start: number
  end: number
  text: string
}

const TIMING = /(\d+):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d+):(\d{2}):(\d{2})[,.](\d{1,3})/

const seconds = (h: string, m: string, s: string, ms: string) => Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, "0")) / 1000

export function parseSrt(text: string): Cue[] {

  const cues: Cue[] = []

  for (const block of text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split(/\n{2,}/)) {

    const lines = block.split("\n")
    const at = lines.findIndex((line) => TIMING.test(line))

    if (at < 0) continue

    const [, h1, m1, s1, ms1, h2, m2, s2, ms2] = lines[at].match(TIMING)!
    const words = lines.slice(at + 1).join("\n").replace(/<[^>]+>/g, "").replace(/\{\\[^}]*\}/g, "").trim()

    if (words) cues.push({ start: seconds(h1, m1, s1, ms1), end: seconds(h2, m2, s2, ms2), text: words })
  }

  return cues.sort((a, b) => a.start - b.start)
}

/** Subtitle files are often not UTF-8, and Polish ones tend to be in the old Windows code page. */
export function decodeText(bytes: Uint8Array) {

  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes)
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes)

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder("windows-1250").decode(bytes)
  }
}

export const captionStyle = ({ height, width }: ProjectSettings): Omit<TextProps, "content"> => ({ size: Math.round(Math.min(width, height) * 0.05), color: "#ffffff", box: true })