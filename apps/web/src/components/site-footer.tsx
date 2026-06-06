import { Link, useRouterState } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { LEGAL } from "../lib/legal"

/** Route prefixes where the legal footer would intrude on an immersive,
 *  full-height flow (the game, the daily, challenge/quiz play) or on a surface
 *  that ships its own footer (the home page) / is internal (admin). On these the
 *  Impressum stays reachable in ≤2 clicks via the logo → home → footer, which
 *  satisfies the German "permanently available" requirement. */
const HIDE_ON = ["/play", "/daily", "/finishing", "/quiz", "/c", "/admin"]

/**
 * Slim, site-wide legal footer. Carries the mandatory Impressum + Datenschutz
 * links plus the Nutzungsbedingungen, so they're reachable from every content
 * page. Rendered once in __root; self-hides on immersive/own-footer routes.
 */
export function SiteFooter() {
  const { t } = useTranslation()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  if (pathname === "/" || HIDE_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null
  }

  return (
    <footer className="relative border-t border-border/40 px-5 py-8 md:px-8">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-semibold text-muted-foreground/70">
          <Link to="/impressum" className="transition-colors hover:text-primary">
            {t("nav.imprint")}
          </Link>
          <Link to="/datenschutz" className="transition-colors hover:text-primary">
            {t("nav.privacy")}
          </Link>
          <Link to="/nutzungsbedingungen" className="transition-colors hover:text-primary">
            {t("nav.terms")}
          </Link>
          <a href={LEGAL.emailHref} className="transition-colors hover:text-primary">
            {t("nav.contact")}
          </a>
        </nav>
        <p className="text-xs text-muted-foreground/40">
          © {LEGAL.companyName}. {t("legal.rights")}
        </p>
      </div>
    </footer>
  )
}
