import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { cn } from "@workspace/ui/lib/utils"

import { getHeaderXpFn } from "../lib/session"
import { rankIconPath } from "../lib/rank-icon"
import { XpGuideDialog } from "./xp-guide-dialog"
import type { HeaderXp } from "../lib/session"

/**
 * Header chip showing current level, mini XP bar, and total XP. Tap → opens the
 * XP-system explainer dialog (how XP works + the full rank ladder).
 * Signed-out users see a ghost "Anmelden für XP" pitch instead. Re-fetches on
 * `refreshKey` change (caller bumps it after a correct answer).
 *
 * Cached in localStorage so the chip renders instantly on page load instead of
 * flickering in. The server fetch still runs in the background and patches the
 * cache if anything drifted.
 */
const CACHE_KEY = "pq.xp.header.v1"

function readCache(): HeaderXp | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as HeaderXp) : null
  } catch {
    return null
  }
}

function writeCache(data: HeaderXp | null) {
  if (typeof window === "undefined") return
  try {
    if (data) window.localStorage.setItem(CACHE_KEY, JSON.stringify(data))
    else window.localStorage.removeItem(CACHE_KEY)
  } catch {
    /* quota / private mode — ignore */
  }
}

export function XpHeaderChip({ refreshKey = 0 }: { refreshKey?: number }) {
  const { t, i18n } = useTranslation()
  const [data, setData] = useState<HeaderXp | null>(() => readCache())
  const [pulse, setPulse] = useState(0)
  const [guideOpen, setGuideOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    getHeaderXpFn()
      .then((r) => {
        if (cancelled) return
        if (!r.signedIn) {
          writeCache(null)
          setData(r)
          return
        }
        setData((prev) => {
          if (prev && JSON.stringify(prev) === JSON.stringify(r)) return prev
          writeCache(r)
          return r
        })
      })
      .catch(() => {
        /* anonymous or transient — silent */
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  useEffect(() => {
    if (refreshKey > 0) setPulse((p) => p + 1)
  }, [refreshKey])

  if (!data) return null
  if (!data.signedIn) return null

  const levelName = i18n.language.startsWith("de")
    ? data.level.nameDe
    : data.level.nameEn
  const showStreak = data.currentStreak >= 2

  return (
    <>
      <button
        type="button"
        onClick={() => setGuideOpen(true)}
        className={cn(
          "group inline-flex items-center gap-1.5 rounded-full sm:gap-2.5",
          "border border-primary/25 bg-primary/5 px-2 py-1.5 sm:px-3",
          "hover:border-primary/50 hover:bg-primary/10 active:scale-[0.97]",
          "transition-all duration-150"
        )}
        style={{
          transition:
            "transform 160ms cubic-bezier(0.23, 1, 0.32, 1), background-color 160ms, border-color 160ms",
        }}
        aria-label={t("xp.headerAria", { level: levelName, xp: data.totalXp })}
      >
        <img
          src={rankIconPath(data.level.rank)}
          alt=""
          aria-hidden="true"
          width={20}
          height={20}
          className="-ml-0.5 select-none"
        />
        <span className="hidden text-[10px] font-bold tracking-[0.14em] text-primary/90 uppercase sm:inline">
          {levelName}
        </span>
        <span
          className="relative block h-1.5 w-8 overflow-hidden rounded-full bg-primary/15 sm:w-12"
          aria-hidden="true"
        >
          <span
            className="absolute inset-y-0 left-0 block bg-primary"
            style={{
              width: `${data.progressPct}%`,
              transition: "width 280ms cubic-bezier(0.23, 1, 0.32, 1)",
            }}
          />
        </span>
        <span className="text-[11px] font-bold text-foreground/90 tabular-nums">
          {compactXp(data.totalXp)}
        </span>
        {showStreak && (
          <span
            key={pulse}
            className="inline-flex items-center text-[10px] font-bold text-primary/90"
            style={{
              animation:
                pulse > 0
                  ? "pq-pulse 0.6s cubic-bezier(0.4, 0, 0.6, 1) both"
                  : undefined,
            }}
            aria-hidden="true"
          >
            🔥{data.currentStreak}
          </span>
        )}
      </button>
      <XpGuideDialog
        open={guideOpen}
        onOpenChange={setGuideOpen}
        totalXp={data.totalXp}
        currentRank={data.level.rank}
      />
    </>
  )
}

function compactXp(xp: number): string {
  if (xp < 1000) return String(xp)
  if (xp < 10000) return `${(xp / 1000).toFixed(1)}k`
  return `${Math.round(xp / 1000)}k`
}
