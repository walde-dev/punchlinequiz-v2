import { Link, createFileRoute } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { cn } from "@workspace/ui/lib/utils"

import { AppHeader } from "../components/app-header"
import { DiscordFooterLink } from "../components/discord-cta"
import { SignInBanner } from "../components/sign-in-banner"
import { getDailyChallenge } from "../lib/daily"
import { listPlayableArtists } from "../lib/game"
import { jsonLd, organizationJsonLd, seo, websiteJsonLd } from "../lib/seo"

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    ...seo({
      description:
        "Errate den Künstler hinter der Punchline. Das tägliche Quiz für deutschen Rap — spiel, sammle XP, fordere Freunde heraus.",
      path: "/",
      ogTitle: "Errätst du die Punchline?",
      ogSubtitle: "Das Quiz für deutschen Rap · Jetzt spielen",
    }),
    scripts: [jsonLd(websiteJsonLd()), jsonLd(organizationJsonLd())],
  }),
  loader: async () => {
    const [artistMode, clozeMode, daily] = await Promise.all([
      listPlayableArtists({ data: {} }),
      listPlayableArtists({ data: { mode: "cloze" } }),
      getDailyChallenge({ data: {} }),
    ])
    return {
      artistTotal: artistMode.reduce((n, a) => n + a.punchlineCount, 0),
      clozeTotal: clozeMode.reduce((n, a) => n + a.punchlineCount, 0),
      clozeArtists: clozeMode.length,
      dailyNumber: daily?.number ?? null,
    }
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
  const { artistTotal, clozeTotal, clozeArtists, dailyNumber } =
    Route.useLoaderData()

  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden">
      <AppHeader />
      <div
        className="pq-spotlight pointer-events-none absolute inset-0"
        aria-hidden="true"
      />

      <main className="relative flex flex-1 flex-col items-center px-5 pt-16 pb-10 md:px-8 md:pt-20">
        <div className="flex w-full max-w-3xl flex-col gap-5 md:gap-8">
          <div
            className="flex flex-col items-center gap-2 text-center md:items-start md:gap-3 md:text-left"
            style={{ animation: `pq-fade-up 0.55s ${ease} both` }}
          >
            <BetaBadge label={t("home.betaBadge")} />
            <h1
              className="leading-[1.1] font-extrabold tracking-tight"
              style={{ fontSize: "clamp(2rem, 6vw, 3.5rem)" }}
            >
              {t("home.hero")}
            </h1>
            <p className="max-w-md text-sm text-muted-foreground sm:text-base">
              {t("home.subtitle")}
            </p>
          </div>

          {dailyNumber !== null && <DailyBanner dailyNumber={dailyNumber} />}
          <SignInBanner />
          <ModeCards
            artistTotal={artistTotal}
            clozeTotal={clozeTotal}
            clozeArtists={clozeArtists}
          />
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
          <Link to="/artists" className="transition-colors hover:text-primary">
            {t("home.footerArtists")}
          </Link>
          <Link
            to="/leaderboard"
            className="transition-colors hover:text-primary"
          >
            {t("nav.leaderboard")}
          </Link>
          <Link to="/daily" className="transition-colors hover:text-primary">
            {t("home.footerDaily")}
          </Link>
          <DiscordFooterLink placement="home_footer" />
          <Link to="/impressum" className="transition-colors hover:text-primary">
            {t("nav.imprint")}
          </Link>
          <Link to="/datenschutz" className="transition-colors hover:text-primary">
            {t("nav.privacy")}
          </Link>
          <Link to="/nutzungsbedingungen" className="transition-colors hover:text-primary">
            {t("nav.terms")}
          </Link>
        </nav>
        <p className="text-xs text-muted-foreground/40">{t("home.madeWith")}</p>
      </footer>
    </div>
  )
}

function DailyBanner({ dailyNumber }: { dailyNumber: number }) {
  const { t } = useTranslation()
  return (
    <Link
      to="/daily"
      aria-label={t("home.dailyAria", { number: dailyNumber })}
      className={cn(
        "group relative flex items-center justify-between gap-3 overflow-hidden rounded-3xl",
        "border border-primary/50 bg-primary/10 p-5",
        "transition-[border-color,background-color] duration-200",
        "hover:border-primary hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
      )}
      style={{ animation: `pq-fade-up 0.55s ${ease} 0.1s both` }}
    >
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-bold tracking-[0.18em] text-primary uppercase">
          {t("home.dailyEyebrow", { number: dailyNumber })}
        </span>
        <h2 className="text-xl leading-tight font-extrabold tracking-tight">
          {t("home.dailyHeadline")}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t("home.dailySubtext")}
        </p>
      </div>
      <span className="text-2xl text-primary transition-transform duration-200 group-hover:translate-x-0.5">
        →
      </span>
    </Link>
  )
}

function ModeCards({
  artistTotal,
  clozeTotal,
  clozeArtists,
}: {
  artistTotal: number
  clozeTotal: number
  clozeArtists: number
}) {
  const { t } = useTranslation()
  return (
    <div
      className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2"
      style={{ animation: `pq-fade-up 0.6s ${ease} 0.15s both` }}
    >
      <ModeCard
        to="/play"
        search={{}}
        eyebrow={t("home.modes.classicEyebrow")}
        title={t("home.modes.classicTitle")}
        description={t("home.modes.classicDesc")}
        meta={t("home.modes.classicMeta", { count: artistTotal })}
        ariaLabel={t("home.modes.classicAria", { count: artistTotal })}
        iconSrc="/mic.png"
        index={0}
      />
      <div className="flex flex-col gap-2">
        <ModeCard
          to="/play"
          search={{ mode: "cloze" }}
          eyebrow={t("home.modes.clozeEyebrow")}
          title={t("home.modes.clozeTitle")}
          description={t("home.modes.clozeDesc")}
          meta={t("home.modes.clozeMeta", {
            count: clozeTotal,
            artists: clozeArtists,
          })}
          ariaLabel={t("home.modes.clozeAria", {
            count: clozeTotal,
            artists: clozeArtists,
          })}
          iconSrc="/cloze.png"
          index={1}
        />
        <Link
          to="/finishing"
          className={cn(
            "inline-flex min-h-11 w-fit items-center gap-1.5 rounded-full px-4",
            "border border-border/60 bg-card text-xs font-bold tracking-[0.16em] text-foreground/80 uppercase",
            "transition-[color,border-color,background-color] duration-200",
            "hover:border-primary/60 hover:bg-card hover:text-foreground",
            "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
          )}
        >
          {t("home.modes.perArtist")}
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </div>
  )
}

function ModeCard({
  to,
  search,
  eyebrow,
  title,
  description,
  meta,
  ariaLabel,
  iconSrc,
  index,
}: {
  to: string
  search: Record<string, string>
  eyebrow: string
  title: string
  description: string
  meta: string
  ariaLabel: string
  iconSrc: string
  index: number
}) {
  return (
    <Link
      to={to}
      search={search}
      aria-label={ariaLabel}
      className={cn(
        "group relative flex flex-col gap-4 overflow-hidden rounded-3xl sm:gap-5",
        "border border-border/60 bg-card/50 p-5",
        "transition-[border-color,background-color] duration-200",
        "hover:border-primary/60 hover:bg-card focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
      )}
      style={{
        animation: `pq-fade-up 0.55s ${ease} ${0.2 + index * 0.08}s both`,
      }}
    >
      <div className="flex items-center gap-4" aria-hidden="true">
        {/* Gold hero icon. Same mix-blend-screen + radial-mask trick as the
            sign-in banner: kills the PNG's pure-black backdrop and softens the
            edge into the card. */}
        <img
          src={iconSrc}
          alt=""
          aria-hidden="true"
          width={80}
          height={80}
          className="h-14 w-14 shrink-0 transition-transform duration-200 select-none motion-safe:group-hover:translate-x-1 sm:h-20 sm:w-20"
          style={{
            mixBlendMode: "screen",
            WebkitMaskImage:
              "radial-gradient(circle at center, black 55%, transparent 90%)",
            maskImage:
              "radial-gradient(circle at center, black 55%, transparent 90%)",
            filter:
              "drop-shadow(0 0 18px color-mix(in oklch, var(--primary), transparent 55%))",
          }}
        />
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-bold tracking-[0.18em] text-primary/80 uppercase">
            {eyebrow}
          </span>
          <h2 className="flex items-center gap-2 text-2xl leading-[1.1] font-extrabold tracking-tight text-balance">
            <span>{title}</span>
            <span className="inline-block translate-y-px text-primary transition-transform duration-200 group-hover:translate-x-0.5">
              →
            </span>
          </h2>
        </div>
      </div>

      <p className="text-sm leading-snug text-balance text-muted-foreground">
        {description}
      </p>

      <span
        aria-hidden="true"
        className="mt-auto text-xs text-muted-foreground tabular-nums"
      >
        {meta}
      </span>
    </Link>
  )
}
