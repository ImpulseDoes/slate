export const HEADER_W = 128
export const RULER_H = 28
export const TRACK_H = { video: 60, audio: 44 } as const
export const CLIP_LABEL_H = 18

export const laneAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-track-id]")
