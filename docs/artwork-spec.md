# Artwork: Artist + Song Cover Images

## Goal

Display artist portraits and song/album cover art across the app. Free, low-scale.

## Decisions

- **Provider:** Deezer Public API. Free, no auth, no per-key signup, covers artist portraits AND album/track art, no policy restrictions on quiz apps. (Spotify is explicitly banned for trivia/quiz apps per their Developer Policy — confirmed via peer review; do not use it.)
- **Fetch timing:** Pre-fetch on bar add (via `/pquiz-add` and admin UI). Never resolve at request time.
- **Matching:** Auto-resolve via Deezer search; allow admin to override by pasting a Deezer ID.
- **Storage:** Store Deezer CDN URLs (`https://e-cdns-images.dzcdn.net/images/...`) directly in `artists.image_url` and `songs.album_art_url`. No self-hosted blob storage at our scale.
- **Fallback:** If no match, render a gold-monogram tile on charcoal — the app works without art.

### Provider rejections

- **Spotify** — Developer Policy bans games and trivia quizzes. Hard no.
- **Last.fm** — artist images deprecated/broken since 2019.
- **iTunes Search API** — no artist portraits.
- **MusicBrainz + Cover Art Archive** — gaps for German rap, slow, attribution overhead.

## Schema changes

```ts
// packages/db/src/schema.ts

export const artists = pgTable("artists", {
  // existing...
  artworkProvider: varchar("artwork_provider", { length: 16 }), // "deezer" | null
  artworkExternalId: varchar("artwork_external_id", { length: 32 }), // provider-specific ID
})

export const songs = pgTable("songs", {
  // existing...
  artworkProvider: varchar("artwork_provider", { length: 16 }),
  artworkTrackId: varchar("artwork_track_id", { length: 32 }),
  artworkAlbumId: varchar("artwork_album_id", { length: 32 }),
})
```

A generic `provider` column (not `deezer_*`) is a deliberate choice — if we ever swap providers we don't need a migration, just a new column value. Existing `image_url` / `album_art_url` hold the resolved CDN URLs.

## Env vars

None. Deezer's public API requires no auth or signup.

## Modules

### `apps/web/src/lib/deezer.ts` (new)

```ts
export async function searchArtist(name: string): Promise<DeezerArtistMatch | null>
export async function searchTrack(artistName: string, title: string): Promise<DeezerTrackMatch | null>
export async function getArtistById(id: string): Promise<DeezerArtistMatch | null>
export async function getTrackById(id: string): Promise<DeezerTrackMatch | null>

type DeezerArtistMatch = {
  id: string
  name: string
  imageUrl: string | null // picture_xl (1000px) preferred, fall back to picture_big (500px)
}

type DeezerTrackMatch = {
  trackId: string
  albumId: string
  title: string
  artistName: string
  albumArtUrl: string | null // cover_xl (1000px) preferred, fall back to cover_big (500px)
}
```

Implementation notes:
- **Endpoints:**
  - `GET https://api.deezer.com/search/artist?q={name}&limit=5`
  - `GET https://api.deezer.com/search?q=artist:"{a}" track:"{t}"&limit=5`
  - `GET https://api.deezer.com/artist/{id}`
  - `GET https://api.deezer.com/track/{id}` (includes album with cover URLs)
- **Match scoring:** Normalize names (lowercase, NFD-strip diacritics, collapse whitespace). Accept top hit only if normalized strings share a token prefix. Miss → return `null`.
- **Image selection:** Prefer `picture_xl` / `cover_xl`. If empty (Deezer sometimes returns blank placeholders — string equals known placeholder hash), fall back through `_big` → `_medium`. If all are placeholders → return `null`.
- **Placeholder detection:** Deezer's "no image" URL ends in a known hash (`/images/cover//1000x1000-000000-80-0-0.jpg` style). Treat any URL containing `/images/cover//` or `/images/artist//` (double slash) as null.
- **Rate limiting:** Deezer caps at ~50 requests / 5 seconds per IP. Backfill script sleeps 150ms between calls. On HTTP 429, exponential backoff (start 500ms, double, max 5 retries).
- **Errors:** All non-2xx → log + return `null`. Caller renders monogram.

### `apps/web/src/lib/upsert.ts` (modify)

In the existing artist/song upsert path used by `/api/admin/bars`:

1. **Artist:** If `artworkExternalId` is missing, call `searchArtist(name)`. On hit: write `artwork_provider = "deezer"`, `artwork_external_id`, `image_url`. On miss: leave all null.
2. **Song:** If `artworkTrackId` is missing, call `searchTrack(artistName, title)`. On hit: write `artwork_provider`, `artwork_track_id`, `artwork_album_id`, `album_art_url`. On miss: leave null.
3. Resolution is awaited within the request (admin write path only — no user-facing latency). If it throws, the bar still creates.

### `apps/web/src/routes/api/admin/artists.$id.ts` & `songs.$id.ts` (modify)

PATCH body additions:
```ts
// artists
{ artworkExternalId?: string | null }
// songs
{ artworkTrackId?: string | null }
```

When set, immediately call `getArtistById` / `getTrackById` and overwrite `image_url` / `album_art_url` (and `artwork_album_id` from the track payload). When set to `null`, clear all artwork fields for that row.

### `/pquiz-add` skill

No skill change needed — it already calls `/api/admin/bars`, which now triggers resolution.

Surface resolved IDs in the admin response so the CLI can print:
```
Resolved: artist=<deezer_artist_id> track=<deezer_track_id>
```

## Frontend

### `apps/web/src/components/artwork.tsx` (new)

```tsx
<ArtistArt artist={artist} size={64 | 96 | 160} />
<CoverArt song={song} size={64 | 96 | 160} />
```

Behavior:
- If `imageUrl` / `albumArtUrl` present → `<img>` with explicit `width` / `height`, `loading="lazy"`, `decoding="async"`, `alt=""` (decorative).
- Shape: artists `rounded-full`, covers `rounded-md`.
- If null → `<Monogram />`. Gold (#fbbf24) initials on charcoal (#1f1f1f), Figtree bold. Two letters for artists (first letter of first two words, or first two letters if one word); one letter for covers (first letter of title).
- No proxy. Deezer CDN is fast globally.

If a Content Security Policy `img-src` directive exists, add `https://e-cdns-images.dzcdn.net` and `https://cdn-images.dzcdn.net`.

## Logging

Per CLAUDE.md aggressive logging rules. All events include `session_id` + `timestamp`:

- `artwork_resolve_attempted` — `{ provider: "deezer", kind: "artist"|"track", query }`
- `artwork_resolve_hit` — `{ provider, kind, external_id, query }`
- `artwork_resolve_miss` — `{ provider, kind, query }`
- `artwork_resolve_failed` — `{ provider, kind, query, status, message }`
- `artwork_overridden` — `{ provider, kind, entity_id, external_id }` (admin manual override)
- `artwork_rate_limited` — `{ provider, retry_after_ms, attempt }`

## Rollout

1. Schema migration — add 5 new nullable columns. No backfill of data required by the migration itself.
2. Ship `lib/deezer.ts` with retry/backoff and placeholder detection.
3. Wire into `upsert.ts` so new bars resolve automatically.
4. Backfill script (`packages/db/src/backfill-artwork.ts`) — iterate artists then songs, skip rows that already have an `artwork_external_id` / `artwork_track_id`, 150ms sleep between calls, write results idempotently. One-shot, runnable via `pnpm tsx`.
5. Ship `<ArtistArt>` / `<CoverArt>` components.
6. Add manual-override input to admin UI (paste a Deezer ID) wired to the PATCH endpoints.

## Failure modes

- **Deezer down or 5xx** → bar still creates, monogram renders, admin can retry via PATCH later.
- **Wrong match** (common name collision, especially `featuring` constructions in German rap) → admin pastes correct Deezer ID via PATCH; image re-resolves immediately.
- **Deezer CDN URL rotates** → re-run backfill; it uses stored `artwork_track_id` / `artwork_external_id` to refresh without re-searching.
- **Placeholder image returned by Deezer** → detected, treated as null, monogram renders.

## Non-goals

- Multiple image sizes / responsive `srcset`. Use one size (xl ~1000px) and let the browser scale; covers are at most 160px in the UI.
- Self-hosting bytes. Revisit only if Deezer CDN breaks at scale.
- Attribution UI. Deezer's API terms do not require visible attribution for catalog images in app UIs (unlike Spotify). Verify once before launch.
