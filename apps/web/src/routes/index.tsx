import { createFileRoute, Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { listPlayableArtists } from "../lib/game"

export const Route = createFileRoute("/")({
  component: HomePage,
  loader: async () => {
    const [artistMode, clozeMode] = await Promise.all([
      listPlayableArtists({ data: {} }),
      listPlayableArtists({ data: { mode: "cloze" } }),
    ])
    return {
      artistTotal: artistMode.reduce((n, a) => n + a.punchlineCount, 0),
      clozeTotal: clozeMode.reduce((n, a) => n + a.punchlineCount, 0),
      clozeArtists: clozeMode.length,
    }
  },
})

const ease = "cubic-bezier(0.16, 1, 0.3, 1)"

function Logo() {
  return (
    <span
      className="font-bold text-lg tracking-tight select-none"
      style={{ animation: `pq-slide-down 0.5s ${ease} both` }}
    >
      <span className="text-foreground">punchline</span>
      {/* Solid gold — no gradient text anti-pattern */}
      <span className="text-primary">/quiz</span>
    </span>
  )
}

function Header() {
  return (
    <header className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-6 h-14 border-b border-border/40 bg-background/95 md:bg-background/80 md:backdrop-blur-sm">
      {/* Logo links home — standard nav convention */}
      <Link to="/" aria-label="punchlinequiz — Startseite">
        <Logo />
      </Link>
      <nav className="flex items-center gap-1">
        <LangToggle />
      </nav>
    </header>
  )
}

function LangToggle() {
  const { i18n } = useTranslation()
  const isDE = i18n.language.startsWith("de")

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => i18n.changeLanguage(isDE ? "en" : "de")}
      aria-label={isDE ? "Zu Englisch wechseln" : "Switch to German"}
      /* min-h-11 expands the tap target to 44px without changing visual size */
      className="min-h-11 min-w-11 text-xs font-medium text-muted-foreground hover:text-foreground"
    >
      {isDE ? "DE" : "EN"}
    </Button>
  )
}

function BetaBadge({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-semibold tracking-[0.12em] uppercase"
      style={{ animation: `pq-fade-up 0.5s ${ease} 0.1s both` }}
    >
      {/* Slash ties to the punchline/quiz logo motif */}
      <span className="text-primary/50 font-light select-none">/</span>
      <span className="text-primary/75">{label}</span>
    </span>
  )
}

function HomePage() {
  const { t } = useTranslation()
  const { artistTotal, clozeTotal, clozeArtists } = Route.useLoaderData()

  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden">
      <Header />
      <div className="pq-spotlight pointer-events-none absolute inset-0" aria-hidden="true" />

      <main className="relative flex flex-1 flex-col items-center px-5 pt-20 pb-10 md:px-8">
        <div className="flex w-full max-w-3xl flex-col gap-8">
          <div
            className="flex flex-col items-center gap-3 text-center md:items-start md:text-left"
            style={{ animation: `pq-fade-up 0.55s ${ease} both` }}
          >
            <BetaBadge label={t("footer.beta")} />
            <h1
              className="font-extrabold leading-[1.1] tracking-tight"
              style={{ fontSize: "clamp(2rem, 6vw, 3.5rem)" }}
            >
              {t("home.hero")}
            </h1>
            <p className="max-w-md text-sm text-muted-foreground sm:text-base">
              Zwei Modi. Welcher wird's?
            </p>
          </div>

          <ModeCards artistTotal={artistTotal} clozeTotal={clozeTotal} clozeArtists={clozeArtists} />
        </div>
      </main>

      <footer
        className="relative flex flex-col items-center gap-1.5 py-6 text-center md:items-start md:px-8"
        style={{ animation: `pq-fade-up 0.55s ${ease} 0.65s both` }}
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary/60 animate-pulse" />
          <span>{t("footer.betaNotice")}</span>
        </div>
        <p className="text-xs text-muted-foreground/40">{t("footer.madeWith")}</p>
      </footer>
    </div>
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
  return (
    <div
      className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2"
      style={{ animation: `pq-fade-up 0.6s ${ease} 0.15s both` }}
    >
      <ModeCard
        to="/play"
        search={{}}
        eyebrow="/ klassisch"
        title="Guess the Artist"
        meta={`${artistTotal} Bars`}
        ariaLabel={`Klassik-Modus spielen — Guess the Artist (${artistTotal} Bars)`}
        index={0}
      />
      <div className="flex flex-col gap-2">
        <ModeCard
          to="/play"
          search={{ mode: "cloze" }}
          eyebrow="/ finishing lines"
          title="Vervollständige die Bar"
          meta={`${clozeTotal} Bars · ${clozeArtists} Artists`}
          ariaLabel={`Finishing-Lines-Modus spielen — Vervollständige die Bar (${clozeTotal} Bars, ${clozeArtists} Artists)`}
          index={1}
        />
        {/*
          Sibling to the card — not nested inside the anchor. Keeps both
          targets as real <a> elements so cmd/right-click works for each.
        */}
        <Link
          to="/finishing"
          className={cn(
            "inline-flex min-h-11 w-fit items-center gap-1.5 rounded-full px-4",
            "border border-border/60 bg-card text-xs font-bold uppercase tracking-[0.16em] text-foreground/80",
            "transition-[color,border-color,background-color] duration-200",
            "hover:border-primary/60 hover:bg-card hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
          )}
        >
          Pro Artist spielen
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
  meta,
  ariaLabel,
  index,
}: {
  to: string
  search: Record<string, string>
  eyebrow: string
  title: string
  meta: string
  ariaLabel: string
  index: number
}) {
  return (
    <Link
      to={to}
      search={search}
      aria-label={ariaLabel}
      className={cn(
        "group relative flex flex-col gap-5 overflow-hidden rounded-3xl",
        "border border-border/60 bg-card/50 p-5",
        "transition-[border-color,background-color] duration-200",
        "hover:border-primary/60 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
      )}
      style={{
        animation: `pq-fade-up 0.55s ${ease} ${0.2 + index * 0.08}s both`,
      }}
    >
      <div className="flex flex-col gap-2" aria-hidden="true">
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-primary/80">
          {eyebrow}
        </span>
        <h2 className="flex items-center gap-2 text-2xl font-extrabold leading-[1.1] tracking-tight text-balance">
          <span>{title}</span>
          <span className="inline-block translate-y-px text-primary transition-transform duration-200 group-hover:translate-x-0.5">
            →
          </span>
        </h2>
      </div>

      <span
        aria-hidden="true"
        className="mt-auto text-xs text-muted-foreground tabular-nums"
      >
        {meta}
      </span>
    </Link>
  )
}
