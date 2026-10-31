import { invoke } from "@tauri-apps/api/core"
import { useEditor, type EditorState } from "../../store/editor"
import { notify } from "../../store/overlays"
import { selectedClips } from "../../store/selectors"
import type { Clip, MediaItem } from "../../types"
import { closeSpans, lockedTrackIds, overwriteRange, speedOf } from "../clips"
import { errorText } from "../errors"
import { t } from "../i18n"
import { isTauri } from "../platform"
import { sec, ticks, toFrame } from "../time"
import { duckKeys, loudSpans, silentSpans, volumeFor, type SilenceOptions } from "./analysis"

export const MAX_VOLUME = 400
const SPEECH_TARGET = -16
const SPEECH_THRESHOLD = 0.08
export const DEFAULT_SILENCE: SilenceOptions = { threshold: 0.06, minimum: ticks(0.6), padding: ticks(0.12) }
const DUCK = { level: 0.25, fade: ticks(0.35) }

export const hasSound = (clip: Clip, media?: MediaItem) => !clip.audioDetached && clip.type !== "text" && !!media && media.kind !== "image" && media.hasAudio !== false

function withPeaks(s: Pick<EditorState, "media">, clips: Clip[]) {
  return clips.flatMap((clip) => {
    const media = s.media.find((m) => m.id === clip.mediaId)
    return hasSound(clip, media) && media?.peaks?.length ? [{ clip, peaks: media.peaks }] : []
  })
}

export const selectedWithPeaks = (s: Pick<EditorState, "clips" | "media" | "selectedClipIds">) => withPeaks(s, selectedClips(s))

export const canUseSoundTools = (s: EditorState) => selectedWithPeaks(s).length > 0

/** Cuts the quiet stretches out of the selection and closes the gaps, keeping every track in sync. */
export function cutSilence(options: SilenceOptions = DEFAULT_SILENCE) {

  const state = useEditor.getState()
  const spans = silentSpans(selectedWithPeaks(state), options)
    .map(([s, e]): [number, number] => [toFrame(s, state.settings.fps), toFrame(e, state.settings.fps)])
    .filter(([s, e]) => e > s)

  if (!spans.length) {
    notify(t("tools.noSilence"))
    return
  }

  const locked = lockedTrackIds(state.tracks)
  const tracks = [...new Set(selectedClips(state).map((c) => c.trackId))].filter((id) => !locked.has(id))

  state.transact((s) => {
    const cleared = spans.reduce((clips, [from, to]) => tracks.reduce((all, id) => overwriteRange(all, id, from, to), clips), s.clips)
    return { ...closeSpans(cleared, s.markers, spans, locked), selectedClipIds: [] }
  })

  notify(t("tools.silenceCut", { count: spans.length, seconds: Math.round(sec(spans.reduce((sum, [s, e]) => sum + e - s, 0))) }))
}

/** Dips the selected music wherever someone talks on the other tracks. */
export function duckSelected() {

  const state = useEditor.getState()
  const music = selectedClips(state).filter((c) => hasSound(c, state.media.find((m) => m.id === c.mediaId)))
  const ids = new Set(music.map((c) => c.id))
  const audioTracks = new Set(state.tracks.filter((t) => t.kind === "audio" && !t.muted).map((t) => t.id))
  const others = state.clips.filter((c) => !ids.has(c.id))
  const voice = withPeaks(state, others.filter((c) => audioTracks.has(c.trackId)))
  const speech = (voice.length ? voice : withPeaks(state, others)).flatMap(({ clip, peaks }) => loudSpans(clip, peaks, SPEECH_THRESHOLD))

  if (!music.length || !speech.length) {
    notify(t("tools.noSpeech"), "error")
    return
  }

  state.transact((s) => ({
    clips: s.clips.map((c) => (ids.has(c.id) ? { ...c, keys: { ...c.keys, volume: duckKeys(c, speech, DUCK) } } : c)),
  }))
}

/** Evens out the loudness of the selection, by real measurement rather than by peaks. */
export async function normalizeSelected() {

  if (!isTauri) {
    notify(t("export.needsDesktop"), "error")
    return
  }

  const state = useEditor.getState()
  const picked = selectedClips(state).flatMap((clip) => {
    const media = state.media.find((m) => m.id === clip.mediaId)
    return media && hasSound(clip, media) ? [{ clip, media }] : []
  })

  try {

    const measured = await Promise.all(
      picked.map(({ clip, media }) =>
        invoke<number | null>("media_loudness", { path: media.path, audioStream: media.audioStream ?? null, start: sec(clip.offset), duration: sec(clip.duration * speedOf(clip)) }),
      ),
    )
    const volumes = new Map(picked.flatMap(({ clip }, i) => (measured[i] === null ? [] : [[clip.id, volumeFor(measured[i]!, SPEECH_TARGET, MAX_VOLUME)] as const])))

    if (!volumes.size) {
      notify(t("tools.nothingToLevel"), "error")
      return
    }

    useEditor.getState().transact((s) => ({
      clips: s.clips.map((c) => {
        const volume = volumes.get(c.id)
        if (volume === undefined) return c
        const ratio = volume / Math.max(1, c.props.volume)
        const keys = c.keys?.volume && { ...c.keys, volume: c.keys.volume.map((k) => ({ ...k, value: k.value * ratio })) }
        return { ...c, props: { ...c.props, volume }, keys: keys ?? c.keys }
      }),
    }))

    notify(t("tools.leveled", { count: volumes.size }))

  } catch (err) {
    notify(errorText(err), "error")
  }
}