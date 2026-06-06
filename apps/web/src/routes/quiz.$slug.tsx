import { Link, createFileRoute, redirect } from "@tanstack/react-router"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"

import { AppHeader } from "../components/app-header"
import { getArtistContext, getRound } from "../lib/game"
import { QUIZ_MIN_BARS, QUIZ_ROUND_SIZE } from "../lib/quiz"
import { noindexSeo, ogImageUrl, seo } from "../lib/seo"
import { isAdminFn } from "../lib/session"
import { logEvent } from "../lib/track"
import { PlayInner } from "./play"
import type { ArtistContext, Round } from "../lib/game"

/**
 * Artist Quiz Landing Page (PUN-106/107). The named, shareable per-artist quiz
 * — the Reddit/WhatsApp drop target. Landing-first (lyric-free identity), then
 * it launches the shared /play engine artist-filtered at 5 bars.
 *
 * - Eligibility: artist active AND ≥15 active bars. Sub-threshold/unknown →
 *   301 to /artist/$slug (the indexed SEO page; links still land usefully).
 * - noindex,follow + dynamic per-quiz OG (PUN-105) so pasted links unfurl as
 *   bait while /artist/$slug stays the search surface (no cannibalization).
 */
export const Route = createFileRoute("/quiz/$slug")({
  component: QuizPage,
  loader: async ({ params }) => {
    const [artistCtx, session] = await Promise.all([
      getArtistContext({ data: { slug: params.slug } }),
      isAdminFn(),
    ])
    if (!artistCtx || artistCtx.punchlineCount < QUIZ_MIN_BARS) {
      throw redirect({
        to: "/artist/$slug",
        params: { slug: params.slug },
        statusCode: 301,
      })
    }
    return { artistCtx, isAdmin: session.admin }
  },
  head: ({ loaderData }) => {
    const a = (loaderData as { artistCtx: ArtistContext } | undefined)
      ?.artistCtx
    if (!a) return noindexSeo()
    const title = `Das ${a.name}-Quiz`
    const description = `${a.name} Punchline-Quiz — ${a.punchlineCount} Bars. Schaffst du 5/5? Errate den Künstler hinter der Line und beweis dein Rap-Wissen.`
    const image = ogImageUrl({
      title,
      subtitle: `${a.punchlineCount} Bars · schaffst du 5/5?`,
      image: a.imageUrl,
    })
    // noindex,follow: /quiz is a share/play target, not a search surface.
    return seo({
      title,
      description,
      path: `/quiz/${a.slug}`,
      image,
      noindex: true,
    })
  },
})

const ease = "cubic-bezier(0.16, 1, 0.3, 1)"

type Phase = "landing" | "playing" | "cleared"

function QuizPage() {
  const { artistCtx, isAdmin } = Route.useLoaderData()
  const [phase, setPhase] = useState<Phase>("landing")
  const [initialRound, setInitialRound] = useState<Round | null>(null)
  const [starting, setStarting] = useState(false)

  async function onStart() {
    if (starting) return
    setStarting(true)
    logEvent("quiz_start_clicked", { artist_slug: artistCtx.slug })
    try {
      const round = await getRound({
        data: { mode: "artist", artistSlug: artistCtx.slug },
      })
      setInitialRound(round)
      setPhase("playing")
      logEvent("quiz_started", {
        artist_slug: artistCtx.slug,
        run_size: QUIZ_ROUND_SIZE,
      })
    } catch {
      // No unsolved bars left for this signed-in player → they've cleared it.
      setPhase("cleared")
      logEvent("quiz_artist_cleared", { artist_slug: artistCtx.slug })
    } finally {
      setStarting(false)
    }
  }

  if (phase === "playing" && initialRound) {
    return (
      <PlayInner
        initialRound={initialRound}
        artistCtx={artistCtx}
        playMode="artist"
        isAdmin={isAdmin}
        roundSize={QUIZ_ROUND_SIZE}
      />
    )
  }

  if (phase === "cleared") return <QuizCleared artist={artistCtx} />

  return (
    <QuizLanding artist={artistCtx} onStart={onStart} starting={starting} />
  )
}

function QuizLanding({
  artist,
  onStart,
  starting,
}: {
  artist: ArtistContext
  onStart: () => void
  starting: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden">
      <AppHeader />
      <div
        className="pq-spotlight pointer-events-none absolute inset-0"
        aria-hidden="true"
      />

      <main className="relative mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-6 px-6 py-20 text-center">
        <span className="text-[10px] font-bold tracking-[0.22em] text-primary/80 uppercase">
          {t("quiz.eyebrow")}
        </span>

        <div
          className="relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-primary/60 bg-card"
          style={{ animation: `pq-fade-up 0.5s ${ease} both` }}
        >
          {artist.imageUrl ? (
            <img
              src={artist.imageUrl}
              alt={artist.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-3xl font-extrabold text-primary">
              {artist.name.slice(0, 1)}
            </span>
          )}
        </div>

        <div className="flex flex-col items-center gap-2">
          <h1 className="text-3xl font-extrabold tracking-tight text-balance">
            {t("quiz.title", { name: artist.name })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("quiz.barsCount", { count: artist.punchlineCount })} ·{" "}
            {t("quiz.hook")}
          </p>
        </div>

        <Button
          size="lg"
          onClick={onStart}
          disabled={starting}
          className="cta-glow min-h-12 w-full max-w-xs text-base font-bold"
        >
          {starting ? "…" : t("quiz.start")}
        </Button>
      </main>
    </div>
  )
}

function QuizCleared({ artist }: { artist: ArtistContext }) {
  const { t } = useTranslation()
  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden">
      <AppHeader />
      <div
        className="pq-spotlight pointer-events-none absolute inset-0"
        aria-hidden="true"
      />

      <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
        <span className="text-xs font-bold tracking-[0.18em] text-primary/70 uppercase">
          {t("quiz.clearedEyebrow")}
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight text-balance">
          {t("quiz.clearedTitle", { name: artist.name })}
        </h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          {t("quiz.clearedSubtitle", { count: artist.punchlineCount })}
        </p>
        <Link
          to="/artists"
          className="cta-glow inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-7 text-base font-bold text-primary-foreground hover:bg-primary/90"
        >
          {t("quiz.clearedCta")}
        </Link>
      </main>
    </div>
  )
}
