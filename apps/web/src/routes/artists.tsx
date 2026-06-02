import { createFileRoute, Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { AppHeader } from "../components/app-header"
import { getSeoArtistsFn, type SeoArtist } from "../lib/artist"
import { seo } from "../lib/seo"

/**
 * Crawlable artist hub (PUN-78). Indexable index page linking to every
 * /artist/$slug — gives crawlers (and users) a reachable path to the catalog.
 */
export const Route = createFileRoute("/artists")({
  component: ArtistsHub,
  loader: async () => getSeoArtistsFn(),
  head: () =>
    seo({
      title: "Alle Artists",
      description: "Alle Künstler im punchlinequiz — spiel das Punchline-Quiz für jeden Artist im deutschen Rap.",
      path: "/artists",
    }),
})

const ease = "cubic-bezier(0.16, 1, 0.3, 1)"

function ArtistsHub() {
  const { t } = useTranslation()
  const artists = Route.useLoaderData() as SeoArtist[]

  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden">
      <AppHeader />
      <div className="pq-spotlight pointer-events-none absolute inset-0" aria-hidden="true" />

      <main className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 pt-20 pb-12 md:px-8">
        <header className="flex flex-col items-center gap-2 text-center" style={{ animation: `pq-fade-up 0.5s ${ease} both` }}>
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary/80">{t("artistsHub.eyebrow")}</span>
          <h1 className="text-3xl font-extrabold tracking-tight">{t("artistsHub.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("artistsHub.subtitle", { count: artists.length })}</p>
        </header>

        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" style={{ animation: `pq-fade-up 0.5s ${ease} 0.08s both` }}>
          {artists.map((a) => (
            <li key={a.slug}>
              <Link
                to="/artist/$slug"
                params={{ slug: a.slug }}
                className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/30 px-3 py-2.5 transition-colors hover:border-primary/40"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-muted/60">
                  {a.imageUrl ? (
                    <img src={a.imageUrl} alt="" aria-hidden="true" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-sm font-bold text-foreground/70">{a.name.slice(0, 1)}</span>
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-foreground/90">{a.name}</span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                  {t("artistsHub.barsShort", { count: a.barCount })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}
