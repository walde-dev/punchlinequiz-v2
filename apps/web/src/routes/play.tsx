import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { Confetti } from "../components/confetti"
import { EditBarDrawer } from "../components/edit-bar-drawer"
import {
  fetchArtists,
  type ArtistRow,
  type BarRow,
} from "../lib/admin-client"
import { getRound, submitAnswer, type ArtistChoice, type AnswerResult, type Round } from "../lib/game"
import { isAdminFn } from "../lib/session"
import { logEvent } from "../lib/track"

export const Route = createFileRoute("/play")({
  component: PlayPage,
  loader: async () => {
    const [round, session] = await Promise.all([getRound({ data: {} }), isAdminFn()])
    return { round, isAdmin: session.admin }
  },
})

const ease = "cubic-bezier(0.16, 1, 0.3, 1)"

type Phase = "guessing" | "revealing" | "loading-next"

function PlayPage() {
  const loaded = Route.useLoaderData()
  const [round, setRound] = useState<Round>(loaded.round)
  const isAdmin = loaded.isAdmin
  const [phase, setPhase] = useState<Phase>("guessing")
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [result, setResult] = useState<AnswerResult | null>(null)
  const [streak, setStreak] = useState(0)
  const [score, setScore] = useState({ right: 0, total: 0 })
  const [confettiKey, setConfettiKey] = useState(0)
  const [wrongShake, setWrongShake] = useState(0)
  const [editing, setEditing] = useState<{ bar: BarRow; artists: ArtistRow[] } | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const artistsCacheRef = useRef<ArtistRow[] | null>(null)

  async function onEditClick() {
    if (!isAdmin) return
    setEditLoading(true)
    setEditError(null)
    try {
      const barRes = await fetch(`/api/admin/bars/${round.punchlineId}`, {
        credentials: "same-origin",
      })
      if (!barRes.ok) throw new Error(`bar fetch ${barRes.status}`)
      const bar = (await barRes.json()) as BarRow
      let artists = artistsCacheRef.current
      if (!artists) {
        const a = await fetchArtists()
        artists = a.items
        artistsCacheRef.current = artists
      }
      setEditing({ bar, artists })
    } catch (e) {
      setEditError(String(e))
    } finally {
      setEditLoading(false)
    }
  }

  async function onEditSaved() {
    if (!editing) return
    setEditing(null)
    // Re-read the bar so the displayed line reflects the saved value.
    try {
      const res = await fetch(`/api/admin/bars/${round.punchlineId}`, {
        credentials: "same-origin",
      })
      if (res.ok) {
        const bar = (await res.json()) as BarRow
        setRound((r) => ({ ...r, line: bar.line }))
      }
    } catch {
      // ignore; user can hit "Nächste Bar"
    }
  }

  // Log round impressions once per round
  const loggedRoundRef = useRef<number | null>(null)
  useEffect(() => {
    if (loggedRoundRef.current === round.punchlineId) return
    loggedRoundRef.current = round.punchlineId
    logEvent("round_started", {
      punchline_id: round.punchlineId,
      choice_ids: round.choices.map((c) => c.id),
    })
  }, [round])

  useEffect(() => {
    logEvent("play_opened", {})
  }, [])

  async function onChoose(choice: ArtistChoice) {
    if (phase !== "guessing") return
    setSelectedId(choice.id)
    logEvent("answer_selected", {
      punchline_id: round.punchlineId,
      artist_id: choice.id,
    })
    try {
      const res = await submitAnswer({
        data: { punchlineId: round.punchlineId, artistId: choice.id },
      })
      setResult(res)
      setScore((s) => ({ right: s.right + (res.isCorrect ? 1 : 0), total: s.total + 1 }))
      logEvent("answer_revealed", {
        punchline_id: round.punchlineId,
        artist_id: choice.id,
        is_correct: res.isCorrect,
        correct_artist_id: res.correctArtist.id,
      })
      if (res.isCorrect) {
        setStreak((s) => s + 1)
        setConfettiKey((k) => k + 1)
      } else {
        setStreak(0)
        setWrongShake((s) => s + 1)
      }
      setPhase("revealing")
    } catch (err) {
      console.error(err)
      logEvent("answer_error", { punchline_id: round.punchlineId, message: String(err) })
      setSelectedId(null)
    }
  }

  async function onNext() {
    setPhase("loading-next")
    logEvent("next_clicked", { punchline_id: round.punchlineId })
    try {
      const next = await getRound({ data: { excludeId: round.punchlineId } })
      setRound(next)
      setResult(null)
      setSelectedId(null)
      setPhase("guessing")
    } catch (err) {
      console.error(err)
      logEvent("next_error", { message: String(err) })
      setPhase("revealing")
    }
  }

  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden">
      <Header score={score} streak={streak} />
      <div className="pq-spotlight pointer-events-none absolute inset-0" aria-hidden="true" />

      <main className="relative flex flex-1 flex-col px-5 pt-20 pb-8 md:px-8">
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-between gap-8">
          <BarDisplay
            key={round.punchlineId}
            line={round.line}
            shakeKey={wrongShake}
            adminBadge={
              isAdmin ? (
                <button
                  type="button"
                  onClick={onEditClick}
                  disabled={editLoading}
                  className={cn(
                    "rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-primary",
                    "hover:bg-primary/20 disabled:opacity-50",
                  )}
                >
                  {editLoading ? "…" : "✎ edit"}
                </button>
              ) : null
            }
          />
          {editError && (
            <p className="-mt-4 text-xs text-destructive" role="alert">
              {editError}
            </p>
          )}

          <div className="relative">
            <Confetti trigger={confettiKey} />
            {phase === "guessing" ? (
              <Choices
                choices={round.choices}
                onChoose={onChoose}
                selectedId={selectedId}
                disabled={selectedId !== null}
              />
            ) : result ? (
              <Reveal result={result} onNext={onNext} loading={phase === "loading-next"} />
            ) : null}
          </div>
        </div>
      </main>

      {editing && (
        <EditBarDrawer
          bar={editing.bar}
          artists={editing.artists}
          onClose={() => setEditing(null)}
          onSaved={onEditSaved}
        />
      )}
    </div>
  )
}

function Header({ score, streak }: { score: { right: number; total: number }; streak: number }) {
  return (
    <header className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-5 h-14 border-b border-border/40 bg-background/95 md:bg-background/80 md:backdrop-blur-sm">
      <Link to="/" aria-label="Zurück zur Startseite" className="select-none">
        <span className="font-bold text-base tracking-tight">
          <span className="text-foreground">punchline</span>
          <span className="text-primary">/quiz</span>
        </span>
      </Link>
      <div className="flex items-center gap-3 text-xs font-medium tabular-nums">
        {streak > 0 && (
          <span className="flex items-center gap-1.5 text-primary" aria-label={`Streak ${streak}`}>
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            <span>Streak ×{streak}</span>
          </span>
        )}
        <span className="text-muted-foreground">
          <span className="text-foreground">{score.right}</span>
          <span className="opacity-50"> / {score.total}</span>
        </span>
      </div>
    </header>
  )
}

function BarDisplay({
  line,
  shakeKey,
  adminBadge,
}: {
  line: string
  shakeKey: number
  adminBadge?: React.ReactNode
}) {
  return (
    <div
      key={shakeKey}
      className="flex flex-col items-start gap-3"
      style={{ animation: `pq-fade-up 0.5s ${ease} both` }}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span className="text-xs font-semibold tracking-[0.16em] uppercase text-primary/70">
          / die bar
        </span>
        {adminBadge}
      </div>
      <blockquote
        className="font-extrabold leading-[1.18] tracking-tight text-balance"
        style={{
          fontSize: "clamp(1.6rem, 5.5vw, 2.5rem)",
          animation: shakeKey ? `pq-shake 0.45s ${ease} both` : undefined,
        }}
      >
        <span className="text-primary/40 select-none mr-1">"</span>
        {line}
        <span className="text-primary/40 select-none ml-1">"</span>
      </blockquote>
      <p className="text-sm text-muted-foreground">Von wem ist die Bar?</p>
    </div>
  )
}

function Choices({
  choices,
  onChoose,
  selectedId,
  disabled,
}: {
  choices: ArtistChoice[]
  onChoose: (c: ArtistChoice) => void
  selectedId: number | null
  disabled: boolean
}) {
  return (
    <div
      className="flex flex-col gap-3"
      style={{ animation: `pq-fade-up 0.55s ${ease} 0.15s both` }}
    >
      {choices.map((c, i) => {
        const isSelected = selectedId === c.id
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChoose(c)}
            disabled={disabled}
            aria-pressed={isSelected}
            className={cn(
              "group relative flex items-center gap-3 w-full min-h-14 px-4 py-3 rounded-full",
              "border bg-card/60 text-left text-base font-semibold transition-all",
              "hover:bg-card hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              "disabled:opacity-60 disabled:cursor-not-allowed",
              isSelected ? "border-primary bg-primary/10" : "border-border/60",
            )}
            style={{ animation: `pq-fade-up 0.5s ${ease} ${0.2 + i * 0.07}s both` }}
          >
            <ArtistAvatar artist={c} size={36} />
            <span className="flex-1">{c.name}</span>
            <span
              className={cn(
                "h-2 w-2 rounded-full transition-all",
                isSelected ? "bg-primary scale-125" : "bg-muted-foreground/30",
              )}
              aria-hidden="true"
            />
          </button>
        )
      })}
    </div>
  )
}

function Reveal({
  result,
  onNext,
  loading,
}: {
  result: AnswerResult
  onNext: () => void
  loading: boolean
}) {
  const { isCorrect, correctArtist, song } = result
  const verdict = useMemo(() => verdictCopy(isCorrect), [isCorrect])

  return (
    <div className="relative">
      <div
        className={cn(
          "flex flex-col items-center gap-5 rounded-3xl p-6 text-center",
          "border bg-card/40 backdrop-blur-[2px]",
          isCorrect ? "border-primary/40" : "border-border/50",
        )}
        style={{ animation: `pq-fade-up 0.55s ${ease} both` }}
      >
        <span
          role="status"
          aria-live="polite"
          className={cn(
            "inline-flex items-center gap-2 text-xs font-bold tracking-[0.16em] uppercase",
            isCorrect ? "text-primary" : "text-muted-foreground",
          )}
        >
          <span className="opacity-50">/</span>
          {verdict.label}
        </span>

        {/* Album art — square gradient placeholder when missing */}
        <AlbumArt artist={correctArtist} song={song} highlight={isCorrect} />

        <div className="flex flex-col items-center gap-1.5">
          <p className="text-xl font-extrabold leading-tight tracking-tight">
            {correctArtist.name}
          </p>
          <p className="text-sm text-muted-foreground">
            <span className="text-foreground/80">{song.title}</span>
            {song.album && <span className="opacity-50"> · {song.album}</span>}
            {song.releaseYear && <span className="opacity-50"> · {song.releaseYear}</span>}
          </p>
        </div>

        <p className="text-sm text-muted-foreground/80 max-w-xs text-balance">{verdict.line}</p>

        <Button
          size="lg"
          onClick={onNext}
          disabled={loading}
          className={cn("cta-glow mt-1 min-h-12 px-7 text-base font-bold")}
        >
          {loading ? "…" : "Nächste Bar"}
        </Button>
      </div>
    </div>
  )
}

function ArtistAvatar({ artist, size }: { artist: ArtistChoice; size: number }) {
  const initials = artist.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-full border border-border/60 bg-muted/60 flex items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {artist.imageUrl ? (
        <img src={artist.imageUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="text-[0.7em] font-bold tracking-tight text-foreground/70">{initials}</span>
      )}
    </div>
  )
}

function AlbumArt({
  artist,
  song,
  highlight,
}: {
  artist: ArtistChoice
  song: AnswerResult["song"]
  highlight: boolean
}) {
  // Token-driven gradient placeholder (gold over charcoal). Never a stock illustration.
  return (
    <div
      className={cn(
        "relative aspect-square w-32 sm:w-44 overflow-hidden rounded-2xl border",
        highlight ? "border-primary/50" : "border-border/60",
      )}
      style={{
        animation: `pq-pop-in 0.6s ${ease} 0.1s both`,
        background:
          "radial-gradient(ellipse 80% 60% at 30% 25%, color-mix(in oklch, var(--primary), transparent 55%) 0%, transparent 70%), linear-gradient(160deg, var(--card), var(--background))",
      }}
    >
      {song.albumArtUrl && (
        <img
          src={song.albumArtUrl}
          alt={`${song.album ?? song.title} cover`}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {!song.albumArtUrl && (
        <div className="absolute inset-0 flex flex-col items-start justify-end p-4">
          <span className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-primary/80">
            {artist.name}
          </span>
          <span className="text-base font-bold leading-tight text-foreground line-clamp-2">
            {song.title}
          </span>
        </div>
      )}
      {highlight && (
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            boxShadow:
              "inset 0 0 0 1px color-mix(in oklch, var(--primary), transparent 50%), 0 0 40px color-mix(in oklch, var(--primary), transparent 60%)",
          }}
        />
      )}
    </div>
  )
}

function verdictCopy(isCorrect: boolean): { label: string; line: string } {
  if (isCorrect) {
    const opts = [
      { label: "ehre", line: "Ehre. Du kennst das." },
      { label: "real", line: "Real recognize real." },
      { label: "auf jeden", line: "Auf jeden. Das saß." },
    ]
    return opts[Math.floor(Math.random() * opts.length)]
  }
  const opts = [
    { label: "daneben", line: "Nicht mal nah dran. Hier ist die Antwort." },
    { label: "noch nicht", line: "Pass auf — das war's nicht." },
    { label: "fail", line: "Versuch's nochmal beim Nächsten." },
  ]
  return opts[Math.floor(Math.random() * opts.length)]
}
