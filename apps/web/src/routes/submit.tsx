import { createFileRoute, Link } from "@tanstack/react-router"
import { SignInButton, useAuth } from "@clerk/tanstack-react-start"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { AppHeader } from "../components/app-header"
import { submitBarFn } from "../lib/submissions"
import { logEvent } from "../lib/track"

export const Route = createFileRoute("/submit")({ component: SubmitPage })

const ease = "cubic-bezier(0.16, 1, 0.3, 1)"

const inputCls =
  "w-full rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-sm font-medium placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/60"
const textareaCls =
  "w-full resize-none rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-base font-semibold placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/60"

function SubmitPage() {
  const { isSignedIn } = useAuth()
  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden">
      <AppHeader />
      <div className="pq-spotlight pointer-events-none absolute inset-0" aria-hidden="true" />
      {isSignedIn ? <SubmitForm /> : <AnonPitch />}
    </div>
  )
}

function AnonPitch() {
  const { t } = useTranslation()
  return (
    <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="text-xs font-bold uppercase tracking-[0.18em] text-primary/70">{t("submit.eyebrow")}</span>
      <h1 className="text-3xl font-extrabold tracking-tight text-balance">{t("submit.anonTitle")}</h1>
      <p className="max-w-xs text-sm text-muted-foreground text-balance">{t("submit.anonBody")}</p>
      <SignInButton mode="modal">
        <Button size="lg" className="cta-glow min-h-12 px-8 text-base font-bold">{t("submit.cta")}</Button>
      </SignInButton>
      <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">←</Link>
    </main>
  )
}

function SubmitForm() {
  const { t } = useTranslation()
  const [line, setLine] = useState("")
  const [showOptional, setShowOptional] = useState(false)
  const [artistHint, setArtistHint] = useState("")
  const [songHint, setSongHint] = useState("")
  const [answer, setAnswer] = useState("")
  const [clozePrompt, setClozePrompt] = useState("")
  const [note, setNote] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setLine("")
    setArtistHint("")
    setSongHint("")
    setAnswer("")
    setClozePrompt("")
    setNote("")
    setShowOptional(false)
    setDone(false)
    setError(null)
  }

  async function submit() {
    if (submitting || line.trim().length < 3) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await submitBarFn({
        data: {
          line: line.trim(),
          artistHint: artistHint.trim() || undefined,
          songHint: songHint.trim() || undefined,
          answer: answer.trim() || undefined,
          clozePrompt: clozePrompt.trim() || undefined,
          note: note.trim() || undefined,
        },
      })
      if (res.ok) {
        // submit_bar = legacy event; submission_created = contributor funnel (PUN-70).
        const filled = {
          artist: !!artistHint.trim(),
          song: !!songHint.trim(),
          answer: !!answer.trim(),
          cloze: !!clozePrompt.trim(),
          note: !!note.trim(),
        }
        logEvent("submit_bar", { filled })
        logEvent("submission_created", { id: res.id, filled })
        setDone(true)
      } else if (res.reason === "cooldown") {
        logEvent("submission_rate_limited", { reason: "cooldown" })
        setError(t("submit.cooldown", { seconds: res.retryAfterSeconds }))
      } else if (res.reason === "pending_cap") {
        logEvent("submission_rate_limited", { reason: "pending_cap", cap: res.cap, tier: res.tier })
        setError(t("submit.pendingCap", { cap: res.cap }))
      } else {
        setError(t("submit.error"))
      }
    } catch {
      setError(t("submit.error"))
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight">{t("submit.successTitle")}</h1>
        <p className="max-w-xs text-sm text-muted-foreground text-balance">{t("submit.successBody")}</p>
        <div className="flex flex-col items-center gap-2">
          <Button onClick={reset} className="cta-glow min-h-11 px-6 font-bold">{t("submit.another")}</Button>
          <Link to="/profile" className="text-xs text-muted-foreground hover:text-foreground">{t("submit.viewMine")}</Link>
        </div>
      </main>
    )
  }

  return (
    <main className="relative mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-5 pt-20 pb-12 md:px-8">
      <header className="flex flex-col items-center gap-2 text-center" style={{ animation: `pq-fade-up 0.5s ${ease} both` }}>
        <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary/80">{t("submit.eyebrow")}</span>
        <h1 className="text-3xl font-extrabold tracking-tight">{t("submit.title")}</h1>
        <p className="max-w-sm text-sm text-muted-foreground text-balance">{t("submit.subtitle")}</p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="flex flex-col gap-4"
        style={{ animation: `pq-fade-up 0.5s ${ease} 0.08s both` }}
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-primary/80">{t("submit.lineLabel")}</span>
          <textarea
            value={line}
            onChange={(e) => setLine(e.target.value)}
            rows={3}
            autoFocus
            placeholder={t("submit.linePlaceholder")}
            className={textareaCls}
          />
        </label>

        <button
          type="button"
          onClick={() => setShowOptional((v) => !v)}
          className="flex items-center gap-2 self-start text-xs font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          <span className={cn("transition-transform", showOptional && "rotate-90")}>›</span>
          {t("submit.optionalToggle")}
        </button>

        {showOptional && (
          <div className="flex flex-col gap-3 rounded-2xl border border-border/40 bg-card/30 p-4">
            <OptField label={t("submit.artistHint")} value={artistHint} onChange={setArtistHint} />
            <OptField label={t("submit.songHint")} value={songHint} onChange={setSongHint} />
            <OptField label={t("submit.answer")} value={answer} onChange={setAnswer} />
            <OptField label={t("submit.clozePrompt")} value={clozePrompt} onChange={setClozePrompt} />
            <OptField label={t("submit.note")} value={note} onChange={setNote} />
          </div>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        <Button
          type="submit"
          size="lg"
          disabled={submitting || line.trim().length < 3}
          className="cta-glow min-h-12 w-full text-base font-bold"
        >
          {submitting ? t("submit.submitting") : t("submit.cta")}
        </Button>
      </form>
    </main>
  )
}

function OptField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </label>
  )
}
