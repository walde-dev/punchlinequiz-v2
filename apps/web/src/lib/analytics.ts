import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm"

import { artists, gameEvents, punchlines, songs } from "@workspace/db"

import { db } from "./db"
import { requireAdmin } from "./auth"

/**
 * Admin analytics, computed live over the `game_events` log (joined to the
 * content tables). No rollups — at our scale a name-filtered, date-bounded
 * scan is instant, and the `game_events_name_created_at` index keeps it cheap.
 *
 * Everything excludes internal/admin sessions (`props.internal === true`, set
 * by the play surfaces for admin tabs). Per-round events are grouped by their
 * `attempt_id` so a player's three cloze tries collapse into one attempt.
 */

// ─── Public result shapes ────────────────────────────────────────────────────

export type ModeStat = {
  /** Distinct attempts that reached a verdict in this mode. */
  plays: number
  correct: number
  /** correct / plays, or null when there are no plays yet. */
  rate: number | null
}

export type ClozeStat = ModeStat & {
  /** Mean number of cloze submissions per attempt (1–3), or null. */
  avgTries: number | null
}

export type SongStat = ModeStat & {
  skips: number
  /** skips / (plays + skips). */
  skipRate: number | null
}

export type LineRow = {
  punchlineId: number
  line: string
  artistId: number
  artistName: string
  songTitle: string
  active: boolean
  hasCloze: boolean
  /** round_started attempts (regular play reach). */
  served: number
  /** Served attempts that never produced a reveal (player bailed). */
  abandoned: number
  abandonRate: number | null
  distinctPlayers: number
  artist: ModeStat
  cloze: ClozeStat
  song: SongStat
  daily: ModeStat
  /** Blended artist+cloze+daily-artist correct rate — the headline difficulty. */
  overallRate: number | null
  /** Denominator behind overallRate (sample size). */
  overallPlays: number
}

export type ConfusionPair = {
  artistId: number
  artistName: string
  count: number
}

export type ArtistRow = {
  artistId: number
  artistName: string
  slug: string
  lineCount: number
  /** round_started attempts across this artist's lines. */
  served: number
  distinctPlayers: number
  /** Correct artist-ID rate across this artist's lines (the fame proxy). */
  recognition: ModeStat
  /** Distinct sessions that actively chose this artist (filtered play + restarts). */
  pullSessions: number
  /** "Play this artist again" restart clicks. */
  pullRestarts: number
  /** When this artist was the answer, who players guessed instead. */
  confusedWith: Array<ConfusionPair>
  /** Times this artist was picked as a wrong answer on someone else's line. */
  foolsAsDistractor: number
}

export type HistogramBucket = { from: number; to: number; count: number }
export type DayPoint = { date: string; plays: number }

export type AnalyticsTotals = {
  sessions: number
  plays: number
  linesTracked: number
}

export type AnalyticsBundle = {
  totals: AnalyticsTotals
  lines: Array<LineRow>
  artists: Array<ArtistRow>
  histogram: Array<HistogramBucket>
  playsByDay: Array<DayPoint>
}

export type FunnelStage = { key: string; count: number }

export type DistractorPick = {
  artistId: number
  artistName: string
  picks: number
  isCorrectArtist: boolean
}

export type LineDetail = {
  punchlineId: number
  line: string
  clozePrompt: string | null
  perfectSolution: Array<string>
  artistId: number
  artistName: string
  songTitle: string
  active: boolean
  served: number
  distinctPlayers: number
  artist: ModeStat
  cloze: ClozeStat
  song: SongStat
  daily: ModeStat
  funnel: Array<FunnelStage>
  distractors: Array<DistractorPick>
}

export type ArtistDetail = {
  artistId: number
  artistName: string
  slug: string
  served: number
  distinctPlayers: number
  recognition: ModeStat
  pullSessions: number
  pullRestarts: number
  confusedWith: Array<ConfusionPair>
  foolsAsDistractor: number
  lines: Array<LineRow>
}

// ─── Inputs ──────────────────────────────────────────────────────────────────

export type DateRange = { from?: string | null; to?: string | null }

// ─── Event names we read ───────────────────────────────────────────────────────

const EVENT_NAMES = [
  "round_started",
  "answer_revealed",
  "cloze_submitted",
  "cloze_revealed",
  "song_guess_revealed",
  "daily_artist_revealed",
  "daily_song_revealed",
  "session_restart_clicked",
] as const

type RawEvent = {
  sessionId: string
  name: string
  props: Record<string, unknown>
  createdAt: Date
}

// ─── Coercion helpers (props is untyped JSON) ──────────────────────────────────

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v)
  return null
}
function bool(v: unknown): boolean {
  return v === true || v === "true"
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null
}
function rate(correct: number, plays: number): number | null {
  return plays > 0 ? correct / plays : null
}

/** Stable per-attempt key — prefers the real attempt_id, falls back for safety. */
function attemptKey(e: RawEvent, punchlineId: number | null): string {
  return str(e.props.attempt_id) ?? `${e.sessionId}:${punchlineId ?? "?"}:${e.name}`
}

// ─── DB access ─────────────────────────────────────────────────────────────────

async function fetchEvents(range: DateRange): Promise<Array<RawEvent>> {
  const from = range.from ? new Date(`${range.from}T00:00:00.000Z`) : null
  const to = range.to ? new Date(`${range.to}T23:59:59.999Z`) : null
  const rows = await db
    .select({
      sessionId: gameEvents.sessionId,
      name: gameEvents.name,
      props: gameEvents.props,
      createdAt: gameEvents.createdAt,
    })
    .from(gameEvents)
    .where(
      and(
        inArray(gameEvents.name, EVENT_NAMES as unknown as Array<string>),
        from ? gte(gameEvents.createdAt, from) : undefined,
        to ? lte(gameEvents.createdAt, to) : undefined,
        // Drop admin/QA sessions. json `->>` yields the text 'true' for the flag.
        sql`(${gameEvents.props} ->> 'internal') is distinct from 'true'`,
      ),
    )
  return rows as Array<RawEvent>
}

type LineMeta = {
  punchlineId: number
  line: string
  clozePrompt: string | null
  perfectSolution: Array<string>
  active: boolean
  distractor1Id: number
  distractor2Id: number
  songTitle: string
  artistId: number
  artistName: string
  artistSlug: string
}

async function fetchLineMeta(): Promise<Array<LineMeta>> {
  const rows = await db
    .select({
      punchlineId: punchlines.id,
      line: punchlines.line,
      clozePrompt: punchlines.clozePrompt,
      perfectSolution: punchlines.perfectSolution,
      active: punchlines.active,
      distractor1Id: punchlines.distractor1Id,
      distractor2Id: punchlines.distractor2Id,
      songTitle: songs.title,
      artistId: artists.id,
      artistName: artists.name,
      artistSlug: artists.slug,
    })
    .from(punchlines)
    .innerJoin(songs, eq(punchlines.songId, songs.id))
    .innerJoin(artists, eq(songs.artistId, artists.id))
  return rows as Array<LineMeta>
}

async function fetchArtistNames(): Promise<Map<number, string>> {
  const rows = await db.select({ id: artists.id, name: artists.name }).from(artists)
  return new Map(rows.map((r) => [r.id, r.name]))
}

// ─── Per-line aggregation ──────────────────────────────────────────────────────

type LineAcc = {
  served: Set<string>
  revealed: Set<string>
  sessions: Set<string>
  artist: { attempts: Map<string, boolean> }
  cloze: { tries: Map<string, number>; solved: Map<string, boolean> }
  song: Map<string, { correct: boolean; skipped: boolean }>
  dailyArtist: { plays: number; correct: number }
  dailySong: { plays: number; correct: number; skips: number }
  /** wrong artist picks → { pickedArtistId: count } (artist + daily-artist modes). */
  wrongPicks: Map<number, number>
  /** correct artist picks by artistId (for distractor breakdown denominator). */
  correctPicks: Map<number, number>
}

function newLineAcc(): LineAcc {
  return {
    served: new Set(),
    revealed: new Set(),
    sessions: new Set(),
    artist: { attempts: new Map() },
    cloze: { tries: new Map(), solved: new Map() },
    song: new Map(),
    dailyArtist: { plays: 0, correct: 0 },
    dailySong: { plays: 0, correct: 0, skips: 0 },
    wrongPicks: new Map(),
    correctPicks: new Map(),
  }
}

function bump(map: Map<number, number>, key: number, by = 1): void {
  map.set(key, (map.get(key) ?? 0) + by)
}

/** Fold the raw events into a per-punchline accumulator. */
function accumulate(events: Array<RawEvent>): Map<number, LineAcc> {
  const byLine = new Map<number, LineAcc>()
  const get = (id: number): LineAcc => {
    let acc = byLine.get(id)
    if (!acc) {
      acc = newLineAcc()
      byLine.set(id, acc)
    }
    return acc
  }

  for (const e of events) {
    const pid = num(e.props.punchline_id)
    if (e.name === "session_restart_clicked") continue // handled in artist aggregation
    if (pid === null) continue
    const acc = get(pid)
    const key = attemptKey(e, pid)
    acc.sessions.add(e.sessionId)

    switch (e.name) {
      case "round_started":
        acc.served.add(key)
        break
      case "answer_revealed": {
        acc.revealed.add(key)
        const isCorrect = bool(e.props.is_correct)
        acc.artist.attempts.set(key, isCorrect)
        const picked = num(e.props.artist_id)
        if (picked !== null) {
          if (isCorrect) bump(acc.correctPicks, picked)
          else bump(acc.wrongPicks, picked)
        }
        break
      }
      case "cloze_submitted":
        acc.cloze.tries.set(key, (acc.cloze.tries.get(key) ?? 0) + 1)
        break
      case "cloze_revealed": {
        acc.revealed.add(key)
        const solved = acc.cloze.solved.get(key) ?? false
        acc.cloze.solved.set(key, solved || bool(e.props.is_correct))
        // Ensure a tries entry exists even if cloze_submitted was lost.
        if (!acc.cloze.tries.has(key)) acc.cloze.tries.set(key, 1)
        break
      }
      case "song_guess_revealed":
        acc.song.set(key, { correct: bool(e.props.is_correct), skipped: bool(e.props.skipped) })
        break
      case "daily_artist_revealed": {
        acc.dailyArtist.plays += 1
        const isCorrect = bool(e.props.is_correct)
        if (isCorrect) acc.dailyArtist.correct += 1
        const picked = num(e.props.artist_id)
        if (picked !== null) {
          if (isCorrect) bump(acc.correctPicks, picked)
          else bump(acc.wrongPicks, picked)
        }
        break
      }
      case "daily_song_revealed":
        acc.dailySong.plays += 1
        if (bool(e.props.is_correct)) acc.dailySong.correct += 1
        if (bool(e.props.skipped)) acc.dailySong.skips += 1
        break
    }
  }
  return byLine
}

function lineRowFrom(meta: LineMeta, acc: LineAcc | undefined): LineRow {
  const a = acc ?? newLineAcc()

  const artistPlays = a.artist.attempts.size
  const artistCorrect = [...a.artist.attempts.values()].filter(Boolean).length

  const clozePlays = a.cloze.solved.size
  const clozeCorrect = [...a.cloze.solved.values()].filter(Boolean).length
  const triesTotal = [...a.cloze.tries.values()].reduce((s, n) => s + n, 0)
  const avgTries = clozePlays > 0 ? triesTotal / clozePlays : null

  let songPlays = 0
  let songCorrect = 0
  let songSkips = 0
  for (const s of a.song.values()) {
    if (s.skipped) songSkips += 1
    else {
      songPlays += 1
      if (s.correct) songCorrect += 1
    }
  }

  const served = a.served.size
  const abandoned = [...a.served].filter((k) => !a.revealed.has(k)).length

  // Headline difficulty: blend the artist-ID-style modes (artist + daily-artist)
  // with cloze, since all three are "did they solve the bar" signals.
  const overallCorrect = artistCorrect + clozeCorrect + a.dailyArtist.correct
  const overallPlays = artistPlays + clozePlays + a.dailyArtist.plays

  return {
    punchlineId: meta.punchlineId,
    line: meta.line,
    artistId: meta.artistId,
    artistName: meta.artistName,
    songTitle: meta.songTitle,
    active: meta.active,
    hasCloze: meta.clozePrompt !== null,
    served,
    abandoned,
    abandonRate: rate(abandoned, served),
    distinctPlayers: a.sessions.size,
    artist: { plays: artistPlays, correct: artistCorrect, rate: rate(artistCorrect, artistPlays) },
    cloze: {
      plays: clozePlays,
      correct: clozeCorrect,
      rate: rate(clozeCorrect, clozePlays),
      avgTries,
    },
    song: {
      plays: songPlays,
      correct: songCorrect,
      rate: rate(songCorrect, songPlays),
      skips: songSkips,
      skipRate: rate(songSkips, songPlays + songSkips),
    },
    daily: {
      plays: a.dailyArtist.plays,
      correct: a.dailyArtist.correct,
      rate: rate(a.dailyArtist.correct, a.dailyArtist.plays),
    },
    overallRate: rate(overallCorrect, overallPlays),
    overallPlays,
  }
}

// ─── Per-artist aggregation ────────────────────────────────────────────────────

function buildArtists(
  lineMeta: Array<LineMeta>,
  accByLine: Map<number, LineAcc>,
  events: Array<RawEvent>,
  artistNames: Map<number, string>,
): Array<ArtistRow> {
  // punchlineId → owning artist
  const ownerByLine = new Map<number, number>()
  for (const m of lineMeta) ownerByLine.set(m.punchlineId, m.artistId)

  // slug → artistId, for resolving artist_slug pull events
  const idBySlug = new Map<string, number>()
  for (const m of lineMeta) idBySlug.set(m.artistSlug, m.artistId)

  type ArtistAcc = {
    served: number
    sessions: Set<string>
    recogPlays: number
    recogCorrect: number
    pullSessions: Set<string>
    pullRestarts: number
    confusedWith: Map<number, number>
    foolsAsDistractor: number
    lineCount: number
  }
  const accByArtist = new Map<number, ArtistAcc>()
  const getArtist = (id: number): ArtistAcc => {
    let acc = accByArtist.get(id)
    if (!acc) {
      acc = {
        served: 0,
        sessions: new Set(),
        recogPlays: 0,
        recogCorrect: 0,
        pullSessions: new Set(),
        pullRestarts: 0,
        confusedWith: new Map(),
        foolsAsDistractor: 0,
        lineCount: 0,
      }
      accByArtist.set(id, acc)
    }
    return acc
  }

  // Seed every artist that owns a line so zero-traffic artists still appear.
  for (const m of lineMeta) getArtist(m.artistId).lineCount += 1

  // Roll per-line stats up to the owning artist.
  for (const m of lineMeta) {
    const lineAcc = accByLine.get(m.punchlineId)
    if (!lineAcc) continue
    const artistAcc = getArtist(m.artistId)
    artistAcc.served += lineAcc.served.size
    for (const s of lineAcc.sessions) artistAcc.sessions.add(s)

    // Recognition: artist-ID correctness (artist + daily-artist modes).
    artistAcc.recogPlays += lineAcc.artist.attempts.size + lineAcc.dailyArtist.plays
    artistAcc.recogCorrect +=
      [...lineAcc.artist.attempts.values()].filter(Boolean).length + lineAcc.dailyArtist.correct

    // Confusion: on this artist's line, wrong picks name the confused-with artist.
    for (const [pickedId, count] of lineAcc.wrongPicks) {
      bump(artistAcc.confusedWith, pickedId, count)
      // The picked artist gets credit for fooling players as a distractor.
      getArtist(pickedId).foolsAsDistractor += count
    }
  }

  // Pull: distinct sessions that chose an artist filter + restart clicks.
  for (const e of events) {
    const slug = str(e.props.artist_slug)
    if (!slug) continue
    const artistId = idBySlug.get(slug)
    if (artistId === undefined) continue
    if (e.name === "round_started") {
      getArtist(artistId).pullSessions.add(e.sessionId)
    } else if (e.name === "session_restart_clicked") {
      getArtist(artistId).pullSessions.add(e.sessionId)
      getArtist(artistId).pullRestarts += 1
    }
  }

  const rows: Array<ArtistRow> = []
  for (const [artistId, acc] of accByArtist) {
    const meta = lineMeta.find((m) => m.artistId === artistId)
    const confusedWith: Array<ConfusionPair> = [...acc.confusedWith.entries()]
      .map(([id, count]) => ({ artistId: id, artistName: artistNames.get(id) ?? `#${id}`, count }))
      .sort((x, y) => y.count - x.count)
      .slice(0, 5)
    rows.push({
      artistId,
      artistName: artistNames.get(artistId) ?? meta?.artistName ?? `#${artistId}`,
      slug: meta?.artistSlug ?? "",
      lineCount: acc.lineCount,
      served: acc.served,
      distinctPlayers: acc.sessions.size,
      recognition: {
        plays: acc.recogPlays,
        correct: acc.recogCorrect,
        rate: rate(acc.recogCorrect, acc.recogPlays),
      },
      pullSessions: acc.pullSessions.size,
      pullRestarts: acc.pullRestarts,
      confusedWith,
      foolsAsDistractor: acc.foolsAsDistractor,
    })
  }
  return rows
}

// ─── Overview helpers ──────────────────────────────────────────────────────────

function buildHistogram(lines: Array<LineRow>): Array<HistogramBucket> {
  const buckets: Array<HistogramBucket> = Array.from({ length: 10 }, (_, i) => ({
    from: i / 10,
    to: (i + 1) / 10,
    count: 0,
  }))
  for (const l of lines) {
    if (l.overallRate === null || l.overallPlays === 0) continue
    let idx = Math.floor(l.overallRate * 10)
    if (idx > 9) idx = 9
    if (idx < 0) idx = 0
    buckets[idx].count += 1
  }
  return buckets
}

function buildPlaysByDay(events: Array<RawEvent>): Array<DayPoint> {
  const counts = new Map<string, number>()
  for (const e of events) {
    if (e.name !== "round_started" && e.name !== "daily_artist_revealed") continue
    const day = e.createdAt.toISOString().slice(0, 10)
    counts.set(day, (counts.get(day) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([date, plays]) => ({ date, plays }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ─── Server functions ──────────────────────────────────────────────────────────

const validateRange = (d: DateRange): DateRange => ({
  from: typeof d.from === "string" ? d.from : null,
  to: typeof d.to === "string" ? d.to : null,
})

export const getAnalyticsBundle = createServerFn({ method: "GET" })
  .inputValidator(validateRange)
  .handler(async ({ data }): Promise<AnalyticsBundle> => {
    await requireAdmin(getRequest())
    const [events, lineMeta, artistNames] = await Promise.all([
      fetchEvents(data),
      fetchLineMeta(),
      fetchArtistNames(),
    ])
    const accByLine = accumulate(events)
    const lines = lineMeta
      .map((m) => lineRowFrom(m, accByLine.get(m.punchlineId)))
      .sort((a, b) => b.served - a.served)
    const artistRows = buildArtists(lineMeta, accByLine, events, artistNames).sort(
      (a, b) => b.served - a.served,
    )
    const sessions = new Set(events.map((e) => e.sessionId)).size
    const plays = events.filter(
      (e) => e.name === "round_started" || e.name === "daily_artist_revealed",
    ).length
    return {
      totals: { sessions, plays, linesTracked: lineMeta.length },
      lines,
      artists: artistRows,
      histogram: buildHistogram(lines),
      playsByDay: buildPlaysByDay(events),
    }
  })

export const getLineDetail = createServerFn({ method: "GET" })
  .inputValidator((d: DateRange & { punchlineId: number }) => ({
    ...validateRange(d),
    punchlineId: Number(d.punchlineId),
  }))
  .handler(async ({ data }): Promise<LineDetail | null> => {
    await requireAdmin(getRequest())
    const [events, lineMeta, artistNames] = await Promise.all([
      fetchEvents(data),
      fetchLineMeta(),
      fetchArtistNames(),
    ])
    const meta = lineMeta.find((m) => m.punchlineId === data.punchlineId)
    if (!meta) return null
    const lineEvents = events.filter((e) => num(e.props.punchline_id) === data.punchlineId)
    const acc = accumulate(lineEvents).get(data.punchlineId) ?? newLineAcc()
    const row = lineRowFrom(meta, acc)

    // Funnel (regular play): served → answered → song shown → song correct.
    const served = acc.served.size
    const answered = acc.revealed.size
    let songShown = 0
    let songCorrect = 0
    for (const s of acc.song.values()) {
      songShown += 1
      if (s.correct) songCorrect += 1
    }
    const funnel: Array<FunnelStage> = [
      { key: "served", count: served },
      { key: "answered", count: answered },
      { key: "song_shown", count: songShown },
      { key: "song_correct", count: songCorrect },
    ]

    // Distractor breakdown: the three artist choices and how often each picked.
    const choiceIds = [meta.artistId, meta.distractor1Id, meta.distractor2Id]
    const distractors: Array<DistractorPick> = choiceIds.map((id) => ({
      artistId: id,
      artistName: artistNames.get(id) ?? `#${id}`,
      picks: (acc.wrongPicks.get(id) ?? 0) + (acc.correctPicks.get(id) ?? 0),
      isCorrectArtist: id === meta.artistId,
    }))

    return {
      punchlineId: meta.punchlineId,
      line: meta.line,
      clozePrompt: meta.clozePrompt,
      perfectSolution: meta.perfectSolution,
      artistId: meta.artistId,
      artistName: meta.artistName,
      songTitle: meta.songTitle,
      active: meta.active,
      served: row.served,
      distinctPlayers: row.distinctPlayers,
      artist: row.artist,
      cloze: row.cloze,
      song: row.song,
      daily: row.daily,
      funnel,
      distractors,
    }
  })

export const getArtistDetail = createServerFn({ method: "GET" })
  .inputValidator((d: DateRange & { artistId: number }) => ({
    ...validateRange(d),
    artistId: Number(d.artistId),
  }))
  .handler(async ({ data }): Promise<ArtistDetail | null> => {
    await requireAdmin(getRequest())
    const [events, lineMeta, artistNames] = await Promise.all([
      fetchEvents(data),
      fetchLineMeta(),
      fetchArtistNames(),
    ])
    const ownLines = lineMeta.filter((m) => m.artistId === data.artistId)
    if (ownLines.length === 0) return null
    const accByLine = accumulate(events)
    const artistRows = buildArtists(lineMeta, accByLine, events, artistNames)
    const summary = artistRows.find((a) => a.artistId === data.artistId)
    if (!summary) return null
    const lines = ownLines
      .map((m) => lineRowFrom(m, accByLine.get(m.punchlineId)))
      .sort((a, b) => b.served - a.served)
    return {
      artistId: summary.artistId,
      artistName: summary.artistName,
      slug: summary.slug,
      served: summary.served,
      distinctPlayers: summary.distinctPlayers,
      recognition: summary.recognition,
      pullSessions: summary.pullSessions,
      pullRestarts: summary.pullRestarts,
      confusedWith: summary.confusedWith,
      foolsAsDistractor: summary.foolsAsDistractor,
      lines,
    }
  })
