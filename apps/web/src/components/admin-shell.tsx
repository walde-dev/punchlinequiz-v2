import { Link, useRouterState } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { cn } from "@workspace/ui/lib/utils"
import type { ReactNode } from "react"

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

type Leaf = { to: AdminPath; labelKey: string; glyph: string }
type Group = {
  labelKey: string
  glyph: string
  /** Prefix that marks the group (and its parent row) active. */
  match: string
  children: Array<{ to: AdminPath; labelKey: string }>
}
type NavEntry = Leaf | Group

const isGroup = (e: NavEntry): e is Group => "children" in e

const NAV: Array<NavEntry> = [
  { to: "/admin", labelKey: "admin.nav.bars", glyph: "♪" },
  { to: "/admin/review", labelKey: "admin.nav.review", glyph: "✓" },
  { to: "/admin/submissions", labelKey: "admin.nav.submissions", glyph: "✎" },
  { to: "/admin/daily", labelKey: "admin.nav.daily", glyph: "★" },
  {
    labelKey: "admin.nav.analytics",
    glyph: "▮",
    match: "/admin/analytics",
    children: [
      { to: "/admin/analytics", labelKey: "admin.nav.conversion" },
      { to: "/admin/analytics/lines", labelKey: "admin.nav.lines" },
    ],
  },
  { to: "/admin/activity", labelKey: "admin.nav.activity", glyph: "↻" },
  { to: "/admin/onboarding", labelKey: "admin.nav.onboarding", glyph: "✸" },
  { to: "/admin/xp", labelKey: "admin.nav.xp", glyph: "✦" },
  { to: "/admin/levels", labelKey: "admin.nav.levels", glyph: "▲" },
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

function NavLink({
  to,
  label,
  glyph,
  active,
  indented,
}: {
  to: AdminPath
  label: string
  glyph?: string
  active: boolean
  indented?: boolean
}) {
  return (
    <Link
      to={to}
      className={cn(
        "group flex flex-1 items-center gap-2.5 rounded-full px-3 py-2 text-sm font-semibold tracking-tight transition-colors md:flex-none md:py-2.5",
        indented && "md:ml-3 md:pl-3",
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
      )}
    >
      {glyph !== undefined ? (
        <span
          className={cn(
            "inline-flex h-5 w-5 items-center justify-center text-xs",
            active ? "text-primary" : "text-muted-foreground/70 group-hover:text-foreground"
          )}
          aria-hidden="true"
        >
          {glyph}
        </span>
      ) : (
        <span
          className={cn(
            "hidden h-1.5 w-1.5 shrink-0 rounded-full md:inline-block",
            active ? "bg-primary" : "bg-muted-foreground/40"
          )}
          aria-hidden="true"
        />
      )}
      <span>{label}</span>
    </Link>
  )
}

function Sidebar() {
  const { t } = useTranslation()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <aside
      className={cn(
        "relative z-40 flex shrink-0 flex-col gap-1 border-b border-white/5 bg-[#181818] px-3 py-4",
        "md:sticky md:top-0 md:h-svh md:w-60 md:border-r md:border-b-0 md:px-4 md:py-6"
      )}
    >
      <Link to="/admin" className="mb-2 flex items-center gap-2 px-2 md:mb-6">
        <span className="text-base font-extrabold tracking-tight select-none md:text-lg">
          <span className="text-foreground">punchline</span>
          <span className="text-primary">/quiz</span>
        </span>
        <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-bold tracking-[0.16em] text-primary uppercase">
          {t("admin.badge")}
        </span>
      </Link>

      <nav className="flex flex-row gap-1 md:flex-col">
        {NAV.map((entry) => {
          if (!isGroup(entry)) {
            return (
              <NavLink
                key={entry.to}
                to={entry.to}
                label={t(entry.labelKey)}
                glyph={entry.glyph}
                active={pathname === entry.to}
              />
            )
          }
          const sectionActive = pathname.startsWith(entry.match)
          return (
            <div key={entry.labelKey} className="flex flex-row gap-1 md:flex-col">
              {/* Group label — desktop only; on mobile the children read as inline pills. */}
              <span
                className={cn(
                  "hidden items-center gap-2.5 px-3 pt-2 pb-0.5 text-[11px] font-bold tracking-tight uppercase md:flex",
                  sectionActive ? "text-primary/80" : "text-muted-foreground/60"
                )}
              >
                <span className="inline-flex h-5 w-5 items-center justify-center text-xs" aria-hidden="true">
                  {entry.glyph}
                </span>
                {t(entry.labelKey)}
              </span>
              {entry.children.map((c) => (
                <NavLink
                  key={c.to}
                  to={c.to}
                  label={t(c.labelKey)}
                  active={pathname === c.to}
                  indented
                />
              ))}
            </div>
          )
        })}
      </nav>

      <div className="mt-auto hidden md:flex md:flex-col md:gap-2 md:pt-6">
        <Link
          to="/play"
          className="rounded-full px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
        >
          {t("admin.common.playLink")}
        </Link>
      </div>
    </aside>
  )
}
