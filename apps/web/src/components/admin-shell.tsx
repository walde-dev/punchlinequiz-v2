import { Link, useRouterState } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { cn } from "@workspace/ui/lib/utils"

type NavItem = {
  to: "/admin" | "/admin/review" | "/admin/submissions" | "/admin/daily" | "/admin/xp" | "/admin/levels"
  labelKey: string
  glyph: string
}

const NAV: NavItem[] = [
  { to: "/admin", labelKey: "admin.nav.bars", glyph: "♪" },
  { to: "/admin/review", labelKey: "admin.nav.review", glyph: "✓" },
  { to: "/admin/submissions", labelKey: "admin.nav.submissions", glyph: "✎" },
  { to: "/admin/daily", labelKey: "admin.nav.daily", glyph: "★" },
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
      <div className="pq-spotlight pointer-events-none absolute inset-0" aria-hidden="true" />
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

function Sidebar() {
  const { t } = useTranslation()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <aside
      className={cn(
        "relative z-40 flex shrink-0 flex-col gap-1 border-b border-white/5 bg-[#181818] px-3 py-4",
        "md:sticky md:top-0 md:h-svh md:w-60 md:border-b-0 md:border-r md:px-4 md:py-6",
      )}
    >
      <Link
        to="/admin"
        className="mb-2 flex items-center gap-2 px-2 md:mb-6"
      >
        <span className="select-none text-base font-extrabold tracking-tight md:text-lg">
          <span className="text-foreground">punchline</span>
          <span className="text-primary">/quiz</span>
        </span>
        <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
          {t("admin.badge")}
        </span>
      </Link>

      <nav className="flex flex-row gap-1 md:flex-col">
        {NAV.map((item) => {
          const active = pathname === item.to
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "group flex flex-1 items-center gap-2.5 rounded-full px-3 py-2 text-sm font-semibold tracking-tight transition-colors md:flex-none md:py-2.5",
                active
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "inline-flex h-5 w-5 items-center justify-center text-xs",
                  active ? "text-primary" : "text-muted-foreground/70 group-hover:text-foreground",
                )}
                aria-hidden="true"
              >
                {item.glyph}
              </span>
              <span>{t(item.labelKey)}</span>
            </Link>
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
