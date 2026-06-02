import { createFileRoute } from "@tanstack/react-router"
import { SignInButton, useAuth } from "@clerk/tanstack-react-start"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { AppHeader } from "../components/app-header"
import { rankIconPath } from "../lib/rank-icon"
import { getLeaderboardFn } from "../lib/leaderboard"
import { seo } from "../lib/seo"
import { listPlayableArtists, type ArtistTile } from "../lib/game"
import { logEvent } from "../lib/track"
import type {
  LeaderboardBoard,
  LeaderboardEntry,
  LeaderboardResult,
  LeaderboardWindow,
} from "../lib/leaderboard"

export const Route = createFileRoute("/leaderboard")({
  component: LeaderboardPage,
  head: () => seo({ title: "Rangliste", description: "Die besten Köpfe im deutschen Rap-Quiz. Wer kennt die meisten Bars?", path: "/leaderboard" }),
  loader: async () => ({
    initial: await getLeaderboardFn({ data: { board: "xp", window: "alltime" } }),
  }),
})

const ease = "cubic-bezier(0.16, 1, 0.3, 1)"

const EMPTY = (board: LeaderboardBoard, window: LeaderboardWindow): LeaderboardResult => ({
  board,
  window,
  totalActiveLines: null,
  top: [],
  me: null,
})

function LeaderboardPage() {
  const { initial } = Route.useLoaderData()
  const { t } = useTranslation()
  const { isSignedIn } = useAuth()
  const [board, setBoard] = useState<LeaderboardBoard>("xp")
  const [window, setWindow] = useState<LeaderboardWindow>("alltime")
  const [artistId, setArtistId] = useState<number | null>(null)
  const [artists, setArtists] = useState<ArtistTile[] | null>(null)
  const [data, setData] = useState<LeaderboardResult>(initial)
  const [loading, setLoading] = useState(false)
  const first = useRef(true)

  // Lazy-load the artist list the first time the Artists board is opened.
  useEffect(() => {
    if (board !== "artist" || artists !== null) return
    listPlayableArtists({ data: { mode: "artist" } })
      .then((rows) => setArtists(rows))
      .catch(() => setArtists([]))
  }, [board, artists])

  useEffect(() => {
    if (first.current) {
      first.current = false
      logEvent("view_leaderboard", { board, window })
      return
    }
    // Friends requires sign-in; artist requires a selected artist. In those
    // "nothing to fetch yet" states, show the prompt instead of querying.
    if (board === "friends" && !isSignedIn) {
      setData(EMPTY("friends", "weekly"))
      return
    }
    if (board === "artist" && artistId == null) {
      setData(EMPTY("artist", "alltime"))
      return
    }
    let active = true
    setLoading(true)
    getLeaderboardFn({ data: { board, window, artistId: artistId ?? undefined } })
      .then((r) => active && setData(r))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [board, window, artistId, isSignedIn])

  function switchBoard(next: LeaderboardBoard) {
    if (next === board) return
    setBoard(next)
    logEvent("view_leaderboard", { board: next, ...(next === "artist" && artistId ? { artistId } : {}) })
    if (next === "contributor") logEvent("view_contributor_leaderboard", {})
  }

  const showSignIn = board === "friends" && !isSignedIn
  const showArtistPrompt = board === "artist" && artistId == null

  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden">
      <AppHeader />
      <div className="pq-spotlight pointer-events-none absolute inset-0" aria-hidden="true" />

      <main className="relative mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-5 pt-20 pb-28 md:px-8">
        <header className="flex flex-col items-center gap-2 text-center" style={{ animation: `pq-fade-up 0.5s ${ease} both` }}>
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary/80">
            {t("leaderboard.eyebrow")}
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight text-balance">{t("leaderboard.title")}</h1>
        </header>

        {/* Board tabs */}
        <div className="flex flex-wrap justify-center gap-2" style={{ animation: `pq-fade-up 0.5s ${ease} 0.06s both` }}>
          <TabButton active={board === "xp"} onClick={() => switchBoard("xp")}>{t("leaderboard.tabs.xp")}</TabButton>
          <TabButton active={board === "completion"} onClick={() => switchBoard("completion")}>{t("leaderboard.tabs.completion")}</TabButton>
          <TabButton active={board === "friends"} onClick={() => switchBoard("friends")}>{t("leaderboard.tabs.friends")}</TabButton>
          <TabButton active={board === "artist"} onClick={() => switchBoard("artist")}>{t("leaderboard.tabs.artists")}</TabButton>
          <TabButton active={board === "contributor"} onClick={() => switchBoard("contributor")}>{t("leaderboard.tabs.contributor")}</TabButton>
        </div>

        {/* Window toggle (XP only) */}
        {board === "xp" && (
          <div className="flex justify-center gap-1.5 text-xs">
            <PillToggle active={window === "weekly"} onClick={() => setWindow("weekly")}>{t("leaderboard.window.weekly")}</PillToggle>
            <PillToggle active={window === "alltime"} onClick={() => setWindow("alltime")}>{t("leaderboard.window.alltime")}</PillToggle>
          </div>
        )}

        {/* Artist picker (Artists board) */}
        {board === "artist" && (
          <ArtistPicker
            artists={artists}
            value={artistId}
            onChange={(id) => {
              setArtistId(id)
              logEvent("view_leaderboard", { board: "artist", artistId: id })
            }}
          />
        )}

        {/* Rows / prompts */}
        {showSignIn ? (
          <SignInPrompt message={t("leaderboard.friendsSignIn")} cta={t("nav.signIn")} />
        ) : showArtistPrompt ? (
          <p className="py-12 text-center text-sm text-muted-foreground">{t("leaderboard.pickArtist")}</p>
        ) : (
          <section
            className={cn("flex flex-col gap-2 transition-opacity duration-200", loading && "opacity-50")}
            style={{ animation: `pq-fade-up 0.5s ${ease} 0.12s both` }}
          >
            {data.top.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {board === "friends"
                  ? t("leaderboard.friendsEmpty")
                  : board === "contributor"
                    ? t("leaderboard.contributorEmpty")
                    : t("leaderboard.empty")}
              </p>
            ) : (
              data.top.map((entry) => (
                <Row
                  key={`${entry.rank}-${entry.handle}`}
                  entry={entry}
                  board={data.board}
                  totalLines={data.totalActiveLines}
                  highlight={data.me?.inTop && data.me.rank === entry.rank && data.me.handle === entry.handle}
                />
              ))
            )}
          </section>
        )}
      </main>

      {/* Sticky "your rank" row when outside the visible top list */}
      {data.me && !data.me.inTop && !showSignIn && !showArtistPrompt && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-primary/30 bg-background/95 px-5 py-3 backdrop-blur-sm md:px-8">
          <div className="mx-auto w-full max-w-xl">
            <Row entry={data.me} board={data.board} totalLines={data.totalActiveLines} highlight />
          </div>
        </div>
      )}
    </div>
  )
}

function ArtistPicker({
  artists,
  value,
  onChange,
}: {
  artists: ArtistTile[] | null
  value: number | null
  onChange: (id: number) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex justify-center">
      <div className="relative w-full max-w-xs">
        <select
          value={value ?? ""}
          disabled={artists === null}
          onChange={(e) => {
            const id = Number(e.target.value)
            if (Number.isInteger(id) && id > 0) onChange(id)
          }}
          className={cn(
            "min-h-11 w-full appearance-none rounded-full border border-border/60 bg-card/60 pl-5 pr-11 text-sm font-bold text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50",
          )}
        >
          <option value="" disabled>
            {artists === null ? t("common.loading") : t("leaderboard.pickArtist")}
          </option>
          {(artists ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-primary"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    </div>
  )
}

function SignInPrompt({ message, cta }: { message: string; cta: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <p className="max-w-xs text-sm text-muted-foreground text-balance">{message}</p>
      <SignInButton mode="modal">
        <Button className="cta-glow min-h-11 bg-primary px-6 text-sm font-bold text-primary-foreground hover:bg-primary/90">
          {cta}
        </Button>
      </SignInButton>
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-5 py-2 text-sm font-bold tracking-tight transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "border border-border/60 text-foreground/70 hover:border-primary/50 hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

function PillToggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 font-bold uppercase tracking-[0.12em] transition-colors",
        active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

function Row({
  entry,
  board,
  totalLines,
  highlight,
}: {
  entry: LeaderboardEntry
  board: LeaderboardBoard
  totalLines: number | null
  highlight?: boolean
}) {
  const { t, i18n } = useTranslation()
  const isDe = i18n.language.startsWith("de")
  const locale = isDe ? "de-DE" : "en-US"

  // completion + artist rank by solved-count; contributor by accepted bars;
  // xp + friends by XP.
  const isCount = board === "completion" || board === "artist"
  const metricLabel =
    board === "contributor"
      ? t("leaderboard.barsCount", { count: entry.metric })
      : isCount
        ? `${entry.metric}${totalLines ? ` / ${totalLines}` : ""}`
        : `${entry.metric.toLocaleString(locale)} XP`
  const subLabel =
    isCount && totalLines ? `${Math.round((entry.metric / totalLines) * 100)}%` : null

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border px-3 py-2.5",
        highlight ? "border-primary/70 bg-primary/10" : "border-border/40 bg-card/30",
      )}
    >
      <span
        className={cn(
          "w-7 shrink-0 text-center text-sm font-extrabold tabular-nums",
          entry.rank <= 3 ? "text-primary" : "text-muted-foreground",
        )}
      >
        {entry.rank}
      </span>
      <Avatar handle={entry.handle} imageUrl={entry.imageUrl} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-bold tracking-tight text-foreground">@{entry.handle}</span>
        <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <img src={rankIconPath(entry.level.rank)} alt="" aria-hidden="true" width={14} height={14} className="select-none" />
          {isDe ? entry.level.nameDe : entry.level.nameEn}
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <span className="text-sm font-extrabold tabular-nums text-foreground">{metricLabel}</span>
        {subLabel && <span className="text-[10px] font-bold tabular-nums text-primary">{subLabel}</span>}
      </div>
    </div>
  )
}

function Avatar({ handle, imageUrl }: { handle: string; imageUrl: string | null }) {
  const initial = handle.slice(0, 1).toUpperCase()
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/30 bg-primary/10 text-sm font-extrabold text-primary"
      aria-hidden="true"
    >
      {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover" /> : initial}
    </div>
  )
}
