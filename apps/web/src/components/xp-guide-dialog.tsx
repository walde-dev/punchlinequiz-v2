import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"

import { getLevelsFn } from "../lib/session"
import { LevelLadder } from "./level-ladder"
import type { LevelInfo } from "../lib/xp"

/**
 * Explains the XP system and teases the full rank ladder. Opened from the
 * header XP chip (replacing the old straight-to-profile link). Levels are
 * fetched lazily the first time the dialog opens and then kept.
 */
export function XpGuideDialog({
  open,
  onOpenChange,
  totalXp,
  currentRank,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  totalXp: number
  currentRank: number
}) {
  const { t } = useTranslation()
  const [levels, setLevels] = useState<Array<LevelInfo> | null>(null)

  useEffect(() => {
    if (!open || levels) return
    getLevelsFn()
      .then(setLevels)
      .catch(() => {
        /* transient — the dialog still shows how XP works */
      })
  }, [open, levels])

  const earnKeys = ["answer", "streak", "daily", "submit"] as const

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-extrabold tracking-tight">
            {t("xp.guide.title")}
          </DialogTitle>
          <DialogDescription>{t("xp.guide.intro")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary/80">
            {t("xp.guide.earnTitle")}
          </h3>
          <ul className="flex flex-col gap-1.5">
            {earnKeys.map((key) => (
              <li
                key={key}
                className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-card/30 px-3.5 py-2.5"
              >
                <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span className="text-sm text-foreground/90">{t(`xp.guide.earn.${key}`)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary/80">
            {t("xp.guide.levelsTitle")}
          </h3>
          {levels ? (
            <LevelLadder levels={levels} totalXp={totalXp} currentRank={currentRank} youAreHere />
          ) : (
            <div aria-hidden="true" className="h-[6.25rem] animate-pulse rounded-2xl bg-card/30" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
