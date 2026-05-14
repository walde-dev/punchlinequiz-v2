import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { Confetti } from "../components/confetti"
import { LangToggle } from "../components/lang-toggle"
import {
  getDailyChallenge,
  submitDailyArtistGuess,
  submitDailySongGuess,
  type DailyArtistChoice,
  type DailyChallenge,
} from "../lib/daily"
import { logEvent } from "../lib/track"

type DailySearch = { date?: string }

export const Route = createFileRoute("/daily")({
  component: DailyPage,
  validateSearch: (search: Record<string, unknown>): DailySearch => ({
    date: typeof search.date === "string" ? search.date : undefined,
  }),
  loaderDeps: ({ search }) => ({ date: search.date }),
  loader: async ({ deps }) => {
    const daily = await getDailyChallenge({ data: { date: deps.date } })
    return { daily, requestedDate: deps.date ?? null }
  },
})

const ease = "cubic-bezier(0.16, 1, 0.3, 1)"

type LocalState = {
  artistId: number
  artistCorrect: boolean
  songGuess: string
  songCorrect: boolean
  artistName: string
  songTitle: string
  completedAt: string
}

type Phase = "artist" | "song" | "done"

function storageKey(date: string) {
  return `pq_daily_${date}`
}

function readLocal(date: string): LocalState | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(storageKey(date))
    return raw ? (JSON.parse(raw) as LocalState) : null
  } catch {
    return null
  }
}

function writeLocal(date: string, state: LocalState) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(storageKey(date), JSON.stringify(state))
  } catch {
    // ignore quota / private mode errors — UI still works mid-session.
  }
}

function DailyPage() {
  const { daily, requestedDate } = Route.useLoaderData()
  if (!daily) {
    return <NoDailyState requestedDate={requestedDate} />
  }
  return <DailyInner daily={daily} />
}

function DailyInner({ daily }: { daily: DailyChallenge }) {
  const { t } = useTranslation()
  const initialStored = useMemo(() => readLocal(daily.date), [daily.date])
  const [phase, setPhase] = useState<Phase>(initialStored ? "done" : "artist")
  const [pickedArtistId, setPickedArtistId] = useState<number | null>(
    initialStored?.artistId ?? null,
  )
  const [songGuess, setSongGuess] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [artistResult, setArtistResult] = useState<{
    isCorrect: boolean
    correctArtist: DailyArtistChoice
  } | null>(
    initialStored
      ? {
          isCorrect: initialStored.artistCorrect,
          correctArtist: {
            id: initialStored.artistId,
            name: initialStored.artistName,
            imageUrl: daily.artistImageUrl,
          },
        }
      : null,
  )
  const [songResult, setSongResult] = useState<{
    isCorrect: boolean
    song: { title: string; album: string | null; albumArtUrl: string | null; releaseYear: number | null }
  } | null>(
    initialStored
      ? {
          isCorrect: initialStored.songCorrect,
          song: {
            title: initialStored.songTitle,
            album: daily.album,
            albumArtUrl: daily.albumArtUrl,
            releaseYear: daily.releaseYear,
          },
        }
      : null,
  )
  const [confettiKey, setConfettiKey] = useState(0)
  const [wrongShake, setWrongShake] = useState(0)
  const loggedRef = useRef(false)

  useEffect(() => {
    if (loggedRef.current) return
    loggedRef.current = true
    logEvent("daily_opened", {
      daily_date: daily.date,
      daily_number: daily.number,
      punchline_id: daily.punchlineId,
      already_completed: phase === "done",
    })
  }, [daily, phase])

  async function onArtistPick(choice: DailyArtistChoice) {
    if (submitting || phase !== "artist") return
    setPickedArtistId(choice.id)
    setSubmitting(true)
    logEvent("daily_artist_submitted", {
      daily_date: daily.date,
      artist_id: choice.id,
    })
    try {
      const res = await submitDailyArtistGuess({
        data: { punchlineId: daily.punchlineId, artistId: choice.id },
      })
      setArtistResult(res)
      logEvent("daily_artist_revealed", {
        daily_date: daily.date,
        is_correct: res.isCorrect,
        artist_id: choice.id,
        correct_artist_id: res.correctArtist.id,
      })
      if (res.isCorrect) {
        setConfettiKey((k) => k + 1)
      } else {
        setWrongShake((s) => s + 1)
      }
      setPhase("song")
    } catch (err) {
      console.error(err)
      setPickedArtistId(null)
    } finally {
      setSubmitting(false)
    }
  }

  async function onSongSubmit(skip = false) {
    const trimmed = skip ? "" : songGuess.trim()
    if (submitting) return
    if (!skip && !trimmed) return
    setSubmitting(true)
    logEvent("daily_song_submitted", { daily_date: daily.date, skipped: skip })
    try {
      const res = await submitDailySongGuess({
        data: { punchlineId: daily.punchlineId, guess: trimmed },
      })
      setSongResult(res)
      logEvent("daily_song_revealed", {
        daily_date: daily.date,
        is_correct: res.isCorrect,
        skipped: skip,
      })
      if (res.isCorrect) {
        setConfettiKey((k) => k + 1)
      }
      if (artistResult && pickedArtistId != null) {
        writeLocal(daily.date, {
          artistId: pickedArtistId,
          artistCorrect: artistResult.isCorrect,
          songGuess: trimmed,
          songCorrect: res.isCorrect,
          artistName: artistResult.correctArtist.name,
          songTitle: res.song.title,
          completedAt: new Date().toISOString(),
        })
      }
      setPhase("done")
    } catch (err) {
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden">
      <Header dailyNumber={daily.number} date={daily.date} />
      <div className="pq-spotlight pointer-events-none absolute inset-0" aria-hidden="true" />

      <main className="relative flex flex-1 flex-col px-5 pt-20 pb-8 md:px-8">
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-between gap-8">
          <BarDisplay line={daily.line} shakeKey={wrongShake} dailyNumber={daily.number} />

          <div className="relative">
            <Confetti trigger={confettiKey} />
            {phase === "artist" && (
              <ArtistChoices
                choices={daily.choices}
                onPick={onArtistPick}
                pickedId={pickedArtistId}
                disabled={submitting}
              />
            )}
            {phase === "song" && (
              <FreeTextStep
                eyebrow={t("daily.eyebrowSong")}
                placeholder={t("daily.songPlaceholder")}
                question={t("daily.questionSong")}
                value={songGuess}
                onChange={setSongGuess}
                onSubmit={() => onSongSubmit(false)}
                onSkip={() => onSongSubmit(true)}
                submitting={submitting}
              />
            )}
            {phase === "done" && artistResult && songResult && (
              <DailyResult
                daily={daily}
                artistResult={artistResult}
                songResult={songResult}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

function Header({ dailyNumber, date }: { dailyNumber: number; date: string }) {
  const { t } = useTranslation()
  return (
    <header className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-5 h-14 border-b border-border/40 bg-background/95 md:bg-background/80 md:backdrop-blur-sm">
      <Link to="/" aria-label={t("common.backToHome")} className="select-none flex items-center gap-2.5">
        <span className="font-bold text-base tracking-tight">
          <span className="text-foreground">punchline</span>
          <span className="text-primary">/quiz</span>
        </span>
        <span className="text-primary/40 text-sm select-none">/</span>
        <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-primary/80">
          daily #{dailyNumber}
        </span>
      </Link>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium tabular-nums text-muted-foreground" aria-label={t("daily.dateAria", { date })}>
          {date}
        </span>
        <LangToggle />
      </div>
    </header>
  )
}

function BarDisplay({
  line,
  shakeKey,
  dailyNumber,
}: {
  line: string
  shakeKey: number
  dailyNumber: number
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
          {t("daily.eyebrowBar")}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          #{dailyNumber}
        </span>
      </div>
      <blockquote
        className="font-extrabold leading-[1.18] tracking-tight text-balance"
        style={{
          fontSize: "clamp(1.6rem, 5.5vw, 2.5rem)",
          animation: shakeKey ? `pq-shake 0.45s ${ease} both` : undefined,
        }}
      >
        <span className="text-primary/40 select-none mr-1">"</span>
        {renderBarLines(line)}
        <span className="text-primary/40 select-none ml-1">"</span>
      </blockquote>
      <p className="text-sm text-muted-foreground">{t("daily.subtext")}</p>
    </div>
  )
}

function renderBarLines(line: string): React.ReactNode {
  const parts = line.split("/")
  return parts.map((seg, i) => {
    const isLast = i === parts.length - 1
    const text = seg.trimStart().replace(/\s+$/, "")
    return (
      <span key={i} className="block">
        {text}
        {!isLast && <span className="text-primary/50 select-none"> /</span>}
      </span>
    )
  })
}

function ArtistChoices({
  choices,
  onPick,
  pickedId,
  disabled,
}: {
  choices: DailyArtistChoice[]
  onPick: (c: DailyArtistChoice) => void
  pickedId: number | null
  disabled: boolean
}) {
  const { t } = useTranslation()
  return (
    <div
      className="flex flex-col gap-3"
      style={{ animation: `pq-fade-up 0.55s ${ease} 0.15s both` }}
    >
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-bold tracking-[0.16em] uppercase text-primary/80">
          {t("daily.eyebrowArtist")}
        </span>
        <span className="text-[11px] font-bold tracking-[0.16em] uppercase text-muted-foreground/60">
          {t("daily.oneShot")}
        </span>
      </div>
      <p className="px-1 text-sm text-muted-foreground">{t("daily.questionArtist")}</p>
      {choices.map((c, i) => {
        const isSelected = pickedId === c.id
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onPick(c)}
            disabled={disabled || pickedId !== null}
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

function ArtistAvatar({ artist, size }: { artist: DailyArtistChoice; size: number }) {
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

function FreeTextStep({
  eyebrow,
  question,
  placeholder,
  value,
  onChange,
  onSubmit,
  onSkip,
  submitting,
}: {
  eyebrow: string
  question: string
  placeholder: string
  value: string
  onChange: (s: string) => void
  onSubmit: () => void
  onSkip?: () => void
  submitting: boolean
}) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    inputRef.current?.focus()
  }, [eyebrow])

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
      className="flex w-full flex-col gap-3"
      style={{ animation: `pq-fade-up 0.55s ${ease} 0.15s both` }}
    >
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-bold tracking-[0.16em] uppercase text-primary/80">
          {eyebrow}
        </span>
        <span className="text-[11px] font-bold tracking-[0.16em] uppercase text-muted-foreground/60">
          {t("daily.oneShot")}
        </span>
      </div>
      <p className="px-1 text-sm text-muted-foreground">{question}</p>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        disabled={submitting}
        className={cn(
          "w-full min-h-14 rounded-full border bg-background/60 px-5 text-lg font-bold",
          "border-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
          "placeholder:text-muted-foreground/50 disabled:opacity-60",
        )}
      />
      <div className="flex gap-2">
        {onSkip && (
          <Button
            type="button"
            variant="ghost"
            onClick={onSkip}
            disabled={submitting}
            className="flex-1 min-h-12 rounded-full text-sm font-bold text-muted-foreground hover:text-foreground"
          >
            {t("common.skip")}
          </Button>
        )}
        <Button
          type="submit"
          size="lg"
          disabled={submitting || value.trim().length === 0}
          className={cn("cta-glow min-h-12 text-base font-bold", onSkip ? "flex-[2]" : "w-full")}
        >
          {submitting ? "…" : t("common.submit")}
        </Button>
      </div>
    </form>
  )
}

function DailyResult({
  daily,
  artistResult,
  songResult,
}: {
  daily: DailyChallenge
  artistResult: {
    isCorrect: boolean
    correctArtist: { id: number; name: string; imageUrl: string | null }
  }
  songResult: {
    isCorrect: boolean
    song: { title: string; album: string | null; albumArtUrl: string | null; releaseYear: number | null }
  }
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const both = artistResult.isCorrect && songResult.isCorrect
  const half = artistResult.isCorrect !== songResult.isCorrect
  const verdict = both
    ? { label: t("daily.verdict.bothLabel"), line: t("daily.verdict.both") }
    : half
      ? { label: t("daily.verdict.halfLabel"), line: t("daily.verdict.half") }
      : { label: t("daily.verdict.wrongLabel"), line: t("daily.verdict.wrong") }

  const shareText = useMemo(() => {
    const grid = `${artistResult.isCorrect ? "🟩" : "🟥"}${songResult.isCorrect ? "🟩" : "🟥"}`
    return `punchline/quiz daily #${daily.number}\n${grid}\npunchlinequiz.de/daily`
  }, [artistResult, songResult, daily.number])

  const countdown = useNextDailyCountdown()

  async function onShare() {
    logEvent("daily_share_clicked", { daily_date: daily.date })
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text: shareText })
        return
      } catch {
        // fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-5 rounded-3xl p-6 text-center",
        "border bg-card/40 backdrop-blur-[2px]",
        both ? "border-primary/40" : half ? "border-primary/25" : "border-border/50",
      )}
      style={{ animation: `pq-fade-up 0.55s ${ease} both` }}
    >
      <span
        className={cn(
          "inline-flex items-center gap-2 text-xs font-bold tracking-[0.16em] uppercase",
          both ? "text-primary" : "text-muted-foreground",
        )}
      >
        <span className="opacity-50">/</span>
        {verdict.label}
      </span>

      <WordleGrid artist={artistResult.isCorrect} song={songResult.isCorrect} />

      <AlbumArt
        artistImage={daily.artistImageUrl}
        albumArt={songResult.song.albumArtUrl}
        highlight={both}
      />

      <div className="flex flex-col items-center gap-1.5">
        <p className="text-xl font-extrabold leading-tight tracking-tight">{songResult.song.title}</p>
        <p className="text-sm text-muted-foreground">
          <span className="text-foreground/80">{artistResult.correctArtist.name}</span>
          {songResult.song.album && <span className="opacity-50"> · {songResult.song.album}</span>}
          {songResult.song.releaseYear && <span className="opacity-50"> · {songResult.song.releaseYear}</span>}
        </p>
      </div>

      <p className="text-sm text-muted-foreground/80 max-w-xs text-balance">{verdict.line}</p>

      <Button
        size="lg"
        onClick={onShare}
        className="cta-glow mt-1 min-h-12 px-7 text-base font-bold"
      >
        {copied ? `✓ ${t("common.copied")}` : t("common.share")}
      </Button>

      <div className="flex flex-col items-center gap-1 text-xs text-muted-foreground/70">
        <span className="font-bold tracking-[0.16em] uppercase text-primary/70">
          {t("daily.nextIn")}
        </span>
        <span className="font-mono tabular-nums text-base text-foreground">{countdown}</span>
      </div>

      <Link
        to="/play"
        className="text-xs font-bold tracking-[0.16em] uppercase text-muted-foreground hover:text-primary"
      >
        {t("daily.keepPlaying")}
      </Link>
    </div>
  )
}

function WordleGrid({ artist, song }: { artist: boolean; song: boolean }) {
  const { t } = useTranslation()
  const cells = [
    { label: "Artist", correct: artist },
    { label: "Song", correct: song },
  ]
  return (
    <div className="flex items-center gap-2">
      {cells.map((c) => (
        <div
          key={c.label}
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-lg border-2 text-xs font-bold uppercase tracking-wide",
            c.correct
              ? "border-primary/80 bg-primary/20 text-primary"
              : "border-destructive/50 bg-destructive/15 text-destructive/80",
          )}
          aria-label={t("daily.wordleAria", {
            label: c.label,
            result: c.correct ? t("daily.wordleCorrect") : t("daily.wordleWrong"),
          })}
        >
          {c.correct ? "✓" : "✕"}
        </div>
      ))}
    </div>
  )
}

function AlbumArt({
  artistImage,
  albumArt,
  highlight,
}: {
  artistImage: string | null
  albumArt: string | null
  highlight: boolean
}) {
  const url = albumArt ?? artistImage
  return (
    <div
      className={cn(
        "relative aspect-square w-32 sm:w-40 overflow-hidden rounded-2xl border",
        highlight ? "border-primary/50" : "border-border/60",
      )}
      style={{
        animation: `pq-pop-in 0.6s ${ease} 0.1s both`,
        background:
          "radial-gradient(ellipse 80% 60% at 30% 25%, color-mix(in oklch, var(--primary), transparent 55%) 0%, transparent 70%), linear-gradient(160deg, var(--card), var(--background))",
      }}
    >
      {url && (
        <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
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

function useNextDailyCountdown(): string {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  // Midnight CET. Simplification: midnight in Europe/Berlin local clock.
  // Cheap approach: target is "00:00:00 next day in Berlin" expressed as a
  // Date that matches when our clock crosses that wall-clock instant.
  const target = useMemo(() => {
    const d = new Date(now)
    const berlinNow = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Berlin" }))
    const next = new Date(berlinNow)
    next.setHours(24, 0, 0, 0)
    const diffLocal = next.getTime() - berlinNow.getTime()
    return now + diffLocal
  }, [now])
  const remaining = Math.max(0, target - now)
  const hh = Math.floor(remaining / 3_600_000)
  const mm = Math.floor((remaining % 3_600_000) / 60_000)
  const ss = Math.floor((remaining % 60_000) / 1000)
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
}

function NoDailyState({ requestedDate }: { requestedDate: string | null }) {
  const { t } = useTranslation()
  return (
    <div className="relative flex min-h-svh flex-col">
      <header className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-5 h-14 border-b border-border/40 bg-background/95 md:bg-background/80 md:backdrop-blur-sm">
        <Link to="/" className="select-none font-bold text-base tracking-tight">
          <span className="text-foreground">punchline</span>
          <span className="text-primary">/quiz</span>
          <span className="text-primary/40 mx-1.5">/</span>
          <span className="text-[10px] tracking-[0.16em] uppercase text-primary/80">daily</span>
        </Link>
      </header>
      <div className="pq-spotlight pointer-events-none absolute inset-0" aria-hidden="true" />
      <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
        <span className="text-xs font-bold tracking-[0.18em] uppercase text-primary/70">
          {t("daily.empty.eyebrow")}
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight">
          {requestedDate ? t("daily.empty.headlineDate", { date: requestedDate }) : t("daily.empty.headline")}
        </h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          {t("daily.empty.subtext")}
        </p>
        <Link
          to="/play"
          className={cn(
            "cta-glow inline-flex min-h-12 items-center justify-center rounded-full px-7 text-base font-bold",
            "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {t("daily.empty.classicCta")}
        </Link>
        <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
          ← {t("common.back")}
        </Link>
      </main>
    </div>
  )
}
