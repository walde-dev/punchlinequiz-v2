import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { SignInButton, useAuth } from "@clerk/tanstack-react-start"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { AppHeader } from "../components/app-header"
import { rankIconPath } from "../lib/rank-icon"
import { getLeaderboardFn } from "../lib/leaderboard"
import { seo } from "../lib/seo"
import { logEvent } from "../lib/track"
import type {
  LeaderboardEntry,
  LeaderboardMetric,
  LeaderboardResult,
  LeaderboardScope,
} from "../lib/leaderboard"

const SCOPES: ReadonlyArray<LeaderboardScope> = ["global", "friends"]
const METRICS: ReadonlyArray<LeaderboardMetric> = [
  "punchlines",
  "contributed",
  "rank",
]

// Both axes are optional in the URL so links to /leaderboard need no params;
// absent/invalid values resolve to the default cell (global/punchlines).
type Search = { scope?: LeaderboardScope; metric?: LeaderboardMetric }

const DEFAULT_SCOPE: LeaderboardScope = "global"
const DEFAULT_METRIC: LeaderboardMetric = "punchlines"

/** Keep only valid axis values; drop everything else (defaults applied later). */
function parseSearch(search: Record<string, unknown>): Search {
  const out: Search = {}
  if (SCOPES.includes(search.scope as LeaderboardScope))
    out.scope = search.scope as LeaderboardScope
  if (METRICS.includes(search.metric as LeaderboardMetric))
    out.metric = search.metric as LeaderboardMetric
  return out
}

export const Route = createFileRoute("/leaderboard")({
  component: LeaderboardPage,
  head: () =>
    seo({
      title: "Rangliste",
      description:
        "Die besten Köpfe im deutschen Rap-Quiz. Wer kennt die meisten Bars?",
      path: "/leaderboard",
    }),
  validateSearch: parseSearch,
  // No loaderDeps: read the URL once on entry so a deep link (?scope=friends&
  // metric=rank) SSRs the right cell. Intra-page tab toggles are handled
  // client-side (cache + fetch below), so the loader must not re-run on them.
  loader: async ({ location }) => {
    const s = parseSearch(location.search as Record<string, unknown>)
    return {
      initial: await getLeaderboardFn({
        data: {
          scope: s.scope ?? DEFAULT_SCOPE,
          metric: s.metric ?? DEFAULT_METRIC,
        },
      }),
    }
  },
})

const ease = "cubic-bezier(0.16, 1, 0.3, 1)"

const cacheKey = (scope: LeaderboardScope, metric: LeaderboardMetric): string =>
  `${scope}:${metric}`

const EMPTY = (
  scope: LeaderboardScope,
  metric: LeaderboardMetric
): LeaderboardResult => ({
  scope,
  metric,
  totalActiveLines: null,
  top: [],
  me: null,
})

function LeaderboardPage() {
  const { initial } = Route.useLoaderData()
  const search = Route.useSearch()
  const scope = search.scope ?? DEFAULT_SCOPE
  const metric = search.metric ?? DEFAULT_METRIC
  const navigate = useNavigate({ from: Route.fullPath })
  const { t } = useTranslation()
  const { isSignedIn } = useAuth()
  const [data, setData] = useState<LeaderboardResult>(initial)
  const [loading, setLoading] = useState(false)
  // Per-session result cache, keyed by scope:metric. Seeded with the loader's
  // cell so revisited tabs render instantly with no refetch.
  const cache = useRef<Map<string, LeaderboardResult>>(
    new Map([[cacheKey(initial.scope, initial.metric), initial]])
  )

  // Log a view on mount and on either-axis change.
  useEffect(() => {
    logEvent("leaderboard_viewed", { scope, metric })
    if (metric === "contributed") logEvent("contributor_leaderboard_viewed", {})
  }, [scope, metric])

  useEffect(() => {
    // Friends requires sign-in → show the prompt instead of querying.
    if (scope === "friends" && !isSignedIn) {
      setLoading(false)
      setData(EMPTY(scope, metric))
      return
    }
    // Cache hit (incl. the seeded loader cell) → render instantly, no fetch.
    const key = cacheKey(scope, metric)
    const cached = cache.current.get(key)
    if (cached) {
      setLoading(false)
      setData(cached)
      return
    }
    // Cache miss → skeleton while the new cell loads.
    let active = true
    setLoading(true)
    getLeaderboardFn({ data: { scope, metric } })
      .then((r) => {
        if (!active) return
        cache.current.set(key, r)
        setData(r)
      })
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [scope, metric, isSignedIn])

  const setAxis = (next: Partial<Search>) =>
    navigate({ search: (prev) => ({ ...prev, ...next }), replace: true })

  const showSignIn = scope === "friends" && !isSignedIn

  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden">
      <AppHeader />
      <div
        className="pq-spotlight pointer-events-none absolute inset-0"
        aria-hidden="true"
      />

      <main className="relative mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-5 pt-20 pb-28 md:px-8">
        <header
          className="flex flex-col items-center gap-2 text-center"
          style={{ animation: `pq-fade-up 0.5s ${ease} both` }}
        >
          <span className="text-[10px] font-bold tracking-[0.22em] text-primary/80 uppercase">
            {t("leaderboard.eyebrow")}
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight text-balance">
            {t("leaderboard.title")}
          </h1>
        </header>

        {/* Metric tabs (primary axis) */}
        <div
          className="flex flex-wrap justify-center gap-2"
          style={{ animation: `pq-fade-up 0.5s ${ease} 0.06s both` }}
        >
          {METRICS.map((m) => (
            <TabButton
              key={m}
              active={metric === m}
              onClick={() => setAxis({ metric: m })}
            >
              {t(`leaderboard.metric.${m}`)}
            </TabButton>
          ))}
        </div>

        {/* Scope toggle (secondary axis) */}
        <div className="flex justify-center gap-1.5 text-xs">
          {SCOPES.map((s) => (
            <PillToggle
              key={s}
              active={scope === s}
              onClick={() => setAxis({ scope: s })}
            >
              {t(`leaderboard.scope.${s}`)}
            </PillToggle>
          ))}
        </div>

        {/* Rows / prompts */}
        {showSignIn ? (
          <SignInPrompt
            message={t("leaderboard.friendsSignIn")}
            cta={t("nav.signIn")}
          />
        ) : loading ? (
          <section className="flex flex-col gap-2" aria-busy="true">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </section>
        ) : (
          <section
            className="flex flex-col gap-2"
            style={{ animation: `pq-fade-up 0.5s ${ease} 0.12s both` }}
          >
            {data.top.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {metric === "contributed"
                  ? t("leaderboard.contributorEmpty")
                  : t("leaderboard.empty")}
              </p>
            ) : (
              data.top.map((entry) => (
                <Row
                  key={`${entry.rank}-${entry.handle}`}
                  entry={entry}
                  metric={data.metric}
                  totalLines={data.totalActiveLines}
                  highlight={
                    data.me?.inTop &&
                    data.me.rank === entry.rank &&
                    data.me.handle === entry.handle
                  }
                />
              ))
            )}
          </section>
        )}
      </main>

      {/* Sticky "your rank" row when outside the visible top list */}
      {data.me && !data.me.inTop && !loading && !showSignIn && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-primary/30 bg-background/95 px-5 py-3 backdrop-blur-sm md:px-8">
          <div className="mx-auto w-full max-w-xl">
            <Row
              entry={data.me}
              metric={data.metric}
              totalLines={data.totalActiveLines}
              highlight
            />
          </div>
        </div>
      )}
    </div>
  )
}

function SignInPrompt({ message, cta }: { message: string; cta: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <p className="max-w-xs text-sm text-balance text-muted-foreground">
        {message}
      </p>
      <SignInButton mode="modal">
        <Button className="cta-glow min-h-11 bg-primary px-6 text-sm font-bold text-primary-foreground hover:bg-primary/90">
          {cta}
        </Button>
      </SignInButton>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-5 py-2 text-sm font-bold tracking-tight transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "border border-border/60 text-foreground/70 hover:border-primary/50 hover:text-foreground"
      )}
    >
      {children}
    </button>
  )
}

function PillToggle({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 font-bold tracking-[0.12em] uppercase transition-colors",
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  )
}

/**
 * Completion percentage. Shows two decimals so near-complete players aren't
 * all flattened to the same rounded integer — but drops them when they'd be
 * `.00` (a clean 50% reads better than "50.00%").
 */
function formatCompletionPct(ratio: number, locale: string): string {
  const pct = Math.round(ratio * 100 * 100) / 100 // round to 2 decimals
  const hasDecimals = !Number.isInteger(pct)
  return pct.toLocaleString(locale, {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })
}

function Row({
  entry,
  metric,
  totalLines,
  highlight,
}: {
  entry: LeaderboardEntry
  metric: LeaderboardMetric
  totalLines: number | null
  highlight?: boolean
}) {
  const { i18n } = useTranslation()
  const isDe = i18n.language.startsWith("de")
  const tierName = isDe ? entry.level.nameDe : entry.level.nameEn

  // The rank board makes the tier badge the hero (XP demoted to a secondary
  // line), so its under-handle tier label would be redundant — hide it there.
  const showTierUnderHandle = metric !== "rank"

  return (
    <Link
      to="/u/$handle"
      params={{ handle: entry.handle }}
      onClick={() =>
        logEvent("leaderboard_profile_click", {
          metric,
          handle: entry.handle,
          rank: entry.rank,
        })
      }
      className={cn(
        "flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-colors hover:border-primary/50",
        highlight
          ? "border-primary/70 bg-primary/10"
          : "border-border/40 bg-card/30 hover:bg-card/50"
      )}
    >
      <span
        className={cn(
          "w-7 shrink-0 text-center text-sm font-extrabold tabular-nums",
          entry.rank <= 3 ? "text-primary" : "text-muted-foreground"
        )}
      >
        {entry.rank}
      </span>
      <Avatar handle={entry.handle} imageUrl={entry.imageUrl} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-bold tracking-tight text-foreground">
          @{entry.handle}
        </span>
        {showTierUnderHandle && (
          <span className="flex items-center gap-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            <img
              src={rankIconPath(entry.level.rank)}
              alt=""
              aria-hidden="true"
              width={14}
              height={14}
              className="select-none"
            />
            {tierName}
          </span>
        )}
      </div>
      <MetricValue entry={entry} metric={metric} totalLines={totalLines} />
    </Link>
  )
}

/** Right-hand value, by metric: solved count (+ % of pool), bar count, or the
 *  tier badge as hero with XP demoted to a secondary line. */
function MetricValue({
  entry,
  metric,
  totalLines,
}: {
  entry: LeaderboardEntry
  metric: LeaderboardMetric
  totalLines: number | null
}) {
  const { t, i18n } = useTranslation()
  const isDe = i18n.language.startsWith("de")
  const locale = isDe ? "de-DE" : "en-US"
  const tierName = isDe ? entry.level.nameDe : entry.level.nameEn

  if (metric === "rank") {
    return (
      <div className="flex shrink-0 flex-col items-end">
        <span className="flex items-center gap-1.5 text-sm font-extrabold text-foreground">
          <img
            src={rankIconPath(entry.level.rank)}
            alt=""
            aria-hidden="true"
            width={16}
            height={16}
            className="select-none"
          />
          {tierName}
        </span>
        <span className="text-[10px] font-bold text-muted-foreground tabular-nums">
          {entry.metric.toLocaleString(locale)} XP
        </span>
      </div>
    )
  }

  if (metric === "contributed") {
    return (
      <div className="flex shrink-0 flex-col items-end">
        <span className="text-sm font-extrabold text-foreground tabular-nums">
          {t("leaderboard.barsCount", { count: entry.metric })}
        </span>
      </div>
    )
  }

  // punchlines: solved count, with % of the active pool underneath.
  return (
    <div className="flex shrink-0 flex-col items-end">
      <span className="text-sm font-extrabold text-foreground tabular-nums">
        {entry.metric}
        {totalLines ? ` / ${totalLines}` : ""}
      </span>
      {totalLines ? (
        <span className="text-[10px] font-bold text-primary tabular-nums">
          {formatCompletionPct(entry.metric / totalLines, locale)}%
        </span>
      ) : null}
    </div>
  )
}

function SkeletonRow() {
  return (
    <div
      aria-hidden="true"
      className="flex animate-pulse items-center gap-3 rounded-2xl border border-border/40 bg-card/30 px-3 py-2.5"
    >
      <span className="h-4 w-7 shrink-0" />
      <div className="h-9 w-9 shrink-0 rounded-full bg-foreground/10" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="h-3.5 w-28 rounded bg-foreground/10" />
        <div className="h-2.5 w-16 rounded bg-foreground/10" />
      </div>
      <div className="h-4 w-14 shrink-0 rounded bg-foreground/10" />
    </div>
  )
}

function Avatar({
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
