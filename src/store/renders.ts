import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { create } from "zustand"
import type { RenderPlan } from "../lib/render"
import { uid } from "../lib/platform"

export type RenderStatus = "queued" | "running" | "done" | "failed" | "cancelled"

export interface RenderJob {
  id: string
  name: string
  output: string
  status: RenderStatus
  /** 0 to 1 across every step. */
  progress: number
  error?: string
  startedAt?: number
  finishedAt?: number
  plan: RenderPlan
  /** Title images, written beside the plan's own files. */
  images: { name: string; bytes: number[] }[]
}

interface RendersState {
  jobs: RenderJob[]
  enqueue: (job: Pick<RenderJob, "name" | "output" | "plan" | "images">) => void
  cancel: (id: string) => void
  /** Take a finished job off the list. */
  dismiss: (id: string) => void
  clearFinished: () => void
}

export const runningRenders = (s: Pick<RendersState, "jobs">) => s.jobs.filter((j) => j.status === "running" || j.status === "queued").length

/** Time left in seconds, once enough has passed to judge. */
export function timeLeft(job: RenderJob, now: number): number | null {
  if (job.status !== "running" || !job.startedAt || job.progress < 0.02) return null
  const elapsed = now - job.startedAt
  return (elapsed / job.progress - elapsed) / 1000
}

const patch = (id: string, change: Partial<RenderJob>) =>
  useRenders.setState((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...change } : j)) }))

/** One at a time: every render already uses all the cores it can get. */
async function runNext() {
  const { jobs } = useRenders.getState()
  if (jobs.some((j) => j.status === "running")) return
  const job = jobs.find((j) => j.status === "queued")
  if (!job) return
  patch(job.id, { status: "running", startedAt: Date.now() })
  try {
    await invoke("render_start", {
      job: {
        id: job.id,
        steps: job.plan.steps,
        files: [...job.plan.files, ...job.images],
        result: job.plan.result,
        output: job.output,
      },
    })
    patch(job.id, { status: "done", progress: 1, finishedAt: Date.now() })
  } catch (err) {
    const error = String(err)
    if (error === "cancelled") patch(job.id, { status: "cancelled", finishedAt: Date.now() })
    else patch(job.id, { status: "failed", error, finishedAt: Date.now() })
  }
  void runNext()
}

export const useRenders = create<RendersState>((set, get) => ({
  jobs: [],

  enqueue: (job) => {
    set((s) => ({ jobs: [...s.jobs, { ...job, id: uid().replace(/\W/g, ""), status: "queued", progress: 0 }] }))
    void runNext()
  },

  cancel: (id) => {
    const job = get().jobs.find((j) => j.id === id)
    if (job?.status === "queued") patch(id, { status: "cancelled", finishedAt: Date.now() })
    if (job?.status === "running") void invoke("render_cancel", { id })
  },

  dismiss: (id) => set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) })),

  clearFinished: () => set((s) => ({ jobs: s.jobs.filter((j) => j.status === "running" || j.status === "queued") })),
}))

let listening = false

export function listenForRenderProgress() {
  if (listening) return
  listening = true
  void listen<{ id: string; step: number; frame: number }>("render-progress", ({ payload }) => {
    const job = useRenders.getState().jobs.find((j) => j.id === payload.id)
    if (!job) return
    const { weights, frames } = job.plan
    const finished = weights.slice(0, payload.step).reduce((a, b) => a + b, 0)
    // Weights are shares of the whole, so a chunk's frames map back through the total.
    const stepFrames = (weights[payload.step] / (1 - weights[weights.length - 1])) * frames
    const within = Math.min(1, stepFrames ? payload.frame / stepFrames : 0)
    patch(job.id, { progress: Math.min(0.999, finished + weights[payload.step] * within) })
  })
}