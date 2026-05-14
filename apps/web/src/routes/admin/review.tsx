import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { ArtistSelect } from "../../components/artist-select"

import {
  deleteBar,
  fetchArtists,
  fetchNextReviewBar,
  patchBar,
  patchSong,
  type ArtistRow,
  type BarRow,
} from "../../lib/admin-client"
import { isAdminFn } from "../../lib/session"

export const Route = createFileRoute("/admin/review")({
  component: ReviewPage,
  beforeLoad: async () => {
    const { admin } = await isAdminFn()
    if (!admin) throw redirect({ to: "/admin/login" })
  },
})

const ease = "cubic-bezier(0.16, 1, 0.3, 1)"

function ReviewPage() {
  const [artists, setArtists] = useState<ArtistRow[]>([])
  const [bar, setBar] = useState<BarRow | null>(null)
  const [remaining, setRemaining] = useState(0)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [exitDir, setExitDir] = useState<"left" | "right" | null>(null)
  // Session-scoped: skipped cards reappear on next session. We keep the set
  // in a ref so the latest skipped IDs are visible to async fetches without
  // re-creating the loader function on every state change.
  const skippedRef = useRef<Set<number>>(new Set())
  const [reviewedCount, setReviewedCount] = useState(0)
  const [skipCount, setSkipCount] = useState(0)

  const loadNext = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const { bar, remaining } = await fetchNextReviewBar(
        Array.from(skippedRef.current),
      )
      setBar(bar)
      setRemaining(remaining)
      setExitDir(null)
    } catch (e) {
      setErr(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const a = await fetchArtists()
        setArtists(a.items)
      } catch (e) {
        setErr(String(e))
      }
      await loadNext()
    })()
  }, [loadNext])

  function onSkip() {
    if (!bar) return
    skippedRef.current.add(bar.id)
    setSkipCount((n) => n + 1)
    setExitDir("left")
    // Let the exit animation play before swapping content.
    setTimeout(() => {
      loadNext()
    }, 220)
  }

  async function onDelete(hard: boolean) {
    if (!bar) return
    const preview = bar.line.slice(0, 80) + (bar.line.length > 80 ? "…" : "")
    const msg = hard
      ? `Bar #${bar.id} ENDGÜLTIG löschen?\n\n„${preview}“\n\nNicht umkehrbar.`
      : `Bar #${bar.id} deaktivieren?\n\n„${preview}“`
    if (!confirm(msg)) return
    setLoading(true)
    setErr(null)
    try {
      await deleteBar(bar.id, hard)
      setExitDir("left")
      setTimeout(() => {
        loadNext()
      }, 220)
    } catch (e) {
      setErr(String(e))
      setLoading(false)
    }
  }

  async function onApprove(patch: ReviewPatch) {
    if (!bar) return
    setLoading(true)
    setErr(null)
    try {
      // Apply field edits + flip reviewed in a single PATCH so they land
      // atomically. Song-level edits still go through patchSong (separate
      // table). All optional — only send when changed.
      if (patch.song) {
        await patchSong(bar.songId, patch.song)
      }
      await patchBar(bar.id, { ...patch.bar, reviewed: true })
      setReviewedCount((n) => n + 1)
      setExitDir("right")
      setTimeout(() => {
        loadNext()
      }, 220)
    } catch (e) {
      setErr(String(e))
      setLoading(false)
    }
  }

  // Keyboard: ← skip, ⌘/Ctrl + Enter approve (handled inside card form).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (loading || !bar) return
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        onSkip()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bar, loading])

  return (
    <div className="relative min-h-svh">
      <div className="pq-spotlight pointer-events-none absolute inset-0" aria-hidden="true" />

      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-border/40 bg-background/95 px-5 py-3 md:bg-background/80 md:backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Link to="/admin" className="select-none text-base font-bold tracking-tight">
            <span className="text-foreground">punchline</span>
            <span className="text-primary">/quiz</span>
          </Link>
          <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
            review
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs font-bold tabular-nums">
          <span className="text-primary" title="Reviewed in dieser Session">
            ✓ {reviewedCount}
          </span>
          <span className="text-muted-foreground" title="Skipped (kommen wieder)">
            ↪ {skipCount}
          </span>
          <span className="text-muted-foreground">
            <span className="text-foreground">{remaining}</span>
            <span className="opacity-50"> übrig</span>
          </span>
        </div>
      </header>

      <main className="relative mx-auto flex max-w-xl flex-col gap-4 px-4 py-6">
        {err && (
          <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {err}
          </p>
        )}

        {loading && !bar && <SkeletonCard />}

        {!loading && !bar && (
          <EmptyQueue onReset={() => {
            skippedRef.current.clear()
            setSkipCount(0)
            loadNext()
          }} skipped={skipCount} />
        )}

        {bar && (
          <ReviewCard
            key={bar.id}
            bar={bar}
            artists={artists}
            onSkip={onSkip}
            onApprove={onApprove}
            onDelete={onDelete}
            exitDir={exitDir}
            disabled={loading}
          />
        )}
      </main>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="h-[420px] animate-pulse rounded-3xl border border-border/40 bg-card/40" />
  )
}

function EmptyQueue({ onReset, skipped }: { onReset: () => void; skipped: number }) {
  return (
    <div className="relative flex min-h-[60vh] flex-col items-center justify-center gap-5 text-center">
      <span className="text-xs font-bold tracking-[0.18em] uppercase text-primary/80">
        / inbox zero
      </span>
      <h1 className="text-3xl font-extrabold tracking-tight">Stack ist leer.</h1>
      <p className="max-w-xs text-sm text-muted-foreground text-balance">
        Alle Bars reviewed (oder geskippt). Ehre.
      </p>
      {skipped > 0 && (
        <Button type="button" onClick={onReset} className="cta-glow font-bold">
          {skipped} geskippte zurückholen
        </Button>
      )}
      <Link to="/admin" className="text-xs text-muted-foreground hover:text-foreground">
        ← Zurück zum Dashboard
      </Link>
    </div>
  )
}

type ReviewPatch = {
  bar: Parameters<typeof patchBar>[1]
  song?: Parameters<typeof patchSong>[1]
}

function ReviewCard({
  bar,
  artists,
  onSkip,
  onApprove,
  onDelete,
  exitDir,
  disabled,
}: {
  bar: BarRow
  artists: ArtistRow[]
  onSkip: () => void
  onApprove: (p: ReviewPatch) => void
  onDelete: (hard: boolean) => void
  exitDir: "left" | "right" | null
  disabled: boolean
}) {
  const [line, setLine] = useState(bar.line)
  const [clozePrompt, setClozePrompt] = useState(bar.clozePrompt ?? "")
  const [clozeAnswers, setClozeAnswers] = useState(
    (bar.perfectSolution ?? []).join(", "),
  )
  const [clozeEnabled, setClozeEnabled] = useState(bar.clozeEnabled ?? true)
  const [artistId, setArtistId] = useState(bar.artistId)
  const [d1, setD1] = useState(bar.distractor1Id)
  const [d2, setD2] = useState(bar.distractor2Id)
  const [songTitle, setSongTitle] = useState(bar.songTitle)

  function buildPatch(): ReviewPatch {
    const barPatch: Parameters<typeof patchBar>[1] = {}
    if (line.trim() !== bar.line) barPatch.line = line.trim()
    if (d1 !== bar.distractor1Id) barPatch.distractor1Id = d1
    if (d2 !== bar.distractor2Id) barPatch.distractor2Id = d2

    const nextCloze = clozePrompt.trim()
    const origCloze = bar.clozePrompt ?? ""
    if (nextCloze !== origCloze) {
      barPatch.clozePrompt = nextCloze.length === 0 ? null : nextCloze
    }
    const nextAnswers = clozeAnswers
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    const origAnswers = bar.perfectSolution ?? []
    if (
      nextAnswers.length !== origAnswers.length ||
      nextAnswers.some((a, i) => a !== origAnswers[i])
    ) {
      barPatch.perfectSolution = nextAnswers
    }
    if (clozeEnabled !== (bar.clozeEnabled ?? true)) {
      barPatch.clozeEnabled = clozeEnabled
    }

    const songPatch: Parameters<typeof patchSong>[1] = {}
    if (artistId !== bar.artistId) songPatch.artistId = artistId
    if (songTitle.trim() !== bar.songTitle) songPatch.title = songTitle.trim()

    return {
      bar: barPatch,
      song: Object.keys(songPatch).length > 0 ? songPatch : undefined,
    }
  }

  const correctArtist = useMemo(
    () => artists.find((a) => a.id === artistId) ?? null,
    [artists, artistId],
  )

  const conflict = d1 === artistId || d2 === artistId || d1 === d2

  function onSubmit() {
    if (conflict || disabled) return
    onApprove(buildPatch())
  }

  const exitClass =
    exitDir === "left"
      ? "translate-x-[-110%] -rotate-6 opacity-0"
      : exitDir === "right"
        ? "translate-x-[110%] rotate-6 opacity-0"
        : ""

  return (
    <div
      className={cn(
        "relative flex flex-col gap-4 rounded-3xl border border-border/60 bg-card/70 p-5 shadow-2xl transition-all duration-200",
        "backdrop-blur-[2px]",
        exitClass,
      )}
      style={{ animation: !exitDir ? `pq-fade-up 0.4s ${ease} both` : undefined }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary/80">
            / bar #{bar.id}
          </span>
          <span className="text-sm font-semibold">
            {bar.artistName} <span className="opacity-50">·</span> {bar.songTitle}
          </span>
        </div>
        <a
          href={`https://genius.com/search?q=${encodeURIComponent(
            line.replace(/\//g, " ").replace(/\s+/g, " ").trim(),
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-border/60 bg-background/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground hover:border-primary/50 hover:text-foreground"
          aria-label="Auf Genius suchen"
        >
          Genius ↗
        </a>
      </div>

      <Field label="Line">
        <textarea
          value={line}
          onChange={(e) => setLine(e.target.value)}
          rows={3}
          className={textareaCls}
        />
      </Field>

      <Field label="Cloze prompt">
        <textarea
          value={clozePrompt}
          onChange={(e) => setClozePrompt(e.target.value)}
          rows={2}
          placeholder="„… und sehe eine ___“ — leer = im Artist-Modus deaktiviert"
          className={textareaCls}
        />
      </Field>

      <Field label="Akzeptierte Antworten (Komma-getrennt)">
        <input
          value={clozeAnswers}
          onChange={(e) => setClozeAnswers(e.target.value)}
          placeholder="Maus, die Maus"
          className={inputCls}
        />
      </Field>

      <label
        className={cn(
          "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors",
          clozeEnabled
            ? "border-primary/40 bg-primary/5 text-foreground"
            : "border-border/60 bg-background/40 text-muted-foreground",
        )}
      >
        <input
          type="checkbox"
          checked={clozeEnabled}
          onChange={(e) => setClozeEnabled(e.target.checked)}
          className="accent-primary"
        />
        <span className="flex flex-col">
          <span>Im Cloze-Modus spielen</span>
          <span className="text-[11px] font-normal text-muted-foreground">
            Aus = Bar nur im Klassik-Modus, nicht beim Artist-Quiz.
          </span>
        </span>
      </label>

      <Field label="Korrekter Artist">
        <ArtistSelect value={artistId} onChange={setArtistId} artists={artists} />
      </Field>

      <Field label="Song">
        <input
          value={songTitle}
          onChange={(e) => setSongTitle(e.target.value)}
          className={inputCls}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Distractor 1">
          <ArtistSelect
            value={d1}
            onChange={setD1}
            artists={artists}
            excludeId={artistId}
            sortByOverlapWith={correctArtist}
          />
        </Field>
        <Field label="Distractor 2">
          <ArtistSelect
            value={d2}
            onChange={setD2}
            artists={artists}
            excludeId={artistId}
            sortByOverlapWith={correctArtist}
          />
        </Field>
      </div>

      {conflict && (
        <p className="text-xs text-destructive">
          Distractors müssen sich vom Artist und voneinander unterscheiden.
        </p>
      )}

      <div className="sticky bottom-0 -mx-5 -mb-5 mt-2 flex items-center justify-between gap-2 border-t border-border/40 bg-background/85 px-5 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            onClick={onSkip}
            disabled={disabled}
            className="font-bold text-muted-foreground hover:text-foreground"
          >
            ↪ Skip
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onDelete(false)}
            disabled={disabled}
            title="Deaktivieren — bleibt in der DB, aber inaktiv"
            className="text-xs font-semibold text-destructive/80 hover:bg-destructive/10 hover:text-destructive"
          >
            Deaktivieren
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onDelete(true)}
            disabled={disabled}
            title="Endgültig löschen — nicht umkehrbar"
            aria-label="Bar endgültig löschen"
            className="text-xs font-semibold text-destructive/70 hover:bg-destructive/15 hover:text-destructive"
          >
            Löschen ✕
          </Button>
        </div>
        <Button
          type="button"
          onClick={onSubmit}
          disabled={disabled || conflict}
          size="lg"
          className="cta-glow font-bold"
        >
          ✓ Reviewed
        </Button>
      </div>
    </div>
  )
}

const textareaCls =
  "w-full resize-none rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-sm font-semibold placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/60"
const inputCls =
  "w-full rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-sm font-medium placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/60"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
      {children}
    </label>
  )
}

