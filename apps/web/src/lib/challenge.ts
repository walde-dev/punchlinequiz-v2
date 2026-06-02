import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import { randomBytes } from "node:crypto"
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"
import {
  artists,
  challengeAttempts,
  challenges,
  dailyChallenges,
  punchlines,
  songs,
  users,
} from "@workspace/db"

import { getActor } from "./auth"
import { db } from "./db"
import { ensureUser, levelFor, loadLevels, type LevelInfo } from "./xp"

/**
 * Challenges = a dedicated 5-bar artist-guess run, frozen into a shareable
 * "beat my score" board (PUN-8/9/10). No XP is granted in challenges — it's a
 * competitive mode, not the XP grind. Answers are validated server-side (the
 * correct answer is never sent to the client) and revealed only in the post-
 * submit recap. First attempt locks the board row.
 */

export const CHALLENGE_SIZE = 5
const MIN_BAR_MS = 300
const MAX_BAR_MS = 120_000

export type ChallengeChoice = { id: number; name: string; imageUrl: string | null }
export type ChallengeRound = {
  punchlineId: number
  line: string
  choices: ChallengeChoice[]
  /** Contributor handle if this bar came from a submission (PUN-67); null = admin-authored. */
  submittedByHandle: string | null
}

export type ChallengeBoardEntry = {
  rank: number
  handle: string
  imageUrl: string | null
  level: LevelInfo
  correctCount: number
  solveMs: number
  isCreator: boolean
}

export type ChallengeAttemptInput = { punchlineId: number; artistId: number; ms: number }

export type ChallengeRecapBar = {
  punchlineId: number
  line: string
  correctArtistId: number | null
  correctArtistName: string | null
  chosenArtistId: number | null
  correct: boolean | null
  /** Contributor handle if this bar came from a submission (PUN-67); null = admin-authored. */
  submittedByHandle: string | null
}

async function callerClerkId(): Promise<string | null> {
  const result = await getActor(getRequest())
  return result?.actor.kind === "clerk" ? result.actor.userId : null
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const dailyScheduledIds = sql`(SELECT ${dailyChallenges.punchlineId} FROM ${dailyChallenges})`

/** Generate a short URL-safe slug (base62-ish, lowercase + digits). */
function makeSlug(len = 8): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
  const bytes = randomBytes(len)
  let s = ""
  for (let i = 0; i < len; i++) s += alphabet[bytes[i] % alphabet.length]
  return s
}

/**
 * Create a challenge: pick 5 random distinct active bars (excluding daily-
 * scheduled), freeze them, return the slug. Auth-required (creator owns the
 * board). The creator's score is only added if/when they play /c/$slug.
 */
export const createChallengeFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ slug: string }> => {
    const creatorId = await callerClerkId()
    if (!creatorId) throw new Error("Authentication required")
    await ensureUser(creatorId)

    const rows = await db
      .select({ id: punchlines.id })
      .from(punchlines)
      .where(and(eq(punchlines.active, true), sql`${punchlines.id} NOT IN ${dailyScheduledIds}`))
      .orderBy(sql`random()`)
      .limit(CHALLENGE_SIZE)
    if (rows.length < CHALLENGE_SIZE) throw new Error("Not enough bars to build a challenge")
    const barIds = rows.map((r) => r.id)

    // Insert with a fresh slug; retry on the (very unlikely) unique collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = makeSlug()
      try {
        await db.insert(challenges).values({ slug, creatorClerkId: creatorId, barIds })
        return { slug }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes("slug") || msg.includes("23505") || msg.includes("duplicate")) continue
        throw err
      }
    }
    throw new Error("Could not generate a unique challenge slug")
  },
)

/** Build the playable rounds (line + shuffled 3 choices) for a frozen bar set. */
async function buildRounds(barIds: number[]): Promise<ChallengeRound[]> {
  if (barIds.length === 0) return []
  const bars = await db
    .select({
      punchlineId: punchlines.id,
      line: punchlines.line,
      artistId: songs.artistId,
      distractor1Id: punchlines.distractor1Id,
      distractor2Id: punchlines.distractor2Id,
      submittedByHandle: users.handle,
    })
    .from(punchlines)
    .innerJoin(songs, eq(songs.id, punchlines.songId))
    .leftJoin(users, eq(users.clerkId, punchlines.submittedByClerkId))
    .where(inArray(punchlines.id, barIds))

  const byId = new Map(bars.map((b) => [b.punchlineId, b]))
  const artistIds = new Set<number>()
  for (const b of bars) {
    artistIds.add(b.artistId)
    artistIds.add(b.distractor1Id)
    artistIds.add(b.distractor2Id)
  }
  const artistRows = await db
    .select({ id: artists.id, name: artists.name, imageUrl: artists.imageUrl })
    .from(artists)
    .where(inArray(artists.id, [...artistIds]))
  const artistById = new Map(artistRows.map((a) => [a.id, a]))

  // Preserve the frozen order from barIds.
  const rounds: ChallengeRound[] = []
  for (const id of barIds) {
    const b = byId.get(id)
    if (!b) continue
    const ids = [b.artistId, b.distractor1Id, b.distractor2Id]
    const choices = shuffle(
      ids
        .map((aid) => artistById.get(aid))
        .filter((a): a is ChallengeChoice => Boolean(a)),
    )
    rounds.push({
      punchlineId: b.punchlineId,
      line: b.line,
      choices,
      submittedByHandle: b.submittedByHandle ?? null,
    })
  }
  return rounds
}

async function loadBoard(
  challengeId: number,
  creatorClerkId: string,
  levels: Awaited<ReturnType<typeof loadLevels>>,
): Promise<ChallengeBoardEntry[]> {
  const rows = await db
    .select({
      clerkId: challengeAttempts.clerkId,
      handle: users.handle,
      imageUrl: users.imageUrl,
      totalXp: users.totalXp,
      correctCount: challengeAttempts.correctCount,
      solveMs: challengeAttempts.solveMs,
    })
    .from(challengeAttempts)
    .innerJoin(users, eq(users.clerkId, challengeAttempts.clerkId))
    .where(eq(challengeAttempts.challengeId, challengeId))
    .orderBy(desc(challengeAttempts.correctCount), asc(challengeAttempts.solveMs))

  return rows
    .filter((r) => r.handle)
    .map((r, i) => ({
      rank: i + 1,
      handle: r.handle as string,
      imageUrl: r.imageUrl,
      level: levelFor(r.totalXp, levels).current,
      correctCount: r.correctCount,
      solveMs: r.solveMs,
      isCreator: r.clerkId === creatorClerkId,
    }))
}

export type ChallengeView =
  | { found: false }
  | {
      found: true
      slug: string
      creatorHandle: string | null
      viewerHandle: string | null
      size: number
      rounds: ChallengeRound[]
      viewerAttempt: { correctCount: number; solveMs: number } | null
      board: ChallengeBoardEntry[]
    }

/** Load a challenge by slug: playable rounds + current board + viewer's locked attempt. */
export const getChallengeFn = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => d)
  .handler(async ({ data }): Promise<ChallengeView> => {
    const [challenge] = await db
      .select()
      .from(challenges)
      .where(eq(challenges.slug, data.slug))
      .limit(1)
    if (!challenge) return { found: false }

    const levels = await loadLevels()
    const viewerId = await callerClerkId()

    const [rounds, board, creator] = await Promise.all([
      buildRounds(challenge.barIds),
      loadBoard(challenge.id, challenge.creatorClerkId, levels),
      db
        .select({ handle: users.handle })
        .from(users)
        .where(eq(users.clerkId, challenge.creatorClerkId))
        .limit(1),
    ])

    let viewerAttempt: { correctCount: number; solveMs: number } | null = null
    let viewerHandle: string | null = null
    if (viewerId) {
      const [u] = await db
        .select({ handle: users.handle })
        .from(users)
        .where(eq(users.clerkId, viewerId))
        .limit(1)
      viewerHandle = u?.handle ?? null
      const [row] = await db
        .select({ correctCount: challengeAttempts.correctCount, solveMs: challengeAttempts.solveMs })
        .from(challengeAttempts)
        .where(
          and(
            eq(challengeAttempts.challengeId, challenge.id),
            eq(challengeAttempts.clerkId, viewerId),
          ),
        )
        .limit(1)
      viewerAttempt = row ?? null
    }

    return {
      found: true,
      slug: challenge.slug,
      creatorHandle: creator[0]?.handle ?? null,
      viewerHandle,
      size: challenge.barIds.length,
      rounds,
      viewerAttempt,
      board,
    }
  })

export type SubmitChallengeResult =
  | { found: false }
  | {
      found: true
      result: { correctCount: number; solveMs: number; recap: ChallengeRecapBar[] }
      persisted: boolean
      /** The actually-stored row (may be a pre-existing locked attempt). */
      locked: { correctCount: number; solveMs: number } | null
      alreadyLocked: boolean
      viewerHandle: string | null
      board: ChallengeBoardEntry[]
    }

/**
 * Validate + score a challenge run server-side (no XP). Persists for signed-in
 * users via first-attempt-lock (onConflictDoNothing); anonymous runs are scored
 * but not persisted (the client holds them and re-submits after sign-up).
 */
export const submitChallengeAttemptFn = createServerFn({ method: "POST" })
  .inputValidator((d: { slug: string; answers: ChallengeAttemptInput[] }) => d)
  .handler(async ({ data }): Promise<SubmitChallengeResult> => {
    const [challenge] = await db
      .select()
      .from(challenges)
      .where(eq(challenges.slug, data.slug))
      .limit(1)
    if (!challenge) return { found: false }

    const levels = await loadLevels()
    const viewerId = await callerClerkId()
    const revealAnswers = Boolean(viewerId)

    // Authoritative correct answers for the challenge's frozen bars.
    const bars = await db
      .select({
        punchlineId: punchlines.id,
        line: punchlines.line,
        artistId: songs.artistId,
        artistName: artists.name,
        submittedByHandle: users.handle,
      })
      .from(punchlines)
      .innerJoin(songs, eq(songs.id, punchlines.songId))
      .innerJoin(artists, eq(artists.id, songs.artistId))
      .leftJoin(users, eq(users.clerkId, punchlines.submittedByClerkId))
      .where(inArray(punchlines.id, challenge.barIds))
    const barById = new Map(bars.map((b) => [b.punchlineId, b]))
    const answerById = new Map(data.answers.map((a) => [a.punchlineId, a]))

    let correctCount = 0
    let solveMs = 0
    const recap: ChallengeRecapBar[] = []
    for (const id of challenge.barIds) {
      const bar = barById.get(id)
      if (!bar) continue
      const ans = answerById.get(id)
      const chosenArtistId = ans?.artistId ?? null
      const correct = chosenArtistId === bar.artistId
      if (correct) correctCount++
      solveMs += Math.min(MAX_BAR_MS, Math.max(MIN_BAR_MS, Math.round(ans?.ms ?? MAX_BAR_MS)))
      recap.push({
        punchlineId: id,
        line: bar.line,
        correctArtistId: revealAnswers ? bar.artistId : null,
        correctArtistName: revealAnswers ? bar.artistName : null,
        chosenArtistId,
        correct: revealAnswers ? correct : null,
        submittedByHandle: bar.submittedByHandle ?? null,
      })
    }

    const result = { correctCount, solveMs, recap: revealAnswers ? recap : [] }

    if (!viewerId) {
      // Anonymous: scored but not persisted; client shows the sign-up wall.
      const board = await loadBoard(challenge.id, challenge.creatorClerkId, levels)
      return {
        found: true,
        result: { correctCount: 0, solveMs, recap: [] },
        persisted: false,
        locked: null,
        alreadyLocked: false,
        viewerHandle: null,
        board,
      }
    }

    await ensureUser(viewerId)
    // First-attempt-lock: keep the earliest attempt; replays never overwrite.
    await db
      .insert(challengeAttempts)
      .values({ challengeId: challenge.id, clerkId: viewerId, correctCount, solveMs })
      .onConflictDoNothing()

    const [stored] = await db
      .select({ correctCount: challengeAttempts.correctCount, solveMs: challengeAttempts.solveMs })
      .from(challengeAttempts)
      .where(
        and(
          eq(challengeAttempts.challengeId, challenge.id),
          eq(challengeAttempts.clerkId, viewerId),
        ),
      )
      .limit(1)
    const locked = stored ?? { correctCount, solveMs }
    const alreadyLocked = locked.correctCount !== correctCount || locked.solveMs !== solveMs

    const [vh] = await db
      .select({ handle: users.handle })
      .from(users)
      .where(eq(users.clerkId, viewerId))
      .limit(1)

    const board = await loadBoard(challenge.id, challenge.creatorClerkId, levels)
    return {
      found: true,
      result,
      persisted: true,
      locked,
      alreadyLocked,
      viewerHandle: vh?.handle ?? null,
      board,
    }
  })
