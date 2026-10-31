import {
  ArrowExpand01Icon,
  AudioWave01Icon,
  ClipboardPasteIcon,
  Flag01Icon,
  CombineIcon,
  Copy01Icon,
  CopyPlusIcon,
  Cursor01Icon,
  Delete02Icon,
  FitToScreenIcon,
  Link01Icon,
  Magnet01Icon,
  MusicNote01Icon,
  PencilEdit02Icon,
  Refresh01Icon,
  Scissor01Icon,
  SquareLock02Icon,
  SquareSplitHorizontalIcon,
  SquareUnlock02Icon,
  TextIcon,
  Unlink01Icon,
  ViewIcon,
  ViewOffSlashIcon,
  Video01Icon,
  VolumeHighIcon,
  VolumeMute02Icon,
} from "@hugeicons/core-free-icons"
import { canDetachAudio, clipEnd } from "../../lib/clips"
import { t } from "../../lib/i18n"
import { MOD } from "../../lib/platform"
import { useEditor } from "../../store/editor"
import { confirmAction, editMarker, openMenu, openMenuBelow, type MenuEntry } from "../../store/overlays"
import { canLinkSelection, hasLinkedSelection, mergeableRuns } from "../../store/selectors"
import type { Clip, Marker, Track } from "../../types"

export function clipMenu(e: React.MouseEvent, clip: Clip, locked: boolean) {
  const s = useEditor.getState()
  if (!s.selectedClipIds.includes(clip.id)) s.selectClip(clip.id)
  const now = useEditor.getState()
  const links: MenuEntry[] = [
    ...(canLinkSelection(now) ? [{ label: t("clip.link"), icon: Link01Icon, kbd: `${MOD} L`, onSelect: s.linkSelected }] : []),
    ...(hasLinkedSelection(now) ? [{ label: t("timeline.unlink"), icon: Unlink01Icon, kbd: `${MOD} ⇧ L`, onSelect: s.unlinkSelected }] : []),
  ]
  const underPlayhead = s.playhead > clip.start && s.playhead < clipEnd(clip)
  const media = s.media.find((m) => m.id === clip.mediaId)
  const audio: MenuEntry[] = clip.audioDetached
    ? [{ label: t("clip.restoreAudio"), icon: VolumeHighIcon, disabled: locked, onSelect: () => s.restoreAudio(clip.id) }]
    : clip.type === "video" && media?.kind === "video"
      ? [{ label: t("timeline.detach"), icon: AudioWave01Icon, kbd: "A", disabled: locked || !canDetachAudio(clip, media), onSelect: s.detachAudio }]
      : []
  openMenu(e, [
    { label: t("clip.cut"), icon: Scissor01Icon, kbd: `${MOD} X`, disabled: locked, onSelect: s.cutSelected },
    { label: t("clip.copy"), icon: Copy01Icon, kbd: `${MOD} C`, onSelect: s.copySelected },
    { label: t("clip.duplicate"), icon: CopyPlusIcon, kbd: `${MOD} D`, disabled: locked, onSelect: s.duplicateSelected },
    "divider",
    { label: t("timeline.splitTip"), icon: SquareSplitHorizontalIcon, kbd: "S", disabled: locked || !underPlayhead, onSelect: s.splitAtPlayhead },
    { label: t("clip.merge"), icon: CombineIcon, kbd: "M", disabled: locked || !mergeableRuns(now).length, onSelect: s.mergeSelected },
    ...audio,
    ...links,
    ...(clip.type === "audio" ? [] : [{ label: t("clip.resetTransform"), icon: Refresh01Icon, disabled: locked, onSelect: () => s.resetTransform(clip.id) }]),
    "divider",
    { label: t("common.delete"), icon: Delete02Icon, kbd: "Del", danger: true, disabled: locked, onSelect: s.deleteSelected },
    { label: t("clip.rippleDelete"), icon: ArrowExpand01Icon, kbd: "⇧ Del", danger: true, disabled: locked, onSelect: s.rippleDelete },
  ])
}

export function addTrackMenu(e: React.MouseEvent) {
  const s = useEditor.getState()
  openMenuBelow(e, [
    { label: t("track.addVideo"), icon: Video01Icon, onSelect: () => s.addTrack("video") },
    { label: t("track.addAudio"), icon: MusicNote01Icon, onSelect: () => s.addTrack("audio") },
  ])
}

export function markerMenu(e: React.MouseEvent, marker: Marker) {
  const s = useEditor.getState()
  openMenu(e, [
    { label: t("marker.edit"), icon: PencilEdit02Icon, onSelect: () => editMarker(marker.id) },
    { label: t("common.delete"), icon: Delete02Icon, danger: true, onSelect: () => s.removeMarker(marker.id) },
  ])
}

export function laneMenu(e: React.MouseEvent, track: Track, at: number, fit: () => void) {
  const s = useEditor.getState()
  const title: MenuEntry[] = track.kind === "video" ? [{ label: t("lane.addTitle"), icon: TextIcon, disabled: track.locked, onSelect: () => s.insertClip(null, track.id, at) }] : []
  const onTrack = s.clips.filter((c) => c.trackId === track.id)
  const inGap = !onTrack.some((c) => c.start <= at && clipEnd(c) > at) && onTrack.some((c) => c.start > at)
  openMenu(e, [
    { label: t("lane.paste"), icon: ClipboardPasteIcon, kbd: `${MOD} V`, disabled: !s.clipboard.length, onSelect: () => s.pasteAt(at) },
    ...title,
    { label: t("lane.movePlayhead"), icon: Cursor01Icon, onSelect: () => s.setPlayhead(at) },
    { label: t("marker.add"), icon: Flag01Icon, kbd: "⇧ M", onSelect: () => s.addMarker(at) },
    { label: t("lane.closeGap"), icon: ArrowExpand01Icon, disabled: track.locked || !inGap, onSelect: () => s.closeGapAt(track.id, at) },
    "divider",
    { label: t("timeline.snapping"), icon: Magnet01Icon, kbd: "N", checked: s.snapping, onSelect: s.toggleSnapping },
    { label: t("timeline.fit"), icon: FitToScreenIcon, disabled: !s.clips.length, onSelect: fit },
  ])
}

export function trackMenu(e: React.MouseEvent, track: Track) {
  const s = useEditor.getState()
  const visual = track.kind === "video"
  const used = s.clips.filter((c) => c.trackId === track.id).length
  const removable = s.tracks.filter((x) => x.kind === track.kind).length > 1
  const remove = () => {
    if (!used) return s.removeTrack(track.id)
    confirmAction({ title: t("track.removeTitle"), body: t("track.removeBody", { name: track.name, count: used }), action: t("common.remove"), onConfirm: () => s.removeTrack(track.id) })
  }
  openMenu(e, [
    ...(visual ? [{ label: t(track.hidden ? "track.show" : "track.hide"), icon: track.hidden ? ViewIcon : ViewOffSlashIcon, onSelect: () => s.toggleTrack(track.id, "hidden") }] : []),
    { label: t(track.muted ? "track.unmute" : "track.mute"), icon: track.muted ? VolumeHighIcon : VolumeMute02Icon, onSelect: () => s.toggleTrack(track.id, "muted") },
    { label: t(track.locked ? "track.unlock" : "track.lock"), icon: track.locked ? SquareUnlock02Icon : SquareLock02Icon, onSelect: () => s.toggleTrack(track.id, "locked") },
    "divider",
    { label: t("track.addVideo"), icon: Video01Icon, onSelect: () => s.addTrack("video") },
    { label: t("track.addAudio"), icon: MusicNote01Icon, onSelect: () => s.addTrack("audio") },
    "divider",
    { label: t("track.clear"), icon: Delete02Icon, danger: true, disabled: track.locked || !used, onSelect: () => s.clearTrack(track.id) },
    { label: t("track.remove"), icon: Delete02Icon, danger: true, disabled: track.locked || !removable, onSelect: remove },
  ])
}