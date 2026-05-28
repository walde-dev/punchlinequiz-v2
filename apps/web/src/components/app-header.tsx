import { Show, SignInButton, UserButton } from "@clerk/tanstack-react-start"
import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { clerkDarkAppearance } from "../lib/clerk-theme"
import { LangToggle } from "./lang-toggle"
import { XpHeaderChip } from "./xp-header-chip"
import type { ArtistContext } from "../lib/game"

type ArtistChoice = { id: number; name: string; imageUrl?: string | null }

function Logo() {
  return (
    <span className="font-bold text-lg tracking-tight select-none">
      <span className="text-foreground">punchline</span>
      <span className="text-primary">/quiz</span>
    </span>
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

export function AppHeader({
  playMode,
  artistCtx,
  score,
  streak,
  roundSize,
  xpRefreshKey,
}: {
  playMode?: "artist" | "cloze"
  artistCtx?: ArtistContext | null
  score?: { right: number; total: number }
  streak?: number
  roundSize?: number
  xpRefreshKey?: number
}) {
  const { t } = useTranslation()

  return (
    <header className="fixed top-0 inset-x-0 z-50 flex items-center justify-between pl-6 pr-16 h-14 border-b border-border/40 bg-background/95 md:bg-background/80 md:backdrop-blur-sm">
      <Link to="/" aria-label={playMode ? t("common.backToHome") : t("nav.logoAria")} className="select-none flex items-center gap-2.5">
        <Logo />
        {playMode && !artistCtx && (
          <>
            <span className="text-primary/40 text-sm select-none">/</span>
            <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-primary/80">
              {playMode === "cloze"
                ? t("home.modes.clozeEyebrow").replace(/^\/\s*/, "")
                : t("home.modes.classicEyebrow").replace(/^\/\s*/, "")}
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

      <nav className="flex items-center gap-3 text-xs font-medium tabular-nums">
        {streak !== undefined && streak > 0 && (
          <span className="flex items-center gap-1.5 text-primary" aria-label={t("play.streakAria", { count: streak })}>
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            <span>{t("play.streakLabel", { count: streak })}</span>
          </span>
        )}
        {score !== undefined && (
          <span className="text-muted-foreground" aria-label={t("play.scoreAria", { score: score.right, total: roundSize ?? score.total })}>
            <span className="text-foreground">{score.right}</span>
            <span className="opacity-50"> / {roundSize ?? score.total}</span>
          </span>
        )}
        <Show when="signed-in">
          <XpHeaderChip refreshKey={xpRefreshKey} />
        </Show>
        <LangToggle />
        <Show when="signed-in">
          <UserButton appearance={clerkDarkAppearance} />
        </Show>
        <Show when="signed-out">
          <SignInButton mode="modal">
            <button
              type="button"
              className="h-8 rounded-full border border-border/60 bg-card/80 px-3 text-xs font-bold tracking-wide text-foreground/80 hover:border-primary/60 hover:text-foreground transition-colors"
            >
              {t("nav.signIn")}
            </button>
          </SignInButton>
        </Show>
      </nav>
    </header>
  )
}
