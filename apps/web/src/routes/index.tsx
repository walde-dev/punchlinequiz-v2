import { Show, SignInButton } from "@clerk/tanstack-react-start"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { cn } from "@workspace/ui/lib/utils"

import { AppHeader } from "../components/app-header"
import { DiscordFooterLink } from "../components/discord-cta"
import { createChallengeFn, getMyChallengesFn } from "../lib/challenge"
import { getDailyChallenge } from "../lib/daily"
import { jsonLd, organizationJsonLd, seo, websiteJsonLd } from "../lib/seo"
import { logEvent } from "../lib/track"
import type { MyChallenge } from "../lib/challenge"

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    ...seo({
      title: "Teste dein Rap-Wissen",
      description:
        "Errate den Künstler hinter der Punchline. Das tägliche Quiz für deutschen Rap — spiel, sammle XP, fordere Freunde heraus.",
      path: "/",
      ogTitle: "Errätst du die Punchline?",
      ogSubtitle: "Das Quiz für deutschen Rap · Jetzt spielen",
    }),
    scripts: [jsonLd(websiteJsonLd()), jsonLd(organizationJsonLd())],
  }),
  loader: async () => {
    const daily = await getDailyChallenge({ data: {} })
    return { dailyNumber: daily?.number ?? null }
  },
})

const ease = "cubic-bezier(0.16, 1, 0.3, 1)"

function BetaBadge({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-semibold tracking-[0.12em] uppercase"
      style={{ animation: `pq-fade-up 0.5s ${ease} 0.1s both` }}
    >
      <span className="font-light text-primary/50 select-none">/</span>
      <span className="text-primary/75">{label}</span>
    </span>
  )
}

function HomePage() {
  const { t } = useTranslation()
  const { dailyNumber } = Route.useLoaderData()

  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden">
      <AppHeader />
      <div
        className="pq-spotlight pointer-events-none absolute inset-0"
        aria-hidden="true"
      />

      <main className="relative flex flex-1 flex-col items-center px-5 pt-16 pb-10 md:px-8 md:pt-20">
        <div className="flex w-full max-w-xl flex-col gap-6 md:gap-8">
          <div
            className="flex flex-col items-center gap-2 text-center md:items-start md:text-left"
            style={{ animation: `pq-fade-up 0.55s ${ease} both` }}
          >
            <BetaBadge label={t("home.betaBadge")} />
            <h1
              className="leading-[1.1] font-extrabold tracking-tight"
              style={{ fontSize: "clamp(2rem, 6vw, 3.5rem)" }}
            >
              {t("home.hero")}
            </h1>
          </div>

          <ModeStack dailyNumber={dailyNumber} />
          <ChallengeHomeSection />
          <SignInLine />
          <MoreLinks />
        </div>
      </main>

      <footer
        className="relative flex flex-col items-center gap-1.5 py-6 text-center md:items-start md:px-8"
        style={{ animation: `pq-fade-up 0.55s ${ease} 0.65s both` }}
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary/60" />
          <span>{t("home.betaNotice")}</span>
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs font-semibold text-muted-foreground/70 md:justify-start">
          <DiscordFooterLink placement="home_footer" />
          <Link to="/impressum" className="transition-colors hover:text-primary">
            {t("nav.imprint")}
          </Link>
          <Link to="/datenschutz" className="transition-colors hover:text-primary">
            {t("nav.privacy")}
          </Link>
          <Link
            to="/nutzungsbedingungen"
            className="transition-colors hover:text-primary"
          >
            {t("nav.terms")}
          </Link>
        </nav>
        <p className="text-xs text-muted-foreground/40">{t("home.madeWith")}</p>
      </footer>
    </div>
  )
}

/**
 * Gold hero PNG (mic / cloze art) dropped into the circular ring. Same
 * mix-blend-screen + radial-mask trick used elsewhere: kills the PNG's
 * pure-black backdrop so only the gold survives.
 */
function ModeImage({ src }: { src: string }) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      width={48}
      height={48}
      className="h-9 w-9 select-none"
      style={{
        mixBlendMode: "screen",
        WebkitMaskImage:
          "radial-gradient(circle at center, black 55%, transparent 90%)",
        maskImage:
          "radial-gradient(circle at center, black 55%, transparent 90%)",
        filter:
          "drop-shadow(0 0 12px color-mix(in oklch, var(--primary), transparent 55%))",
      }}
    />
  )
}

function ModeStack({ dailyNumber }: { dailyNumber: number | null }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-3">
      {dailyNumber !== null && (
        <ModeRow
          to="/daily"
          icon={<ModeImage src="/calendar.png" />}
          title={t("home.modes.dailyTitle")}
          description={t("home.modes.dailyDesc")}
          badge={t("home.dailyBadge", { number: dailyNumber })}
          index={0}
        />
      )}
      <ModeRow
        to="/play"
        search={{}}
        icon={<ModeImage src="/mic.png" />}
        title={t("home.modes.classicTitle")}
        description={t("home.modes.classicDesc")}
        index={1}
      />
      <ModeRow
        to="/play"
        search={{ mode: "cloze" }}
        icon={<ModeImage src="/cloze.png" />}
        title={t("home.modes.clozeTitle")}
        description={t("home.modes.clozeDesc")}
        index={2}
      />
    </div>
  )
}

/**
 * Challenge a friend (PUN-123): the create entry + the return-leg capture hook.
 * "You've been beaten" cards pull a creator back to defend (and sign up); the
 * create button mints a challenge friction-free (anon too) and routes to the
 * gauntlet. Boards are resolved by the anon session cookie or account.
 */
function ChallengeHomeSection() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [mine, setMine] = useState<Array<MyChallenge>>([])

  useEffect(() => {
    let active = true
    getMyChallengesFn()
      .then((r) => active && setMine(r.items))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  async function create() {
    if (creating) return
    setCreating(true)
    try {
      const { slug } = await createChallengeFn()
      logEvent("challenge_created", { slug, from: "home_menu" })
      navigate({ to: "/c/$slug", params: { slug } })
    } catch {
      setCreating(false)
    }
  }

  const beaten = mine.filter((m) => m.beaten)

  return (
    <div className="flex flex-col gap-3">
      {/* Return-leg hook: someone dethroned you → come defend (and sign up). */}
      {beaten.map((m, i) => (
        <Link
          key={m.slug}
          to="/c/$slug"
          params={{ slug: m.slug }}
          onClick={() => logEvent("challenge_dethroned_clicked", { slug: m.slug })}
          className={cn(
            "group flex items-center gap-4 rounded-2xl px-4 py-4",
            "border border-primary/50 bg-primary/10",
            "transition-colors hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
          )}
          style={{ animation: `pq-fade-up 0.5s ${ease} ${0.1 + i * 0.06}s both` }}
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-primary/50 bg-primary/15 text-lg">
            👑
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm leading-tight font-extrabold tracking-tight text-primary">
              {t("challenge.home.beatenTitle")}
            </span>
            <span className="truncate text-sm text-muted-foreground">
              {m.topChallenger
                ? t("challenge.home.beatenBy", {
                    name: m.topChallenger,
                    score: m.creatorScore ?? 0,
                  })
                : t("challenge.home.beatenGeneric")}
            </span>
          </span>
          <span
            aria-hidden="true"
            className="text-xl text-primary/70 transition-transform duration-200 group-hover:translate-x-0.5"
          >
            →
          </span>
        </Link>
      ))}

      {/* Create entry — styled like a mode row, but it's an action (mint + route). */}
      <button
        type="button"
        onClick={create}
        disabled={creating}
        className={cn(
          "group flex items-center gap-4 rounded-2xl px-4 py-4 text-left",
          "border border-border/60 bg-card/50 disabled:opacity-60",
          "transition-[border-color,background-color] duration-200",
          "hover:border-primary/60 hover:bg-card focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
        )}
        style={{ animation: `pq-fade-up 0.55s ${ease} 0.33s both` }}
      >
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-primary/40 bg-primary/5">
          <ModeImage src="/mic.png" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-lg leading-tight font-extrabold tracking-tight">
            {t("challenge.home.createTitle")}
          </span>
          <span className="text-sm text-muted-foreground">
            {creating
              ? t("challenge.creating")
              : t("challenge.home.createDesc")}
          </span>
        </span>
        <span
          aria-hidden="true"
          className="text-xl text-primary/70 transition-transform duration-200 group-hover:translate-x-0.5"
        >
          →
        </span>
      </button>
    </div>
  )
}

/**
 * One mode row — circular gold-ringed icon + title + one-liner + chevron, on a
 * consistent quiet card. Equal weight across modes; hierarchy is carried by
 * order alone (LoLdle pattern). Gold lives only in the ring, the badge and
 * hover — no gold-filled cards competing for attention.
 */
function ModeRow({
  to,
  search,
  icon,
  title,
  description,
  badge,
  index,
}: {
  to: string
  search?: Record<string, string>
  icon: React.ReactNode
  title: string
  description: string
  badge?: string
  index: number
}) {
  return (
    <Link
      to={to}
      search={search}
      className={cn(
        "group flex items-center gap-4 rounded-2xl px-4 py-4",
        "border border-border/60 bg-card/50",
        "transition-[border-color,background-color] duration-200",
        "hover:border-primary/60 hover:bg-card focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
      )}
      style={{ animation: `pq-fade-up 0.55s ${ease} ${0.12 + index * 0.07}s both` }}
    >
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-primary/40 bg-primary/5">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-lg leading-tight font-extrabold tracking-tight">
            {title}
          </span>
          {badge && (
            <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-bold tracking-[0.14em] text-primary uppercase tabular-nums">
              {badge}
            </span>
          )}
        </span>
        <span className="text-sm text-muted-foreground">{description}</span>
      </span>
      <span
        aria-hidden="true"
        className="text-xl text-primary/70 transition-transform duration-200 group-hover:translate-x-0.5"
      >
        →
      </span>
    </Link>
  )
}

/** Small, quiet sign-in nudge — signed-out only. The header pill and the
 *  in-play anon-XP nudges carry the rest, so this stays a single line. */
function SignInLine() {
  const { t } = useTranslation()
  return (
    <Show when="signed-out">
      <SignInButton mode="modal">
        <button
          type="button"
          className="mx-auto text-sm text-muted-foreground transition-colors hover:text-foreground md:mx-0"
        >
          {t("home.signIn.prompt")}{" "}
          <span className="font-semibold text-primary">
            {t("home.signIn.action")}
          </span>
        </button>
      </SignInButton>
    </Show>
  )
}

/** Quiet "more ways in" row below the mode stack. */
function MoreLinks() {
  const { t } = useTranslation()
  const cls = "transition-colors hover:text-primary"
  return (
    <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs font-semibold text-muted-foreground/70 md:justify-start">
      <Link to="/finishing" className={cls}>
        {t("home.more.perArtist")}
      </Link>
      <Link to="/artists" className={cls}>
        {t("home.footerArtists")}
      </Link>
      <Link to="/leaderboard" className={cls}>
        {t("nav.leaderboard")}
      </Link>
    </nav>
  )
}
