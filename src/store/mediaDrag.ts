import { create } from "zustand"

interface MediaDrag {
  mediaId: string
  x: number
  y: number
}
export const useMediaDrag = create<{ drag: MediaDrag | null; set: (d: MediaDrag | null) => void }>((set) => ({
  drag: null,
  set: (drag) => set({ drag }),
}))
