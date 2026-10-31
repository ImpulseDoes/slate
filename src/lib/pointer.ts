export function trackPointer(onMove: (e: PointerEvent) => void, onUp?: (e: PointerEvent) => void) {
  const up = (e: PointerEvent) => {
    window.removeEventListener("pointermove", onMove)
    window.removeEventListener("pointerup", up)
    onUp?.(e)
  }
  window.addEventListener("pointermove", onMove)
  window.addEventListener("pointerup", up)
}
