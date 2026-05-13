/**
 * Client-side helpers for the admin REST API. All calls go to /api/admin/*
 * and rely on the httpOnly `pquiz_admin` cookie for auth — no token in JS.
 */

export type BarRow = {
  id: number
  line: string
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
}

export type ArtistRow = {
  id: number
  name: string
  slug: string
  imageUrl: string | null
  active: boolean
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const msg = (body.message as string) || (body.error as string) || `HTTP ${res.status}`
    throw new Error(msg)
  }
  return body as T
}

export async function fetchBars(opts: {
  search?: string
  includeInactive?: boolean
  limit?: number
}): Promise<{ items: BarRow[]; total: number }> {
  const url = new URL("/api/admin/bars", window.location.origin)
  if (opts.search?.trim()) url.searchParams.set("search", opts.search.trim())
  if (opts.includeInactive) url.searchParams.set("includeInactive", "true")
  url.searchParams.set("limit", String(opts.limit ?? 100))
  const res = await fetch(url, { credentials: "same-origin" })
  return jsonOrThrow(res)
}

export async function fetchArtists(): Promise<{ items: ArtistRow[] }> {
  const res = await fetch("/api/admin/artists?includeInactive=true", {
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

export async function patchBar(
  id: number,
  patch: {
    line?: string
    active?: boolean
    distractor1Id?: number
    distractor2Id?: number
  },
): Promise<BarRow> {
  const res = await fetch(`/api/admin/bars/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
    credentials: "same-origin",
  })
  return jsonOrThrow(res)
}

export async function deleteBar(id: number, hard = false): Promise<void> {
  const url = new URL(`/api/admin/bars/${id}`, window.location.origin)
  if (hard) url.searchParams.set("hard", "true")
  const res = await fetch(url, { method: "DELETE", credentials: "same-origin" })
  await jsonOrThrow(res)
}
