import { ClerkProvider } from "@clerk/tanstack-react-start"
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router"
import { Suspense, useEffect } from "react"
import { I18nextProvider, useTranslation } from "react-i18next"

import appCss from "@workspace/ui/globals.css?url"
import { figtreeLatinWoff2 } from "@workspace/ui/lib/fonts"
import i18n, { LANG_STORAGE_KEY } from "../i18n"
import { OnboardingGate } from "../components/onboarding-gate"
import { AnalyticsIdentity } from "../components/analytics-identity"
import { SiteFooter } from "../components/site-footer"
import { getBootstrapFlagsFn } from "../lib/flags"
import { DEFAULT_DESCRIPTION, OG_DEFAULT_SUBTITLE, SITE_NAME, ogImageUrl } from "../lib/seo"
import type { BootstrapFlags } from "../lib/flags"

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!CLERK_PUBLISHABLE_KEY) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY")
}

export const Route = createRootRoute({
  // Server-evaluate feature flags once per session for PostHog SSR bootstrap
  // (PUN-44, no flag flicker). staleTime Infinity → runs during SSR, reused for
  // the session so client navigations don't refetch. No-op until POSTHOG_KEY set.
  loader: async (): Promise<{ phFlags: BootstrapFlags }> => ({
    phFlags: await getBootstrapFlagsFn(),
  }),
  staleTime: Number.POSITIVE_INFINITY,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: SITE_NAME },
      { name: "description", content: DEFAULT_DESCRIPTION },
      { name: "theme-color", content: "#121212" },
      // Default OG/Twitter — child routes override per-page via lib/seo.ts seo()
      // (TanStack dedupes meta by name/property, deepest route wins).
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:type", content: "website" },
      { property: "og:title", content: SITE_NAME },
      { property: "og:description", content: DEFAULT_DESCRIPTION },
      { property: "og:image", content: ogImageUrl({ title: SITE_NAME, subtitle: OG_DEFAULT_SUBTITLE }) },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: SITE_NAME },
      { name: "twitter:description", content: DEFAULT_DESCRIPTION },
      { name: "twitter:image", content: ogImageUrl({ title: SITE_NAME, subtitle: OG_DEFAULT_SUBTITLE }) },
    ],
    links: [
      // Preload the latin Figtree woff2 so the hero text paints in-brand sooner
      // (PUN-112). crossOrigin is required even same-origin — fonts fetch in CORS
      // mode, so the preload must match or it's a wasted double-fetch.
      { rel: "preload", as: "font", type: "font/woff2", href: figtreeLatinWoff2, crossOrigin: "anonymous" },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", type: "image/png", href: "/icon-32.png", sizes: "32x32" },
      { rel: "icon", type: "image/png", href: "/icon-16.png", sizes: "16x16" },
      { rel: "apple-touch-icon", href: "/icon-180.png" },
      { rel: "manifest", href: "/manifest.json" },
    ],
  }),
  notFoundComponent: () => <NotFound />,
  errorComponent: ErrorPage,
  shellComponent: RootDocument,
})

/** Route-level error boundary: reports to Sentry, then shows a slick fallback. */
function ErrorPage({ error }: { error: Error }) {
  const { t } = useTranslation()
  useEffect(() => {
    // Client-only Sentry capture; SSR-guarded so the server bundle stays free
    // of @sentry (see sentry.client.ts for why).
    if (!import.meta.env.SSR) {
      void import("@sentry/tanstackstart-react").then((Sentry) => Sentry.captureException(error))
    }
  }, [error])
  return (
    <main className="container mx-auto p-4 pt-16">
      <h1>{t("common.errorTitle")}</h1>
      <p>{t("common.errorBody")}</p>
    </main>
  )
}

/** Keeps <html lang="…"> in sync with the active i18n language, and applies the
 *  visitor's stored/detected language preference *after* hydration. i18n inits
 *  pinned to "de" so SSR and the first client render match (no #418); here we
 *  switch to the localStorage choice or browser language once mounted. */
function LangSync() {
  const { i18n } = useTranslation()
  // One-time post-hydration: honour the persisted toggle choice, else the
  // browser language. Done here (not at init) so SSR + first client render both
  // stay "de" and don't trip a hydration mismatch.
  useEffect(() => {
    let stored: string | null = null
    try {
      stored = localStorage.getItem(LANG_STORAGE_KEY)
    } catch {
      // localStorage blocked (private mode / cookies off) — fall back to nav.
    }
    const fromNav = navigator.language.toLowerCase().startsWith("en") ? "en" : "de"
    const next = stored === "en" || stored === "de" ? stored : fromNav
    if (next !== i18n.language) void i18n.changeLanguage(next)
  }, [])
  useEffect(() => {
    document.documentElement.lang = i18n.language.startsWith("de") ? "de" : "en"
  }, [i18n.language])
  return null
}

function NotFound() {
  const { t } = useTranslation()
  return (
    <main className="container mx-auto p-4 pt-16">
      <h1>404</h1>
      <p>{t("common.notFound")}</p>
    </main>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const { phFlags } = Route.useLoaderData()
  return (
    <html lang="de" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-svh bg-background text-foreground antialiased">
        {/* PostHog flag bootstrap (PUN-44): set before hydration so posthog-js
            init reads the server-evaluated variants — no flicker. */}
        <PostHogBootstrap flags={phFlags} />
        <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} afterSignOutUrl="/">
          <I18nextProvider i18n={i18n}>
            <LangSync />
            <Suspense fallback={<div className="min-h-svh bg-background" />}>
              {children}
            </Suspense>
            {/* Site-wide legal footer (Impressum/Datenschutz/Terms). Self-hides
                on immersive game routes and the home page (which ships its own). */}
            <SiteFooter />
            <OnboardingGate />
            <AnalyticsIdentity />
          </I18nextProvider>
        </ClerkProvider>
        <Scripts />
      </body>
    </html>
  )
}

/** Inline script that publishes server-evaluated feature flags to the client
 *  before posthog-js initialises. JSON is escaped to prevent </script> breakout. */
function PostHogBootstrap({ flags }: { flags: BootstrapFlags }) {
  if (Object.keys(flags).length === 0) return null
  const json = JSON.stringify({ featureFlags: flags }).replace(/</g, "\\u003c")
  return <script dangerouslySetInnerHTML={{ __html: `window.__PH_BOOTSTRAP__=${json}` }} />
}
