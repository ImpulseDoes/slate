import { convertFileSrc } from "@tauri-apps/api/core"
import { open } from "@tauri-apps/plugin-dialog"
import { useEditor } from "../../store/editor"
import { notify } from "../../store/overlays"
import type { FontRef } from "../../types"
import { t } from "../i18n"
import { baseName } from "../paths"

const familyOf = (path: string) => baseName(path).replace(/\.[^.]+$/, "")

export async function loadFont(font: FontRef) {
  try {
    const face = new FontFace(font.family, `url("${convertFileSrc(font.path)}")`)
    document.fonts.add(await face.load())
    return true
  } catch {
    notify(t("font.missing", { name: font.family }), "error")
    return false
  }
}

export async function pickFont(): Promise<string | null> {

  const path = await open({ title: t("font.pick"), filters: [{ name: t("font.files"), extensions: ["ttf", "otf", "woff", "woff2"] }] })

  if (!path) return null

  const font = { family: familyOf(path), path }

  if (!(await loadFont(font))) return null

  useEditor.getState().addFont(font)

  return font.family
}