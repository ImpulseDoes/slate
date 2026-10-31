import { useEditor } from "../../store/editor"
import { ClipInspector } from "./ClipInspector"
import { ProjectInspector } from "./ProjectInspector"

export function Inspector() {

  // Clicking a linked clip selects its partners too, and that still counts as one clip to edit.
  const clip = useEditor((s) => {
    const first = s.clips.find((c) => c.id === s.selectedClipIds[0])
    const one = s.selectedClipIds.length === 1 || (first?.linkId && s.selectedClipIds.every((id) => s.clips.find((c) => c.id === id)?.linkId === first.linkId))
    return one ? first : undefined
  })
  const count = useEditor((s) => s.selectedClipIds.length)
  const media = useEditor((s) => s.media.find((m) => m.id === clip?.mediaId))

  return (
    <aside className="flex w-[320px] shrink-0 flex-col overflow-y-auto rounded-xl bg-surface p-4 shadow-card">
      {clip ? <ClipInspector clip={clip} media={media} /> : <ProjectInspector multi={count > 1 ? count : 0} />}
    </aside>
  )
}