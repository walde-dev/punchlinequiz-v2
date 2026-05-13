import { createFileRoute, Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { Button, buttonVariants } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

export const Route = createFileRoute("/")({ component: HomePage })

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

  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden">
      <Header />

      {/* Atmospheric spotlight — token-referenced, not hard-coded */}
      <div className="pq-spotlight pointer-events-none absolute inset-0" aria-hidden="true" />

      {/*
        /arrange: left-aligned on desktop, centered on mobile.
        This breaks the full-center lock that reads as templated.
      */}
      <main className="relative flex flex-1 flex-col items-center justify-center px-6 pt-14 md:items-start md:px-24 lg:px-32">
        <div className="flex max-w-lg flex-col items-center gap-7 text-center md:items-start md:text-left">
          <BetaBadge label={t("footer.beta")} />

          {/*
            /adapt: fluid clamp() sizing instead of hard breakpoint jumps.
            Smooth scaling from 2.5rem (mobile) → 4.5rem (wide desktop).
          */}
          <h1
            className="font-extrabold leading-[1.15] tracking-tight"
            style={{
              fontSize: "clamp(2.5rem, 7vw, 4.5rem)",
              animation: `pq-fade-up 0.55s ${ease} 0.22s both`,
            }}
          >
            {t("home.hero")}
          </h1>

          <p
            className="max-w-xs text-base text-muted-foreground sm:text-lg md:max-w-sm"
            style={{ animation: `pq-fade-up 0.55s ${ease} 0.36s both` }}
          >
            {t("home.subtext")}
          </p>

          {/*
            /arrange: CTAs left-aligned on desktop, row layout.
            Primary CTA uses .cta-glow (token-based, no hard-coded oklch).
          */}
          <div
            className="flex flex-col items-center gap-3 sm:flex-row md:items-start"
            style={{ animation: `pq-fade-up 0.55s ${ease} 0.5s both` }}
          >
            <Link
              to="/play"
              className={cn(
                buttonVariants({ size: "lg" }),
                "cta-glow transition-shadow duration-300",
              )}
            >
              {t("home.cta")}
            </Link>
          </div>
        </div>
      </main>

      <footer
        className="relative flex flex-col items-center gap-1.5 py-8 text-center md:items-start md:px-24 lg:px-32"
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
