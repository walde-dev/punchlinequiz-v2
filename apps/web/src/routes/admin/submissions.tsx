import { createFileRoute, redirect } from "@tanstack/react-router"
import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import { cn } from "@workspace/ui/lib/utils"

import { AdminShell } from "../../components/admin-shell"
import { ArtistCombobox, TrackCombobox } from "../../components/deezer-combobox"
import {
  approveSubmission,
  fetchSubmissions,
  rejectSubmission,
} from "../../lib/admin-client"
import { isAdminFn } from "../../lib/session"
import type { SubmissionRow } from "../../lib/admin-client"

export const Route = createFileRoute("/admin/submissions")({
  component: SubmissionsPage,
  beforeLoad: async () => {
    const { admin } = await isAdminFn()
    if (!admin) throw redirect({ to: "/admin/login" })
  },
})

function SubmissionsPage() {
  const { t } = useTranslation()
  const [items, setItems] = useState<Array<SubmissionRow>>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const { items } = await fetchSubmissions("pending")
      setItems(items)
    } catch (e) {
      setErr(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function onResolved(id: number) {
    setItems((prev) => prev.filter((s) => s.id !== id))
  }

  return (
    <AdminShell
      topRight={
        <span className="text-xs font-bold text-muted-foreground tabular-nums">
          <span className="text-foreground">{items.length}</span>{" "}
          {t("admin.submissions.remaining", { n: items.length })}
        </span>
      }
    >
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <h1 className="text-2xl font-extrabold tracking-tight">
          {t("admin.submissions.title")}
        </h1>
        {err && (
          <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {err}
          </p>
        )}
        {loading && (
          <div className="h-64 animate-pulse rounded-3xl border border-border/40 bg-card/40" />
        )}
        {!loading && items.length === 0 && (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {t("admin.submissions.empty")}
          </p>
        )}
        {items.map((s) => (
          <SubmissionCard
            key={s.id}
            submission={s}
            onResolved={() => onResolved(s.id)}
          />
        ))}
      </div>
    </AdminShell>
  )
}

function SubmissionCard({
  submission,
  onResolved,
}: {
  submission: SubmissionRow
  onResolved: () => void
}) {
  const { t } = useTranslation()
  const [artist, setArtist] = useState(submission.artistHint ?? "")
  const [song, setSong] = useState(submission.songHint ?? "")
  const [line, setLine] = useState(submission.line)
  const [d1, setD1] = useState("")
  const [d2, setD2] = useState("")
  const [clozePrompt, setClozePrompt] = useState(submission.clozePrompt ?? "")
  const [answers, setAnswers] = useState(
    (submission.perfectSolution ?? []).join(", ")
  )
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const canApprove =
    artist.trim() &&
    song.trim() &&
    line.trim() &&
    d1.trim() &&
    d2.trim() &&
    !busy

  async function approve() {
    if (!canApprove) return
    setBusy(true)
    setErr(null)
    try {
      await approveSubmission(submission.id, {
        artist: artist.trim(),
        song: song.trim(),
        line: line.trim(),
        distractor1: d1.trim(),
        distractor2: d2.trim(),
        clozePrompt: clozePrompt.trim() || undefined,
        perfectSolution: answers
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      })
      onResolved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("admin.submissions.error"))
      setBusy(false)
    }
  }

  async function reject() {
    setBusy(true)
    setErr(null)
    try {
      await rejectSubmission(submission.id)
      onResolved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("admin.submissions.error"))
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-border/60 bg-card/70 p-5 shadow-xl">
      <div className="flex items-center justify-between text-[10px] font-bold tracking-[0.18em] text-muted-foreground uppercase">
        <span>#{submission.id}</span>
        <span className="flex items-center gap-2">
          {submission.submitterTier !== "neuling" && (
            <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-primary">
              {t(`profile.contributor.tier.${submission.submitterTier}`)}
            </span>
          )}
          {submission.submitterHandle && (
            <span>
              {t("admin.submissions.by", {
                handle: submission.submitterHandle,
              })}
            </span>
          )}
        </span>
      </div>

      <Field label={t("admin.submissions.line")}>
        <Textarea
          value={line}
          onChange={(e) => setLine(e.target.value)}
          rows={3}
        />
      </Field>

      {submission.note && (
        <p className="rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-bold tracking-wide uppercase">
            {t("admin.submissions.note")}:
          </span>{" "}
          {submission.note}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field
          label={t("admin.submissions.artist")}
          hint={submission.artistHint}
        >
          <ArtistCombobox value={artist} onChange={setArtist} />
        </Field>
        <Field label={t("admin.submissions.song")} hint={submission.songHint}>
          <TrackCombobox
            value={song}
            onChange={setSong}
            onPickTrack={(tr) => {
              setSong(tr.title)
              // Only the artist is part of an approval; album/year aren't.
              if (!artist.trim() && tr.artistName) setArtist(tr.artistName)
            }}
          />
        </Field>
        <Field label={t("admin.submissions.distractor1")}>
          <ArtistCombobox value={d1} onChange={setD1} />
        </Field>
        <Field label={t("admin.submissions.distractor2")}>
          <ArtistCombobox value={d2} onChange={setD2} />
        </Field>
      </div>

      <Field label={t("admin.submissions.clozePrompt")}>
        <Input
          value={clozePrompt}
          onChange={(e) => setClozePrompt(e.target.value)}
        />
      </Field>
      <Field label={t("admin.submissions.answers")}>
        <Input value={answers} onChange={(e) => setAnswers(e.target.value)} />
      </Field>

      {err && <p className="text-xs text-destructive">{err}</p>}

      <div className="flex items-center justify-between gap-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          onClick={reject}
          disabled={busy}
          className="text-xs font-semibold text-destructive/80 hover:bg-destructive/10 hover:text-destructive"
        >
          {t("admin.submissions.reject")}
        </Button>
        <Button
          type="button"
          onClick={approve}
          disabled={!canApprove}
          size="lg"
          className="cta-glow font-bold"
        >
          {t("admin.submissions.approve")}
        </Button>
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string | null
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  return (
    <label className="flex flex-col gap-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
      <span className="flex items-center gap-2">
        {label}
        {hint && (
          <span
            className={cn(
              "rounded bg-primary/10 px-1.5 py-0.5 text-[9px] text-primary/80 normal-case"
            )}
          >
            {t("admin.submissions.hint")}: {hint}
          </span>
        )}
      </span>
      {children}
    </label>
  )
}
