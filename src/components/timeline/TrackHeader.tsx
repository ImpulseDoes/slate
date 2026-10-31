import { SquareLock02Icon, SquareUnlock02Icon, ViewIcon, ViewOffSlashIcon, VolumeHighIcon, VolumeMute02Icon } from "@hugeicons/core-free-icons"
import { useEditor } from "../../store/editor"
import type { Track } from "../../types"
import { Button, Tip } from "../ui"
import { HEADER_W } from "./layout"

export function TrackHeader({ track, onContextMenu }: { track: Track; onContextMenu: (e: React.MouseEvent) => void }) {
  const toggle = useEditor((s) => s.toggleTrack)
  const visual = track.kind === "video"
  const off = visual ? track.hidden : track.muted
  return (
    <div onContextMenu={onContextMenu} className="sticky left-0 z-20 flex shrink-0 items-center gap-0.5 border-r border-border bg-surface pr-1.5 pl-4" style={{ width: HEADER_W }}>
      <span className="flex-1 text-h-sm font-semibold text-fg">{track.name}</span>
      <Tip label={visual ? (off ? "Show track" : "Hide track") : off ? "Unmute track" : "Mute track"}>
        <Button
          variant="quiet"
          aria-pressed={off}
          aria-label={visual ? "Toggle visibility" : "Toggle mute"}
          icon={visual ? (off ? ViewOffSlashIcon : ViewIcon) : off ? VolumeMute02Icon : VolumeHighIcon}
          active={off}
          onClick={() => toggle(track.id, visual ? "hidden" : "muted")}
        />
      </Tip>
      <Tip label={track.locked ? "Unlock track" : "Lock track"}>
        <Button
          variant="quiet"
          aria-pressed={track.locked}
          aria-label="Toggle lock"
          icon={track.locked ? SquareLock02Icon : SquareUnlock02Icon}
          active={track.locked}
          onClick={() => toggle(track.id, "locked")}
        />
      </Tip>
    </div>
  )
}
