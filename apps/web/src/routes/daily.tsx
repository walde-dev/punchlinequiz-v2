import { Link, createFileRoute } from "@tanstack/react-router"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"

import { AnonymousXpCta } from "../components/anonymous-xp-cta"
import { BarCredit } from "../components/bar-credit"
import { Confetti } from "../components/confetti"
import { DiscordJoinCard } from "../components/discord-cta"
import { LangToggle } from "../components/lang-toggle"
import { LevelUpModal } from "../components/level-up-modal"
import { XpGain } from "../components/xp-gain"
import {
  getDailyChallenge,
  submitDailyArtistGuess,
  submitDailySongGuess,
} from "../lib/daily"
import { seo } from "../lib/seo"
import { logEvent } from "../lib/track"
import type { DailyArtistChoice, DailyChallenge } from "../lib/daily"
import type { LevelInfo, XpGrantResult } from "../lib/xp"

type DailySearch = { date?: string }

export const Route = createFileRoute("/daily")({
  component: DailyPage,
  head: () =>
    seo({
      title: "Daily Bar",
      description:
        "Die tägliche Bar — errate Künstler und Song. Jeden Tag eine neue Punchline.",
      path: "/daily",
    }),
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

/** 🟩 first try · 🟨 got it after a miss · 🟥 never got it (only on bail). */
type ArtistTier = "first" | "retry" | "missed"

type LocalState = {
  artistId: number
  artistCorrect: boolean
  /** Optional for back-compat with rows written before three-tier landed. */
  artistTier?: ArtistTier
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
  // Wrong picks stay on screen, eliminated; the day only advances on a hit.
  const [wrongArtistIds, setWrongArtistIds] = useState<Array<number>>([])
  const [pendingArtistId, setPendingArtistId] = useState<number | null>(null)
  const [songGuess, setSongGuess] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [artistResult, setArtistResult] = useState<{
    isCorrect: boolean
    tier: ArtistTier
    correctArtist: DailyArtistChoice
  } | null>(
    initialStored
      ? {
          isCorrect: initialStored.artistCorrect,
          tier:
            initialStored.artistTier ??
            (initialStored.artistCorrect ? "first" : "missed"),
          correctArtist: {
            id: initialStored.artistId,
            name: initialStored.artistName,
            imageUrl: daily.artistImageUrl,
          },
        }
      : null
  )
  const [songResult, setSongResult] = useState<{
    isCorrect: boolean
    song: {
      title: string
      album: string | null
      albumArtUrl: string | null
      releaseYear: number | null
    }
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
      : null
  )
  const [confettiKey, setConfettiKey] = useState(0)
  const [wrongShake, setWrongShake] = useState(0)
  const [xpGrant, setXpGrant] = useState<{
    key: number
    grant: XpGrantResult
  } | null>(null)
  const [levelUp, setLevelUp] = useState<LevelInfo | null>(null)
  const [anonCtaKey, setAnonCtaKey] = useState(0)
  const loggedRef = useRef(false)

  function consumeXp(
    grant: XpGrantResult | null | undefined,
    isCorrect: boolean
  ) {
    if (!isCorrect) return
    if (grant === null) {
      setAnonCtaKey((k) => k + 1)
      return
    }
    if (!grant || grant.awarded === false) return
    if (grant.leveledUp) {
      setLevelUp(grant.level)
    } else if (grant.xpAwarded > 0) {
      setXpGrant({ key: Date.now(), grant })
    }
  }

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
    if (wrongArtistIds.includes(choice.id)) return
    const firstTry = wrongArtistIds.length === 0
    const attempt = wrongArtistIds.length + 1
    setPendingArtistId(choice.id)
    setSubmitting(true)
    logEvent("daily_artist_submitted", {
      daily_date: daily.date,
      artist_id: choice.id,
      attempt,
    })
    try {
      const res = await submitDailyArtistGuess({
        data: {
          punchlineId: daily.punchlineId,
          artistId: choice.id,
          date: daily.date,
          firstTry,
        },
      })
      logEvent("daily_artist_revealed", {
        daily_date: daily.date,
        punchline_id: daily.punchlineId,
        is_correct: res.isCorrect,
        attempt,
        artist_id: choice.id,
        correct_artist_id: res.correctArtist.id,
      })
      if (res.isCorrect) {
        // Their success moment — reveal the artist, then the song prompt.
        setArtistResult({
          isCorrect: true,
          tier: firstTry ? "first" : "retry",
          correctArtist: res.correctArtist,
        })
        consumeXp(res.xp, true)
        setConfettiKey((k) => k + 1)
        setPhase("song")
      } else {
        // No block — eliminate the miss and let them go again.
        setWrongArtistIds((ids) => [...ids, choice.id])
        setWrongShake((s) => s + 1)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setPendingArtistId(null)
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
        data: {
          punchlineId: daily.punchlineId,
          guess: trimmed,
          date: daily.date,
        },
      })
      setSongResult(res)
      consumeXp(res.xp, res.isCorrect)
      logEvent("daily_song_revealed", {
        daily_date: daily.date,
        punchline_id: daily.punchlineId,
        is_correct: res.isCorrect,
        skipped: skip,
      })
      if (res.isCorrect) {
        setConfettiKey((k) => k + 1)
      }
      if (artistResult) {
        writeLocal(daily.date, {
          artistId: artistResult.correctArtist.id,
          artistCorrect: artistResult.isCorrect,
          artistTier: artistResult.tier,
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
      <div
        className="pq-spotlight pointer-events-none absolute inset-0"
        aria-hidden="true"
      />

      <main className="relative flex flex-1 flex-col px-5 pt-20 pb-8 md:px-8">
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6">
          <BarDisplay
            line={daily.line}
            shakeKey={wrongShake}
            dailyNumber={daily.number}
            submittedByHandle={daily.submittedByHandle}
          />

          <div className="relative">
            <Confetti trigger={confettiKey} />
            {xpGrant && <XpGain key={xpGrant.key} xp={xpGrant.grant} />}
            <AnonymousXpCta triggerKey={anonCtaKey} />
            {phase === "artist" && (
              <ArtistChoices
                choices={daily.choices}
                onPick={onArtistPick}
                wrongIds={wrongArtistIds}
                pendingId={pendingArtistId}
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

      <LevelUpModal level={levelUp} onClose={() => setLevelUp(null)} />
    </div>
  )
}

function Header({ dailyNumber, date }: { dailyNumber: number; date: string }) {
  const { t } = useTranslation()
  return (
    <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between gap-3 border-b border-border/40 bg-background/95 px-5 md:bg-background/80 md:backdrop-blur-sm">
      <Link
        to="/"
        aria-label={t("common.backToHome")}
        className="flex min-w-0 items-center gap-2.5 select-none"
      >
        <span className="text-base font-bold tracking-tight whitespace-nowrap">
          <span className="text-foreground">punchline</span>
          <span className="text-primary">/quiz</span>
        </span>
        <span className="text-sm text-primary/40 select-none">/</span>
        <span className="text-[10px] font-bold tracking-[0.16em] text-primary/80 uppercase whitespace-nowrap">
          daily #{dailyNumber}
        </span>
      </Link>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className="text-xs font-medium whitespace-nowrap text-muted-foreground tabular-nums"
          aria-label={t("daily.dateAria", { date })}
        >
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
  submittedByHandle,
}: {
  line: string
  shakeKey: number
  dailyNumber: number
  submittedByHandle?: string | null
}) {
  const { t } = useTranslation()
  return (
    <div
      key={shakeKey}
      className="flex flex-col items-start gap-3"
      style={{ animation: `pq-fade-up 0.5s ${ease} both` }}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span className="text-xs font-semibold tracking-[0.16em] text-primary/70 uppercase">
          {t("daily.eyebrowBar")}
        </span>
        <span className="text-[10px] font-bold tracking-[0.16em] text-muted-foreground uppercase">
          #{dailyNumber}
        </span>
      </div>
      <blockquote
        className="leading-[1.18] font-extrabold tracking-tight text-balance"
        style={{
          fontSize: "clamp(1.6rem, 5.5vw, 2.5rem)",
          animation: shakeKey ? `pq-shake 0.45s ${ease} both` : undefined,
        }}
      >
        <span className="mr-1 text-primary/40 select-none">"</span>
        {renderBarLines(line)}
        <span className="ml-1 text-primary/40 select-none">"</span>
      </blockquote>
      <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-sm text-muted-foreground">{t("daily.subtext")}</p>
        <BarCredit handle={submittedByHandle} />
      </div>
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
  wrongIds,
  pendingId,
  disabled,
}: {
  choices: Array<DailyArtistChoice>
  onPick: (c: DailyArtistChoice) => void
  wrongIds: Array<number>
  pendingId: number | null
  disabled: boolean
}) {
  const { t } = useTranslation()
  const missed = wrongIds.length > 0
  return (
    <div
      className="flex flex-col gap-3"
      style={{ animation: `pq-fade-up 0.55s ${ease} 0.15s both` }}
    >
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-bold tracking-[0.16em] text-primary/80 uppercase">
          {t("daily.eyebrowArtist")}
        </span>
      </div>
      <p className="px-1 text-sm text-muted-foreground">
        {missed ? t("daily.artistRetry") : t("daily.questionArtist")}
      </p>
      {choices.map((c, i) => {
        const isWrong = wrongIds.includes(c.id)
        const isPending = pendingId === c.id
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onPick(c)}
            disabled={disabled || isWrong}
            className={cn(
              "group relative flex min-h-14 w-full items-center gap-3 rounded-full px-4 py-3",
              "border bg-card/60 text-left text-base font-semibold transition-all",
              "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
              "disabled:cursor-not-allowed",
              isWrong
                ? "border-destructive/40 bg-destructive/5 text-muted-foreground/70 line-through opacity-60"
                : isPending
                  ? "border-primary bg-primary/10"
                  : "border-border/60 hover:border-primary/40 hover:bg-card disabled:opacity-60"
            )}
            style={{
              animation: `pq-fade-up 0.5s ${ease} ${0.2 + i * 0.07}s both`,
            }}
          >
            <ArtistAvatar artist={c} size={36} />
            <span className="flex-1">{c.name}</span>
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center text-sm font-bold transition-all",
                isWrong
                  ? "text-destructive/70"
                  : isPending
                    ? "text-primary"
                    : "text-muted-foreground/30"
              )}
              aria-hidden="true"
            >
              {isWrong ? "✕" : isPending ? "…" : ""}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function ArtistAvatar({
  artist,
  size,
}: {
  artist: DailyArtistChoice
  size: number
}) {
  const initials = artist.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
  return (
    <div
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-muted/60"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {artist.imageUrl ? (
        <img
          src={artist.imageUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="text-[0.7em] font-bold tracking-tight text-foreground/70">
          {initials}
        </span>
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
        <span className="text-[11px] font-bold tracking-[0.16em] text-primary/80 uppercase">
          {eyebrow}
        </span>
        <span className="text-[11px] font-bold tracking-[0.16em] text-muted-foreground/60 uppercase">
          {t("daily.oneShot")}
        </span>
      </div>
      <p className="px-1 text-sm text-muted-foreground">{question}</p>
      <Input
        ref={inputRef}
        size="hero"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        disabled={submitting}
      />
      <div className="flex gap-2">
        {onSkip && (
          <Button
            type="button"
            variant="ghost"
            onClick={onSkip}
            disabled={submitting}
            className="min-h-12 flex-1 text-sm font-bold text-muted-foreground hover:text-foreground"
          >
            {t("common.skip")}
          </Button>
        )}
        <Button
          type="submit"
          size="lg"
          disabled={submitting || value.trim().length === 0}
          className={cn(
            "cta-glow min-h-12 text-base font-bold",
            onSkip ? "flex-[2]" : "w-full"
          )}
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
    tier: ArtistTier
    correctArtist: { id: number; name: string; imageUrl: string | null }
  }
  songResult: {
    isCorrect: boolean
    song: {
      title: string
      album: string | null
      albumArtUrl: string | null
      releaseYear: number | null
    }
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
    const artistCell =
      artistResult.tier === "missed"
        ? "🟥"
        : artistResult.tier === "retry"
          ? "🟨"
          : "🟩"
    const grid = `${artistCell}${songResult.isCorrect ? "🟩" : "🟥"}`
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
        both
          ? "border-primary/40"
          : half
            ? "border-primary/25"
            : "border-border/50"
      )}
      style={{ animation: `pq-fade-up 0.55s ${ease} both` }}
    >
      <span
        className={cn(
          "inline-flex items-center gap-2 text-xs font-bold tracking-[0.16em] uppercase",
          both ? "text-primary" : "text-muted-foreground"
        )}
      >
        <span className="opacity-50">/</span>
        {verdict.label}
      </span>

      <WordleGrid artistTier={artistResult.tier} song={songResult.isCorrect} />

      <AlbumArt
        artistImage={daily.artistImageUrl}
        albumArt={songResult.song.albumArtUrl}
        highlight={both}
      />

      <div className="flex flex-col items-center gap-1.5">
        <p className="text-xl leading-tight font-extrabold tracking-tight">
          {songResult.song.title}
        </p>
        <p className="text-sm text-muted-foreground">
          <span className="text-foreground/80">
            {artistResult.correctArtist.name}
          </span>
          {songResult.song.album && (
            <span className="opacity-50"> · {songResult.song.album}</span>
          )}
          {songResult.song.releaseYear && (
            <span className="opacity-50"> · {songResult.song.releaseYear}</span>
          )}
        </p>
      </div>

      <p className="max-w-xs text-sm text-balance text-muted-foreground/80">
        {verdict.line}
      </p>

      <Button
        size="lg"
        onClick={onShare}
        className="cta-glow mt-1 min-h-12 px-7 text-base font-bold"
      >
        {copied ? `✓ ${t("common.copied")}` : t("common.share")}
      </Button>

      <div className="flex flex-col items-center gap-1 text-xs text-muted-foreground/70">
        <span className="font-bold tracking-[0.16em] text-primary/70 uppercase">
          {t("daily.nextIn")}
        </span>
        <span className="font-mono text-base text-foreground tabular-nums">
          {countdown}
        </span>
      </div>

      <DiscordJoinCard
        placement="daily_done"
        delay={0.1}
        className="mt-1 w-full text-left"
      />

      <Link
        to="/play"
        className="text-xs font-bold tracking-[0.16em] text-muted-foreground uppercase hover:text-primary"
      >
        {t("daily.keepPlaying")}
      </Link>
    </div>
  )
}

function WordleGrid({
  artistTier,
  song,
}: {
  artistTier: ArtistTier
  song: boolean
}) {
  const { t } = useTranslation()
  const artistState: CellState =
    artistTier === "missed" ? "wrong" : artistTier === "retry" ? "retry" : "hit"
  const cells: Array<{ label: string; state: CellState }> = [
    { label: "Artist", state: artistState },
    { label: "Song", state: song ? "hit" : "wrong" },
  ]
  const resultKey: Record<CellState, string> = {
    hit: "daily.wordleCorrect",
    retry: "daily.wordleRetry",
    wrong: "daily.wordleWrong",
  }
  return (
    <div className="flex items-center gap-2">
      {cells.map((c) => (
        <div
          key={c.label}
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-lg border-2 text-xs font-bold tracking-wide uppercase",
            c.state === "hit"
              ? "border-primary/80 bg-primary/20 text-primary"
              : c.state === "retry"
                ? "border-primary/40 bg-primary/10 text-primary/70"
                : "border-destructive/50 bg-destructive/15 text-destructive/80"
          )}
          aria-label={t("daily.wordleAria", {
            label: c.label,
            result: t(resultKey[c.state]),
          })}
        >
          {c.state === "wrong" ? "✕" : "✓"}
        </div>
      ))}
    </div>
  )
}

type CellState = "hit" | "retry" | "wrong"

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
        "relative aspect-square w-32 overflow-hidden rounded-2xl border sm:w-40",
        highlight ? "border-primary/50" : "border-border/60"
      )}
      style={{
        animation: `pq-pop-in 0.6s ${ease} 0.1s both`,
        background:
          "radial-gradient(ellipse 80% 60% at 30% 25%, color-mix(in oklch, var(--primary), transparent 55%) 0%, transparent 70%), linear-gradient(160deg, var(--card), var(--background))",
      }}
    >
      {url && (
        <img
          src={url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {highlight && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
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
    const berlinNow = new Date(
      d.toLocaleString("en-US", { timeZone: "Europe/Berlin" })
    )
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
      <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b border-border/40 bg-background/95 px-5 md:bg-background/80 md:backdrop-blur-sm">
        <Link to="/" className="text-base font-bold tracking-tight select-none">
          <span className="text-foreground">punchline</span>
          <span className="text-primary">/quiz</span>
          <span className="mx-1.5 text-primary/40">/</span>
          <span className="text-[10px] tracking-[0.16em] text-primary/80 uppercase">
            daily
          </span>
        </Link>
      </header>
      <div
        className="pq-spotlight pointer-events-none absolute inset-0"
        aria-hidden="true"
      />
      <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
        <span className="text-xs font-bold tracking-[0.18em] text-primary/70 uppercase">
          {t("daily.empty.eyebrow")}
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight">
          {requestedDate
            ? t("daily.empty.headlineDate", { date: requestedDate })
            : t("daily.empty.headline")}
        </h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          {t("daily.empty.subtext")}
        </p>
        <Link
          to="/play"
          className={cn(
            "cta-glow inline-flex min-h-12 items-center justify-center rounded-full px-7 text-base font-bold",
            "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          {t("daily.empty.classicCta")}
        </Link>
        <Link
          to="/"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← {t("common.back")}
        </Link>
      </main>
    </div>
  )
}
