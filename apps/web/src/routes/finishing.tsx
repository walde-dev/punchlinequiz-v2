import { createFileRoute, Link } from "@tanstack/react-router"

import { ArtistGrid } from "../components/artist-grid"
import { listPlayableArtists } from "../lib/game"

export const Route = createFileRoute("/finishing")({
  component: FinishingPicker,
  loader: async () => {
    const artists = await listPlayableArtists({ data: { mode: "cloze" } })
    return { artists }
  },
})

const ease = "cubic-bezier(0.16, 1, 0.3, 1)"

function FinishingPicker() {
  const { artists } = Route.useLoaderData()

  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden">
      <header className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-6 h-14 border-b border-border/40 bg-background/95 md:bg-background/80 md:backdrop-blur-sm">
        <Link to="/" aria-label="Zurück zur Startseite" className="select-none">
          <span className="font-bold text-base tracking-tight">
            <span className="text-foreground">punchline</span>
            <span className="text-primary">/quiz</span>
          </span>
        </Link>
        <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
          / finishing lines
        </span>
      </header>

      <div className="pq-spotlight pointer-events-none absolute inset-0" aria-hidden="true" />

      <main className="relative flex flex-1 flex-col items-center px-5 pt-20 pb-10 md:px-8">
        <div className="flex w-full max-w-3xl flex-col gap-7">
          <div
            className="flex flex-col items-center gap-3 text-center md:items-start md:text-left"
            style={{ animation: `pq-fade-up 0.55s ${ease} both` }}
          >
            <h1
              className="font-extrabold leading-[1.1] tracking-tight"
              style={{ fontSize: "clamp(1.8rem, 5vw, 3rem)" }}
            >
              Welcher Artist?
            </h1>
            <p className="max-w-md text-sm text-muted-foreground sm:text-base">
              Random aus allen — oder pin' dich auf einen Artist fest.
            </p>
          </div>

          {artists.length === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-card/40 p-6 text-center text-sm text-muted-foreground">
              Noch keine Cloze-fertigen Bars. Schalte sie im Admin frei.
            </div>
          ) : (
            <ArtistGrid artists={artists} mode="cloze" />
          )}
        </div>
      </main>
    </div>
  )
}
