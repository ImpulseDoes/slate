import { SquareLock02Icon, SquareUnlock02Icon, ViewIcon, ViewOffSlashIcon, VolumeHighIcon, VolumeMute02Icon } from "@hugeicons/core-free-icons"
import { useT } from "../../lib/i18n"
import { useEditor } from "../../store/editor"
import type { Track } from "../../types"
import { Button, Tip } from "../ui"
import { HEADER_W } from "./layout"

export function TrackHeader({ track, onContextMenu }: { track: Track; onContextMenu: (e: React.MouseEvent) => void }) {
  const t = useT()
  const toggle = useEditor((s) => s.toggleTrack)
  const visual = track.kind === "video"
  const off = visual ? track.hidden : track.muted
  return (
    <div onContextMenu={onContextMenu} className="sticky left-0 z-20 flex shrink-0 items-center gap-0.5 border-r border-border bg-surface pr-1.5 pl-4" style={{ width: HEADER_W }}>
      <span className="flex-1 text-h-sm font-semibold text-fg">{track.name}</span>
      <Tip label={t(visual ? (off ? "track.show" : "track.hide") : off ? "track.unmute" : "track.mute")}>
        <Button
          variant="quiet"
          aria-pressed={off}
          aria-label={t(visual ? "track.toggleVisibility" : "track.toggleMute")}
          icon={visual ? (off ? ViewOffSlashIcon : ViewIcon) : off ? VolumeMute02Icon : VolumeHighIcon}
          active={off}
          onClick={() => toggle(track.id, visual ? "hidden" : "muted")}
        />
      </Tip>
      <Tip label={t(track.locked ? "track.unlock" : "track.lock")}>
        <Button
          variant="quiet"
          aria-pressed={track.locked}
          aria-label={t("track.toggleLock")}
          icon={track.locked ? SquareLock02Icon : SquareUnlock02Icon}
          active={track.locked}
          onClick={() => toggle(track.id, "locked")}
        />
      </Tip>
    </div>
  )
}