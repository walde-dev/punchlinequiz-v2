import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { SignUpButton, useAuth } from "@clerk/tanstack-react-start"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"

import { AppHeader } from "../components/app-header"
import { BarCredit } from "../components/bar-credit"
import { rankIconPath } from "../lib/rank-icon"
import {
  createChallengeFn,
  getChallengeFn,
  submitChallengeAttemptFn,
} from "../lib/challenge"
import { readChallengeName, saveChallengeName } from "../lib/challenge-client"
import { renderChallengeCard } from "../lib/share-card"
import { setReferralToken } from "../lib/referral-client"
import { noindexSeo, ogImageUrl, seo } from "../lib/seo"
import { logEvent } from "../lib/track"
import type {
  ChallengeAttemptInput,
  ChallengeBoardEntry,
  ChallengeChoice,
  ChallengeRecapBar,
  ChallengeRound,
  ChallengeView,
} from "../lib/challenge"

export const Route = createFileRoute("/c/$slug")({
  component: ChallengePage,
  loader: async ({ params }) => ({
    data: await getChallengeFn({ data: { slug: params.slug } }),
  }),
  // Dynamic OG so a pasted WhatsApp link unfurls as a personal dare (PUN-123).
  // Stays noindex,follow — challenge boards aren't a search surface. (Declared
  // after `loader` so loaderData's type is inferred.)
  head: ({ loaderData }) => {
    const v = (loaderData as { data: ChallengeView } | undefined)?.data
    if (!v || !v.found) return noindexSeo()
    const who = v.creatorHandle ?? "Jemand"
    const hasScore = v.creatorScore != null
    const title = hasScore
      ? `${who}: ${v.creatorScore}/${v.size}`
      : `${who} fordert dich heraus`
    const subtitle = hasScore
      ? `Schlägst du ${v.creatorScore}/${v.size}?`
      : "Nimm die Challenge an"
    return seo({
      title: `${who} fordert dich heraus`,
      description: `${who} hat ${hasScore ? `${v.creatorScore}/${v.size}` : "eine Challenge"} bei punchlinequiz geholt. Errätst du mehr Künstler hinter den Bars?`,
      image: ogImageUrl({ title, subtitle }),
      noindex: true,
    })
  },
})

const ease = "cubic-bezier(0.16, 1, 0.3, 1)"
const PENDING_PREFIX = "pq.challenge."

function readPending(slug: string): Array<ChallengeAttemptInput> | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(PENDING_PREFIX + slug)
    return raw ? (JSON.parse(raw) as Array<ChallengeAttemptInput>) : null
  } catch {
    return null
  }
}
function writePending(slug: string, answers: Array<ChallengeAttemptInput>) {
  try {
    window.localStorage.setItem(PENDING_PREFIX + slug, JSON.stringify(answers))
  } catch {
    /* ignore */
  }
}
function clearPending(slug: string) {
  try {
    window.localStorage.removeItem(PENDING_PREFIX + slug)
  } catch {
    /* ignore */
  }
}

function fmtSeconds(ms: number): string {
  return (ms / 1000).toFixed(1)
}

function ChallengePage() {
  const { data } = Route.useLoaderData()
  if (!data.found) return <NotFound />
  return <ChallengeRunner data={data} />
}

function NotFound() {
  const { t } = useTranslation()
  return (
    <Shell>
      <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
        <span className="text-xs font-bold tracking-[0.18em] text-primary/70 uppercase">
          404
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight">
          {t("challenge.notFoundTitle")}
        </h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          {t("challenge.notFoundBody")}
        </p>
        <Link
          to="/"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ←
        </Link>
      </main>
    </Shell>
  )
}

type Phase = "intro" | "play" | "result" | "board"

function ChallengeRunner({
  data,
}: {
  data: Extract<ChallengeView, { found: true }>
}) {
  const { isSignedIn } = useAuth()
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>(
    data.viewerAttempt ? "board" : "intro"
  )
  const [board, setBoard] = useState<Array<ChallengeBoardEntry>>(data.board)
  const [result, setResult] = useState<{
    correctCount: number
    solveMs: number
    recap: Array<ChallengeRecapBar>
  } | null>(null)
  const [persisted, setPersisted] = useState<boolean>(!!data.viewerAttempt)
  const [alreadyLocked, setAlreadyLocked] = useState(false)
  const [locked, setLocked] = useState<{
    correctCount: number
    solveMs: number
  } | null>(data.viewerAttempt)
  const [viewerHandle, setViewerHandle] = useState<string | null>(
    data.viewerHandle
  )
  const [submitting, setSubmitting] = useState(false)
  const [creatingNext, setCreatingNext] = useState(false)

  const answersRef = useRef<Array<ChallengeAttemptInput> | null>(null)
  const pendingRef = useRef<Array<ChallengeAttemptInput> | null>(null)
  const claimedRef = useRef(false)

  useEffect(() => {
    logEvent(
      data.viewerIsCreator ? "challenge_gauntlet_started" : "challenge_link_opened",
      { slug: data.slug, creator_score: data.creatorScore }
    )
    // First-touch referral capture for RECIPIENTS only — never the creator
    // viewing their own board (PUN-123/73).
    if (!data.viewerIsCreator)
      setReferralToken({ source: "challenge", value: data.slug })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist (or score-only) an attempt; anon needs a displayName to land on the
  // board, so a name-less anon submit returns persisted:false and we prompt.
  async function persist(
    answers: Array<ChallengeAttemptInput>,
    displayName?: string
  ) {
    const res = await submitChallengeAttemptFn({
      data: { slug: data.slug, answers, displayName },
    })
    if (!res.found) return null
    setResult(res.result)
    setBoard(res.board)
    setPersisted(res.persisted)
    if (res.persisted) {
      setLocked(res.locked)
      setAlreadyLocked(res.alreadyLocked)
      setViewerHandle(res.viewerHandle)
      clearPending(data.slug)
      if (displayName) saveChallengeName(displayName)
    } else {
      pendingRef.current = answers
      writePending(data.slug, answers)
    }
    return res
  }

  async function onComplete(answers: Array<ChallengeAttemptInput>) {
    setSubmitting(true)
    answersRef.current = answers
    try {
      // Signed-in persists immediately; anon persists if we already know a name.
      const name = isSignedIn ? undefined : (readChallengeName() ?? undefined)
      const res = await persist(answers, name)
      if (res)
        logEvent("challenge_play_completed", {
          slug: data.slug,
          correct: res.result.correctCount,
          solve_ms: res.result.solveMs,
          is_creator: data.viewerIsCreator,
        })
      setPhase("result")
    } finally {
      setSubmitting(false)
    }
  }

  // Anon names themselves → re-submit the held run so they land on the board.
  async function onNameSubmit(name: string) {
    if (!answersRef.current || submitting) return
    setSubmitting(true)
    try {
      logEvent("challenge_name_set", { slug: data.slug })
      await persist(answersRef.current, name)
    } finally {
      setSubmitting(false)
    }
  }

  // Propagation: mint a fresh challenge so the recipient dares THEIR friends.
  async function onDareFriends() {
    if (creatingNext) return
    setCreatingNext(true)
    try {
      const { slug } = await createChallengeFn()
      logEvent("challenge_created", { slug, from: "propagation" })
      navigate({ to: "/c/$slug", params: { slug } })
    } catch {
      setCreatingNext(false)
    }
  }

  // Claim a held anonymous run once the player signs in (modal or redirect).
  useEffect(() => {
    if (!isSignedIn || claimedRef.current) return
    const pend = pendingRef.current ?? readPending(data.slug)
    if (!pend) return
    claimedRef.current = true
    ;(async () => {
      const res = await submitChallengeAttemptFn({
        data: { slug: data.slug, answers: pend },
      })
      if (!res.found) return
      setResult(res.result)
      setBoard(res.board)
      setPersisted(true)
      setLocked(res.locked)
      setAlreadyLocked(res.alreadyLocked)
      setViewerHandle(res.viewerHandle)
      clearPending(data.slug)
      pendingRef.current = null
      logEvent("challenge_signup_claimed", {
        slug: data.slug,
        correct: res.result.correctCount,
      })
      setPhase("result")
    })()
  }, [isSignedIn, data.slug])

  function playAgain() {
    setResult(null)
    setPhase("play")
  }

  if (phase === "intro") {
    return (
      <Shell>
        <IntroView
          creatorHandle={data.creatorHandle}
          creatorScore={data.creatorScore}
          size={data.size}
          isCreator={data.viewerIsCreator}
          onStart={() => setPhase("play")}
        />
      </Shell>
    )
  }

  if (phase === "play") {
    return (
      <Shell>
        <ChallengePlay
          rounds={data.rounds}
          submitting={submitting}
          onComplete={onComplete}
        />
      </Shell>
    )
  }

  if (phase === "result" && result) {
    return (
      <Shell>
        <ResultView
          slug={data.slug}
          size={data.size}
          result={result}
          board={board}
          persisted={persisted}
          alreadyLocked={alreadyLocked}
          locked={locked}
          viewerHandle={viewerHandle}
          creatorHandle={data.creatorHandle}
          isCreator={data.viewerIsCreator}
          submitting={submitting}
          creatingNext={creatingNext}
          onNameSubmit={onNameSubmit}
          onDareFriends={onDareFriends}
          onViewBoard={() => setPhase("board")}
        />
      </Shell>
    )
  }

  return (
    <Shell>
      <BoardScreen
        slug={data.slug}
        board={board}
        creatorHandle={data.creatorHandle}
        viewerHandle={viewerHandle}
        locked={locked}
        size={data.size}
        viewerIsCreator={data.viewerIsCreator}
        creatingNext={creatingNext}
        onPlayAgain={playAgain}
        onDareFriends={onDareFriends}
      />
    </Shell>
  )
}

/**
 * Stakes intro (PUN-123): the 1-tap framing before play. Recipients see "X dares
 * you: beat N/5"; the creator setting their own gauntlet sees "set your score".
 */
function IntroView({
  creatorHandle,
  creatorScore,
  size,
  isCreator,
  onStart,
}: {
  creatorHandle: string | null
  creatorScore: number | null
  size: number
  isCreator: boolean
  onStart: () => void
}) {
  const { t } = useTranslation()
  const who = creatorHandle ?? t("challenge.someone")
  return (
    <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="text-xs font-bold tracking-[0.2em] text-primary/80 uppercase">
        {isCreator ? t("challenge.intro.creatorEyebrow") : t("challenge.eyebrow")}
      </span>
      <h1
        className="font-extrabold tracking-tight text-balance"
        style={{ fontSize: "clamp(1.9rem, 7vw, 3rem)", lineHeight: 1.05 }}
      >
        {isCreator
          ? t("challenge.intro.creatorTitle")
          : creatorScore != null
            ? t("challenge.intro.daresYou", {
                name: who,
                score: creatorScore,
                total: size,
              })
            : t("challenge.intro.daresYouNoScore", { name: who })}
      </h1>
      <p className="max-w-xs text-sm text-muted-foreground">
        {isCreator
          ? t("challenge.intro.creatorBody", { total: size })
          : t("challenge.intro.body", { total: size })}
      </p>
      <Button
        onClick={onStart}
        className="cta-glow min-h-12 w-full max-w-xs text-base font-bold"
      >
        {isCreator ? t("challenge.intro.creatorCta") : t("challenge.intro.cta")}
      </Button>
    </main>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden">
      <AppHeader />
      <div
        className="pq-spotlight pointer-events-none absolute inset-0"
        aria-hidden="true"
      />
      {children}
    </div>
  )
}

function ChallengePlay({
  rounds,
  submitting,
  onComplete,
}: {
  rounds: Array<ChallengeRound>
  submitting: boolean
  onComplete: (answers: Array<ChallengeAttemptInput>) => void
}) {
  const { t } = useTranslation()
  const [idx, setIdx] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const answersRef = useRef<Array<ChallengeAttemptInput>>([])
  const shownAt = useRef<number>(
    typeof performance !== "undefined" ? performance.now() : Date.now()
  )

  useEffect(() => {
    shownAt.current =
      typeof performance !== "undefined" ? performance.now() : Date.now()
    setPicked(null)
  }, [idx])

  const round = rounds[idx]
  if (!round) return null
  const isLast = idx + 1 >= rounds.length

  function choose(choice: ChallengeChoice) {
    if (picked !== null || submitting) return
    setPicked(choice.id)
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now()
    const ms = Math.max(0, now - shownAt.current)
    answersRef.current = [
      ...answersRef.current,
      { punchlineId: round.punchlineId, artistId: choice.id, ms },
    ]
    // Brief tap feedback, then advance with no correctness reveal.
    setTimeout(() => {
      if (isLast) onComplete(answersRef.current)
      else setIdx((i) => i + 1)
    }, 160)
  }

  return (
    <main className="relative flex flex-1 flex-col px-5 pt-20 pb-8 md:px-8">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-between gap-8">
        <div
          className="flex flex-col items-start gap-3"
          style={{ animation: `pq-fade-up 0.5s ${ease} both` }}
        >
          <div className="flex w-full items-center justify-between">
            <span className="text-xs font-semibold tracking-[0.16em] text-primary/70 uppercase">
              {t("challenge.progress", { n: idx + 1, total: rounds.length })}
            </span>
            <ProgressDots total={rounds.length} done={idx} />
          </div>
          <blockquote
            key={round.punchlineId}
            className="leading-[1.18] font-extrabold tracking-tight text-balance"
            style={{
              fontSize: "clamp(1.6rem, 5.5vw, 2.5rem)",
              animation: `pq-fade-up 0.5s ${ease} both`,
            }}
          >
            <span className="mr-1 text-primary/40 select-none">"</span>
            {round.line.split("/").map((seg, i, arr) => (
              <span key={i} className="block">
                {seg.trim()}
                {i < arr.length - 1 && (
                  <span className="text-primary/50 select-none"> /</span>
                )}
              </span>
            ))}
            <span className="ml-1 text-primary/40 select-none">"</span>
          </blockquote>
          <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="text-sm text-muted-foreground">
              {t("challenge.prompt")}
            </p>
            <BarCredit handle={round.submittedByHandle} />
          </div>
        </div>

        <div
          className="flex flex-col gap-3"
          style={{ animation: `pq-fade-up 0.55s ${ease} 0.12s both` }}
        >
          {round.choices.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => choose(c)}
              disabled={picked !== null || submitting}
              aria-pressed={picked === c.id}
              className={cn(
                "group relative flex min-h-14 w-full items-center gap-3 rounded-full border px-4 py-3 text-left text-base font-semibold transition-all",
                "hover:border-primary/40 hover:bg-card focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
                "disabled:cursor-not-allowed",
                picked === c.id
                  ? "border-primary bg-primary/10"
                  : "border-border/60 bg-card/60",
                picked !== null && picked !== c.id && "opacity-50"
              )}
              style={{
                animation: `pq-fade-up 0.5s ${ease} ${0.18 + i * 0.07}s both`,
              }}
            >
              <ChoiceAvatar choice={c} />
              <span className="flex-1">{c.name}</span>
            </button>
          ))}
        </div>
      </div>
    </main>
  )
}

function ProgressDots({ total, done }: { total: number; done: number }) {
  return (
    <span className="flex items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "inline-block h-1.5 w-5 rounded-full",
            i < done
              ? "bg-primary"
              : i === done
                ? "bg-primary/50"
                : "bg-muted-foreground/25"
          )}
        />
      ))}
    </span>
  )
}

function ChoiceAvatar({ choice }: { choice: ChallengeChoice }) {
  const initials = choice.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
  return (
    <div
      className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-muted/60"
      aria-hidden="true"
    >
      {choice.imageUrl ? (
        <img
          src={choice.imageUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="text-[0.7em] font-bold text-foreground/70">
          {initials}
        </span>
      )}
    </div>
  )
}

function ResultView({
  slug,
  size,
  result,
  board,
  persisted,
  alreadyLocked,
  locked,
  viewerHandle,
  creatorHandle,
  isCreator,
  submitting,
  creatingNext,
  onNameSubmit,
  onDareFriends,
  onViewBoard,
}: {
  slug: string
  size: number
  result: {
    correctCount: number
    solveMs: number
    recap: Array<ChallengeRecapBar>
  }
  board: Array<ChallengeBoardEntry>
  persisted: boolean
  alreadyLocked: boolean
  locked: { correctCount: number; solveMs: number } | null
  viewerHandle: string | null
  creatorHandle: string | null
  isCreator: boolean
  submitting: boolean
  creatingNext: boolean
  onNameSubmit: (name: string) => void
  onDareFriends: () => void
  onViewBoard: () => void
}) {
  const { t } = useTranslation()
  const { isSignedIn } = useAuth()
  // Did the recipient beat the creator's score? (drives the headline emotion)
  const creatorEntry = board.find((e) => e.isCreator)
  const beatCreator =
    !isCreator &&
    creatorEntry != null &&
    (result.correctCount > creatorEntry.correctCount ||
      (result.correctCount === creatorEntry.correctCount &&
        result.solveMs < creatorEntry.solveMs))
  return (
    <main className="relative mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-5 pt-20 pb-12 md:px-8">
      <section
        className="flex flex-col items-center gap-3 text-center"
        style={{ animation: `pq-fade-up 0.55s ${ease} both` }}
      >
        <span className="text-xs font-bold tracking-[0.18em] text-primary/80 uppercase">
          {t("challenge.resultEyebrow")}
        </span>
        <p
          className="font-extrabold text-primary tabular-nums"
          style={{ fontSize: "clamp(3rem, 14vw, 5rem)", lineHeight: 1 }}
        >
          {t("challenge.score", { correct: result.correctCount, total: size })}
        </p>
        <p className="text-sm font-semibold text-muted-foreground">
          {t("challenge.yourTime")}:{" "}
          <span className="text-foreground tabular-nums">
            {t("challenge.seconds", { s: fmtSeconds(result.solveMs) })}
          </span>
        </p>
        {!isCreator && persisted && (
          <p className="text-sm font-bold text-primary">
            {beatCreator
              ? t("challenge.beatCreator", { name: creatorHandle ?? "" })
              : t("challenge.lostToCreator", { name: creatorHandle ?? "" })}
          </p>
        )}
        {persisted && alreadyLocked && locked && (
          <p className="text-xs text-primary/90">
            {t("challenge.alreadyLocked", {
              correct: locked.correctCount,
              total: size,
            })}
          </p>
        )}
      </section>

      {/* Anon, no board name yet → capture a name so they land on the board. */}
      {!persisted && (
        <NameCapture submitting={submitting} onSubmit={onNameSubmit} />
      )}

      {/* Already on the board but anonymous → soft "lock it / sign up" (capture
          on the return leg, never a blocking wall). */}
      {persisted && !isSignedIn && <SignupWall />}

      {/* Recap */}
      <section
        className="flex flex-col gap-2"
        style={{ animation: `pq-fade-up 0.55s ${ease} 0.12s both` }}
      >
        <h2 className="text-[10px] font-bold tracking-[0.18em] text-primary/80 uppercase">
          {t("challenge.recapTitle")}
        </h2>
        {result.recap.map((b) => (
          <div
            key={b.punchlineId}
            className={cn(
              "flex items-center gap-3 rounded-xl border px-3 py-2.5",
              b.correct
                ? "border-primary/40 bg-primary/5"
                : "border-destructive/30 bg-destructive/5"
            )}
          >
            <span
              className={cn(
                "text-base",
                b.correct ? "text-primary" : "text-destructive/80"
              )}
            >
              {b.correct ? "✓" : "✗"}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground/90">
              "{b.line.split("/")[0].trim()}"
            </span>
            <span className="shrink-0 text-xs font-bold text-foreground/80">
              {b.correctArtistName}
            </span>
          </div>
        ))}
      </section>

      <Board
        board={board}
        viewerHandle={viewerHandle}
        creatorHandle={creatorHandle}
      />

      <div className="flex flex-col gap-2">
        {isCreator ? (
          // Creator just set their gauntlet → the PRIMARY action is sending it.
          <ShareButton
            slug={slug}
            correctCount={
              persisted && locked ? locked.correctCount : result.correctCount
            }
            size={size}
            creatorHandle={creatorHandle}
            label={t("challenge.sendChallenge")}
          />
        ) : (
          // Recipient → PRIMARY is daring THEIR friends (keeps the loop spreading).
          <Button
            type="button"
            onClick={onDareFriends}
            disabled={creatingNext}
            className="cta-glow min-h-12 w-full text-base font-bold"
          >
            {creatingNext
              ? t("challenge.creating")
              : t("challenge.dareYourFriends")}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          onClick={onViewBoard}
          className="min-h-11 text-sm font-bold text-muted-foreground hover:text-foreground"
        >
          {t("challenge.viewBoard")}
        </Button>
      </div>
    </main>
  )
}

/**
 * Anon board-name capture (PUN-123): one field, no account. Saved to localStorage
 * so a player only types it once. Submitting puts them on the board by name.
 */
function NameCapture({
  submitting,
  onSubmit,
}: {
  submitting: boolean
  onSubmit: (name: string) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState("")
  const trimmed = name.trim()
  return (
    <section
      className="flex flex-col items-center gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-5 text-center"
      style={{ animation: `pq-fade-up 0.55s ${ease} 0.06s both` }}
    >
      <h2 className="text-lg font-extrabold tracking-tight">
        {t("challenge.name.title")}
      </h2>
      <p className="max-w-xs text-sm text-balance text-muted-foreground">
        {t("challenge.name.body")}
      </p>
      <form
        className="flex w-full max-w-xs gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (trimmed && !submitting) onSubmit(trimmed)
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          autoFocus
          placeholder={t("challenge.name.placeholder")}
          aria-label={t("challenge.name.placeholder")}
        />
        <Button type="submit" disabled={submitting || !trimmed}>
          {t("challenge.name.cta")}
        </Button>
      </form>
    </section>
  )
}

function SignupWall() {
  const { t } = useTranslation()
  return (
    <section
      className="flex flex-col items-center gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-5 text-center"
      style={{ animation: `pq-fade-up 0.55s ${ease} 0.06s both` }}
    >
      <h2 className="text-lg font-extrabold tracking-tight">
        {t("challenge.wallTitle")}
      </h2>
      <p className="max-w-xs text-sm text-balance text-muted-foreground">
        {t("challenge.wallBody")}
      </p>
      <SignUpButton mode="modal">
        <Button className="cta-glow min-h-11 bg-primary px-6 text-sm font-bold text-primary-foreground hover:bg-primary/90">
          {t("challenge.wallCta")}
        </Button>
      </SignUpButton>
    </section>
  )
}

function BoardScreen({
  slug,
  board,
  creatorHandle,
  viewerHandle,
  locked,
  size,
  viewerIsCreator,
  creatingNext,
  onPlayAgain,
  onDareFriends,
}: {
  slug: string
  board: Array<ChallengeBoardEntry>
  creatorHandle: string | null
  viewerHandle: string | null
  locked: { correctCount: number; solveMs: number } | null
  size: number
  viewerIsCreator: boolean
  creatingNext: boolean
  onPlayAgain: () => void
  onDareFriends: () => void
}) {
  const { t } = useTranslation()
  const { isSignedIn } = useAuth()
  // Dethroned = the creator is back, and someone outranks them on their own board.
  const top = board[0]
  const dethroned =
    viewerIsCreator && top != null && !top.isCreator && board.length > 1
  useEffect(() => {
    logEvent("challenge_board_viewed", { slug, dethroned })
    if (dethroned) logEvent("challenge_dethroned_viewed", { slug })
  }, [slug, dethroned])
  return (
    <main className="relative mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-5 pt-20 pb-12 md:px-8">
      <header
        className="flex flex-col items-center gap-2 text-center"
        style={{ animation: `pq-fade-up 0.5s ${ease} both` }}
      >
        <span className="text-[10px] font-bold tracking-[0.22em] text-primary/80 uppercase">
          {t("challenge.eyebrow")}
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight">
          {dethroned ? t("challenge.dethronedTitle") : t("challenge.boardTitle")}
        </h1>
        {dethroned ? (
          <p className="text-sm font-semibold text-primary">
            {t("challenge.dethronedBody", {
              name: top?.handle ?? "",
              score: top?.correctCount ?? 0,
              total: size,
            })}
          </p>
        ) : (
          creatorHandle && (
            <p className="text-sm text-muted-foreground">
              {t("challenge.creatorThrewDown", { handle: creatorHandle })}
            </p>
          )
        )}
        {locked && (
          <p className="text-xs text-primary/90">
            {t("challenge.alreadyLocked", {
              correct: locked.correctCount,
              total: size,
            })}
          </p>
        )}
      </header>

      {/* Dethroned + anonymous → the capture moment: lock your throne (sign up). */}
      {dethroned && !isSignedIn && <SignupWall />}

      <Board
        board={board}
        viewerHandle={viewerHandle}
        creatorHandle={creatorHandle}
      />

      <div className="flex flex-col gap-2">
        {viewerIsCreator ? (
          <ShareButton
            slug={slug}
            correctCount={locked?.correctCount ?? null}
            size={size}
            creatorHandle={creatorHandle}
            label={t("challenge.sendChallenge")}
          />
        ) : (
          <Button
            type="button"
            onClick={onDareFriends}
            disabled={creatingNext}
            className="cta-glow min-h-12 w-full text-base font-bold"
          >
            {creatingNext
              ? t("challenge.creating")
              : t("challenge.dareYourFriends")}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          onClick={onPlayAgain}
          className="min-h-11 border border-border/60 text-sm font-bold"
        >
          {t("challenge.playAgain")}
        </Button>
      </div>
    </main>
  )
}

function Board({
  board,
  viewerHandle,
  creatorHandle,
}: {
  board: Array<ChallengeBoardEntry>
  viewerHandle: string | null
  creatorHandle: string | null
}) {
  const { t, i18n } = useTranslation()
  const isDe = i18n.language.startsWith("de")
  if (board.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {creatorHandle
          ? t("challenge.beatThem", { handle: creatorHandle })
          : t("challenge.beFirst")}
      </p>
    )
  }
  return (
    <section className="flex flex-col gap-2">
      {board.map((e) => {
        const isMe = viewerHandle != null && e.handle === viewerHandle
        return (
          <div
            key={`${e.rank}-${e.handle}`}
            className={cn(
              "flex items-center gap-3 rounded-2xl border px-3 py-2.5",
              isMe
                ? "border-primary/70 bg-primary/10"
                : "border-border/40 bg-card/30"
            )}
          >
            <span
              className={cn(
                "w-7 shrink-0 text-center text-sm font-extrabold tabular-nums",
                e.rank <= 3 ? "text-primary" : "text-muted-foreground"
              )}
            >
              {e.rank}
            </span>
            <BoardAvatar handle={e.handle} imageUrl={e.imageUrl} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-1.5 truncate text-sm font-bold tracking-tight text-foreground">
                {e.isGuest ? e.handle : `@${e.handle}`}
                {e.isCreator && (
                  <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-primary uppercase">
                    ★
                  </span>
                )}
                {isMe && (
                  <span className="text-[10px] font-bold tracking-wide text-primary/70 uppercase">
                    · {t("challenge.you")}
                  </span>
                )}
              </span>
              {e.isGuest ? (
                <span className="text-[10px] font-semibold tracking-wide text-muted-foreground/70 uppercase">
                  {t("challenge.guest")}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                  <img
                    src={rankIconPath(e.level.rank)}
                    alt=""
                    aria-hidden="true"
                    width={14}
                    height={14}
                    className="select-none"
                  />
                  {isDe ? e.level.nameDe : e.level.nameEn}
                </span>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end">
              <span className="text-sm font-extrabold text-foreground tabular-nums">
                {e.correctCount}
                <span className="text-muted-foreground/60">/5</span>
              </span>
              <span className="text-[10px] font-bold text-primary tabular-nums">
                {t("challenge.seconds", { s: fmtSeconds(e.solveMs) })}
              </span>
            </div>
          </div>
        )
      })}
    </section>
  )
}

function BoardAvatar({
  handle,
  imageUrl,
}: {
  handle: string
  imageUrl: string | null
}) {
  const initial = handle.slice(0, 1).toUpperCase()
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/30 bg-primary/10 text-sm font-extrabold text-primary"
      aria-hidden="true"
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        initial
      )}
    </div>
  )
}

function ShareButton({
  slug,
  correctCount,
  size,
  creatorHandle,
  label,
}: {
  slug: string
  correctCount: number | null
  size: number
  creatorHandle: string | null
  label?: string
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const blobRef = useRef<Blob | null>(null)

  async function share() {
    const url = `${window.location.origin}/c/${slug}`
    const text =
      correctCount != null
        ? `${t("challenge.score", { correct: correctCount, total: size })} — ${t("challenge.boardTitle")}`
        : t("challenge.beFirst")
    const nav = navigator as Navigator & {
      canShare?: (d: ShareData) => boolean
    }
    const canNativeShare = typeof nav.share === "function"
    logEvent("challenge_shared", {
      slug,
      channel: canNativeShare ? "native" : "copy",
    })
    try {
      if (!blobRef.current) {
        blobRef.current = await renderChallengeCard({
          correctCount,
          size,
          creatorHandle,
        })
      }
      const file = new File(
        [blobRef.current],
        `punchlinequiz-challenge-${slug}.png`,
        { type: "image/png" }
      )
      const withFile: ShareData = { files: [file], text, url }
      const canFile =
        typeof nav.canShare === "function" && nav.canShare(withFile)
      if (canNativeShare) {
        await nav.share(canFile ? withFile : { text, url })
        return
      }
    } catch {
      /* render failed or share dismissed — fall through to copy */
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* ignore */
    }
  }

  return (
    <Button
      onClick={share}
      className="cta-glow min-h-12 w-full text-base font-bold"
    >
      {copied ? t("common.linkCopied") : (label ?? t("challenge.share"))}
    </Button>
  )
}
