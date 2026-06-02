import { useTranslation } from "react-i18next"

import { cn } from "@workspace/ui/lib/utils"

import { DISCORD_INVITE_URL } from "../lib/links"
import { logEvent } from "../lib/track"

const ease = "cubic-bezier(0.16, 1, 0.3, 1)"

/** Discord wordmark glyph. Inherits color (gold) — one accent, per brand. */
function DiscordGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={cn("pq-discord-glyph", className)}
    >
      <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.249a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.036A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  )
}

/**
 * Prominent community CTA for high-intent moments (post-game). Matches the
 * DailyBanner idiom — gold, rounded-3xl, hover-intensify — with a playful glyph
 * wiggle on hover and a subtle scale-on-press. `delay` staggers the entrance.
 */
export function DiscordJoinCard({
  placement,
  delay = 0,
  className,
}: {
  placement: string
  delay?: number
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <a
      href={DISCORD_INVITE_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => logEvent("discord_click", { placement })}
      aria-label={t("community.joinTitle")}
      className={cn(
        "pq-discord-card cta-glow group relative flex items-center gap-4 overflow-hidden rounded-3xl",
        "border border-primary/40 bg-primary/10 p-4",
        "transition-[border-color,background-color,transform] duration-200 ease-out",
        "hover:border-primary hover:bg-primary/15",
        "active:scale-[0.985]",
        "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
        className
      )}
      style={{ animation: `pq-fade-up 0.55s ${ease} ${delay}s both` }}
    >
      <span
        aria-hidden="true"
        className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary"
      >
        <DiscordGlyph className="size-6" />
      </span>
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] font-bold tracking-[0.18em] text-primary/80 uppercase">
          {t("community.eyebrow")}
        </span>
        <h2 className="text-base leading-tight font-extrabold tracking-tight">
          {t("community.joinTitle")}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t("community.joinSubtitle")}
        </p>
      </div>
      <span
        aria-hidden="true"
        className="ml-auto self-center text-xl text-primary transition-transform duration-200 motion-safe:group-hover:translate-x-0.5"
      >
        →
      </span>
    </a>
  )
}

/** Compact inline link for footers / nav rows. Matches sibling footer links. */
export function DiscordFooterLink({ placement }: { placement: string }) {
  const { t } = useTranslation()
  return (
    <a
      href={DISCORD_INVITE_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => logEvent("discord_click", { placement })}
      className="pq-discord-card inline-flex items-center gap-1.5 transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-none"
    >
      <DiscordGlyph className="size-3.5" />
      {t("community.footerLink")}
    </a>
  )
}
