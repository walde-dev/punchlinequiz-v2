/**
 * Tag-driven distractor selection.
 *
 * The tag dictionary and per-artist weights live in the database — the admin
 * UI is the source of truth. This module pulls the data from the admin API at
 * script start (one request) and runs the same scoring logic locally so
 * `insert.ts` doesn't need to hit the API per bar.
 */

import { adminConfig } from "./config.ts"

export interface ArtistTag {
  tag: string
  weight: number
}

interface AdminArtistRow {
  id: number
  name: string
  slug: string
  active: boolean
}

interface AdminTagRow {
  tagId: number
  slug: string
  label: string
  weight: number
}

let cached: { artists: AdminArtistRow[]; byArtist: Map<number, ArtistTag[]> } | null = null

async function fetchJson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    throw new Error(`${url} → ${res.status} ${await res.text().catch(() => "")}`)
  }
  return (await res.json()) as T
}

export async function loadTagsFromAdmin(): Promise<void> {
  if (cached) return
  const { baseUrl, token } = adminConfig()
  const a = await fetchJson<{ items: AdminArtistRow[] }>(
    `${baseUrl}/api/admin/artists?includeInactive=true`,
    token,
  )
  const byArtist = new Map<number, ArtistTag[]>()
  await Promise.all(
    a.items.map(async (artist) => {
      const r = await fetchJson<{ items: AdminTagRow[] }>(
        `${baseUrl}/api/admin/artists/${artist.id}/tags`,
        token,
      )
      byArtist.set(
        artist.id,
        r.items.map((t) => ({ tag: t.slug, weight: t.weight })),
      )
    }),
  )
  cached = { artists: a.items, byArtist }
}

function ensureLoaded(): NonNullable<typeof cached> {
  if (!cached) {
    throw new Error("Tags not loaded — call loadTagsFromAdmin() first.")
  }
  return cached
}

export function allArtists(): string[] {
  return ensureLoaded().artists.map((a) => a.name)
}

function findArtist(name: string): AdminArtistRow | null {
  const { artists } = ensureLoaded()
  return artists.find((a) => a.name.toLowerCase() === name.toLowerCase()) ?? null
}

export function tagsFor(name: string): ArtistTag[] {
  const a = findArtist(name)
  if (!a) return []
  return ensureLoaded().byArtist.get(a.id) ?? []
}

export function tagOverlap(a: string, b: string): number {
  const ta = tagsFor(a)
  const tb = tagsFor(b)
  let score = 0
  for (const x of ta) {
    for (const y of tb) {
      if (x.tag === y.tag) score += x.weight * y.weight
    }
  }
  return score
}

// ---------------------------------------------------------------------------
// Content signals (regex-based; cheap to run, easy to tune)
// ---------------------------------------------------------------------------

export type ContentSignal = {
  type: "city" | "style" | "mood" | "era"
  value: string
  confidence: number
}

const SIGNAL_PATTERNS: { re: RegExp; signal: Omit<ContentSignal, "confidence">; confidence: number }[] = [
  { re: /\b(frankfurt|069|azzlack|bornheim|bahnhofsviertel|gallus)\b/i, signal: { type: "city", value: "frankfurt" }, confidence: 0.9 },
  { re: /\b(berlin|berghain|neukölln|kreuzberg|wedding|moabit|36er|36 boys|tempelhof)\b/i, signal: { type: "city", value: "berlin" }, confidence: 0.9 },
  { re: /\b(hamburg|hh|reeperbahn|st\.? pauli|187)\b/i, signal: { type: "city", value: "hamburg" }, confidence: 0.9 },
  { re: /\b(köln|cologne|domstadt|0221|düsseldorf|nrw)\b/i, signal: { type: "city", value: "nrw" }, confidence: 0.8 },
  { re: /\b(wien|vienna|österreich|austria|wiener)\b/i, signal: { type: "city", value: "oesterreich" }, confidence: 0.9 },
  { re: /\b(stuttgart|0711|schwaben)\b/i, signal: { type: "city", value: "stuttgart" }, confidence: 0.85 },
  { re: /\b(hessen|hessisch|wiesbaden|offenbach|darmstadt)\b/i, signal: { type: "city", value: "hessen" }, confidence: 0.8 },
  { re: /\b(wie ein|wie 'ne|wie der|wie die|gleich wie|als ob)\b/i, signal: { type: "style", value: "wordplay" }, confidence: 0.5 },
  { re: /\b(baby|love|herz|kuss|liebe|romantik|verliebt|gefühle)\b/i, signal: { type: "style", value: "love" }, confidence: 0.7 },
  { re: /\b(kokain|koka|crack|drogen|straße|block|deal|dealer|hustle|ghetto|knast|jva)\b/i, signal: { type: "style", value: "street" }, confidence: 0.75 },
  { re: /\b(money|cash|geld|gold|lambo|lamborghini|porsche|rolex|millionen|million|patek)\b/i, signal: { type: "style", value: "braggadocio" }, confidence: 0.65 },
  { re: /\b(diss|battle|fick dich|punch|opfer|hurensohn|opps?)\b/i, signal: { type: "style", value: "battle" }, confidence: 0.7 },
  { re: /\b(trap|autotune|woah|skrr|brrr)\b/i, signal: { type: "style", value: "trap" }, confidence: 0.7 },
  { re: /\b(mama|gott|allah|seele|frieden|leben|schmerz|tränen)\b/i, signal: { type: "style", value: "conscious" }, confidence: 0.55 },
  { re: /\b(alman|wallah|babo|para|lan|moruk|brate|aywa|ya hmar)\b/i, signal: { type: "style", value: "multilingual" }, confidence: 0.85 },
]

export function analyzePunchline(line: string, song?: string): ContentSignal[] {
  const text = `${line} ${song ?? ""}`
  const out: ContentSignal[] = []
  for (const { re, signal, confidence } of SIGNAL_PATTERNS) {
    if (re.test(text)) out.push({ ...signal, confidence })
  }
  return out
}

// ---------------------------------------------------------------------------
// Distractor selection
// ---------------------------------------------------------------------------

const USED_SINGLE_PENALTY = 0.6

export interface PickOptions {
  usedPairs?: Set<string>
  jitter?: number
}

export function scoreDistractor(
  candidate: string,
  correctArtist: string,
  signals: ContentSignal[],
): number {
  let score = tagOverlap(candidate, correctArtist)
  const candTags = tagsFor(candidate)
  for (const s of signals) {
    for (const t of candTags) {
      if (t.tag === s.value) score += t.weight * s.confidence
    }
  }
  return score
}

export function pickDistractorsSmart(
  correctArtist: string,
  punchline: string,
  song: string | undefined,
  opts: PickOptions = {},
): [string, string] {
  const signals = analyzePunchline(punchline, song)
  const jitter = opts.jitter ?? 0.15
  const used = opts.usedPairs ?? new Set<string>()

  const candidates = allArtists()
    .filter((a) => a.toLowerCase() !== correctArtist.toLowerCase())
    .map((a) => {
      let score = scoreDistractor(a, correctArtist, signals)
      if (used.has(pairKey(correctArtist, a))) score -= USED_SINGLE_PENALTY
      score += Math.random() * jitter
      return { artist: a, score }
    })
    .sort((x, y) => y.score - x.score)

  if (candidates.length < 2) {
    throw new Error(`not enough candidates to pick distractors for ${correctArtist}`)
  }

  const first = candidates[0]!
  let second = candidates[1]!
  if (used.has(tripleKey(correctArtist, first.artist, second.artist)) && candidates[2]) {
    second = candidates[2]
  }
  return [first.artist, second.artist]
}

export function pairKey(correct: string, distractor: string): string {
  return `${correct.toLowerCase()}|${distractor.toLowerCase()}`
}

export function tripleKey(correct: string, d1: string, d2: string): string {
  const pair = [d1.toLowerCase(), d2.toLowerCase()].sort().join("|")
  return `${correct.toLowerCase()}|${pair}`
}

export function recordUsed(used: Set<string>, correct: string, d1: string, d2: string): void {
  used.add(pairKey(correct, d1))
  used.add(pairKey(correct, d2))
  used.add(tripleKey(correct, d1, d2))
}
