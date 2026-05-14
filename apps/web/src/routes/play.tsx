import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { Confetti } from "../components/confetti"
import { EditBarDrawer } from "../components/edit-bar-drawer"
import { LangToggle } from "../components/lang-toggle"
import { SessionSummary } from "../components/session-summary"
import {
  fetchArtists,
  type ArtistRow,
  type BarRow,
} from "../lib/admin-client"
import {
  getArtistContext,
  getRound,
  submitAnswer,
  submitClozeGuess,
  submitSongGuess,
  type AnswerResult,
  type ArtistChoice,
  type ArtistContext,
  type ClozeGuessResult,
  type Round,
  type SongGuessResult,
  type SongReveal,
} from "../lib/game"
import { isAdminFn } from "../lib/session"
import { logEvent } from "../lib/track"

type PlayMode = "artist" | "cloze"
type PlaySearch = { artist?: string; mode?: PlayMode }

export const Route = createFileRoute("/play")({
  component: PlayPage,
  validateSearch: (search: Record<string, unknown>): PlaySearch => ({
    artist: typeof search.artist === "string" ? search.artist : undefined,
    mode: search.mode === "cloze" ? "cloze" : undefined,
  }),
  loaderDeps: ({ search }) => ({ artist: search.artist, mode: search.mode }),
  loader: async ({ deps }) => {
    const artistSlug = deps.artist
    const mode: PlayMode = deps.mode === "cloze" ? "cloze" : "artist"
    const [artistCtx, session] = await Promise.all([
      artistSlug ? getArtistContext({ data: { slug: artistSlug } }) : Promise.resolve(null),
      isAdminFn(),
    ])
    if (artistSlug && (!artistCtx || artistCtx.punchlineCount === 0)) {
      return { round: null, artistCtx, mode, isAdmin: session.admin }
    }
    try {
      const round = await getRound({
        data: {
          mode,
          ...(artistSlug ? { artistSlug } : {}),
        },
      })
      return { round, artistCtx, mode, isAdmin: session.admin }
    } catch {
      // mode=cloze with no cloze-ready bars (per artist or globally) → empty.
      return { round: null, artistCtx, mode, isAdmin: session.admin }
    }
  },
})

const ease = "cubic-bezier(0.16, 1, 0.3, 1)"

type Phase = "guessing" | "song-guessing" | "revealing" | "loading-next" | "session-complete"

const ROUND_SIZE = 10

type ClozeOutcome = { guess: string; isCorrect: boolean; correctAnswer: string; fullLine: string }

function PlayPage() {
  const loaded = Route.useLoaderData()
  const artistCtx = loaded.artistCtx
  const isAdmin = loaded.isAdmin
  if (!loaded.round) {
    return <EmptyArtistState artist={artistCtx} mode={loaded.mode} />
  }
  return (
    <PlayInner
      initialRound={loaded.round}
      artistCtx={artistCtx}
      playMode={loaded.mode}
      isAdmin={isAdmin}
    />
  )
}

function PlayInner({
  initialRound,
  artistCtx,
  playMode,
  isAdmin,
}: {
  initialRound: Round
  artistCtx: ArtistContext | null
  playMode: "artist" | "cloze"
  isAdmin: boolean
}) {
  const { t } = useTranslation()
  const [round, setRound] = useState<Round>(initialRound)
  const [phase, setPhase] = useState<Phase>("guessing")
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [artistResult, setArtistResult] = useState<AnswerResult | null>(null)
  const [songResult, setSongResult] = useState<SongGuessResult | null>(null)
  const [clozeOutcome, setClozeOutcome] = useState<ClozeOutcome | null>(null)
  const [clozeWrongTries, setClozeWrongTries] = useState<string[]>([])
  const CLOZE_MAX_TRIES = 3
  const [streak, setStreak] = useState(0)
  const [score, setScore] = useState({ right: 0, total: 0 })
  const [results, setResults] = useState<Array<boolean>>([])
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

  function resetRoundState() {
    setArtistResult(null)
    setSongResult(null)
    setClozeOutcome(null)
    setClozeWrongTries([])
    setSelectedId(null)
    setPhase("guessing")
  }

  async function onEditSaved() {
    if (!editing) return
    setEditing(null)
    try {
      const next = await getRound({
        data: {
          mode: playMode,
          ...(artistCtx ? { artistSlug: artistCtx.slug } : {}),
        },
      })
      setRound(next)
      resetRoundState()
    } catch {
      // ignore; user can hit "Nächste Bar"
    }
  }

  const loggedRoundRef = useRef<number | null>(null)
  useEffect(() => {
    if (loggedRoundRef.current === round.punchlineId) return
    loggedRoundRef.current = round.punchlineId
    logEvent("round_started", {
      punchline_id: round.punchlineId,
      mode: round.mode,
      choice_ids: round.mode === "artist" ? round.choices.map((c) => c.id) : [],
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
      setArtistResult(res)
      logEvent("answer_revealed", {
        punchline_id: round.punchlineId,
        artist_id: choice.id,
        is_correct: res.isCorrect,
        correct_artist_id: res.correctArtist.id,
      })
      if (res.isCorrect) {
        setConfettiKey((k) => k + 1)
        // Move on to the song-guessing phase. Score is awarded only after
        // the song step resolves so a single round counts once.
        setPhase("song-guessing")
      } else {
        setStreak(0)
        setWrongShake((s) => s + 1)
        setScore((s) => ({ right: s.right, total: s.total + 1 }))
        setResults((r) => [...r, false])
        setPhase("revealing")
      }
    } catch (err) {
      console.error(err)
      logEvent("answer_error", { punchline_id: round.punchlineId, message: String(err) })
      setSelectedId(null)
    }
  }

  async function onClozeSubmit(guess: string) {
    if (phase !== "guessing" || round.mode !== "cloze") return
    const trimmed = guess.trim()
    if (!trimmed) return
    logEvent("cloze_submitted", {
      punchline_id: round.punchlineId,
    })
    try {
      const res: ClozeGuessResult = await submitClozeGuess({
        data: { punchlineId: round.punchlineId, guess: trimmed },
      })
      // The artist is pre-known in cloze mode → synthesize an AnswerResult so
      // the existing Reveal component renders the artist/song card cleanly.
      setArtistResult({
        isCorrect: true,
        correctArtist: res.correctArtist,
        song: null,
      })
      setClozeOutcome({
        guess: trimmed,
        isCorrect: res.isCorrect,
        correctAnswer: res.correctAnswer,
        fullLine: res.fullLine,
      })
      logEvent("cloze_revealed", {
        punchline_id: round.punchlineId,
        is_correct: res.isCorrect,
      })
      if (res.isCorrect) {
        setConfettiKey((k) => k + 1)
        // Move to the bonus song-guess phase. Score is awarded when that
        // resolves so a single round counts once (same flow as classic mode).
        setPhase("song-guessing")
        return
      }

      const nextTries = [...clozeWrongTries, trimmed]
      setClozeWrongTries(nextTries)
      setWrongShake((s) => s + 1)

      if (nextTries.length >= CLOZE_MAX_TRIES) {
        setStreak(0)
        setScore((s) => ({ right: s.right, total: s.total + 1 }))
        setResults((r) => [...r, false])
        setPhase("revealing")
        return
      }
      // Still have tries left — clear the synthetic artist result so the
      // Reveal doesn't accidentally render, and stay in guessing phase.
      setArtistResult(null)
      setClozeOutcome(null)
    } catch (err) {
      console.error(err)
      logEvent("cloze_error", { punchline_id: round.punchlineId, message: String(err) })
    }
  }

  async function onSongSubmit(guess: string) {
    if (phase !== "song-guessing") return
    const trimmed = guess.trim()
    logEvent("song_guess_submitted", {
      punchline_id: round.punchlineId,
      skipped: trimmed.length === 0,
    })
    try {
      const res = await submitSongGuess({
        data: { punchlineId: round.punchlineId, guess: trimmed },
      })
      setSongResult(res)
      logEvent("song_guess_revealed", {
        punchline_id: round.punchlineId,
        is_correct: res.isCorrect,
        skipped: trimmed.length === 0,
      })
      if (res.isCorrect) {
        setConfettiKey((k) => k + 1)
        setStreak((s) => s + 1)
      } else {
        setStreak(0)
      }
      // Artist was already right — count the round as right regardless of
      // whether the bonus song step was nailed.
      setScore((s) => ({ right: s.right + 1, total: s.total + 1 }))
      setResults((r) => [...r, true])
      setPhase("revealing")
    } catch (err) {
      console.error(err)
      logEvent("song_guess_error", { punchline_id: round.punchlineId, message: String(err) })
    }
  }

  async function onNext() {
    logEvent("next_clicked", { punchline_id: round.punchlineId })
    // After 10 punchlines, jump to the share-card summary instead of loading.
    if (results.length >= ROUND_SIZE) {
      setPhase("session-complete")
      return
    }
    setPhase("loading-next")
    try {
      const next = await getRound({
        data: {
          mode: playMode,
          excludeId: round.punchlineId,
          ...(artistCtx ? { artistSlug: artistCtx.slug } : {}),
        },
      })
      setRound(next)
      resetRoundState()
    } catch (err) {
      console.error(err)
      logEvent("next_error", { message: String(err) })
      setPhase("revealing")
    }
  }

  async function onRestartSession() {
    logEvent("session_restart_clicked", {
      mode: playMode,
      artist_slug: artistCtx?.slug ?? null,
    })
    setPhase("loading-next")
    try {
      const next = await getRound({
        data: {
          mode: playMode,
          ...(artistCtx ? { artistSlug: artistCtx.slug } : {}),
        },
      })
      setScore({ right: 0, total: 0 })
      setResults([])
      setStreak(0)
      setRound(next)
      resetRoundState()
    } catch (err) {
      console.error(err)
      logEvent("session_restart_error", { message: String(err) })
      setPhase("session-complete")
    }
  }

  if (phase === "session-complete") {
    return (
      <div className="relative flex min-h-svh flex-col overflow-hidden">
        <Header score={score} streak={streak} artistCtx={artistCtx} playMode={playMode} />
        <div className="pq-spotlight pointer-events-none absolute inset-0" aria-hidden="true" />
        <main className="relative flex flex-1 flex-col px-5 pt-20 pb-8 md:px-8">
          <SessionSummary
            score={score.right}
            total={score.total}
            mode={playMode}
            results={results}
            artistName={artistCtx?.name ?? null}
            artistSlug={artistCtx?.slug ?? null}
            artistImageUrl={artistCtx?.imageUrl ?? null}
            onRestart={onRestartSession}
          />
        </main>
      </div>
    )
  }

  const isLastRound = results.length >= ROUND_SIZE
  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden">
      <Header
        score={score}
        streak={streak}
        artistCtx={artistCtx}
        playMode={playMode}
        roundSize={ROUND_SIZE}
      />
      <div className="pq-spotlight pointer-events-none absolute inset-0" aria-hidden="true" />

      <main className="relative flex flex-1 flex-col px-5 pt-20 pb-8 md:px-8">
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-between gap-8">
          <BarDisplay
            key={round.punchlineId}
            line={
              // Once the cloze is solved, swap the blanked prompt for the
              // full bar so the user can see their answer in context while
              // they tackle the song step / reveal.
              round.mode === "cloze" && clozeOutcome?.isCorrect
                ? clozeOutcome.fullLine
                : round.line
            }
            mode={round.mode}
            filledAnswer={
              round.mode === "cloze" && clozeOutcome?.isCorrect
                ? clozeOutcome.correctAnswer
                : null
            }
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
                  {editLoading ? "…" : `✎ ${t("play.edit")}`}
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
            {phase === "guessing" && round.mode === "artist" && (
              <Choices
                choices={round.choices}
                onChoose={onChoose}
                selectedId={selectedId}
                disabled={selectedId !== null}
              />
            )}
            {phase === "guessing" && round.mode === "cloze" && (
              <ClozeInput
                onSubmit={onClozeSubmit}
                wrongTries={clozeWrongTries}
                maxTries={CLOZE_MAX_TRIES}
              />
            )}
            {phase === "song-guessing" && artistResult && (
              <SongGuess
                artist={artistResult.correctArtist}
                onSubmit={onSongSubmit}
              />
            )}
            {phase !== "guessing" && phase !== "song-guessing" && artistResult && (
              <Reveal
                mode={round.mode}
                artistResult={artistResult}
                songResult={songResult}
                clozeOutcome={clozeOutcome}
                onNext={onNext}
                loading={phase === "loading-next"}
                isLastRound={isLastRound}
              />
            )}
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

function Header({
  score,
  streak,
  artistCtx,
  playMode,
  roundSize,
}: {
  score: { right: number; total: number }
  streak: number
  artistCtx: ArtistContext | null
  playMode: "artist" | "cloze"
  roundSize?: number
}) {
  const { t } = useTranslation()
  return (
    <header className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-5 h-14 border-b border-border/40 bg-background/95 md:bg-background/80 md:backdrop-blur-sm">
      <Link to="/" aria-label={t("common.backToHome")} className="select-none flex items-center gap-2.5">
        <span className="font-bold text-base tracking-tight">
          <span className="text-foreground">punchline</span>
          <span className="text-primary">/quiz</span>
        </span>
        {playMode === "cloze" && !artistCtx && (
          <>
            <span className="text-primary/40 text-sm select-none">/</span>
            <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-primary/80">
              {t("home.modes.clozeEyebrow").replace(/^\/\s*/, "")}
            </span>
          </>
        )}
        {artistCtx && (
          <>
            <span className="text-primary/40 text-sm select-none">/</span>
            <span className="flex items-center gap-1.5">
              <ArtistAvatar
                artist={{ id: artistCtx.id, name: artistCtx.name, imageUrl: artistCtx.imageUrl }}
                size={22}
              />
              <span className="text-xs font-bold tracking-tight text-foreground/90 truncate max-w-[7.5rem]">
                {artistCtx.name}
              </span>
            </span>
          </>
        )}
      </Link>
      <div className="flex items-center gap-3 text-xs font-medium tabular-nums">
        <LangToggle />
        {streak > 0 && (
          <span className="flex items-center gap-1.5 text-primary" aria-label={t("play.streakAria", { count: streak })}>
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            <span>{t("play.streakLabel", { count: streak })}</span>
          </span>
        )}
        <span className="text-muted-foreground" aria-label={t("play.scoreAria", { score: score.right, total: roundSize ?? score.total })}>
          <span className="text-foreground">{score.right}</span>
          <span className="opacity-50"> / {roundSize ?? score.total}</span>
        </span>
      </div>
    </header>
  )
}

function BarDisplay({
  line,
  mode,
  filledAnswer,
  shakeKey,
  adminBadge,
}: {
  line: string
  mode: Round["mode"]
  /** When set, the cloze has been solved — highlight that word inline. */
  filledAnswer?: string | null
  shakeKey: number
  adminBadge?: React.ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div
      key={shakeKey}
      className="flex flex-col items-start gap-3"
      style={{ animation: `pq-fade-up 0.5s ${ease} both` }}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span className="text-xs font-semibold tracking-[0.16em] uppercase text-primary/70">
          {t("play.barEyebrow")}
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
        {renderBarLines(line, filledAnswer ?? null)}
        <span className="text-primary/40 select-none ml-1">"</span>
      </blockquote>
      <p className="text-sm text-muted-foreground">
        {mode === "cloze" ? t("play.questionCloze") : t("play.questionArtist")}
      </p>
    </div>
  )
}

/**
 * Rap notation uses "/" as a bar separator — render each segment on its own
 * line, with the slash kept inline at the end (gold, slightly faded). When
 * `filledAnswer` is provided, the final occurrence of that word gets the
 * gold-pill treatment so the previously-blanked word visibly stands out.
 */
function renderBarLines(line: string, filledAnswer: string | null): React.ReactNode {
  const parts = line.split("/")
  const lastNonEmptyIdx = (() => {
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i].trim().length > 0) return i
    }
    return -1
  })()
  return parts.map((seg, i) => {
    const isLast = i === parts.length - 1
    const text = seg.trimStart().replace(/\s+$/, "")
    return (
      <span key={i} className="block">
        {filledAnswer && i === lastNonEmptyIdx
          ? renderFilledAnswer(text, filledAnswer)
          : renderClozeBlanks(text)}
        {!isLast && <span className="text-primary/50 select-none"> /</span>}
      </span>
    )
  })
}

/**
 * Highlight the trailing answer token in the final bar segment. Matches the
 * answer case-insensitively at the end of the segment (allowing trailing
 * punctuation or ad-lib parentheticals), so backfilled lines render cleanly.
 */
function renderFilledAnswer(text: string, answer: string): React.ReactNode {
  const escaped = answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const re = new RegExp(`(.*?)(${escaped})([^\\w]*)$`, "i")
  const m = text.match(re)
  if (!m) return text
  return (
    <>
      {m[1]}
      <span className="inline-block align-baseline px-2 py-0.5 mx-0.5 rounded-md bg-primary/15 text-primary border-b-2 border-primary/80">
        {m[2]}
      </span>
      {m[3]}
    </>
  )
}

/**
 * In cloze prompts the blank position is marked literally as `___` (any run of
 * 3+ underscores). Render it as a gold-underlined pill so it visually reads as
 * a blank slot to fill.
 */
function renderClozeBlanks(text: string): React.ReactNode {
  if (!/_{3,}/.test(text)) return text
  const parts = text.split(/(_{3,})/g)
  return parts.map((p, i) =>
    /_{3,}/.test(p) ? (
      <span
        key={i}
        className="inline-block align-baseline mx-1 px-3 py-0.5 rounded-md border-b-2 border-primary/80 bg-primary/10 text-primary/80"
      >
        {"____"}
      </span>
    ) : (
      <span key={i}>{p}</span>
    ),
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

function ClozeInput({
  onSubmit,
  wrongTries,
  maxTries,
}: {
  onSubmit: (guess: string) => void
  wrongTries: string[]
  maxTries: number
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const used = wrongTries.length
  const remaining = Math.max(0, maxTries - used)
  const lastWrong = wrongTries[wrongTries.length - 1]

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // After a wrong try is logged, clear the input so the user can retype.
  useEffect(() => {
    setValue("")
    inputRef.current?.focus()
  }, [wrongTries.length])

  async function submit() {
    if (submitting) return
    const trimmed = value.trim()
    if (!trimmed) return
    setSubmitting(true)
    try {
      await onSubmit(trimmed)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="flex w-full flex-col gap-3"
      style={{ animation: `pq-fade-up 0.55s ${ease} 0.15s both` }}
    >
      <div className="flex items-center justify-between px-1 text-[11px] font-bold tracking-[0.16em] uppercase">
        <span className="text-muted-foreground">
          {t("play.tryNumber")} <span className="text-foreground">{used + 1}</span>
          <span className="opacity-50"> / {maxTries}</span>
        </span>
        <span aria-live="polite" className={cn(used > 0 ? "text-destructive/80" : "text-muted-foreground/50")}>
          {used > 0 ? (
            <>
              {Array.from({ length: maxTries }).map((_, i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  className={cn(
                    "ml-1 inline-block h-1.5 w-3 rounded-sm",
                    i < used ? "bg-destructive/70" : "bg-muted-foreground/25",
                  )}
                />
              ))}
            </>
          ) : (
            <span>{t("play.triesLeft", { count: remaining })}</span>
          )}
        </span>
      </div>

      {lastWrong && (
        <p className="-mb-1 px-1 text-xs text-muted-foreground" role="status" aria-live="polite">
          {t("play.notQuite")}
          <span className="ml-1 line-through text-foreground/70">{lastWrong}</span>
          <span className="ml-1 opacity-60"> {t("play.stillLeft", { count: remaining })}</span>
        </p>
      )}

      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("play.clozePlaceholder")}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        disabled={submitting}
        aria-label={t("play.clozeAriaLabel")}
        className={cn(
          "w-full min-h-14 rounded-full border bg-background/60 px-5 text-lg font-bold",
          "border-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
          "placeholder:text-muted-foreground/50 disabled:opacity-60",
        )}
      />
      <Button
        type="submit"
        size="lg"
        disabled={submitting || value.trim().length === 0}
        className="cta-glow min-h-12 w-full text-base font-bold"
      >
        {submitting ? "…" : t("common.submit")}
      </Button>
    </form>
  )
}

function SongGuess({
  artist,
  onSubmit,
}: {
  artist: ArtistChoice
  onSubmit: (guess: string) => void
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    // Soft autofocus so users on desktop can type immediately. On mobile this
    // pops the keyboard — desired here since song-guess is the active task.
    inputRef.current?.focus()
  }, [])

  async function submit(guess: string) {
    if (submitting) return
    setSubmitting(true)
    try {
      await onSubmit(guess)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-5 rounded-3xl p-6 text-center",
        "border border-primary/40 bg-card/40 backdrop-blur-[2px]",
      )}
      style={{ animation: `pq-fade-up 0.55s ${ease} both` }}
    >
      <span
        role="status"
        aria-live="polite"
        className="inline-flex items-center gap-2 text-xs font-bold tracking-[0.16em] uppercase text-primary"
      >
        {t("play.songEyebrow")}
      </span>

      <div className="flex flex-col items-center gap-2">
        <ArtistAvatar artist={artist} size={56} />
        <p className="text-lg font-extrabold leading-tight tracking-tight">{artist.name}</p>
        <p className="text-sm text-muted-foreground max-w-xs text-balance">
          {t("play.songPrompt")}
        </p>
      </div>

      <form
        className="flex w-full flex-col items-stretch gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          submit(value)
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("play.songPlaceholder")}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          disabled={submitting}
          aria-label={t("play.songAriaLabel")}
          className={cn(
            "w-full min-h-12 rounded-full border bg-background/60 px-5 text-base font-semibold",
            "border-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
            "placeholder:text-muted-foreground/50 disabled:opacity-60",
          )}
        />
        <div className="flex w-full gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => submit("")}
            disabled={submitting}
            className="flex-1 min-h-12 rounded-full text-sm font-bold text-muted-foreground hover:text-foreground"
          >
            {t("common.skip")}
          </Button>
          <Button
            type="submit"
            size="lg"
            disabled={submitting || value.trim().length === 0}
            className="flex-[2] cta-glow min-h-12 text-base font-bold"
          >
            {submitting ? "…" : t("common.submit")}
          </Button>
        </div>
      </form>
    </div>
  )
}

function Reveal({
  mode,
  artistResult,
  songResult,
  clozeOutcome,
  onNext,
  loading,
  isLastRound,
}: {
  mode: Round["mode"]
  artistResult: AnswerResult
  songResult: SongGuessResult | null
  clozeOutcome: ClozeOutcome | null
  onNext: () => void
  loading: boolean
  isLastRound: boolean
}) {
  const { t } = useTranslation()
  const artistCorrect = artistResult.isCorrect
  const song: SongReveal | null = songResult?.song ?? artistResult.song
  const songCorrect = songResult?.isCorrect ?? false
  const clozeCorrect = clozeOutcome?.isCorrect ?? false
  const verdict = useMemo(
    () =>
      mode === "cloze"
        ? clozeVerdictCopy(t, clozeCorrect, songResult ? songCorrect : null)
        : verdictCopy(t, artistCorrect, songResult ? songCorrect : null),
    [t, mode, artistCorrect, clozeCorrect, songCorrect, songResult],
  )
  // In cloze mode the artist is pre-known; the win/loss line is the cloze pick
  // (and optionally the bonus song step).
  const highlight = mode === "cloze" ? clozeCorrect : artistCorrect

  return (
    <div className="relative">
      <div
        className={cn(
          "flex flex-col items-center gap-5 rounded-3xl p-6 text-center",
          "border bg-card/40 backdrop-blur-[2px]",
          highlight ? "border-primary/40" : "border-border/50",
        )}
        style={{ animation: `pq-fade-up 0.55s ${ease} both` }}
      >
        <span
          role="status"
          aria-live="polite"
          className={cn(
            "inline-flex items-center gap-2 text-xs font-bold tracking-[0.16em] uppercase",
            highlight ? "text-primary" : "text-muted-foreground",
          )}
        >
          <span className="opacity-50">/</span>
          {verdict.label}
        </span>

        <AlbumArt artist={artistResult.correctArtist} song={song} highlight={highlight} />

        <div className="flex flex-col items-center gap-1.5">
          {/*
            Hierarchy is driven by what the user was *most recently* guessing:
            - songResult present (i.e. went through the song step) → the song
              they were trying to name is the hero, artist drops to meta.
            - Otherwise (classic mode, wrong artist → fast fail, no song step)
              → artist stays the hero with song shown as supporting context.
          */}
          {song && songResult ? (
            <>
              <p
                className={cn(
                  "text-xl font-extrabold leading-tight tracking-tight",
                  songCorrect ? "text-primary" : "text-foreground",
                )}
              >
                {song.title}
              </p>
              <p className="text-sm text-muted-foreground">
                <span className="text-foreground/80">{artistResult.correctArtist.name}</span>
                {song.album && <span className="opacity-50"> · {song.album}</span>}
                {song.releaseYear && <span className="opacity-50"> · {song.releaseYear}</span>}
              </p>
            </>
          ) : (
            <>
              <p className="text-xl font-extrabold leading-tight tracking-tight">
                {artistResult.correctArtist.name}
              </p>
              {song && (
                <p className="text-sm text-muted-foreground">
                  <span className="text-foreground/80">{song.title}</span>
                  {song.album && <span className="opacity-50"> · {song.album}</span>}
                  {song.releaseYear && <span className="opacity-50"> · {song.releaseYear}</span>}
                </p>
              )}
            </>
          )}
        </div>

        {mode === "cloze" && clozeOutcome && (
          <ClozeAnswerCallout outcome={clozeOutcome} />
        )}

        <p className="text-sm text-muted-foreground/80 max-w-xs text-balance">{verdict.line}</p>

        <Button
          size="lg"
          onClick={onNext}
          disabled={loading}
          className={cn("cta-glow mt-1 min-h-12 px-7 text-base font-bold")}
        >
          {loading ? "…" : isLastRound ? t("play.viewScore") : t("play.nextBar")}
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
  song: SongReveal | null
  highlight: boolean
}) {
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
      {song?.albumArtUrl && (
        <img
          src={song.albumArtUrl}
          alt={`${song.album ?? song.title} cover`}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {song && !song.albumArtUrl && (
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

function EmptyArtistState({
  artist,
  mode,
}: {
  artist: ArtistContext | null
  mode: "artist" | "cloze"
}) {
  const { t } = useTranslation()
  const headline = artist
    ? mode === "cloze"
      ? t("play.empty.artistNoCloze", { name: artist.name })
      : t("play.empty.artistComing", { name: artist.name })
    : mode === "cloze"
      ? t("play.empty.noClozeYet")
      : t("play.empty.noBars")
  return (
    <div className="relative flex min-h-svh flex-col">
      <Header score={{ right: 0, total: 0 }} streak={0} artistCtx={artist} playMode={mode} />
      <div className="pq-spotlight pointer-events-none absolute inset-0" aria-hidden="true" />
      <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
        <span className="text-xs font-bold tracking-[0.18em] uppercase text-primary/70">
          {t("play.empty.eyebrow")}
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight">{headline}</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          {mode === "cloze" ? t("play.empty.tryClassic") : t("play.empty.moreComing")}
        </p>
        <Link
          to="/play"
          search={mode === "cloze" ? { mode: "cloze" } : {}}
          className={cn(
            "cta-glow inline-flex min-h-12 items-center justify-center rounded-full px-7 text-base font-bold",
            "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {mode === "cloze" ? t("play.empty.allCloze") : t("play.empty.allArtists")}
        </Link>
        <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
          {t("play.empty.backToPicker")}
        </Link>
      </main>
    </div>
  )
}

function ClozeAnswerCallout({ outcome }: { outcome: ClozeOutcome }) {
  const { t } = useTranslation()
  return (
    <div
      className={cn(
        "flex w-full max-w-sm flex-col gap-1 rounded-2xl border px-4 py-3 text-left text-sm",
        outcome.isCorrect
          ? "border-primary/40 bg-primary/5"
          : "border-destructive/30 bg-destructive/5",
      )}
    >
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        {outcome.isCorrect ? t("play.yourAnswer") : t("play.correctAnswer")}
      </span>
      <span
        className={cn(
          "text-base font-extrabold tracking-tight",
          outcome.isCorrect ? "text-primary" : "text-foreground",
        )}
      >
        {outcome.isCorrect ? outcome.guess : outcome.correctAnswer}
      </span>
      {!outcome.isCorrect && outcome.guess && (
        <span className="text-xs text-muted-foreground">
          {t("play.you")}: <span className="line-through opacity-70">{outcome.guess}</span>
        </span>
      )}
    </div>
  )
}

function clozeVerdictCopy(
  t: TFunction,
  clozeCorrect: boolean,
  songCorrect: boolean | null,
): { label: string; line: string } {
  if (clozeCorrect && songCorrect === true) {
    return { label: t("play.verdict.labelBoth"), line: t("play.verdict.clozeBothCorrect") }
  }
  if (clozeCorrect && songCorrect === false) {
    return { label: t("play.verdict.labelHalf"), line: t("play.verdict.clozeCorrectSongWrong") }
  }
  if (clozeCorrect) {
    return { label: t("play.verdict.labelBoth"), line: t("play.verdict.clozeCorrect") }
  }
  return { label: t("play.verdict.labelWrong"), line: t("play.verdict.wrong") }
}

function verdictCopy(
  t: TFunction,
  artistCorrect: boolean,
  songCorrect: boolean | null,
): { label: string; line: string } {
  if (artistCorrect && songCorrect === true) {
    return { label: t("play.verdict.labelBoth"), line: t("play.verdict.bothCorrect") }
  }
  if (artistCorrect && songCorrect === false) {
    return { label: t("play.verdict.labelHalf"), line: t("play.verdict.artistCorrectSongWrong") }
  }
  if (artistCorrect) {
    return { label: t("play.verdict.labelBoth"), line: t("play.verdict.artistCorrect") }
  }
  return { label: t("play.verdict.labelWrong"), line: t("play.verdict.wrong") }
}
