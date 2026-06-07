import { randomBytes } from "node:crypto"
import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm"
import {
  artists,
  challengeAttempts,
  challenges,
  punchlines,
  songs,
  users,
} from "@workspace/db"

import { getActor } from "./auth"
import { db } from "./db"
import { hiddenDailyIds } from "./daily-pool"
import { getServerSessionId } from "./log"
import { ensureUser, levelFor, loadLevels } from "./xp"
import type { LevelInfo } from "./xp"

/**
 * Challenges = a dedicated 5-bar artist-guess run, frozen into a shareable
 * "beat my score" board (PUN-8/9/10). No XP is granted in challenges — it's a
 * competitive mode, not the XP grind. Answers are validated server-side (the
 * correct answer is never sent to the client) and revealed only in the post-
 * submit recap. First attempt locks the board row.
 */

export const CHALLENGE_SIZE = 5
const MAX_BAR_MS = 120_000

export type ChallengeChoice = {
  id: number
  name: string
  imageUrl: string | null
}
export type ChallengeRound = {
  punchlineId: number
  line: string
  choices: Array<ChallengeChoice>
  /** Contributor handle if this bar came from a submission (PUN-67); null = admin-authored. */
  submittedByHandle: string | null
}

export type ChallengeBoardEntry = {
  rank: number
  handle: string
  /** Anonymous player (no account) — shown by display name, no @ / level chrome. */
  isGuest: boolean
  imageUrl: string | null
  level: LevelInfo
  correctCount: number
  solveMs: number
  isCreator: boolean
}

export type ChallengeAttemptInput = {
  punchlineId: number
  artistId: number
  ms: number
}

export type ChallengeRecapBar = {
  punchlineId: number
  line: string
  correctArtistId: number
  correctArtistName: string
  chosenArtistId: number | null
  correct: boolean
  /** Contributor handle if this bar came from a submission (PUN-67); null = admin-authored. */
  submittedByHandle: string | null
}

async function callerClerkId(): Promise<string | null> {
  const result = await getActor(getRequest())
  return result?.actor.kind === "clerk" ? result.actor.userId : null
}

function shuffle<T>(arr: Array<T>): Array<T> {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

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
 * scheduled), freeze them, return the slug. Friction-free for ANYONE (PUN-123):
 * a signed-in creator owns it by clerkId; an anonymous creator is keyed by their
 * pq_sid session and stitched onto an account if/when they sign up. The creator's
 * score lands when they play their own /c/$slug gauntlet.
 */
export const createChallengeFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ slug: string }> => {
    const creatorId = await callerClerkId()
    const creatorSession = getServerSessionId()
    // Need at least one stable key to own the board; pq_sid is set on first load.
    if (!creatorId && !creatorSession)
      throw new Error("No session — cannot create a challenge")
    if (creatorId) await ensureUser(creatorId)

    const rows = await db
      .select({ id: punchlines.id })
      .from(punchlines)
      .where(
        and(
          eq(punchlines.active, true),
          eq(punchlines.reviewed, true),
          sql`${punchlines.id} NOT IN ${hiddenDailyIds()}`
        )
      )
      .orderBy(sql`random()`)
      .limit(CHALLENGE_SIZE)
    if (rows.length < CHALLENGE_SIZE)
      throw new Error("Not enough bars to build a challenge")
    const barIds = rows.map((r) => r.id)

    // Insert with a fresh slug; retry on the (very unlikely) unique collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = makeSlug()
      try {
        await db.insert(challenges).values({
          slug,
          creatorClerkId: creatorId ?? null,
          creatorSessionId: creatorId ? null : creatorSession,
          barIds,
        })
        return { slug }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (
          msg.includes("slug") ||
          msg.includes("23505") ||
          msg.includes("duplicate")
        )
          continue
        throw err
      }
    }
    throw new Error("Could not generate a unique challenge slug")
  }
)

/** Build the playable rounds (line + shuffled 3 choices) for a frozen bar set. */
async function buildRounds(
  barIds: Array<number>
): Promise<Array<ChallengeRound>> {
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
  const rounds: Array<ChallengeRound> = []
  for (const id of barIds) {
    const b = byId.get(id)
    if (!b) continue
    const ids = [b.artistId, b.distractor1Id, b.distractor2Id]
    const choices = shuffle(
      ids
        .map((aid) => artistById.get(aid))
        .filter((a): a is ChallengeChoice => Boolean(a))
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
  creatorClerkId: string | null,
  creatorSessionId: string | null,
  levels: Awaited<ReturnType<typeof loadLevels>>
): Promise<Array<ChallengeBoardEntry>> {
  // leftJoin so anonymous attempts (no users row) still appear on the board.
  const rows = await db
    .select({
      clerkId: challengeAttempts.clerkId,
      sessionId: challengeAttempts.sessionId,
      displayName: challengeAttempts.displayName,
      handle: users.handle,
      imageUrl: users.imageUrl,
      totalXp: users.totalXp,
      correctCount: challengeAttempts.correctCount,
      solveMs: challengeAttempts.solveMs,
    })
    .from(challengeAttempts)
    .leftJoin(users, eq(users.clerkId, challengeAttempts.clerkId))
    .where(eq(challengeAttempts.challengeId, challengeId))
    .orderBy(
      desc(challengeAttempts.correctCount),
      asc(challengeAttempts.solveMs)
    )

  return rows
    .filter((r) => r.handle || r.displayName)
    .map((r, i) => ({
      rank: i + 1,
      handle: (r.handle ?? r.displayName) as string,
      isGuest: r.clerkId == null,
      imageUrl: r.imageUrl,
      level: levelFor(r.totalXp ?? 0, levels).current,
      correctCount: r.correctCount,
      solveMs: r.solveMs,
      isCreator:
        (r.clerkId != null && r.clerkId === creatorClerkId) ||
        (r.sessionId != null && r.sessionId === creatorSessionId),
    }))
}

export type ChallengeView =
  | { found: false }
  | {
      found: true
      slug: string
      creatorHandle: string | null
      /** Creator's score on their own gauntlet — the "beat X/5" target. */
      creatorScore: number | null
      viewerHandle: string | null
      /** True when the current visitor is the challenge's creator (their session
       *  or account owns it) — drives the "set your gauntlet" vs "X dares you" framing. */
      viewerIsCreator: boolean
      size: number
      rounds: Array<ChallengeRound>
      viewerAttempt: { correctCount: number; solveMs: number } | null
      board: Array<ChallengeBoardEntry>
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
    const viewerSession = getServerSessionId()

    const [rounds, board] = await Promise.all([
      buildRounds(challenge.barIds),
      loadBoard(
        challenge.id,
        challenge.creatorClerkId,
        challenge.creatorSessionId,
        levels
      ),
    ])

    // Creator identity + target score derived from the board (works for anon
    // creators, who have no users row but do have a named board attempt).
    const creatorEntry = board.find((e) => e.isCreator) ?? null
    const viewerIsCreator =
      (viewerId != null && viewerId === challenge.creatorClerkId) ||
      (viewerSession != null && viewerSession === challenge.creatorSessionId)

    // The viewer's own locked attempt (account → by clerkId; anon → by session).
    let viewerAttempt: { correctCount: number; solveMs: number } | null = null
    let viewerHandle: string | null = null
    if (viewerId) {
      const [u] = await db
        .select({ handle: users.handle })
        .from(users)
        .where(eq(users.clerkId, viewerId))
        .limit(1)
      viewerHandle = u?.handle ?? null
    }
    if (viewerId || viewerSession) {
      const [row] = await db
        .select({
          correctCount: challengeAttempts.correctCount,
          solveMs: challengeAttempts.solveMs,
          displayName: challengeAttempts.displayName,
        })
        .from(challengeAttempts)
        .where(
          and(
            eq(challengeAttempts.challengeId, challenge.id),
            viewerId
              ? eq(challengeAttempts.clerkId, viewerId)
              : eq(challengeAttempts.sessionId, viewerSession as string)
          )
        )
        .limit(1)
      if (row) {
        viewerAttempt = { correctCount: row.correctCount, solveMs: row.solveMs }
        if (!viewerHandle) viewerHandle = row.displayName ?? null
      }
    }

    return {
      found: true,
      slug: challenge.slug,
      creatorHandle: creatorEntry?.handle ?? null,
      creatorScore: creatorEntry?.correctCount ?? null,
      viewerHandle,
      viewerIsCreator,
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
      result: {
        correctCount: number
        solveMs: number
        recap: Array<ChallengeRecapBar>
      }
      persisted: boolean
      /** The actually-stored row (may be a pre-existing locked attempt). */
      locked: { correctCount: number; solveMs: number } | null
      alreadyLocked: boolean
      viewerHandle: string | null
      board: Array<ChallengeBoardEntry>
    }

/**
 * Validate + score a challenge run server-side (no XP). Persists for signed-in
 * users via first-attempt-lock (onConflictDoNothing); anonymous runs are scored
 * but not persisted (the client holds them and re-submits after sign-up).
 */
export const submitChallengeAttemptFn = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      slug: string
      answers: Array<ChallengeAttemptInput>
      /** Board display name for an anonymous player (PUN-123). Ignored for accounts. */
      displayName?: string
    }) => d
  )
  .handler(async ({ data }): Promise<SubmitChallengeResult> => {
    const [challenge] = await db
      .select()
      .from(challenges)
      .where(eq(challenges.slug, data.slug))
      .limit(1)
    if (!challenge) return { found: false }

    const levels = await loadLevels()

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
    const recap: Array<ChallengeRecapBar> = []
    for (const id of challenge.barIds) {
      const bar = barById.get(id)
      if (!bar) continue
      const ans = answerById.get(id)
      const chosenArtistId = ans?.artistId ?? null
      const correct = chosenArtistId === bar.artistId
      if (correct) correctCount++
      solveMs += Math.min(
        MAX_BAR_MS,
        Math.max(0, Math.round(ans?.ms ?? MAX_BAR_MS))
      )
      recap.push({
        punchlineId: id,
        line: bar.line,
        correctArtistId: bar.artistId,
        correctArtistName: bar.artistName,
        chosenArtistId,
        correct,
        submittedByHandle: bar.submittedByHandle ?? null,
      })
    }

    const result = { correctCount, solveMs, recap }
    const viewerId = await callerClerkId()
    const viewerSession = getServerSessionId()
    const trimmedName = (data.displayName ?? "").trim().slice(0, 40)
    // Anon attempts need a board name; without one we score-only and let the
    // client collect a name and re-submit (PUN-123).
    const canPersistAnon =
      !viewerId && !!viewerSession && trimmedName.length > 0

    if (!viewerId && !canPersistAnon) {
      const board = await loadBoard(
        challenge.id,
        challenge.creatorClerkId,
        challenge.creatorSessionId,
        levels
      )
      return {
        found: true,
        result,
        persisted: false,
        locked: null,
        alreadyLocked: false,
        viewerHandle: null,
        board,
      }
    }

    if (viewerId) await ensureUser(viewerId)

    // First-attempt-lock: keep the earliest attempt; replays never overwrite.
    // Existence check (not ON CONFLICT) — clean against the split partial indexes.
    const actorWhere = and(
      eq(challengeAttempts.challengeId, challenge.id),
      viewerId
        ? eq(challengeAttempts.clerkId, viewerId)
        : eq(challengeAttempts.sessionId, viewerSession as string)
    )
    const [existing] = await db
      .select({
        correctCount: challengeAttempts.correctCount,
        solveMs: challengeAttempts.solveMs,
      })
      .from(challengeAttempts)
      .where(actorWhere)
      .limit(1)
    if (!existing) {
      try {
        await db.insert(challengeAttempts).values(
          viewerId
            ? { challengeId: challenge.id, clerkId: viewerId, correctCount, solveMs }
            : {
                challengeId: challenge.id,
                sessionId: viewerSession as string,
                displayName: trimmedName,
                correctCount,
                solveMs,
              }
        )
      } catch {
        // Lost a concurrent first-attempt race — the stored row wins, re-read below.
      }
    }

    const [stored] = await db
      .select({
        correctCount: challengeAttempts.correctCount,
        solveMs: challengeAttempts.solveMs,
      })
      .from(challengeAttempts)
      .where(actorWhere)
      .limit(1)
    const locked = stored ?? { correctCount, solveMs }
    const alreadyLocked =
      locked.correctCount !== correctCount || locked.solveMs !== solveMs

    let viewerHandle: string | null = trimmedName || null
    if (viewerId) {
      const [vh] = await db
        .select({ handle: users.handle })
        .from(users)
        .where(eq(users.clerkId, viewerId))
        .limit(1)
      viewerHandle = vh?.handle ?? null
    }

    const board = await loadBoard(
      challenge.id,
      challenge.creatorClerkId,
      challenge.creatorSessionId,
      levels
    )
    return {
      found: true,
      result,
      persisted: true,
      locked,
      alreadyLocked,
      viewerHandle,
      board,
    }
  })

export type MyChallenge = {
  slug: string
  creatorScore: number | null
  players: number
  /** Someone has beaten the creator's score — the "defend your throne" hook. */
  beaten: boolean
  /** Top non-creator name, for "X beat your 4/5". */
  topChallenger: string | null
}

/**
 * The current visitor's own challenges (PUN-123) — by account or anon session —
 * for the home "you've been beaten, defend your throne" strip. Cheap: capped to
 * the few most recent, board loaded per challenge. The return leg's capture hook.
 */
export const getMyChallengesFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ items: Array<MyChallenge> }> => {
    const clerkId = await callerClerkId()
    const session = getServerSessionId()
    const conds = []
    if (clerkId) conds.push(eq(challenges.creatorClerkId, clerkId))
    if (session) conds.push(eq(challenges.creatorSessionId, session))
    if (conds.length === 0) return { items: [] }

    const mine = await db
      .select({
        id: challenges.id,
        slug: challenges.slug,
        creatorClerkId: challenges.creatorClerkId,
        creatorSessionId: challenges.creatorSessionId,
      })
      .from(challenges)
      .where(conds.length === 1 ? conds[0] : or(...conds))
      .orderBy(desc(challenges.createdAt))
      .limit(6)
    if (mine.length === 0) return { items: [] }

    const levels = await loadLevels()
    const items = await Promise.all(
      mine.map(async (c): Promise<MyChallenge> => {
        const board = await loadBoard(
          c.id,
          c.creatorClerkId,
          c.creatorSessionId,
          levels
        )
        const creator = board.find((e) => e.isCreator) ?? null
        const others = board.filter((e) => !e.isCreator)
        const beaten =
          creator != null &&
          others.some(
            (e) =>
              e.correctCount > creator.correctCount ||
              (e.correctCount === creator.correctCount &&
                e.solveMs < creator.solveMs)
          )
        return {
          slug: c.slug,
          creatorScore: creator?.correctCount ?? null,
          players: others.length,
          beaten,
          topChallenger: others[0]?.handle ?? null,
        }
      })
    )
    return { items }
  }
)

/**
 * Stitch an anonymous creator's challenges + board attempts onto their account
 * when they sign up (PUN-123) — so "lock your throne" actually attaches the
 * board identity they built while anonymous. Called from the handle-claim path.
 * Idempotent; never throws into the claim (caller catches).
 */
export async function stitchAnonChallengesOnSignup(
  clerkId: string,
  sessionId: string | null
): Promise<{ challenges: number; attempts: number }> {
  if (!sessionId) return { challenges: 0, attempts: 0 }

  // Own the boards this session created.
  const ch = await db
    .update(challenges)
    .set({ creatorClerkId: clerkId, creatorSessionId: null })
    .where(
      and(
        eq(challenges.creatorSessionId, sessionId),
        sql`${challenges.creatorClerkId} is null`
      )
    )
    .returning({ id: challenges.id })

  // Convert this session's anon attempts to account attempts, but only where the
  // account doesn't already hold an attempt on that challenge (the clerk partial
  // unique would otherwise reject it; keep the existing account row).
  const at = await db
    .update(challengeAttempts)
    .set({ clerkId, sessionId: null, displayName: null })
    .where(
      and(
        eq(challengeAttempts.sessionId, sessionId),
        sql`${challengeAttempts.clerkId} is null`,
        sql`not exists (select 1 from ${challengeAttempts} a2 where a2.challenge_id = ${challengeAttempts.challengeId} and a2.clerk_id = ${clerkId})`
      )
    )
    .returning({ id: challengeAttempts.id })

  return { challenges: ch.length, attempts: at.length }
}
