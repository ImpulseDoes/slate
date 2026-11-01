import { revealItemInDir } from "@tauri-apps/plugin-opener"
import { Add01Icon, AlertCircleIcon, Clock01Icon, Delete02Icon, FileSearchIcon, FolderOpenIcon, Image01Icon, MusicNote01Icon } from "@hugeicons/core-free-icons"
import { clipTypeForMedia, trackKindFor } from "../../lib/clips"
import { t, useT } from "../../lib/i18n"
import { relinkMissing } from "../../lib/media/importer"
import { isTauri } from "../../lib/platform"
import { trackPointer } from "../../lib/pointer"
import { shortDuration, TICKS } from "../../lib/time"
import { useEditor } from "../../store/editor"
import { useMediaDrag } from "../../store/mediaDrag"
import { confirmAction, openMenu, type MenuEntry } from "../../store/overlays"
import type { MediaItem } from "../../types"
import { laneAt } from "../timeline/layout"
import { Icon, StatusTag, Tip, TypeChip } from "../ui"

function requestRemove(item: MediaItem) {

  const { clips, removeMedia } = useEditor.getState()
  const used = clips.filter((c) => c.mediaId === item.id).length

  if (!used) return removeMedia(item.id)

  confirmAction({
    title: t("media.removeTitle"),
    body: t("media.removeBody", { name: item.name, count: used }),
    action: t("common.remove"),
    onConfirm: () => removeMedia(item.id),
  })
}

function mediaMenu(e: React.MouseEvent, item: MediaItem) {
  useEditor.getState().selectMedia(item.id)
  const offline = item.status === "missing"
  const reveal: MenuEntry[] = isTauri && !offline ? [{ label: t("media.showInFolder"), icon: FolderOpenIcon, onSelect: () => void revealItemInDir(item.path) }] : []
  const relink: MenuEntry[] = isTauri && offline ? [{ label: t("media.locateFile"), icon: FileSearchIcon, onSelect: () => void relinkMissing(item) }] : []
  openMenu(e, [
    { label: t("media.addToTimeline"), icon: Add01Icon, disabled: item.status !== "ready", onSelect: () => insertAtPlayhead(item) },
    ...relink,
    ...reveal,
    "divider",
    { label: t("media.removeFromProject"), icon: Delete02Icon, danger: true, onSelect: () => requestRemove(item) },
  ])
}

export function MediaRow({ item }: { item: MediaItem }) {

  const t = useT()
  const selected = useEditor((s) => s.selectedMediaId === item.id)
  const ready = item.status === "ready"

  const onPointerDown = (e: React.PointerEvent) => {

    if (e.button !== 0) return
    useEditor.getState().selectMedia(item.id)
    if (!ready) return

    const startX = e.clientX
    const startY = e.clientY

    let dragging = false

    const move = (ev: PointerEvent) => {

      if (!dragging && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return

      dragging = true

      useMediaDrag.getState().set({ mediaId: item.id, x: ev.clientX, y: ev.clientY })
    }

    trackPointer(move, (ev) => {
      useMediaDrag.getState().set(null)
      if (dragging) dropOnTimeline(item, ev.clientX, ev.clientY)
    })
  }

  return (
    <li
      onPointerDown={onPointerDown}
      onDoubleClick={() => ready && insertAtPlayhead(item)}
      onContextMenu={(e) => mediaMenu(e, item)}
      className={`group flex items-center gap-2.5 rounded-md p-1.5 ${selected ? "bg-primary-highlight" : "hover:bg-raised"}`}
      title={item.path}
    >
      <Thumb item={item} />
      <div className="min-w-0 flex-1">
        <div className={`truncate ${item.status === "error" || item.status === "missing" ? "text-label" : "text-fg"}`}>{item.name}</div>
        <div className="mt-1 flex items-center gap-2">
          {item.status === "missing" ? (
            <Tip label={t("media.notFound", { path: item.path })}>
              <button onClick={() => void relinkMissing(item)} onPointerDown={(e) => e.stopPropagation()}>
                <StatusTag tone="error" icon={FileSearchIcon}>
                  {t("common.locate")}
                </StatusTag>
              </button>
            </Tip>
          ) : item.status === "error" ? (
            <Tip label={item.error ?? t("probe.unreadable")}>
              <StatusTag tone="error" icon={AlertCircleIcon}>
                {t("media.error")}
              </StatusTag>
            </Tip>
          ) : (
            <>
              <TypeChip type={item.kind} compact />
              {item.hdr && (
                <Tip label={t("media.hdrTip")}>
                  <span className="inline-flex h-5 shrink-0 items-center rounded-xs bg-raised px-1 font-semibold text-caps text-label">HDR</span>
                </Tip>
              )}
            </>
          )}
          {item.status === "loading" && <span className="tnum text-small text-muted">{item.progress === undefined ? t("media.reading") : t("media.converting", { percent: Math.round(item.progress * 100) })}</span>}
          {ready && item.kind !== "image" && (
            <span className="tnum inline-flex items-center gap-1 text-small text-label">
              <Icon icon={Clock01Icon} size={14} />
              {shortDuration(item.duration)}
            </span>
          )}
          {ready && item.progress !== undefined && <span className="tnum text-small text-muted">{t("media.preview", { percent: Math.round(item.progress * 100) })}</span>}
        </div>
      </div>
      <button
        aria-label={t("media.removeItem", { name: item.name })}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => requestRemove(item)}
        className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-md text-label group-hover:inline-flex hover:bg-danger-soft hover:text-error"
      >
        <Icon icon={Delete02Icon} />
      </button>
    </li>
  )
}

function Thumb({ item }: { item: MediaItem }) {
  const frame = item.frames[Math.floor(item.frames.length / 2)]
  return (
    <span className="flex h-11 w-[68px] shrink-0 items-center justify-center overflow-hidden rounded-sm bg-raised text-label">
      {frame ? <img src={frame} alt="" className="h-full w-full object-cover" draggable={false} /> : <Icon icon={item.kind === "audio" ? MusicNote01Icon : Image01Icon} size={20} />}
    </span>
  )
}

function dropOnTimeline(item: MediaItem, x: number, y: number) {
  const lane = laneAt(x, y)
  if (!lane) return
  const { pxPerSec, insertClip } = useEditor.getState()
  const rect = lane.getBoundingClientRect()
  insertClip(item.id, lane.dataset.trackId!, ((x - rect.left) / pxPerSec) * TICKS)
}

function insertAtPlayhead(item: MediaItem) {

  const { tracks, playhead, insertClip } = useEditor.getState()
  const kind = trackKindFor(clipTypeForMedia(item))
  // Bottom-most unlocked track of the right kind: V1 for video, A1 for audio.
  const candidates = tracks.filter((t) => t.kind === kind && !t.locked)
  const track = kind === "video" ? candidates[candidates.length - 1] : candidates[0]

  if (track) insertClip(item.id, track.id, playhead)
}