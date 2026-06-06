import { Show, SignInButton } from "@clerk/tanstack-react-start"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { cn } from "@workspace/ui/lib/utils"

import { getAnonStandingFn } from "../lib/anon-xp"
import { logEvent } from "../lib/track"

const ease = "cubic-bezier(0.16, 1, 0.3, 1)"

/**
 * "Claim your X XP" card on the session-complete screen (PUN-100). The
 * value-peak signup moment — the session is already over, so this never
 * interrupts play. HARD CONSTRAINT: this sits BESIDE "Play again", never
 * instead of it; skipping it costs nothing and anon play continues unlimited.
 * Signed-out + banked-XP only.
 */
export function SessionClaimCta() {
  return (
    <Show when="signed-out">
      <SessionClaimCtaInner />
    </Show>
  )
}

function SessionClaimCtaInner() {
  const { t } = useTranslation()
  const [xp, setXp] = useState(0)
  const [rank, setRank] = useState<number | null>(null)
  const shownRef = useRef(false)

  useEffect(() => {
    let active = true
    getAnonStandingFn()
      .then((r) => {
        if (!active) return
        setXp(r.claimed ? 0 : r.total)
        setRank(r.claimed ? null : r.weeklyRank)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (xp > 0 && !shownRef.current) {
      shownRef.current = true
      logEvent("signup_prompt_shown", { source: "session_complete", xp, rank })
    }
  }, [xp, rank])

  if (xp <= 0) return null

  // Rank is the hero; XP-banked copy is the fallback before a weekly board exists.
  const headline =
    rank !== null
      ? t("session.claim.rankHeadline", { rank })
      : t("session.claim.headline", { xp })
  const sub = rank !== null ? t("session.claim.rankSub") : t("session.claim.sub")
  const cta = rank !== null ? t("session.claim.rankCta") : t("session.claim.cta")

  return (
    <div
      className={cn(
        "mx-auto mb-6 flex w-full max-w-sm flex-col items-center gap-3 rounded-3xl p-5 text-center",
        "border border-primary/40 bg-card/50 backdrop-blur-[2px]"
      )}
      style={{
        animation: `pq-pop-in 0.5s ${ease} both`,
        boxShadow:
          "0 0 50px color-mix(in oklch, var(--primary), transparent 82%)",
      }}
    >
      <p className="text-lg leading-tight font-extrabold tracking-tight text-balance">
        {headline}
      </p>
      <p className="text-sm text-balance text-muted-foreground">{sub}</p>
      <SignInButton mode="modal">
        <button
          type="button"
          onClick={() =>
            logEvent("signup_prompt_clicked", {
              source: "session_complete",
              xp,
              rank,
            })
          }
          className={cn(
            "cta-glow inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-7 text-base font-bold",
            "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          {cta}
          <span aria-hidden="true">→</span>
        </button>
      </SignInButton>
    </div>
  )
}
