import { revealItemInDir } from "@tauri-apps/plugin-opener"
import { Add01Icon, AlertCircleIcon, Clock01Icon, Delete02Icon, FileImportIcon, FolderOpenIcon, Image01Icon, MusicNote01Icon } from "@hugeicons/core-free-icons"
import { useShallow } from "zustand/react/shallow"
import { clipTypeForMedia, liveMedia, trackKindFor, useEditor, useMediaDrag } from "../store/editor"
import { pickAndImport } from "../lib/media"
import { shortDuration } from "../lib/time"
import { isTauri, MOD } from "../lib/platform"
import type { MediaItem } from "../types"
import { confirmAction, openMenu, type MenuEntry } from "./overlays"
import { Button, Icon, StatusTag, Tip, TypeChip } from "./ui"

export function MediaBin({ dropActive }: { dropActive: boolean }) {

  const media = useEditor(useShallow(liveMedia))

  return (
    <section
      onContextMenu={(e) => openMenu(e, [{ label: "Import media", icon: FileImportIcon, kbd: `${MOD} I`, onSelect: () => void pickAndImport() }])}
      className={`flex w-[300px] shrink-0 flex-col rounded-xl bg-surface p-4 shadow-card transition-[outline-color] ${dropActive ? "outline-2 outline-primary" : "outline-2 outline-transparent"}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-h-md font-semibold">Media</h2>
        <Tip label="Import media" kbd={`${MOD} I`} side="bottom">
          <Button icon={FileImportIcon} onClick={() => void pickAndImport()}>
            Import
          </Button>
        </Tip>
      </div>

      {media.length === 0 ? (
        <EmptyBin />
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between text-small text-muted">
            <span>Footage</span>
            <span className="tnum">{media.length}</span>
          </div>
          <ul className="-mx-1.5 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
            {media.map((m) => (
              <MediaRow key={m.id} item={m} />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function EmptyBin() {
  return (
    <button
      onClick={() => void pickAndImport()}
      className="flex flex-1 flex-col items-center justify-center gap-2.5 rounded-lg border border-dashed border-border-strong px-6 text-center text-body text-label hover:bg-raised hover:text-fg"
    >
      <Icon icon={FileImportIcon} size={24} />
      <span>Drop footage here. We'll keep it tidy.</span>
    </button>
  )
}

function requestRemove(item: MediaItem) {

  const { clips, removeMedia } = useEditor.getState()
  const used = clips.filter((c) => c.mediaId === item.id).length

  if (!used) return removeMedia(item.id)

  confirmAction({
    title: "Remove from project?",
    body: `${item.name} is used by ${used} ${used === 1 ? "clip" : "clips"} on the timeline. ${used === 1 ? "It" : "They"} will be removed too.`,
    action: "Remove",
    onConfirm: () => removeMedia(item.id),
  })
}

function mediaMenu(e: React.MouseEvent, item: MediaItem) {
  useEditor.getState().selectMedia(item.id)
  const reveal: MenuEntry[] = isTauri ? [{ label: "Show in folder", icon: FolderOpenIcon, onSelect: () => void revealItemInDir(item.path) }] : []
  openMenu(e, [
    { label: "Add to timeline", icon: Add01Icon, disabled: item.status !== "ready", onSelect: () => insertAtPlayhead(item) },
    ...reveal,
    "divider",
    { label: "Remove from project", icon: Delete02Icon, danger: true, onSelect: () => requestRemove(item) },
  ])
}

function MediaRow({ item }: { item: MediaItem }) {

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

    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      useMediaDrag.getState().set(null)
      if (dragging) dropOnTimeline(item, ev.clientX, ev.clientY)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
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
        <div className={`truncate ${item.status === "error" ? "text-label" : "text-fg"}`}>{item.name}</div>
        <div className="mt-1 flex items-center gap-2">
          {item.status === "error" ? (
            <Tip label={item.error ?? "This file can't be read."}>
              <StatusTag tone="error" icon={AlertCircleIcon}>
                Error
              </StatusTag>
            </Tip>
          ) : (
            <TypeChip type={item.kind} compact />
          )}
          {item.status === "loading" && <span className="text-small text-muted">Reading…</span>}
          {ready && item.kind !== "image" && (
            <span className="tnum inline-flex items-center gap-1 text-small text-label">
              <Icon icon={Clock01Icon} size={14} />
              {shortDuration(item.duration)}
            </span>
          )}
        </div>
      </div>
      <button
        aria-label={`Remove ${item.name}`}
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

/** Drop a dragged media item onto whichever track lane is under the pointer. */
function dropOnTimeline(item: MediaItem, x: number, y: number) {
  const lane = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-track-id]")
  if (!lane) return
  const { pxPerSec, insertClip } = useEditor.getState()
  const rect = lane.getBoundingClientRect()
  insertClip(item.id, lane.dataset.trackId!, (x - rect.left) / pxPerSec)
}

function insertAtPlayhead(item: MediaItem) {

  const { tracks, playhead, insertClip } = useEditor.getState()
  const kind = trackKindFor(clipTypeForMedia(item))
  // Bottom-most unlocked track of the right kind: V1 for video, A1 for audio.
  const candidates = tracks.filter((t) => t.kind === kind && !t.locked)
  const track = kind === "video" ? candidates[candidates.length - 1] : candidates[0]

  if (track) insertClip(item.id, track.id, playhead)
}