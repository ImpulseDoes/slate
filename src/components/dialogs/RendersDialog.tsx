import { useEffect, useState } from "react"
import { revealItemInDir } from "@tauri-apps/plugin-opener"
import { Cancel01Icon, FolderOpenIcon } from "@hugeicons/core-free-icons"
import { useT, type Key } from "../../lib/i18n"
import { shortDuration, ticks } from "../../lib/time"
import { isActive, timeLeft, useRenders, type RenderJob, type RenderStatus } from "../../store/renders"
import { Modal } from "../overlays/Modal"
import { Button, StatusTag, Tip } from "../ui"

const STATUS: Record<RenderStatus, { label: Key; tone: "muted" | "error" | "progress" }> = {
  queued: { label: "render.status.queued", tone: "muted" },
  running: { label: "render.status.running", tone: "progress" },
  done: { label: "render.status.done", tone: "muted" },
  failed: { label: "render.status.failed", tone: "error" },
  cancelled: { label: "render.status.cancelled", tone: "muted" },
}

export function RendersDialog({ onClose }: { onClose: () => void }) {

  const t = useT()
  const jobs = useRenders((s) => s.jobs)
  const clearFinished = useRenders((s) => s.clearFinished)
  const anyFinished = !jobs.every(isActive)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <Modal
      title={t("render.title")}
      labelId="renders-title"
      onClose={onClose}
      closeButton
      width={520}
      footer={
        <>
          <Button onClick={clearFinished} disabled={!anyFinished}>
            {t("render.clearFinished")}
          </Button>
          <Button variant="primary" onClick={onClose}>
            {t("render.keepEditing")}
          </Button>
        </>
      }
    >
      {jobs.length === 0 ? (
        <p className="mt-3 text-body text-muted">{t("render.empty")}</p>
      ) : (
        <ul className="mt-3 flex max-h-[420px] flex-col gap-3 overflow-y-auto">
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} now={now} />
          ))}
        </ul>
      )}
    </Modal>
  )
}

function JobRow({ job, now }: { job: RenderJob; now: number }) {

  const t = useT()
  const { cancel, dismiss } = useRenders.getState()
  const status = STATUS[job.status]
  const active = isActive(job)
  const left = timeLeft(job, now)

  return (
    <li className="rounded-lg bg-raised p-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-fg" title={job.output}>
          {job.name}
        </span>
        <StatusTag tone={status.tone}>{t(status.label)}</StatusTag>
        {job.status === "done" && (
          <Tip label={t("media.showInFolder")}>
            <Button variant="quiet" icon={FolderOpenIcon} aria-label={t("media.showInFolder")} onClick={() => void revealItemInDir(job.output)} />
          </Tip>
        )}
        <Tip label={t(active ? "render.cancel" : "render.dismiss")}>
          <Button variant="quiet" icon={Cancel01Icon} aria-label={t(active ? "render.cancel" : "render.dismiss")} onClick={() => (active ? cancel(job.id) : dismiss(job.id))} />
        </Tip>
      </div>
      {job.status === "running" && (
        <>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuenow={Math.round(job.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-primary transition-[width]" style={{ width: `${job.progress * 100}%` }} />
          </div>
          <div className="tnum mt-1.5 flex justify-between text-small text-muted">
            <span>{Math.round(job.progress * 100)}%</span>
            {left !== null && <span>{t("render.left", { time: shortDuration(ticks(left)) })}</span>}
          </div>
        </>
      )}
      {job.error && <pre className="mt-2 max-h-32 overflow-auto text-small break-words whitespace-pre-wrap text-error select-text">{job.error}</pre>}
    </li>
  )
}