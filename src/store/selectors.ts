import { canDetachAudio, continues, linkedWith } from "../lib/clips"
import type { Clip } from "../types"
import type { EditorState } from "./editor"

type Selection = Pick<EditorState, "clips" | "selectedClipIds">

export const isDirty = (s: EditorState) =>
  s.saved.name !== s.projectName ||
  s.saved.tracks !== s.tracks ||
  s.saved.clips !== s.clips ||
  s.saved.markers !== s.markers ||
  s.saved.settings !== s.settings ||
  s.saved.mediaRevision !== s.mediaRevision

export const liveMedia = (s: Pick<EditorState, "media" | "removedMediaIds">) => s.media.filter((m) => !s.removedMediaIds.includes(m.id))

export const selectedClips = (s: Selection) => s.clips.filter((c) => s.selectedClipIds.includes(c.id))

export function canLinkSelection(s: Selection) {
  const picked = selectedClips(s)
  return picked.length > 1 && !picked.every((c) => c.linkId && c.linkId === picked[0].linkId)
}

export const hasLinkedSelection = (s: Selection) => selectedClips(s).some((c) => linkedWith(s.clips, c).length > 0)

/**
 * Runs of clips the selection can merge. One selected clip on a track reaches
 * both neighbors; with several, only the selected ones join.
 */
export function mergeableRuns(s: Pick<EditorState, "clips" | "media" | "tracks" | "selectedClipIds" | "settings">): Clip[][] {
  const selected = new Set(s.selectedClipIds)
  const runs: Clip[][] = []
  for (const track of s.tracks) {
    if (track.locked) continue
    const onTrack = s.clips.filter((c) => c.trackId === track.id).sort((a, b) => a.start - b.start)
    const single = onTrack.filter((c) => selected.has(c.id)).length === 1
    let run: Clip[] = []
    const flush = () => {
      if (run.length > 1 && run.some((c) => selected.has(c.id))) runs.push(run)
    }
    for (const c of onTrack) {
      const last = run[run.length - 1]
      if (last && continues(last, c, s.media, s.settings.fps) && (single || (selected.has(last.id) && selected.has(c.id)))) {
        run.push(c)
      } else {
        flush()
        run = [c]
      }
    }
    flush()
  }
  return runs
}

export function detachableClips(s: Pick<EditorState, "clips" | "media" | "tracks" | "selectedClipIds">): Clip[] {
  return selectedClips(s).filter((c) => canDetachAudio(c, s.media.find((m) => m.id === c.mediaId)) && !s.tracks.find((t) => t.id === c.trackId)?.locked)
}