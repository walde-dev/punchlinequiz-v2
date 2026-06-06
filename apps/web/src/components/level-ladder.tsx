import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"

import { cn } from "@workspace/ui/lib/utils"

import { rankIconPath } from "../lib/rank-icon"
import type { LevelInfo } from "../lib/xp"

/**
 * Horizontal, scroll-snapping strip of every rank in the game. Reached ranks
 * glow gold, the current one is ringed + tagged "You", future ones are dimmed
 * with their XP cost teased. Mounts scrolled to the current rank so the user
 * lands on "where am I". Used on the public profile and inside the XP guide.
 */
export function LevelLadder({
  levels,
  totalXp,
  currentRank,
  /** Tag the current rank with "You" — only true when the XP is the viewer's own. */
  youAreHere = false,
  className,
}: {
  levels: Array<LevelInfo>
  totalXp: number
  currentRank: number
  youAreHere?: boolean
  className?: string
}) {
  const { t, i18n } = useTranslation()
  const isDe = i18n.language.startsWith("de")
  const scrollerRef = useRef<HTMLOListElement>(null)
  const currentRef = useRef<HTMLLIElement>(null)

  // Center the current rank on mount — no smooth scroll (it's the initial view).
  useEffect(() => {
    const node = currentRef.current
    const scroller = scrollerRef.current
    if (!node || !scroller) return
    const target = node.offsetLeft - scroller.clientWidth / 2 + node.clientWidth / 2
    scroller.scrollLeft = Math.max(0, target)
  }, [currentRank])

  return (
    <ol
      ref={scrollerRef}
      className={cn(
        // min-w-0 + max-w-full so the scroller can shrink inside flex/grid
        // parents and actually scroll, rather than stretching to fit all ranks.
        "flex min-w-0 max-w-full snap-x gap-2.5 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {levels.map((lvl) => {
        const reached = totalXp >= lvl.threshold
        const isCurrent = lvl.rank === currentRank
        const name = isDe ? lvl.nameDe : lvl.nameEn
        return (
          <li
            key={lvl.id}
            ref={isCurrent ? currentRef : undefined}
            className="shrink-0 snap-start"
          >
            <div
              className={cn(
                "flex w-[5.5rem] flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-center transition-colors",
                isCurrent
                  ? "border-primary/60 bg-primary/10"
                  : reached
                    ? "border-border/50 bg-card/40"
                    : "border-border/30 bg-card/20",
              )}
            >
              <img
                src={rankIconPath(lvl.rank)}
                alt=""
                aria-hidden="true"
                width={40}
                height={40}
                className={cn("select-none", !reached && "opacity-30 grayscale")}
                style={
                  isCurrent
                    ? { filter: "drop-shadow(0 0 14px color-mix(in oklch, var(--primary), transparent 45%))" }
                    : undefined
                }
              />
              <span
                className={cn(
                  "text-[10px] font-bold uppercase leading-tight tracking-[0.08em]",
                  isCurrent ? "text-primary" : reached ? "text-foreground/85" : "text-muted-foreground",
                )}
              >
                {name}
              </span>
              {isCurrent && youAreHere ? (
                <span className="rounded-full bg-primary px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-primary-foreground">
                  {t("xp.guide.youAreHere")}
                </span>
              ) : (
                <span
                  className={cn(
                    "text-[10px] font-semibold tabular-nums",
                    isCurrent ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {compactThreshold(lvl.threshold)}
                </span>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** 0 → "0", 1000 → "1k", 3500 → "3.5k", 320000 → "320k". */
function compactThreshold(xp: number): string {
  if (xp < 1000) return String(xp)
  const k = xp / 1000
  return Number.isInteger(k) ? `${k}k` : `${k.toFixed(1)}k`
}
