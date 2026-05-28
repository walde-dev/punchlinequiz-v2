import { ClerkProvider } from "@clerk/tanstack-react-start"
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router"
import { Suspense, useEffect } from "react"
import { I18nextProvider, useTranslation } from "react-i18next"

import i18n from "../i18n"
import appCss from "@workspace/ui/globals.css?url"

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!CLERK_PUBLISHABLE_KEY) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY")
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "punchlinequiz" },
      { name: "description", content: "punchlinequiz — German hip-hop bars quiz." },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  notFoundComponent: () => <NotFound />,
  shellComponent: RootDocument,
})

/** Keeps <html lang="…"> in sync with the active i18n language client-side. */
function LangSync() {
  const { i18n } = useTranslation()
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
  return (
    <html lang="de" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-svh bg-background text-foreground antialiased">
        <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} afterSignOutUrl="/">
          <I18nextProvider i18n={i18n}>
            <LangSync />
            <Suspense fallback={<div className="min-h-svh bg-background" />}>
              {children}
            </Suspense>
          </I18nextProvider>
        </ClerkProvider>
        <Scripts />
      </body>
    </html>
  )
}
