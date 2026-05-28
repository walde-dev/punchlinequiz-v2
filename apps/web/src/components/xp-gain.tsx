import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { cn } from "@workspace/ui/lib/utils"

import type { XpGrantResult } from "../lib/xp"

/**
 * Gold +XP burst that floats up and fades out. Mounted by a `key` change so
 * each correct answer fires its own instance — never reuse, never animate
 * from scale(0). Skipped entirely when `xp` is null/anonymous/duplicate.
 */
export function XpGain({ xp }: { xp: XpGrantResult | null | undefined }) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const id = window.setTimeout(() => setVisible(false), 1500)
    return () => window.clearTimeout(id)
  }, [])

  if (!xp || xp.awarded === false || xp.leveledUp) return null
  if (!visible) return null

  const streakChip = xp.streak >= 3

  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center"
    >
      <div
        className={cn(
          "relative mt-2 flex items-center gap-2",
          "rounded-full px-4 py-1.5",
          "bg-primary/15 backdrop-blur-md ring-1 ring-primary/40",
          "shadow-[0_0_30px_-5px_rgba(251,191,36,0.6)]",
        )}
        style={{
          animation: "pq-xp-float 1.4s cubic-bezier(0.16, 1, 0.3, 1) both",
        }}
      >
        <span className="text-base font-extrabold tabular-nums tracking-tight text-primary">
          +{xp.xpAwarded} {t("xp.suffix")}
        </span>
        {streakChip && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-primary"
            style={{ animation: "pq-fade-up 0.4s cubic-bezier(0.23, 1, 0.32, 1) 80ms both" }}
          >
            <span aria-hidden="true">🔥</span>×{xp.streak}
          </span>
        )}
      </div>
    </div>
  )
}
