import { Link, useRouterState } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { cn } from "@workspace/ui/lib/utils"
import type { ReactNode, SVGProps } from "react"

type AdminPath =
  | "/admin"
  | "/admin/review"
  | "/admin/submissions"
  | "/admin/daily"
  | "/admin/xp"
  | "/admin/levels"
  | "/admin/analytics"
  | "/admin/analytics/lines"
  | "/admin/activity"
  | "/admin/onboarding"

type IconName =
  | "bars"
  | "daily"
  | "review"
  | "submissions"
  | "conversion"
  | "lines"
  | "activity"
  | "onboarding"
  | "xp"
  | "levels"
  | "play"

type NavItem = { to: AdminPath; labelKey: string; icon: IconName }
type NavSection = { labelKey: string; items: Array<NavItem> }

/**
 * Grouped, SaaS-style information architecture (Stripe/Linear/Clerk): a few
 * labelled sections instead of one flat list. "Analytics" groups the Conversion
 * dashboard, per-line analytics and the activity log.
 */
const SECTIONS: Array<NavSection> = [
  {
    labelKey: "admin.nav.sections.content",
    items: [
      { to: "/admin", labelKey: "admin.nav.bars", icon: "bars" },
      { to: "/admin/daily", labelKey: "admin.nav.daily", icon: "daily" },
      { to: "/admin/review", labelKey: "admin.nav.review", icon: "review" },
      { to: "/admin/submissions", labelKey: "admin.nav.submissions", icon: "submissions" },
    ],
  },
  {
    labelKey: "admin.nav.sections.analytics",
    items: [
      { to: "/admin/analytics", labelKey: "admin.nav.conversion", icon: "conversion" },
      { to: "/admin/analytics/lines", labelKey: "admin.nav.lines", icon: "lines" },
      { to: "/admin/activity", labelKey: "admin.nav.activity", icon: "activity" },
    ],
  },
  {
    labelKey: "admin.nav.sections.config",
    items: [
      { to: "/admin/onboarding", labelKey: "admin.nav.onboarding", icon: "onboarding" },
      { to: "/admin/xp", labelKey: "admin.nav.xp", icon: "xp" },
      { to: "/admin/levels", labelKey: "admin.nav.levels", icon: "levels" },
    ],
  },
]

export function AdminShell({
  children,
  topRight,
}: {
  children: ReactNode
  /** Optional content rendered top-right of the main pane (page-specific actions, stats, etc.). */
  topRight?: ReactNode
}) {
  return (
    <div className="relative min-h-svh md:flex">
      <div
        className="pq-spotlight pointer-events-none absolute inset-0"
        aria-hidden="true"
      />
      <Sidebar />
      <div className="relative flex min-w-0 flex-1 flex-col">
        {topRight && (
          <div className="sticky top-0 z-30 flex items-center justify-end gap-3 px-5 py-3 pr-20 backdrop-blur-sm md:pr-20">
            {topRight}
          </div>
        )}
        <main className="relative flex flex-1 flex-col px-5 py-8 md:px-10 md:py-10">
          {children}
        </main>
      </div>
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar() {
  const { t } = useTranslation()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <aside
      className={cn(
        "relative z-40 flex shrink-0 flex-col border-b border-white/[0.06] bg-[#161616]",
        "px-2.5 py-3 md:sticky md:top-0 md:h-svh md:w-[244px] md:border-r md:border-b-0 md:px-3 md:py-4"
      )}
    >
      {/* Brand / workspace */}
      <Link
        to="/admin"
        className="mb-1 flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors duration-150 hover:bg-white/[0.04] md:mb-3"
      >
        <span className="text-sm font-extrabold tracking-tight select-none">
          <span className="text-foreground">punchline</span>
          <span className="text-primary">/quiz</span>
        </span>
        <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold tracking-[0.14em] text-primary/90 uppercase">
          {t("admin.badge")}
        </span>
      </Link>

      {/* Nav: horizontal scroller on mobile, sectioned column on desktop */}
      <nav className="flex flex-row gap-1 overflow-x-auto md:flex-1 md:flex-col md:gap-0 md:overflow-visible">
        {SECTIONS.map((section) => (
          <div
            key={section.labelKey}
            className="flex flex-row gap-1 md:mt-3 md:flex-col md:gap-0.5 md:first:mt-0"
          >
            <span className="hidden px-2 pt-1 pb-1.5 text-[10px] font-semibold tracking-[0.08em] text-muted-foreground/45 uppercase md:block">
              {t(section.labelKey)}
            </span>
            {section.items.map((item) => (
              <NavRow
                key={item.to}
                to={item.to}
                label={t(item.labelKey)}
                icon={item.icon}
                active={pathname === item.to}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* Footer: back to the live app */}
      <div className="mt-auto hidden border-t border-white/[0.06] pt-2 md:block">
        <NavRow to="/play" label={t("admin.nav.openApp")} icon="play" active={false} />
      </div>
    </aside>
  )
}

function NavRow({
  to,
  label,
  icon,
  active,
}: {
  to: AdminPath | "/play"
  label: string
  icon: IconName
  active: boolean
}) {
  return (
    <Link
      to={to}
      // Curated transition set (not `all`), strong ease-out, <160ms. Press gives
      // tactile scale feedback; motion is disabled for reduced-motion users.
      className={cn(
        "group relative flex shrink-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-medium",
        "transition duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
        "active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
        active
          ? "bg-white/[0.055] text-foreground"
          : "text-muted-foreground/85 hover:bg-white/[0.035] hover:text-foreground"
      )}
      aria-current={active ? "page" : undefined}
    >
      {/* Active accent — desktop only; a calm gold marker, the single accent. */}
      <span
        className={cn(
          "absolute top-1/2 left-0 hidden h-4 w-[2.5px] -translate-y-1/2 rounded-r-full bg-primary md:block",
          "transition-opacity duration-150",
          active ? "opacity-100" : "opacity-0"
        )}
        aria-hidden="true"
      />
      <NavIcon
        name={icon}
        className={cn(
          "size-[17px] shrink-0 transition-colors duration-150",
          active ? "text-primary" : "text-muted-foreground/60 group-hover:text-foreground/80"
        )}
      />
      <span className="truncate">{label}</span>
    </Link>
  )
}

// ─── Inline line-icon set (1.5px stroke, currentColor) ──────────────────────────

function NavIcon({ name, className }: { name: IconName; className?: string }) {
  const p: SVGProps<SVGSVGElement> = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  }
  return (
    <svg {...p} className={className} aria-hidden="true">
      {PATHS[name]}
    </svg>
  )
}

const PATHS: Record<IconName, ReactNode> = {
  bars: (
    <>
      <line x1="8" x2="21" y1="6" y2="6" />
      <line x1="8" x2="21" y1="12" y2="12" />
      <line x1="8" x2="21" y1="18" y2="18" />
      <line x1="3" x2="3.01" y1="6" y2="6" />
      <line x1="3" x2="3.01" y1="12" y2="12" />
      <line x1="3" x2="3.01" y1="18" y2="18" />
    </>
  ),
  daily: (
    <>
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 2v4" />
      <path d="M16 2v4" />
    </>
  ),
  review: (
    <>
      <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  submissions: (
    <>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </>
  ),
  conversion: (
    <>
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </>
  ),
  lines: (
    <>
      <line x1="18" x2="18" y1="20" y2="10" />
      <line x1="12" x2="12" y1="20" y2="4" />
      <line x1="6" x2="6" y1="20" y2="14" />
    </>
  ),
  activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  onboarding: (
    <>
      <path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z" />
      <path d="M20 3v4" />
      <path d="M22 5h-4" />
    </>
  ),
  xp: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  levels: (
    <>
      <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
      <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
      <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
    </>
  ),
  play: <polygon points="6 3 20 12 6 21 6 3" />,
}
