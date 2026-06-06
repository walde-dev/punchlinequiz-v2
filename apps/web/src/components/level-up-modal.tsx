import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { cn } from "@workspace/ui/lib/utils"

import { rankIconPath } from "../lib/rank-icon"
import { Confetti } from "./confetti"
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

  if (!level) return null
  const name = i18n.language.startsWith("de") ? level.nameDe : level.nameEn

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* Deliberate one-off celebratory surface — it's loud on purpose. base-ui
          handles focus-trap, scroll-lock and Esc; the look is bespoke. */}
      <DialogContent
        showCloseButton={false}
        className={cn(
          "max-w-md gap-5 border-primary/40 bg-gradient-to-b from-[#1a1a1a] to-[#0e0e0e] px-8 py-10 text-center",
          "flex flex-col items-center shadow-[0_0_80px_-10px_rgba(251,191,36,0.6)] sm:max-w-md"
        )}
      >
        <Confetti trigger={level.rank} />
        <span className="text-xs font-bold tracking-[0.22em] text-primary/80 uppercase">
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
            animation:
              "pq-pop-in 0.55s cubic-bezier(0.16, 1, 0.3, 1) 0.05s both",
            filter:
              "drop-shadow(0 0 40px color-mix(in oklch, var(--primary), transparent 50%))",
          }}
        />
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
            {t("xp.levelUp.levelLabel")} {level.rank}
          </span>
          <DialogTitle
            className="font-extrabold tracking-tight text-balance text-primary"
            style={{
              fontSize: "clamp(2.5rem, 9vw, 4rem)",
              lineHeight: 1.05,
              textShadow: "0 0 50px rgba(251,191,36,0.5)",
            }}
          >
            {name}
          </DialogTitle>
        </div>
        <DialogDescription className="max-w-xs text-sm text-balance text-muted-foreground">
          {t("xp.levelUp.subtitle", { rank: name })}
        </DialogDescription>
        <Button
          size="lg"
          onClick={onClose}
          className="cta-glow mt-1 min-h-12 px-8 text-base font-bold"
        >
          {t("xp.levelUp.cta")}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
