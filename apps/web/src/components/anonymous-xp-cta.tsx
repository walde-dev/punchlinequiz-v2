import { SignUpButton } from "@clerk/tanstack-react-start"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Anonymous-user CTA shown after a correct guess. Sits in the same slot as
 * <XpGain> so the layout doesn't shift. Auto-dismisses after ~2.6s.
 *
 * Throttled: once dismissed in a session, never shown again on this trigger
 * key. Caller bumps `triggerKey` per correct answer; we track which keys
 * have been seen via sessionStorage so it doesn't spam on every right guess.
 * Strategy: show on the 1st correct, 4th, 10th — diminishing-returns cadence.
 */
const STORAGE_KEY = "pq_anon_cta_count"
const SHOW_AT = [1, 4, 10]

export function AnonymousXpCta({ triggerKey }: { triggerKey: number }) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!triggerKey) return
    if (typeof window === "undefined") return
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    const count = raw ? Number(raw) || 0 : 0
    const next = count + 1
    window.sessionStorage.setItem(STORAGE_KEY, String(next))
    if (!SHOW_AT.includes(next)) return
    setVisible(true)
    const id = window.setTimeout(() => setVisible(false), 2800)
    return () => window.clearTimeout(id)
  }, [triggerKey])

  if (!visible) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center"
    >
      <SignUpButton mode="modal">
        <button
          type="button"
          className={cn(
            "pointer-events-auto group mt-2 inline-flex items-center gap-2.5",
            "rounded-full px-4 py-1.5",
            "bg-[#1a1a1a]/95 ring-1 ring-primary/45 backdrop-blur-md",
            "shadow-[0_0_30px_-6px_color-mix(in_oklch,var(--primary),transparent_45%)]",
            "active:scale-[0.97] transition-transform duration-150",
          )}
          style={{ animation: "pq-xp-float 2.8s cubic-bezier(0.16, 1, 0.3, 1) both" }}
        >
          <span aria-hidden="true" className="text-base">✨</span>
          <span className="flex flex-col items-start leading-tight">
            <span className="text-xs font-extrabold tracking-tight text-foreground">
              {t("xp.anonCta.headline")}
            </span>
            <span className="text-[10px] font-semibold tracking-tight text-muted-foreground">
              {t("xp.anonCta.sub")}
            </span>
          </span>
          <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
            {t("xp.anonCta.cta")}
            <span aria-hidden="true">→</span>
          </span>
        </button>
      </SignUpButton>
    </div>
  )
}
