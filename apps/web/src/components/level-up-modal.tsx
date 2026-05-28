import { useEffect } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { Confetti } from "./confetti"
import { rankIconPath } from "../lib/rank-icon"
import type { LevelInfo } from "../lib/xp"

/**
 * Full-screen takeover for level-up moments. Fires only on the rare
 * threshold crossing — it's loud on purpose. Dismiss on click or Esc.
 */
export function LevelUpModal({
  level,
  onClose,
}: {
  level: LevelInfo | null
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()

  useEffect(() => {
    if (!level) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [level, onClose])

  if (!level) return null
  const name = i18n.language.startsWith("de") ? level.nameDe : level.nameEn

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="level-up-title"
      className="fixed inset-0 z-[200] flex items-center justify-center px-6"
      onClick={onClose}
      style={{ animation: "pq-fade-in 0.22s ease-out both" }}
    >
      <div
        className="absolute inset-0 bg-black/85 backdrop-blur-sm"
        aria-hidden="true"
      />
      <Confetti trigger={level.rank} />
      <div
        className={cn(
          "relative flex flex-col items-center gap-5 rounded-3xl px-8 py-10 text-center",
          "border border-primary/40 bg-gradient-to-b from-[#1a1a1a] to-[#0e0e0e]",
          "shadow-[0_0_80px_-10px_rgba(251,191,36,0.6)]",
        )}
        style={{
          animation: "pq-pop-in 0.45s cubic-bezier(0.16, 1, 0.3, 1) both",
          maxWidth: "min(90vw, 28rem)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-xs font-bold uppercase tracking-[0.22em] text-primary/80">
          {t("xp.levelUp.eyebrow")}
        </span>
        <img
          src={rankIconPath(level.rank)}
          alt=""
          aria-hidden="true"
          width={144}
          height={144}
          className="select-none"
          style={{
            animation: "pq-pop-in 0.55s cubic-bezier(0.16, 1, 0.3, 1) 0.05s both",
            filter:
              "drop-shadow(0 0 40px color-mix(in oklch, var(--primary), transparent 50%))",
          }}
        />
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            {t("xp.levelUp.levelLabel")} {level.rank}
          </span>
          <h2
            id="level-up-title"
            className="font-extrabold tracking-tight text-primary text-balance"
            style={{
              fontSize: "clamp(2.5rem, 9vw, 4rem)",
              lineHeight: 1.05,
              textShadow: "0 0 50px rgba(251,191,36,0.5)",
            }}
          >
            {name}
          </h2>
        </div>
        <p className="max-w-xs text-sm text-muted-foreground text-balance">
          {t("xp.levelUp.subtitle", { rank: name })}
        </p>
        <Button
          size="lg"
          onClick={onClose}
          className="cta-glow mt-1 min-h-12 px-8 text-base font-bold"
        >
          {t("xp.levelUp.cta")}
        </Button>
      </div>
    </div>
  )
}
