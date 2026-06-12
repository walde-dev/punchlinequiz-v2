/**
 * Client-side helpers for the admin REST API. All calls go to /api/admin/*
 * and rely on the httpOnly `pquiz_admin` cookie for auth — no token in JS.
 */

export type BarRow = {
  id: number
  line: string
  /** Finishing-lines prompt with `___` at the blank; null = not authored. */
  clozePrompt?: string | null
  /** Soft toggle: false → excluded from cloze (artist-filtered) mode. */
  clozeEnabled?: boolean
  /** Curated starter bar — eligible to seed a first-run player's opening rounds. */
  starter?: boolean
  /** Accepted cloze answers (first entry is canonical). */
  perfectSolution?: Array<string>
  /** Whether an admin has manually verified this row. */
  reviewed?: boolean
  active: boolean
  createdAt: string
  songId: number
  songTitle: string
  songAlbum: string | null
  releaseYear: number | null
  artistId: number
  artistName: string
  artistSlug: string
  distractor1Id: number
  distractor2Id: number
  /**
   * Ingestion provenance (PUN-162), present only for auto-ingested bars
   * (source = WHO DAT?! YouTube). Lets a reviewer vet the bar against the
   * source clip without leaving the queue.
   */
  ingestVideoId?: string | null
  ingestTsMs?: number | null
  ingestModel?: string | null
  ingestConfidence?: number | null
  ingestStatus?: string | null
}

export type ArtistRow = {
  id: number
  name: string
  slug: string
  imageUrl: string | null
  active: boolean
  /** Tag slugs (scene/era/region). Used to score distractor overlap. */
  tags?: Array<string>
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const msg =
      (body.message as string) || (body.error as string) || `HTTP ${res.status}`
    throw new Error(msg)
  }
  return body as T
}

export async function fetchBars(opts: {
  search?: string
  artist?: string
  artistId?: number
  song?: string
  includeInactive?: boolean
  limit?: number
  offset?: number
  reviewed?: boolean
  /** Bar ids to drop from the result set (e.g. already-scheduled dailies). */
  excludeIds?: Array<number>
}): Promise<{
  items: Array<BarRow>
  total: number
  limit: number
  offset: number
}> {
  const url = new URL("/api/admin/bars", window.location.origin)
  if (opts.search?.trim()) url.searchParams.set("search", opts.search.trim())
  if (opts.artistId && opts.artistId > 0)
    url.searchParams.set("artistId", String(opts.artistId))
  else if (opts.artist?.trim())
    url.searchParams.set("artist", opts.artist.trim())
  if (opts.song?.trim()) url.searchParams.set("song", opts.song.trim())
  if (opts.includeInactive) url.searchParams.set("includeInactive", "true")
  if (opts.reviewed !== undefined)
    url.searchParams.set("reviewed", String(opts.reviewed))
  if (opts.excludeIds && opts.excludeIds.length > 0)
    url.searchParams.set("excludeIds", opts.excludeIds.join(","))
  url.searchParams.set("limit", String(opts.limit ?? 100))
  if (opts.offset && opts.offset > 0)
    url.searchParams.set("offset", String(opts.offset))
  const res = await fetch(url, { credentials: "same-origin" })
  return jsonOrThrow(res)
}

/**
 * Fetch *every* bar (active + inactive) by paging through the API, which
 * caps each request at 200 rows. Used by the admin table, which filters
 * client-side and caches the full set (see admin index `loadAll`).
 */
export async function fetchAllBars(): Promise<{
  items: Array<BarRow>
  total: number
}> {
  const pageSize = 200
  const all: Array<BarRow> = []
  let offset = 0
  let total = 0
  // Hard ceiling so a misbehaving API can never spin forever.
  for (let page = 0; page < 200; page++) {
    const url = new URL("/api/admin/bars", window.location.origin)
    url.searchParams.set("includeInactive", "true")
    url.searchParams.set("limit", String(pageSize))
    url.searchParams.set("offset", String(offset))
    const res = await fetch(url, { credentials: "same-origin" })
    const body = await jsonOrThrow<{ items: Array<BarRow>; total: number }>(res)
    all.push(...body.items)
    total = body.total
    if (body.items.length < pageSize || all.length >= total) break
    offset += pageSize
  }
  return { items: all, total }
}

/**
 * Fetch the next un-reviewed bar (single, random pick) excluding any
 * client-side session-skipped IDs. Returns null when the queue is empty.
 */
export async function fetchNextReviewBar(
  excludeIds: Array<number>
): Promise<{ bar: BarRow | null; remaining: number }> {
  const url = new URL("/api/admin/bars", window.location.origin)
  url.searchParams.set("reviewed", "false")
  url.searchParams.set("random", "true")
  url.searchParams.set("limit", "1")
  if (excludeIds.length > 0) {
    url.searchParams.set("excludeIds", excludeIds.join(","))
  }
  const res = await fetch(url, { credentials: "same-origin" })
  const body = await jsonOrThrow<{ items: Array<BarRow>; total: number }>(res)
  return { bar: body.items[0] ?? null, remaining: body.total }
}

export async function fetchArtists(): Promise<{ items: Array<ArtistRow> }> {
  const res = await fetch("/api/admin/artists?includeInactive=true", {
    credentials: "same-origin",
  })
  return jsonOrThrow(res)
}

export async function createArtist(
  name: string,
  tags: Array<{ slug: string; weight: number }> = []
): Promise<{
  id: number
  name: string
  slug: string
  imageUrl: string | null
  active: boolean
  created: boolean
  tagCount?: number
}> {
  const res = await fetch("/api/admin/artists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tags.length > 0 ? { name, tags } : { name }),
    credentials: "same-origin",
  })
  return jsonOrThrow(res)
}

export type TagRow = {
  id: number
  slug: string
  label: string
  artistCount: number
}
export type ArtistTagRow = {
  tagId: number
  slug: string
  label: string
  weight: number
}

export async function fetchTags(): Promise<{ items: Array<TagRow> }> {
  const res = await fetch("/api/admin/tags", { credentials: "same-origin" })
  return jsonOrThrow(res)
}

export async function createTag(
  label: string
): Promise<TagRow & { created: boolean }> {
  const res = await fetch("/api/admin/tags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label }),
    credentials: "same-origin",
  })
  return jsonOrThrow(res)
}

export async function fetchArtistTags(
  artistId: number
): Promise<{ items: Array<ArtistTagRow> }> {
  const res = await fetch(`/api/admin/artists/${artistId}/tags`, {
    credentials: "same-origin",
  })
  return jsonOrThrow(res)
}

export async function setArtistTags(
  artistId: number,
  tags: Array<{ slug: string; weight: number }>
): Promise<{ items: Array<ArtistTagRow> }> {
  const res = await fetch(`/api/admin/artists/${artistId}/tags`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tags }),
    credentials: "same-origin",
  })
  return jsonOrThrow(res)
}

export async function createBar(input: {
  artist: string
  song: string
  line: string
  distractor1: string
  distractor2: string
  album?: string
  releaseYear?: number
}): Promise<{ punchlineId: number }> {
  const res = await fetch("/api/admin/bars", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    credentials: "same-origin",
  })
  return jsonOrThrow(res)
}

export async function patchSong(
  id: number,
  patch: {
    title?: string
    album?: string | null
    releaseYear?: number
    artistId?: number
  }
): Promise<{ id: number; title: string; album: string | null }> {
  const res = await fetch(`/api/admin/songs/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
    credentials: "same-origin",
  })
  return jsonOrThrow(res)
}

export async function patchBar(
  id: number,
  patch: {
    line?: string
    clozePrompt?: string | null
    clozeEnabled?: boolean
    starter?: boolean
    perfectSolution?: Array<string>
    active?: boolean
    reviewed?: boolean
    distractor1Id?: number
    distractor2Id?: number
  }
): Promise<BarRow> {
  const res = await fetch(`/api/admin/bars/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
    credentials: "same-origin",
  })
  return jsonOrThrow(res)
}

export type DeezerArtistHit = {
  id: string
  name: string
  imageUrl: string | null
}

export type DeezerTrackHit = {
  trackId: string
  title: string
  artistName: string
  artistId: string
  albumId: string
  albumTitle: string
  albumArtUrl: string | null
  releaseYear: number | null
}

export async function searchDeezerArtists(
  q: string
): Promise<Array<DeezerArtistHit>> {
  if (!q.trim()) return []
  const url = new URL("/api/admin/search/artists", window.location.origin)
  url.searchParams.set("q", q.trim())
  const res = await fetch(url, { credentials: "same-origin" })
  const body = await jsonOrThrow<{ items: Array<DeezerArtistHit> }>(res)
  return body.items
}

export async function getDeezerTrack(
  id: string
): Promise<DeezerTrackHit | null> {
  const res = await fetch(`/api/admin/search/track/${encodeURIComponent(id)}`, {
    credentials: "same-origin",
  })
  if (res.status === 404) return null
  const body = await jsonOrThrow<{
    trackId: string
    title: string
    artistName: string
    albumId: string
    albumTitle: string
    albumArtUrl: string | null
    releaseYear: number | null
  }>(res)
  return {
    trackId: body.trackId,
    title: body.title,
    artistName: body.artistName,
    artistId: "",
    albumId: body.albumId,
    albumTitle: body.albumTitle,
    albumArtUrl: body.albumArtUrl,
    releaseYear: body.releaseYear,
  }
}

export async function searchDeezerTracks(
  q: string
): Promise<Array<DeezerTrackHit>> {
  if (!q.trim()) return []
  const url = new URL("/api/admin/search/tracks", window.location.origin)
  url.searchParams.set("q", q.trim())
  const res = await fetch(url, { credentials: "same-origin" })
  const body = await jsonOrThrow<{ items: Array<DeezerTrackHit> }>(res)
  return body.items
}

export type DailyRow = {
  id: number
  date: string
  createdAt: string
  punchlineId: number
  line: string
  songId: number
  songTitle: string
  releaseYear: number | null
  artistId: number
  artistName: string
  artistSlug: string
}

export async function fetchDailyChallenges(
  opts: { all?: boolean } = {}
): Promise<{
  items: Array<DailyRow>
}> {
  const url = new URL("/api/admin/daily", window.location.origin)
  if (opts.all) url.searchParams.set("all", "true")
  const res = await fetch(url, { credentials: "same-origin" })
  return jsonOrThrow(res)
}

export async function scheduleDailyChallenge(input: {
  date: string
  punchlineId: number
}): Promise<{ id: number; date: string; punchlineId: number }> {
  const res = await fetch("/api/admin/daily", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    credentials: "same-origin",
  })
  return jsonOrThrow(res)
}

export async function deleteDailyChallenge(id: number): Promise<void> {
  const res = await fetch(`/api/admin/daily/${id}`, {
    method: "DELETE",
    credentials: "same-origin",
  })
  await jsonOrThrow(res)
}

export async function deleteBar(id: number, hard = false): Promise<void> {
  const url = new URL(`/api/admin/bars/${id}`, window.location.origin)
  if (hard) url.searchParams.set("hard", "true")
  const res = await fetch(url, { method: "DELETE", credentials: "same-origin" })
  await jsonOrThrow(res)
}

export type SubmissionRow = {
  id: number
  line: string
  clozePrompt: string | null
  perfectSolution: Array<string> | null
  artistHint: string | null
  songHint: string | null
  note: string | null
  status: string
  createdAt: string
  submitterHandle: string | null
  /** Computed contributor tier of the submitter — drives review-queue priority (PUN-66). */
  submitterTier: "neuling" | "vertraut" | "verifiziert"
}

export async function fetchSubmissions(
  status = "pending"
): Promise<{ items: Array<SubmissionRow> }> {
  const url = new URL("/api/admin/submissions", window.location.origin)
  url.searchParams.set("status", status)
  const res = await fetch(url, { credentials: "same-origin" })
  return jsonOrThrow(res)
}

export async function approveSubmission(
  id: number,
  input: {
    artist: string
    song: string
    line: string
    distractor1: string
    distractor2: string
    clozePrompt?: string
    perfectSolution?: Array<string>
  }
): Promise<{ ok: true; punchlineId: number }> {
  const res = await fetch(`/api/admin/submissions/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "approve", ...input }),
    credentials: "same-origin",
  })
  return jsonOrThrow(res)
}

export async function rejectSubmission(
  id: number,
  reason?: string
): Promise<{ ok: true }> {
  const res = await fetch(`/api/admin/submissions/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "reject", reason }),
    credentials: "same-origin",
  })
  return jsonOrThrow(res)
}
