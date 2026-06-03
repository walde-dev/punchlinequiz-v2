import { SignInButton, Show } from "@clerk/tanstack-react-start"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { cn } from "@workspace/ui/lib/utils"

import { getAnonXpTotalFn } from "../lib/anon-xp"
import { logEvent } from "../lib/track"

/**
 * Persistent "X XP banked — sign up to keep it" pill (PUN-99). The primary
 * signup surface for anonymous players: always present once provisional XP
 * exists, never blocking a game interaction (no auto-dismiss, no overlay).
 * Refetches the live total whenever `refreshKey` bumps (caller bumps it on each
 * correct answer). Signed-out only.
 */
export function AnonXpPill({ refreshKey }: { refreshKey: number }) {
  return (
    <Show when="signed-out">
      <AnonXpPillInner refreshKey={refreshKey} />
    </Show>
  )
}

function AnonXpPillInner({ refreshKey }: { refreshKey: number }) {
  const { t } = useTranslation()
  const [xp, setXp] = useState(0)
  const shownRef = useRef(false)

  useEffect(() => {
    let active = true
    getAnonXpTotalFn()
      .then((r) => {
        if (active) setXp(r.claimed ? 0 : r.total)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [refreshKey])

  // Funnel: fire once when the prompt first becomes visible (PUN-101).
  useEffect(() => {
    if (xp > 0 && !shownRef.current) {
      shownRef.current = true
      logEvent("signup_prompt_shown", { source: "pill", xp })
    }
  }, [xp])

  if (xp <= 0) return null

  return (
    <div className="flex justify-center" aria-live="polite">
      <SignInButton mode="modal">
        <button
          type="button"
          onClick={() => logEvent("signup_prompt_clicked", { source: "pill", xp })}
          aria-label={t("xp.banked.aria", { xp })}
          className={cn(
            "group inline-flex items-center gap-2.5 rounded-full px-4 py-1.5",
            "bg-[#1a1a1a]/95 ring-1 ring-primary/45 backdrop-blur-md",
            "shadow-[0_0_30px_-6px_color-mix(in_oklch,var(--primary),transparent_45%)]",
            "active:scale-[0.97] transition-transform duration-150",
          )}
        >
          <span aria-hidden="true" className="text-base">✨</span>
          <span className="text-xs font-extrabold tracking-tight text-foreground">
            {t("xp.banked.label", { xp })}
          </span>
          <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
            {t("xp.banked.cta")}
            <span aria-hidden="true">→</span>
          </span>
        </button>
      </SignInButton>
    </div>
  )
}
