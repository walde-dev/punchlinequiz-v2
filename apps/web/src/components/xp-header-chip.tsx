import { Link } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { cn } from "@workspace/ui/lib/utils"

import { getHeaderXpFn, type HeaderXp } from "../lib/session"
import { rankIconPath } from "../lib/rank-icon"

/**
 * Header chip showing current level, mini XP bar, and total XP. Tap → /profile.
 * Signed-out users see a ghost "Anmelden für XP" pitch instead. Re-fetches on
 * `refreshKey` change (caller bumps it after a correct answer).
 */
export function XpHeaderChip({ refreshKey = 0 }: { refreshKey?: number }) {
  const { t, i18n } = useTranslation()
  const [data, setData] = useState<HeaderXp | null>(null)
  const [pulse, setPulse] = useState(0)

  useEffect(() => {
    let cancelled = false
    getHeaderXpFn()
      .then((r) => {
        if (!cancelled) setData(r)
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

  const levelName = i18n.language.startsWith("de") ? data.level.nameDe : data.level.nameEn
  const showStreak = data.currentStreak >= 2

  return (
    <Link
      to="/profile"
      className={cn(
        "group inline-flex items-center gap-2.5 rounded-full",
        "border border-primary/25 bg-primary/5 px-3 py-1.5",
        "hover:border-primary/50 hover:bg-primary/10 active:scale-[0.97]",
        "transition-all duration-150",
      )}
      style={{ transition: "transform 160ms cubic-bezier(0.23, 1, 0.32, 1), background-color 160ms, border-color 160ms" }}
      aria-label={t("xp.headerAria", { level: levelName, xp: data.totalXp })}
    >
      <img
        src={rankIconPath(data.level.rank)}
        alt=""
        aria-hidden="true"
        width={20}
        height={20}
        className="select-none -ml-0.5"
      />
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary/90">
        {levelName}
      </span>
      <span
        className="relative block h-1.5 w-12 overflow-hidden rounded-full bg-primary/15"
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
      <span className="text-[11px] font-bold tabular-nums text-foreground/90">
        {compactXp(data.totalXp)}
      </span>
      {showStreak && (
        <span
          key={pulse}
          className="inline-flex items-center text-[10px] font-bold text-primary/90"
          style={{
            animation:
              pulse > 0 ? "pq-pulse 0.6s cubic-bezier(0.4, 0, 0.6, 1) both" : undefined,
          }}
          aria-hidden="true"
        >
          🔥{data.currentStreak}
        </span>
      )}
    </Link>
  )
}

function compactXp(xp: number): string {
  if (xp < 1000) return String(xp)
  if (xp < 10000) return `${(xp / 1000).toFixed(1)}k`
  return `${Math.round(xp / 1000)}k`
}
