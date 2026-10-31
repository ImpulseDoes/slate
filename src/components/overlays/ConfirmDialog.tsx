import { Delete02Icon } from "@hugeicons/core-free-icons"
import type { ConfirmState } from "../../store/overlays"
import { Button } from "../ui"
import { Modal } from "./Modal"

export function ConfirmDialog({ title, body, action, onConfirm, onClose, tone = "danger", cancelLabel = "Cancel", onCancel, alternate }: ConfirmState & { onClose: () => void }) {
  return (
    <Modal
      title={title}
      labelId="confirm-title"
      onClose={onClose}
      footer={
        <>
          {alternate && (
            <Button
              className="mr-auto"
              onClick={() => {
                onClose()
                alternate.onSelect()
              }}
            >
              {alternate.label}
            </Button>
          )}
          <Button
            onClick={() => {
              onClose()
              onCancel?.()
            }}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={tone}
            icon={tone === "danger" ? Delete02Icon : undefined}
            autoFocus
            onClick={() => {
              onClose()
              onConfirm()
            }}
          >
            {action}
          </Button>
        </>
      }
    >
      <p className="text-h-sm leading-snug font-normal text-label">{body}</p>
    </Modal>
  )
}