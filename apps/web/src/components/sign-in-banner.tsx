import { Show, SignInButton } from "@clerk/tanstack-react-start"
import { useTranslation } from "react-i18next"

import { cn } from "@workspace/ui/lib/utils"

const ease = "cubic-bezier(0.16, 1, 0.3, 1)"

/**
 * Conversion-optimized home banner shown only to signed-out users. Gold-on-
 * charcoal, full-width, sits above the mode cards. Uses Clerk's <Show> so it
 * disappears the instant the user signs in (no flash, no roundtrip).
 */
export function SignInBanner() {
  const { t } = useTranslation()
  return (
    <Show when="signed-out">
      <SignInButton mode="modal">
        <button
          type="button"
          className={cn(
            "group relative flex w-full items-center justify-between gap-3 overflow-hidden rounded-3xl",
            "border border-primary/40 px-5 py-4 text-left",
            "transition-[border-color,transform] duration-200 active:scale-[0.99]",
            "hover:border-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
          )}
          style={{
            animation: `pq-fade-up 0.55s ${ease} 0.05s both`,
            background:
              "radial-gradient(ellipse 110% 140% at 0% 0%, color-mix(in oklch, var(--primary), transparent 80%) 0%, transparent 60%), linear-gradient(180deg, color-mix(in oklch, var(--primary), transparent 92%) 0%, transparent 100%)",
          }}
        >
          {/* shimmer accent — appears once on mount, never on hover */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2"
            style={{
              background:
                "linear-gradient(90deg, transparent, color-mix(in oklch, var(--primary), transparent 70%), transparent)",
              animation: `pq-banner-sheen 1.6s ${ease} 0.35s both`,
            }}
          />

          <div className="flex min-w-0 flex-1 items-center gap-4">
            {/* Gold chains art. mix-blend-mode: screen treats the source's
                pure-black background as transparent so only the gold survives.
                Radial mask softens any residual edge so it melts into the
                banner gradient. */}
            <img
              src="/banner-chains.png"
              alt=""
              aria-hidden="true"
              width={64}
              height={64}
              className="h-12 w-12 shrink-0 select-none sm:h-16 sm:w-16"
              style={{
                mixBlendMode: "screen",
                WebkitMaskImage:
                  "radial-gradient(circle at center, black 55%, transparent 90%)",
                maskImage:
                  "radial-gradient(circle at center, black 55%, transparent 90%)",
                filter: "drop-shadow(0 0 18px color-mix(in oklch, var(--primary), transparent 55%))",
              }}
            />
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-primary">
                {t("home.signInBanner.eyebrow")}
              </span>
              <span className="text-base font-extrabold leading-tight tracking-tight text-foreground sm:text-lg">
                {t("home.signInBanner.headline")}
              </span>
              <span className="text-[11px] text-muted-foreground sm:text-xs">
                {t("home.signInBanner.sub")}
              </span>
            </div>
          </div>

          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 py-2",
              "text-xs font-bold tracking-tight text-primary-foreground",
              "transition-transform duration-200 group-hover:translate-x-0.5",
            )}
          >
            {t("home.signInBanner.cta")}
            <span aria-hidden="true">→</span>
          </span>
        </button>
      </SignInButton>
    </Show>
  )
}

