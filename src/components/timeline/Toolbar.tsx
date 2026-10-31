import {
  AudioWave01Icon,
  CombineIcon,
  Delete02Icon,
  FitToScreenIcon,
  Link01Icon,
  Magnet01Icon,
  SquareSplitHorizontalIcon,
  TextIcon,
  Unlink01Icon,
  ZoomInAreaIcon,
  ZoomOutAreaIcon,
} from "@hugeicons/core-free-icons"
import { MOD } from "../../lib/platform"
import { MAX_ZOOM, MIN_ZOOM, useEditor } from "../../store/editor"
import { canLinkSelection, detachableClips, hasLinkedSelection, mergeableRuns } from "../../store/selectors"
import { Button, Tip } from "../ui"

export function Toolbar({ onFit }: { onFit: () => void }) {
  const snapping = useEditor((s) => s.snapping)
  const pps = useEditor((s) => s.pxPerSec)
  const hasSelection = useEditor((s) => s.selectedClipIds.length > 0)
  const hasClips = useEditor((s) => s.clips.length > 0)
  const canDetach = useEditor((s) => detachableClips(s).length > 0)
  const canLink = useEditor(canLinkSelection)
  const canUnlink = useEditor(hasLinkedSelection)
  const canMerge = useEditor((s) => mergeableRuns(s).length > 0)
  const { splitAtPlayhead, detachAudio, linkSelected, unlinkSelected, mergeSelected, deleteSelected, addTitle, toggleSnapping, setZoom } = useEditor.getState()
  const toSlider = (v: number) => Math.log(v / MIN_ZOOM) / Math.log(MAX_ZOOM / MIN_ZOOM)
  const fromSlider = (v: number) => MIN_ZOOM * Math.pow(MAX_ZOOM / MIN_ZOOM, v)

  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-3">
      <Tip label="Split at playhead" kbd="S">
        <Button variant="quiet" icon={SquareSplitHorizontalIcon} onClick={splitAtPlayhead} disabled={!hasClips}>
          Split
        </Button>
      </Tip>
      <Tip label="Move the sound to its own track" kbd="A">
        <Button variant="quiet" icon={AudioWave01Icon} onClick={detachAudio} disabled={!canDetach}>
          Detach audio
        </Button>
      </Tip>
      {canLink || !canUnlink ? (
        <Tip label="Cut and move these clips together" kbd={`${MOD} L`}>
          <Button variant="quiet" icon={Link01Icon} onClick={linkSelected} disabled={!canLink}>
            Link
          </Button>
        </Tip>
      ) : (
        <Tip label="Let these clips move on their own" kbd={`${MOD} ⇧ L`}>
          <Button variant="quiet" icon={Unlink01Icon} onClick={unlinkSelected}>
            Unlink
          </Button>
        </Tip>
      )}
      <Tip label="Rejoin clips cut from the same source" kbd="M">
        <Button variant="quiet" icon={CombineIcon} onClick={mergeSelected} disabled={!canMerge}>
          Merge
        </Button>
      </Tip>
      <Tip label="Delete" kbd="Del">
        <Button variant="quiet" icon={Delete02Icon} onClick={deleteSelected} disabled={!hasSelection}>
          Delete
        </Button>
      </Tip>
      <Tip label="Add title at playhead" kbd="T">
        <Button variant="quiet" icon={TextIcon} onClick={addTitle}>
          Title
        </Button>
      </Tip>
      <div className="flex-1" />
      <Tip label={snapping ? "Snapping on" : "Snapping off"} kbd="N">
        <Button variant="quiet" icon={Magnet01Icon} active={snapping} onClick={toggleSnapping} aria-pressed={snapping} aria-label="Snapping" />
      </Tip>
      <Tip label="Fit timeline to window">
        <Button variant="quiet" icon={FitToScreenIcon} onClick={onFit} disabled={!hasClips} aria-label="Fit timeline to window" />
      </Tip>
      <div className="mx-1 h-5 w-px bg-border" />
      <Tip label="Zoom out" kbd="−">
        <Button variant="quiet" icon={ZoomOutAreaIcon} onClick={() => setZoom(pps / 1.5)} aria-label="Zoom out" />
      </Tip>
      <input
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={toSlider(pps)}
        onChange={(e) => setZoom(fromSlider(Number(e.target.value)))}
        aria-label="Zoom"
        className="h-1 w-28 accent-primary"
      />
      <Tip label="Zoom in" kbd="+">
        <Button variant="quiet" icon={ZoomInAreaIcon} onClick={() => setZoom(pps * 1.5)} aria-label="Zoom in" />
      </Tip>
    </div>
  )
}