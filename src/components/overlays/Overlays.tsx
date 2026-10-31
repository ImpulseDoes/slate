import { useEffect } from "react"
import { closeConfirm, useOverlays } from "../../store/overlays"
import { ConfirmDialog } from "./ConfirmDialog"
import { ContextMenu } from "./ContextMenu"
import { Notices } from "./Notices"

export function Overlays() {

  const menu = useOverlays((s) => s.menu)
  const confirm = useOverlays((s) => s.confirm)

  useEffect(() => {

    const onContext = (e: MouseEvent) => {

      if (!(e.target as HTMLElement).closest("input, textarea")) e.preventDefault()
    }

    window.addEventListener("contextmenu", onContext)

    return () => window.removeEventListener("contextmenu", onContext)
  }, [])

  return (
    <>
      {menu && <ContextMenu key={`${menu.x},${menu.y}`} {...menu} />}
      {confirm && <ConfirmDialog {...confirm} onClose={closeConfirm} />}
      <Notices />
    </>
  )
}