import { Link, createFileRoute } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"

import { AppHeader } from "../components/app-header"
import { getArtistPageFn } from "../lib/artist"
import { QUIZ_MIN_BARS } from "../lib/quiz"
import {
  breadcrumbJsonLd,
  jsonLd,
  musicGroupJsonLd,
  noindexSeo,
  ogImageUrl,
  seo,
} from "../lib/seo"
import type { ArtistPage } from "../lib/artist"

/**
 * Crawlable artist catalog page (PUN-78). No lyric text — artist metadata,
 * counts, tags, related artists, and a play CTA. MusicGroup + BreadcrumbList
 * JSON-LD + per-page canonical/OG (artist photo). 404 for unknown/empty artists.
 */
export const Route = createFileRoute("/artist/$slug")({
  component: ArtistPageView,
  loader: async ({ params }) =>
    getArtistPageFn({ data: { slug: params.slug } }),
  head: ({ loaderData }) => {
    const a = loaderData as ArtistPage | null
    if (!a) return noindexSeo()
    const genre = a.tags.map((t) => t.label)
    const description = `Spiele das ${a.name} Punchline-Quiz — ${a.barCount} Bars. Errate den Künstler hinter der Line und beweis dein Rap-Wissen.`
    return {
      ...seo({
        title: `${a.name} Punchline-Quiz`,
        description,
        path: `/artist/${a.slug}`,
        // Branded 1200×630 card with the artist photo embedded (not the raw 1:1
        // photo, which is wrong-ratio + heavy for share unfurls).
        image: ogImageUrl({
          title: `${a.name} Punchline-Quiz`,
          subtitle: `${a.barCount} Bars · jetzt spielen`,
          image: a.imageUrl,
        }),
        type: "music.musician",
      }),
      scripts: [
        jsonLd(
          musicGroupJsonLd({
            name: a.name,
            slug: a.slug,
            image: a.imageUrl,
            genre,
          })
        ),
        jsonLd(
          breadcrumbJsonLd([
            { name: "punchlinequiz", path: "/" },
            { name: "Artists", path: "/artists" },
            { name: a.name, path: `/artist/${a.slug}` },
          ])
        ),
      ],
    }
  },
})

const ease = "cubic-bezier(0.16, 1, 0.3, 1)"

function ArtistPageView() {
  const { t } = useTranslation()
  const a = Route.useLoaderData()

  if (!a) {
    return (
      <div className="relative flex min-h-svh flex-col overflow-hidden">
        <AppHeader />
        <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
          <h1 className="text-2xl font-extrabold tracking-tight">
            {t("artistPage.notFoundTitle")}
          </h1>
          <Link
            to="/artists"
            className="text-sm font-bold text-primary hover:underline"
          >
            {t("artistPage.allArtists")}
          </Link>
        </main>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden">
      <AppHeader />
      <div
        className="pq-spotlight pointer-events-none absolute inset-0"
        aria-hidden="true"
      />

      <main className="relative mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-6 px-6 pt-20 pb-12 text-center">
        <div
          className="relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-primary/60 bg-card"
          style={{ animation: `pq-fade-up 0.5s ${ease} both` }}
        >
          {a.imageUrl ? (
            <img
              src={a.imageUrl}
              alt={a.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-3xl font-extrabold text-primary">
              {a.name.slice(0, 1)}
            </span>
          )}
        </div>

        <div className="flex flex-col items-center gap-2">
          <h1 className="text-3xl font-extrabold tracking-tight text-balance">
            {t("artistPage.title", { name: a.name })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("artistPage.barsCount", { count: a.barCount })}
          </p>
        </div>

        {a.tags.length > 0 && (
          <ul className="flex flex-wrap justify-center gap-2">
            {a.tags.map((tag) => (
              <li
                key={tag.slug}
                className="rounded-full border border-border/50 bg-card/40 px-3 py-1 text-[11px] font-bold tracking-wide text-muted-foreground uppercase"
              >
                {tag.label}
              </li>
            ))}
          </ul>
        )}

        <Button
          size="lg"
          className="cta-glow min-h-12 w-full max-w-xs text-base font-bold"
          render={
            // Qualifying artists (≥15 bars) get the named /quiz landing (PUN-108);
            // smaller catalogs keep the classic artist-filtered /play.
            a.barCount >= QUIZ_MIN_BARS ? (
              <Link to="/quiz/$slug" params={{ slug: a.slug }} />
            ) : (
              <Link to="/play" search={{ artist: a.slug }} />
            )
          }
        >
          {t("artistPage.playCta", { name: a.name })}
        </Button>

        {a.related.length > 0 && (
          <section className="flex w-full flex-col gap-3 pt-4">
            <h2 className="text-[10px] font-bold tracking-[0.18em] text-primary/80 uppercase">
              {t("artistPage.relatedTitle")}
            </h2>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {a.related.map((r) => (
                <li key={r.slug}>
                  <Link
                    to="/artist/$slug"
                    params={{ slug: r.slug }}
                    className="flex items-center gap-2 rounded-xl border border-border/40 bg-card/30 px-3 py-2 text-left transition-colors hover:border-primary/40"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-muted/60">
                      {r.imageUrl ? (
                        <img
                          src={r.imageUrl}
                          alt=""
                          aria-hidden="true"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-xs font-bold text-foreground/70">
                          {r.name.slice(0, 1)}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 truncate text-sm font-semibold text-foreground/90">
                      {r.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  )
}
