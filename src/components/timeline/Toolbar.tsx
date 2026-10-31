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
import { useT } from "../../lib/i18n"
import { MOD } from "../../lib/platform"
import { MAX_ZOOM, MIN_ZOOM, useEditor } from "../../store/editor"
import { canLinkSelection, detachableClips, hasLinkedSelection, mergeableRuns } from "../../store/selectors"
import { Button, Tip } from "../ui"

export function Toolbar({ onFit }: { onFit: () => void }) {
  const t = useT()
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
      <Tip label={t("timeline.splitTip")} kbd="S">
        <Button variant="quiet" icon={SquareSplitHorizontalIcon} onClick={splitAtPlayhead} disabled={!hasClips}>
          {t("timeline.split")}
        </Button>
      </Tip>
      <Tip label={t("timeline.detachTip")} kbd="A">
        <Button variant="quiet" icon={AudioWave01Icon} onClick={detachAudio} disabled={!canDetach}>
          {t("timeline.detach")}
        </Button>
      </Tip>
      {canLink || !canUnlink ? (
        <Tip label={t("timeline.linkTip")} kbd={`${MOD} L`}>
          <Button variant="quiet" icon={Link01Icon} onClick={linkSelected} disabled={!canLink}>
            {t("timeline.link")}
          </Button>
        </Tip>
      ) : (
        <Tip label={t("timeline.unlinkTip")} kbd={`${MOD} ⇧ L`}>
          <Button variant="quiet" icon={Unlink01Icon} onClick={unlinkSelected}>
            {t("timeline.unlink")}
          </Button>
        </Tip>
      )}
      <Tip label={t("timeline.mergeTip")} kbd="M">
        <Button variant="quiet" icon={CombineIcon} onClick={mergeSelected} disabled={!canMerge}>
          {t("timeline.merge")}
        </Button>
      </Tip>
      <Tip label={t("common.delete")} kbd="Del">
        <Button variant="quiet" icon={Delete02Icon} onClick={deleteSelected} disabled={!hasSelection}>
          {t("common.delete")}
        </Button>
      </Tip>
      <Tip label={t("timeline.addTitle")} kbd="T">
        <Button variant="quiet" icon={TextIcon} onClick={addTitle}>
          {t("timeline.title")}
        </Button>
      </Tip>
      <div className="flex-1" />
      <Tip label={t(snapping ? "timeline.snappingOn" : "timeline.snappingOff")} kbd="N">
        <Button variant="quiet" icon={Magnet01Icon} active={snapping} onClick={toggleSnapping} aria-pressed={snapping} aria-label={t("timeline.snapping")} />
      </Tip>
      <Tip label={t("timeline.fit")}>
        <Button variant="quiet" icon={FitToScreenIcon} onClick={onFit} disabled={!hasClips} aria-label={t("timeline.fit")} />
      </Tip>
      <div className="mx-1 h-5 w-px bg-border" />
      <Tip label={t("timeline.zoomOut")} kbd="−">
        <Button variant="quiet" icon={ZoomOutAreaIcon} onClick={() => setZoom(pps / 1.5)} aria-label={t("timeline.zoomOut")} />
      </Tip>
      <input
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={toSlider(pps)}
        onChange={(e) => setZoom(fromSlider(Number(e.target.value)))}
        aria-label={t("timeline.zoom")}
        className="h-1 w-28 accent-primary"
      />
      <Tip label={t("timeline.zoomIn")} kbd="+">
        <Button variant="quiet" icon={ZoomInAreaIcon} onClick={() => setZoom(pps * 1.5)} aria-label={t("timeline.zoomIn")} />
      </Tip>
    </div>
  )
}