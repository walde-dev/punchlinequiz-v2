import { Link } from "@tanstack/react-router"

import { cn } from "@workspace/ui/lib/utils"

import type { ArtistTile } from "../lib/game"

const ease = "cubic-bezier(0.16, 1, 0.3, 1)"

/**
 * 2/3-col responsive grid of artist tiles + a leading "Alle" random tile.
 *
 * `mode` controls the target route: "artist" → classic guess-the-artist
 * play; "cloze" → finishing-lines play. The "Alle" tile drops the artist
 * filter; per-artist tiles include `?artist=<slug>`.
 */
export function ArtistGrid({
  artists,
  mode,
}: {
  artists: ArtistTile[]
  mode: "artist" | "cloze"
}) {
  const total = artists.reduce((n, a) => n + a.punchlineCount, 0)
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4"
      style={{ animation: `pq-fade-up 0.6s ${ease} 0.15s both` }}
    >
      <AlleCard total={total} mode={mode} />
      {artists.map((a, i) => (
        <ArtistCard key={a.id} artist={a} index={i} mode={mode} />
      ))}
    </div>
  )
}

function searchFor(
  mode: "artist" | "cloze",
  artistSlug?: string,
): Record<string, string> {
  const s: Record<string, string> = {}
  if (mode === "cloze") s.mode = "cloze"
  if (artistSlug) s.artist = artistSlug
  return s
}

function AlleCard({ total, mode }: { total: number; mode: "artist" | "cloze" }) {
  return (
    <Link
      to="/play"
      search={searchFor(mode)}
      className={cn(
        "group relative flex aspect-square flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl",
        "border border-primary/40 bg-card/40 text-center transition-all",
        "hover:border-primary hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
      )}
      style={{
        background:
          "radial-gradient(ellipse 80% 70% at 30% 20%, color-mix(in oklch, var(--primary), transparent 70%) 0%, transparent 70%), linear-gradient(160deg, var(--card), var(--background))",
      }}
    >
      <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-primary/80">
        / alle artists
      </span>
      <span className="text-2xl font-extrabold tracking-tight">Random</span>
      <span className="text-xs text-muted-foreground tabular-nums">{total} Bars</span>
    </Link>
  )
}

function ArtistCard({
  artist,
  index,
  mode,
}: {
  artist: ArtistTile
  index: number
  mode: "artist" | "cloze"
}) {
  return (
    <Link
      to="/play"
      search={searchFor(mode, artist.slug)}
      className={cn(
        "group relative flex aspect-square flex-col justify-end overflow-hidden rounded-2xl",
        "border border-border/50 bg-card/40 transition-all",
        "hover:border-primary/60 hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
      )}
      style={{ animation: `pq-fade-up 0.5s ${ease} ${0.18 + index * 0.04}s both` }}
    >
      {artist.imageUrl ? (
        <img
          src={artist.imageUrl}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-card via-card to-background" />
      )}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(180deg, transparent 35%, rgba(0,0,0,0.78) 100%)",
        }}
        aria-hidden="true"
      />
      <div className="relative z-10 flex flex-col gap-0.5 p-3">
        <span className="text-base font-extrabold leading-tight tracking-tight text-white drop-shadow line-clamp-2">
          {artist.name}
        </span>
        <span className="text-[11px] font-medium text-white/70 tabular-nums">
          {artist.punchlineCount} Bars
        </span>
      </div>
    </Link>
  )
}
