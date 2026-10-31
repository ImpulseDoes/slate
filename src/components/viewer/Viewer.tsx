import { Stage } from "./Stage"
import { Transport } from "./Transport"

export function Viewer() {
  return (
    <section className="flex min-w-0 flex-1 flex-col gap-2">
      <Stage />
      <Transport />
    </section>
  )
}