import { useEditor } from "../store/editor"
import { notify } from "../store/overlays"
import type { Clip, Keyframe, Keyframes, MediaItem, ProjectSettings } from "../types"
import { coverRegion } from "./animation"
import { t } from "./i18n"

export const VERTICAL = { width: 1080, height: 1920 }

export type Layout = "stack" | "even" | "corner"

const FACECAM_SHARE: Record<Exclude<Layout, "corner">, number> = { stack: 1 / 3, even: 1 / 2 }
const CORNER_WIDTH = 0.42
const CORNER_MARGIN = 0.04

const isFootage = (c: Clip, media?: MediaItem): media is MediaItem => c.type === "video" && !!media?.width

export const isVertical = ({ width, height }: ProjectSettings) => height > width

const shifted = (keys: Keyframe[], value: (old: number) => number) => keys.map((k) => ({ ...k, value: value(k.value) }))

/** Moves a pan or a zoom to where the clip now sits, so it plays the same in the new frame. The tightest moment fills it. */
function reframedKeys(clip: Clip, media: MediaItem, before: ProjectSettings, after: ProjectSettings, to: { x: number; y: number; scale: number }): Keyframes | undefined {

  const { keys } = clip

  if (!keys) return undefined

  const widest = keys.scale ? Math.min(...keys.scale.map((k) => k.value)) : clip.props.scale
  const fit = (s: ProjectSettings) => Math.min(s.width / media.width, s.height / media.height)
  const picture = (to.scale * fit(after)) / (widest * fit(before))

  return {
    ...keys,
    ...(keys.x && { x: shifted(keys.x, (v) => to.x + (v - keys.x![0].value) * picture) }),
    ...(keys.y && { y: shifted(keys.y, (v) => to.y + (v - keys.y![0].value) * picture) }),
    ...(keys.scale && { scale: shifted(keys.scale, (v) => (v * to.scale) / widest) }),
  }
}

/** Turns the project upright, with every piece of footage filling the frame. Drag a clip in the viewer to pick what stays in shot. */
export function reframeToVertical() {

  useEditor.getState().transact((s) => {

    const settings = { ...s.settings, ...VERTICAL }

    return {
      settings,
      clips: s.clips.map((c) => {
        const media = s.media.find((m) => m.id === c.mediaId)
        if (!isFootage(c, media)) return c
        const { props } = coverRegion(media.width, media.height, settings.width, settings.height, { x: 0, y: 0, ...VERTICAL })
        return { ...c, crop: undefined, keys: reframedKeys(c, media, s.settings, settings, props), props: { ...c.props, ...props } }
      }),
    }
  })
}

/** Where the two parts of a layout sit on a canvas. */
export function layoutRegions(layout: Layout, width: number, height: number) {

  if (layout === "corner") {
    const margin = Math.round(width * CORNER_MARGIN)
    const size = Math.round(width * CORNER_WIDTH)
    return {
      gameplay: { x: 0, y: 0, width, height },
      facecam: { x: width - size - margin, y: margin, width: size, height: Math.round((size * 9) / 16) },
    }
  }

  const split = Math.round(height * FACECAM_SHARE[layout])

  return {
    gameplay: { x: 0, y: split, width, height: height - split },
    facecam: { x: 0, y: 0, width, height: split },
  }
}

/** Clips playing at the same moment that a layout can be built from, bottom track first. */
export function layoutCandidates(clips: Clip[], media: MediaItem[], at: number) {
  return clips.filter((c) => isFootage(c, media.find((m) => m.id === c.mediaId)) && c.start <= at && c.start + c.duration > at)
}

/** A part of a layout has to stay inside its region, so only keys that don't move the picture carry over. */
function layoutKeys(keys: Keyframes | undefined) {

  const { opacity, volume } = keys ?? {}
  const kept = { ...(opacity && { opacity }), ...(volume && { volume }) }

  return Object.keys(kept).length ? kept : undefined
}

export function applyLayout(layout: Layout, gameplayId: string, facecamId: string) {

  const moving = useEditor.getState().clips.some((c) => (c.id === gameplayId || c.id === facecamId) && (c.keys?.x || c.keys?.y || c.keys?.scale || c.keys?.rotation))

  useEditor.getState().transact((s) => {

    const { width, height } = s.settings
    const regions = layoutRegions(layout, width, height)
    const place = (c: Clip, region: typeof regions.gameplay): Clip => {
      const media = s.media.find((m) => m.id === c.mediaId)
      if (!media) return c
      const { props, crop } = coverRegion(media.width, media.height, width, height, region)
      return { ...c, crop, keys: layoutKeys(c.keys), props: { ...c.props, ...props } }
    }

    return {
      clips: s.clips.map((c) => (c.id === gameplayId ? place(c, regions.gameplay) : c.id === facecamId ? place(c, regions.facecam) : c)),
    }
  })

  if (moving) notify(t("vertical.motionDropped"))
}