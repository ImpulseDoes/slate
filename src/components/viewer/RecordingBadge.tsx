import { useEffect, useState } from "react"
import { useRecorder } from "../../lib/audio/recorder"
import { useT } from "../../lib/i18n"
import { shortDuration, ticks } from "../../lib/time"

/** Tells that the microphone is live. It sits over the viewer but isn't part of the picture. */
export function RecordingBadge() {

  const t = useT()
  const recording = useRecorder((s) => s.recording)
  const saving = useRecorder((s) => s.saving)
  const startedAt = useRecorder((s) => s.startedAt)
  const [now, setNow] = useState(Date.now)

  useEffect(() => {

    if (!recording) return

    setNow(Date.now())

    const timer = setInterval(() => setNow(Date.now()), 250)

    return () => clearInterval(timer)
  }, [recording])

  if (saving) {
    return <div role="status" className="pointer-events-none absolute top-3 left-3 z-50 rounded-md bg-tooltip px-2.5 py-1.5 text-small font-semibold text-white shadow-float">{t("record.saving")}</div>
  }

  if (!recording) return null

  return (
    <div role="status" aria-label={t("record.active")} className="pointer-events-none absolute top-3 left-3 z-50 flex items-center gap-2 rounded-md bg-error px-2.5 py-1.5 text-small font-semibold text-white shadow-float">
      <span className="h-2.5 w-2.5 rounded-full bg-white motion-safe:animate-pulse" />
      {t("record.badge")}
      <span className="tnum">{shortDuration(ticks(Math.max(0, now - startedAt) / 1000))}</span>
    </div>
  )
}