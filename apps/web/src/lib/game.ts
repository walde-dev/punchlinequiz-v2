import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import { and, eq, inArray, isNotNull, ne, notInArray, sql } from "drizzle-orm"
import {
  artists,
  punchlines,
  songs,
  userPunchlineXp,
  users,
} from "@workspace/db"
import { db } from "./db"
import { getActor } from "./auth"
import { accrueAnonPrimary, accrueAnonSongBonus } from "./anon-xp"
import { hiddenDailyIds } from "./daily-pool"
import { getServerSessionId } from "./log"
import { grantPrimary, grantSongBonus } from "./xp"
import {
  clozeAnswerMatches,
  normalizeClozeAnswer,
  normalizeTitle,
  songGuessMatches,
} from "./answer-matching"
import type { XpGrantResult } from "./xp"

/**
 * Answer-matching / normalization is pure and side-effect free, so it lives in
 * ./answer-matching where it can be unit-tested without booting server-fns.
 * Imported here for internal use, and re-exported so existing imports of these
 * names from "./game" (e.g. ./daily) keep resolving.
 */

export type ArtistTile = {
  id: number
  slug: string
  name: string
  imageUrl: string | null
  punchlineCount: number
}

/**
 * List artists with playable punchlines. Optionally filter to cloze-eligible
 * lines (cloze_prompt authored + cloze_enabled) so the finishing-lines
 * picker only surfaces artists that can actually be played in that mode.
 */
export const listPlayableArtists = createServerFn({ method: "GET" })
  .inputValidator((d: { mode?: "artist" | "cloze" } | undefined) => d ?? {})
  .handler(async ({ data }): Promise<Array<ArtistTile>> => {
    const punchlineConds = [
      eq(punchlines.active, true),
      eq(punchlines.reviewed, true),
    ]
    punchlineConds.push(sql`${punchlines.id} NOT IN ${hiddenDailyIds()}`)
    if (data.mode === "cloze") {
      punchlineConds.push(isNotNull(punchlines.clozePrompt))
      punchlineConds.push(eq(punchlines.clozeEnabled, true))
    }
    const rows = await db
      .select({
        id: artists.id,
        slug: artists.slug,
        name: artists.name,
        imageUrl: artists.imageUrl,
        punchlineCount: sql<number>`count(${punchlines.id})::int`,
      })
      .from(artists)
      .innerJoin(songs, eq(songs.artistId, artists.id))
      .innerJoin(
        punchlines,
        and(eq(punchlines.songId, songs.id), ...punchlineConds)
      )
      .where(eq(artists.active, true))
      .groupBy(artists.id)
      .orderBy(sql`count(${punchlines.id}) desc`, artists.name)

    return rows
  })

export type ArtistChoice = {
  id: number
  name: string
  imageUrl: string | null
}

export type SongChoice = {
  id: number
  title: string
  album: string | null
  albumArtUrl: string | null
  releaseYear: number | null
}

/**
 * Classic mode: full bar shown, 3 artist choices. The user guesses who wrote
 * the bar, then free-types the song.
 *
 * Cloze mode (artist-filtered URL): artist is already known. The bar is shown
 * with its final word(s) blanked out and the user free-types the completion,
 * then free-types the song. Lines without a cloze_prompt authored are
 * excluded from this mode.
 */
export type Round =
  | {
      mode: "artist"
      punchlineId: number
      line: string
      choices: Array<ArtistChoice>
      /** Contributor handle if this bar came from a submission (PUN-67); null = admin-authored. */
      submittedByHandle: string | null
    }
  | {
      mode: "cloze"
      punchlineId: number
      line: string // the cloze prompt (with ___)
      artist: ArtistChoice
      submittedByHandle: string | null
    }

export type ArtistContext = {
  id: number
  slug: string
  name: string
  imageUrl: string | null
  punchlineCount: number
}

/** Look up a single artist by slug for the artist-mode header. */
export const getArtistContext = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => d)
  .handler(async ({ data }): Promise<ArtistContext | null> => {
    const rows = await db
      .select({
        id: artists.id,
        slug: artists.slug,
        name: artists.name,
        imageUrl: artists.imageUrl,
        punchlineCount: sql<number>`count(${punchlines.id})::int`,
      })
      .from(artists)
      .leftJoin(songs, eq(songs.artistId, artists.id))
      .leftJoin(
        punchlines,
        and(
          eq(punchlines.songId, songs.id),
          eq(punchlines.active, true),
          eq(punchlines.reviewed, true)
        )
      )
      .where(eq(artists.slug, data.slug))
      .groupBy(artists.id)
      .limit(1)
    return rows[0] ?? null
  })

export type SongReveal = {
  title: string
  album: string | null
  albumArtUrl: string | null
  releaseYear: number | null
}

export type AnswerResult = {
  isCorrect: boolean
  correctArtist: ArtistChoice
  song: SongReveal | null
  /** Server-issued XP grant outcome. null when the caller is anonymous. */
  xp: XpGrantResult | null
}

export type SongGuessResult = {
  isCorrect: boolean
  song: SongReveal
  xp: XpGrantResult | null
}

export type ClozeGuessResult = {
  isCorrect: boolean
  correctAnswer: string
  fullLine: string
  correctArtist: ArtistChoice
  xp: XpGrantResult | null
}

/**
 * Resolve the signed-in Clerk user id from the active request, or null for
 * anonymous play. We never `throw` — anonymous play stays valid; XP just
 * doesn't accrue.
 */
async function getClerkIdOrNull(): Promise<string | null> {
  try {
    const req = getRequest()
    const result = await getActor(req)
    if (result?.actor.kind === "clerk") return result.actor.userId
  } catch {
    /* getRequest only valid inside server fn context; ignore */
  }
  return null
}

/**
 * Has this device ever finished a bar? Read from the `pq_played` cookie set
 * client-side after the first answer (see `lib/first-run.ts`). Used to gate the
 * starter-pool early-win ramp on the very FIRST bar — which the SSR loader
 * fetches before any client code runs, so a localStorage-only flag couldn't
 * reach it. Absent cookie ⇒ treat as first-run. Never throws.
 */
function hasPlayedCookie(): boolean {
  try {
    const c = getRequest().headers.get("cookie")
    return !!c && /(?:^|;\s*)pq_played=1/.test(c)
  } catch {
    return false
  }
}

function shuffle<T>(arr: Array<T>): Array<T> {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export { normalizeTitle, normalizeClozeAnswer, clozeAnswerMatches }

/**
 * Fetch one random active punchline.
 *
 * `mode` is the primary discriminator: "artist" → classic 3-choice round;
 * "cloze" → finishing-lines round (line with `___`, free-typed completion;
 * filtered to cloze-eligible punchlines). `artistSlug` is orthogonal — it
 * narrows either mode to a single artist when present.
 *
 * Early-win ramp (PUN-95): a brand-new player's opening rounds are drawn from
 * the curated starter pool (`punchlines.starter`) so the cold-open is an easy,
 * recognizable win. Two entry points:
 *   - `starter: true` — client-driven; the client knows it's a first-run
 *     opening round (rounds 2–3) and asks explicitly.
 *   - `opening: true` — used by the SSR loader for bar #1, which runs before
 *     any client code. The server reads the `pq_played` cookie and only serves
 *     a starter when the device hasn't played before.
 * Either way, if the starter pool is exhausted/empty for the current
 * mode+filters we fall back to a normal random pick — play is never blocked.
 * `excludeIds` keeps the opening starter bars distinct across those rounds.
 */
export const getRound = createServerFn({ method: "GET" })
  .inputValidator(
    (
      d:
        | {
            excludeId?: number
            excludeIds?: Array<number>
            artistSlug?: string
            mode?: "artist" | "cloze"
            starter?: boolean
            opening?: boolean
          }
        | undefined
    ) => d ?? {}
  )
  .handler(async ({ data }): Promise<Round> => {
    const mode = data.mode ?? "artist"
    const conds = [eq(punchlines.active, true), eq(punchlines.reviewed, true)]
    conds.push(sql`${punchlines.id} NOT IN ${hiddenDailyIds()}`)
    if (data.excludeId) conds.push(ne(punchlines.id, data.excludeId))
    const excludeIds = (data.excludeIds ?? []).filter(
      (n) => Number.isInteger(n) && n > 0
    )
    if (excludeIds.length > 0) conds.push(notInArray(punchlines.id, excludeIds))
    if (data.artistSlug) conds.push(eq(artists.slug, data.artistSlug))
    if (mode === "cloze") {
      conds.push(isNotNull(punchlines.clozePrompt))
      conds.push(eq(punchlines.clozeEnabled, true))
    }

    // Solved-bar exclusion (PUN-103): a signed-in player is never re-served a
    // bar they've already answered correctly. The user_punchline_xp row IS the
    // solved record (written on the correct primary grant, idempotent; no row
    // for a wrong answer — so missed bars can still come back). Random-draw
    // only: getRound powers cold-open /play + /quiz; daily and challenge resolve
    // fixed bars by id and never hit this path, so they stay exempt by design.
    // Anonymous players (no clerkId) are unaffected and may repeat.
    const solverClerkId = await getClerkIdOrNull()
    if (solverClerkId) {
      conds.push(
        sql`${punchlines.id} NOT IN (SELECT ${userPunchlineXp.punchlineId} FROM ${userPunchlineXp} WHERE ${userPunchlineXp.clerkId} = ${solverClerkId})`
      )
    }

    function pick(extra: Array<ReturnType<typeof eq>>) {
      return db
        .select({
          punchlineId: punchlines.id,
          line: punchlines.line,
          clozePrompt: punchlines.clozePrompt,
          artistId: songs.artistId,
          distractor1Id: punchlines.distractor1Id,
          distractor2Id: punchlines.distractor2Id,
          submittedByHandle: users.handle,
        })
        .from(punchlines)
        .innerJoin(songs, eq(songs.id, punchlines.songId))
        .innerJoin(artists, eq(artists.id, songs.artistId))
        .leftJoin(users, eq(users.clerkId, punchlines.submittedByClerkId))
        .where(and(...conds, ...extra))
        .orderBy(sql`random()`)
        .limit(1)
    }

    // Starter-first with graceful fallback: try the curated pool, but if it's
    // empty for these filters drop the constraint so play is never blocked.
    const wantStarter =
      data.starter === true || (data.opening === true && !hasPlayedCookie())
    let baseRows = wantStarter ? await pick([eq(punchlines.starter, true)]) : []
    if (baseRows.length === 0) baseRows = await pick([])

    if (baseRows.length === 0) {
      throw new Error(
        mode === "cloze"
          ? "No cloze-ready punchlines available"
          : "No punchlines available"
      )
    }
    const row = baseRows[0]

    if (mode === "cloze" && row.clozePrompt) {
      const artistRow = await db
        .select({
          id: artists.id,
          name: artists.name,
          imageUrl: artists.imageUrl,
        })
        .from(artists)
        .where(eq(artists.id, row.artistId))
        .limit(1)
      return {
        mode: "cloze",
        punchlineId: row.punchlineId,
        line: row.clozePrompt,
        artist: artistRow[0] ?? { id: row.artistId, name: "", imageUrl: null },
        submittedByHandle: row.submittedByHandle ?? null,
      }
    }

    const ids = [row.artistId, row.distractor1Id, row.distractor2Id]
    const rows = await db
      .select({
        id: artists.id,
        name: artists.name,
        imageUrl: artists.imageUrl,
      })
      .from(artists)
      .where(inArray(artists.id, ids))

    const byId = new Map(rows.map((r) => [r.id, r]))
    const ordered = ids
      .map((id) => byId.get(id))
      .filter((x): x is ArtistChoice => Boolean(x))

    return {
      mode: "artist",
      punchlineId: row.punchlineId,
      line: row.line,
      choices: shuffle(ordered),
      submittedByHandle: row.submittedByHandle ?? null,
    }
  })

/**
 * Validate the artist guess. When the guess is correct we deliberately do NOT
 * return song/album info — the client moves to the song-guessing phase and
 * has to call submitSongGuess to reveal it.
 */
export const submitAnswer = createServerFn({ method: "POST" })
  .inputValidator((d: { punchlineId: number; artistId: number }) => d)
  .handler(async ({ data }): Promise<AnswerResult> => {
    const rows = await db
      .select({
        correctArtistId: songs.artistId,
        songTitle: songs.title,
        album: songs.album,
        albumArtUrl: songs.albumArtUrl,
        releaseYear: songs.releaseYear,
        artistName: artists.name,
        artistImageUrl: artists.imageUrl,
      })
      .from(punchlines)
      .innerJoin(songs, eq(songs.id, punchlines.songId))
      .innerJoin(artists, eq(artists.id, songs.artistId))
      .where(eq(punchlines.id, data.punchlineId))
      .limit(1)

    if (rows.length === 0) throw new Error("Punchline not found")
    const r = rows[0]
    const isCorrect = r.correctArtistId === data.artistId
    let xp: XpGrantResult | null = null
    if (isCorrect) {
      const clerkId = await getClerkIdOrNull()
      if (clerkId) {
        xp = await grantPrimary({
          clerkId,
          punchlineId: data.punchlineId,
          mode: "artist",
        })
      } else {
        // Anonymous: bank provisional XP for "keep your XP" on sign-up (PUN-97).
        const sid = getServerSessionId()
        if (sid)
          await accrueAnonPrimary({
            sessionId: sid,
            punchlineId: data.punchlineId,
            mode: "artist",
          })
      }
    }
    return {
      isCorrect,
      correctArtist: {
        id: r.correctArtistId,
        name: r.artistName,
        imageUrl: r.artistImageUrl,
      },
      song: isCorrect
        ? null
        : {
            title: r.songTitle,
            album: r.album,
            albumArtUrl: r.albumArtUrl,
            releaseYear: r.releaseYear,
          },
      xp,
    }
  })

/**
 * Validate a free-typed cloze answer. Accepted answers live in
 * punchlines.perfect_solution (a list of full-answer strings). Matching is
 * lenient via the same normalizeTitle pipeline used for song titles.
 */
export const submitClozeGuess = createServerFn({ method: "POST" })
  .inputValidator((d: { punchlineId: number; guess: string }) => d)
  .handler(async ({ data }): Promise<ClozeGuessResult> => {
    const rows = await db
      .select({
        line: punchlines.line,
        perfectSolution: punchlines.perfectSolution,
        artistId: artists.id,
        artistName: artists.name,
        artistImageUrl: artists.imageUrl,
      })
      .from(punchlines)
      .innerJoin(songs, eq(songs.id, punchlines.songId))
      .innerJoin(artists, eq(artists.id, songs.artistId))
      .where(eq(punchlines.id, data.punchlineId))
      .limit(1)

    if (rows.length === 0) throw new Error("Punchline not found")
    const r = rows[0]
    const guess = (data.guess ?? "").trim()
    const accepted = r.perfectSolution ?? []
    const isCorrect = clozeAnswerMatches(guess, accepted)
    let xp: XpGrantResult | null = null
    if (isCorrect) {
      const clerkId = await getClerkIdOrNull()
      if (clerkId) {
        xp = await grantPrimary({
          clerkId,
          punchlineId: data.punchlineId,
          mode: "cloze",
        })
      } else {
        const sid = getServerSessionId()
        if (sid)
          await accrueAnonPrimary({
            sessionId: sid,
            punchlineId: data.punchlineId,
            mode: "cloze",
          })
      }
    }
    return {
      isCorrect,
      correctAnswer: accepted[0] ?? "",
      fullLine: r.line,
      correctArtist: {
        id: r.artistId,
        name: r.artistName,
        imageUrl: r.artistImageUrl,
      },
      xp,
    }
  })

/**
 * Validate a free-typed song guess. Empty string is treated as "skip" — the
 * reply still returns the song reveal but with isCorrect=false. The matching
 * is intentionally lenient (see normalizeTitle / titleCandidates).
 */
export const submitSongGuess = createServerFn({ method: "POST" })
  .inputValidator((d: { punchlineId: number; guess: string }) => d)
  .handler(async ({ data }): Promise<SongGuessResult> => {
    const rows = await db
      .select({
        title: songs.title,
        album: songs.album,
        albumArtUrl: songs.albumArtUrl,
        releaseYear: songs.releaseYear,
      })
      .from(punchlines)
      .innerJoin(songs, eq(songs.id, punchlines.songId))
      .where(eq(punchlines.id, data.punchlineId))
      .limit(1)

    if (rows.length === 0) throw new Error("Punchline not found")
    const r = rows[0]
    const guess = (data.guess ?? "").trim()
    const isCorrect = guess.length > 0 && songGuessMatches(guess, r.title)
    let xp: XpGrantResult | null = null
    if (isCorrect) {
      const clerkId = await getClerkIdOrNull()
      if (clerkId) {
        xp = await grantSongBonus({ clerkId, punchlineId: data.punchlineId })
      } else {
        const sid = getServerSessionId()
        if (sid)
          await accrueAnonSongBonus({
            sessionId: sid,
            punchlineId: data.punchlineId,
          })
      }
    }
    return {
      isCorrect,
      song: {
        title: r.title,
        album: r.album,
        albumArtUrl: r.albumArtUrl,
        releaseYear: r.releaseYear,
      },
      xp,
    }
  })
