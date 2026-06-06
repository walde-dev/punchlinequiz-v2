import { SignInButton, UserButton, useUser } from "@clerk/tanstack-react-start"
import { Link } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"

import { clerkDarkAppearance } from "../lib/clerk-theme"
import { syncProfileImageFn } from "../lib/profile"
import { LangToggle } from "./lang-toggle"
import { XpHeaderChip } from "./xp-header-chip"
import type { ArtistContext } from "../lib/game"

type ArtistChoice = { id: number; name: string; imageUrl?: string | null }

/** Plus glyph for the "Submit a bar" header CTA. */
function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

/**
 * "Submit a bar" CTA — the primary contributor growth action, surfaced in the
 * header for signed-in users. Reuses the Button component (gold default variant)
 * rendered as a Link; label collapses to the icon on mobile to stay compact.
 */
function SubmitBarCta() {
  const { t } = useTranslation()
  return (
    <Button
      size="sm"
      aria-label={t("nav.submit")}
      render={<Link to="/submit" />}
      // Secondary action — drop it from the crowded mobile header; it returns at sm+.
      className="hidden sm:inline-flex"
    >
      <PlusIcon />
      <span className="hidden sm:inline">{t("nav.submit")}</span>
    </Button>
  )
}

/** Small icon for the custom "Profile" item in the Clerk account menu. */
function ProfileMenuIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function Logo() {
  return (
    <span className="flex min-w-0 items-center gap-2 select-none">
      <img src="/logo.png" alt="" aria-hidden="true" className="h-7 w-7 shrink-0" />
      {/* The gold mark carries identity on phones; the wordmark is chrome that
          crowds the mobile header (leaderboard + XP chip + lang + avatar already
          fill it). Hide it below sm to stop the header overflowing; it returns
          at sm+ where there's room. */}
      <span className="hidden truncate font-bold text-lg tracking-tight sm:inline">
        <span className="text-foreground">punchline</span>
        <span className="text-primary">/quiz</span>
      </span>
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
  streak,
  xpRefreshKey,
}: {
  playMode?: "artist" | "cloze"
  artistCtx?: ArtistContext | null
  streak?: number
  xpRefreshKey?: number
}) {
  const { t } = useTranslation()

  return (
    <header className="fixed top-0 inset-x-0 z-50 flex items-center justify-between gap-2 pl-4 pr-3 h-14 border-b border-border/40 bg-background/95 md:bg-background/80 md:backdrop-blur-sm sm:gap-3 sm:pr-4 md:pl-6 md:pr-16">
      <Link
        to="/"
        aria-label={playMode ? t("common.backToHome") : t("nav.logoAria")}
        className="select-none flex min-w-0 items-center gap-2.5"
      >
        <Logo />
        {playMode && !artistCtx && (
          <>
            <span className="text-primary/40 text-sm select-none">/</span>
            <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-primary/80 truncate">
              {playMode === "cloze"
                ? t("home.modes.clozeEyebrow").replace(/^\/\s*/, "")
                : t("home.modes.classicEyebrow").replace(/^\/\s*/, "")}
            </span>
          </>
        )}
        {artistCtx && (
          <>
            <span className="text-primary/40 text-sm select-none">/</span>
            <span className="flex min-w-0 items-center gap-1.5">
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

      <nav className="flex shrink-0 items-center gap-2 text-xs font-medium tabular-nums sm:gap-3">
        <Link
          to="/leaderboard"
          className="font-bold tracking-wide text-foreground/70 hover:text-primary transition-colors"
        >
          {t("nav.leaderboard")}
        </Link>
        {streak !== undefined && streak > 0 && (
          /* Redundant with the streak shown inside the XP chip; hide on mobile to
             save header width. */
          <span className="hidden items-center gap-1.5 text-primary sm:flex" aria-label={t("play.streakAria", { count: streak })}>
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            <span>{t("play.streakLabel", { count: streak })}</span>
          </span>
        )}
        <AuthSlot xpRefreshKey={xpRefreshKey} />
      </nav>
    </header>
  )
}

/**
 * Right-side auth cluster. Reads a cached signed-in flag synchronously on mount
 * so we render the correct slot (UserButton vs Sign-in pill) without waiting
 * for Clerk to hydrate — no layout shift. `useUser` patches the flag once Clerk
 * loads in case the cache was wrong (e.g. signed out in another tab).
 */
const AUTH_CACHE_KEY = "pq.auth.v1"

type AuthCache = { signedIn: boolean; imageUrl: string | null }

function readAuthCache(): AuthCache | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(AUTH_CACHE_KEY)
    return raw ? (JSON.parse(raw) as AuthCache) : null
  } catch {
    return null
  }
}

function writeAuthCache(value: AuthCache) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

function AuthSlot({ xpRefreshKey }: { xpRefreshKey?: number }) {
  const { t } = useTranslation()
  const { isLoaded, isSignedIn, user } = useUser()
  const [cache, setCache] = useState<AuthCache | null>(() => readAuthCache())

  useEffect(() => {
    if (!isLoaded || isSignedIn === undefined) return
    const next: AuthCache = {
      signedIn: isSignedIn,
      imageUrl: isSignedIn ? (user?.imageUrl ?? null) : null,
    }
    writeAuthCache(next)
    setCache(next)
    // Persist the Clerk avatar so public profiles can render it for any user.
    // Fire-and-forget; the server no-ops when the URL is unchanged.
    if (isSignedIn && user?.imageUrl) {
      syncProfileImageFn({ data: { imageUrl: user.imageUrl } }).catch(() => {})
    }
  }, [isLoaded, isSignedIn, user?.imageUrl])

  const signedIn = isLoaded ? isSignedIn : cache?.signedIn ?? null
  const cachedAvatar = cache?.imageUrl ?? null

  return (
    <>
      {signedIn === true && <SubmitBarCta />}
      {signedIn === true && <XpHeaderChip refreshKey={xpRefreshKey} />}
      <LangToggle />
      {signedIn === true && (
        /* Fixed slot: UserButton renders empty for a beat while Clerk hydrates
           internally. We stamp the cached avatar underneath so the slot looks
           correct from the first paint; UserButton then paints its own avatar
           on top (same image, so the handoff is invisible). */
        <span className="relative inline-flex h-7 w-7 items-center justify-center">
          {cachedAvatar ? (
            <img
              src={cachedAvatar}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full rounded-full object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-full bg-card/40"
            />
          )}
          <UserButton appearance={clerkDarkAppearance}>
            <UserButton.MenuItems>
              <UserButton.Link label={t("nav.profile")} labelIcon={<ProfileMenuIcon />} href="/profile" />
              <UserButton.Action label="manageAccount" />
              <UserButton.Action label="signOut" />
            </UserButton.MenuItems>
          </UserButton>
        </span>
      )}
      {signedIn === false && (
        <SignInButton mode="modal">
          <button
            type="button"
            className="h-8 rounded-full border border-border/60 bg-card/80 px-3 text-xs font-bold tracking-wide text-foreground/80 hover:border-primary/60 hover:text-foreground transition-colors"
          >
            {t("nav.signIn")}
          </button>
        </SignInButton>
      )}
      {signedIn === null && (
        /* First-ever visit: nothing cached, Clerk still hydrating. Reserve a
           28×28 slot so the eventual UserButton/SignIn pill doesn't shift
           anything when it appears. */
        <span
          aria-hidden="true"
          className="inline-block h-7 w-7 rounded-full bg-card/40"
        />
      )}
    </>
  )
}
