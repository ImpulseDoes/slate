import {
  AudioWave01Icon,
  ClipboardPasteIcon,
  CombineIcon,
  Copy01Icon,
  CopyPlusIcon,
  Cursor01Icon,
  Delete02Icon,
  FitToScreenIcon,
  Link01Icon,
  Magnet01Icon,
  Refresh01Icon,
  Scissor01Icon,
  SquareLock02Icon,
  SquareSplitHorizontalIcon,
  SquareUnlock02Icon,
  TextIcon,
  Unlink01Icon,
  ViewIcon,
  ViewOffSlashIcon,
  VolumeHighIcon,
  VolumeMute02Icon,
} from "@hugeicons/core-free-icons"
import { canDetachAudio, clipEnd } from "../../lib/clips"
import { MOD } from "../../lib/platform"
import { useEditor } from "../../store/editor"
import { openMenu, type MenuEntry } from "../../store/overlays"
import { canLinkSelection, hasLinkedSelection, mergeableRuns } from "../../store/selectors"
import type { Clip, Track } from "../../types"

export function clipMenu(e: React.MouseEvent, clip: Clip, locked: boolean) {
  const s = useEditor.getState()
  if (!s.selectedClipIds.includes(clip.id)) s.selectClip(clip.id)
  const now = useEditor.getState()
  const links: MenuEntry[] = [
    ...(canLinkSelection(now) ? [{ label: "Link clips", icon: Link01Icon, kbd: `${MOD} L`, onSelect: s.linkSelected }] : []),
    ...(hasLinkedSelection(now) ? [{ label: "Unlink", icon: Unlink01Icon, kbd: `${MOD} ⇧ L`, onSelect: s.unlinkSelected }] : []),
  ]
  const underPlayhead = s.playhead > clip.start && s.playhead < clipEnd(clip)
  const media = s.media.find((m) => m.id === clip.mediaId)
  const audio: MenuEntry[] = clip.audioDetached
    ? [{ label: "Restore clip audio", icon: VolumeHighIcon, disabled: locked, onSelect: () => s.restoreAudio(clip.id) }]
    : clip.type === "video" && media?.kind === "video"
      ? [{ label: "Detach audio", icon: AudioWave01Icon, kbd: "A", disabled: locked || !canDetachAudio(clip, media), onSelect: s.detachAudio }]
      : []
  openMenu(e, [
    { label: "Cut", icon: Scissor01Icon, kbd: `${MOD} X`, disabled: locked, onSelect: s.cutSelected },
    { label: "Copy", icon: Copy01Icon, kbd: `${MOD} C`, onSelect: s.copySelected },
    { label: "Duplicate", icon: CopyPlusIcon, kbd: `${MOD} D`, disabled: locked, onSelect: s.duplicateSelected },
    "divider",
    { label: "Split at playhead", icon: SquareSplitHorizontalIcon, kbd: "S", disabled: locked || !underPlayhead, onSelect: s.splitAtPlayhead },
    { label: "Merge clips", icon: CombineIcon, kbd: "M", disabled: locked || !mergeableRuns(now).length, onSelect: s.mergeSelected },
    ...audio,
    ...links,
    ...(clip.type === "audio" ? [] : [{ label: "Reset transform", icon: Refresh01Icon, disabled: locked, onSelect: () => s.resetTransform(clip.id) }]),
    "divider",
    { label: "Delete", icon: Delete02Icon, kbd: "Del", danger: true, disabled: locked, onSelect: s.deleteSelected },
  ])
}

export function laneMenu(e: React.MouseEvent, track: Track, at: number, fit: () => void) {
  const s = useEditor.getState()
  const title: MenuEntry[] = track.kind === "video" ? [{ label: "Add title here", icon: TextIcon, disabled: track.locked, onSelect: () => s.insertClip(null, track.id, at) }] : []
  openMenu(e, [
    { label: "Paste here", icon: ClipboardPasteIcon, kbd: `${MOD} V`, disabled: !s.clipboard.length, onSelect: () => s.pasteAt(at) },
    ...title,
    { label: "Move playhead here", icon: Cursor01Icon, onSelect: () => s.setPlayhead(at) },
    "divider",
    { label: "Snapping", icon: Magnet01Icon, kbd: "N", checked: s.snapping, onSelect: s.toggleSnapping },
    { label: "Fit timeline to window", icon: FitToScreenIcon, disabled: !s.clips.length, onSelect: fit },
  ])
}

export function trackMenu(e: React.MouseEvent, track: Track) {
  const s = useEditor.getState()
  const visual = track.kind === "video"
  openMenu(e, [
    ...(visual ? [{ label: track.hidden ? "Show track" : "Hide track", icon: track.hidden ? ViewIcon : ViewOffSlashIcon, onSelect: () => s.toggleTrack(track.id, "hidden") }] : []),
    { label: track.muted ? "Unmute track" : "Mute track", icon: track.muted ? VolumeHighIcon : VolumeMute02Icon, onSelect: () => s.toggleTrack(track.id, "muted") },
    { label: track.locked ? "Unlock track" : "Lock track", icon: track.locked ? SquareUnlock02Icon : SquareLock02Icon, onSelect: () => s.toggleTrack(track.id, "locked") },
    "divider",
    { label: "Clear track", icon: Delete02Icon, danger: true, disabled: track.locked || !s.clips.some((c) => c.trackId === track.id), onSelect: () => s.clearTrack(track.id) },
  ])
}