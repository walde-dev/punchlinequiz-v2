import { and, eq, sql } from "drizzle-orm"
import { artists, ingestItems, punchlines, songs } from "@workspace/db"
import {
  assertDistinctArtists,
  findDuplicateLine,
  findDuplicateLineGlobal,
  insertBar,
  resolveOrCreateArtist,
  resolveOrCreateSong,
} from "../../apps/web/src/lib/ingest-core.ts"
import { GEMINI_MODEL, LOW_CONFIDENCE } from "./config.ts"
import type { IngestDb } from "./db.ts"
import { correctArtistInCredit, resolveSongInfo } from "./resolve.ts"
import type { PersistOutcome, RawQuizItem } from "./types.ts"

function distractorsFor(item: RawQuizItem): { correct: string; d1: string; d2: string } | null {
  if (item.correctIndex < 0 || !item.options[item.correctIndex]) return null
  const correct = item.options[item.correctIndex]
  const others = item.options.filter((_, i) => i !== item.correctIndex)
  if (others.length < 2) return null
  return { correct, d1: others[0], d2: others[1] }
}

async function findArtistId(db: IngestDb, name: string): Promise<number | null> {
  const row = (
    await db
      .select({ id: artists.id })
      .from(artists)
      .where(sql`lower(${artists.name}) = lower(${name})`)
      .limit(1)
  )[0]
  return row?.id ?? null
}

/**
 * Resolve + persist one quiz item into the review queue with provenance.
 *
 * - Items with no known correct answer (no reveal) can't form a valid bar, so
 *   they are recorded in `ingest_items` as 'low_confidence' (never silently
 *   dropped) but NOT minted as a punchline — we don't guess the answer.
 * - Everything else is inserted reviewed=false, active=true (quarantined), with
 *   an `ingest_items` provenance row.
 * - `commit=false` does all read-only resolution + dedup but writes nothing,
 *   returning a preview (neon-http has no interactive transactions).
 */
export async function persistItem(
  db: IngestDb,
  videoId: string,
  item: RawQuizItem,
  seqIndex: number,
  opts: { commit: boolean },
): Promise<PersistOutcome> {
  const itemIndex = item.index ?? seqIndex + 1
  const tsMs = item.evidence.revealTsMs ?? item.evidence.questionTsMs ?? null
  const raw: Record<string, unknown> = {
    line: item.line,
    options: item.options,
    correctIndex: item.correctIndex,
    songCredit: item.songCredit,
    songTitle: item.songTitle,
    confidence: item.confidence,
    evidence: item.evidence,
  }

  const recordItem = async (
    status: PersistOutcome["status"],
    extra: { punchlineId?: number; dedupeOfPunchlineId?: number } = {},
  ): Promise<void> => {
    if (!opts.commit) return
    await db.insert(ingestItems).values({
      videoId,
      punchlineId: extra.punchlineId ?? null,
      itemIndex,
      tsMs,
      model: GEMINI_MODEL,
      confidence: item.confidence,
      status,
      dedupeOfPunchlineId: extra.dedupeOfPunchlineId ?? null,
      rawExtraction: raw,
    })
  }

  // No known correct answer (or <2 distractors) → can't form a valid bar.
  // Recorded in ingest_items (not silently dropped) but not minted — we never
  // guess the answer. Shows up in the episode's failedCount + logs.
  const trio = distractorsFor(item)
  if (!trio) {
    await recordItem("failed")
    return { itemIndex, status: "failed", error: "no correct answer / too few options" }
  }

  // Global line dedup first (cheaper than resolving the song, and robust to the
  // same bar resolving to a slightly different song across runs/episodes).
  const globalDup = await findDuplicateLineGlobal(db, item.line)
  if (globalDup) {
    await recordItem("duplicate", { dedupeOfPunchlineId: globalDup })
    return { itemIndex, status: "duplicate", dedupeOfPunchlineId: globalDup, correctArtist: trio.correct }
  }

  // Soft sanity check: the correct artist should appear in the reveal credit.
  const creditMismatch = item.songCredit && !correctArtistInCredit(trio.correct, item.songCredit)

  const songInfo = await resolveSongInfo(item, trio.correct)
  const title = songInfo?.title ?? `Unbekannt (WHO DAT ${videoId})`

  // ---- dry-run: read-only preview, no writes ----
  if (!opts.commit) {
    const correctId = await findArtistId(db, trio.correct)
    let dupId: number | null = null
    if (correctId) {
      const songRow = (
        await db
          .select({ id: songs.id })
          .from(songs)
          .where(and(eq(songs.artistId, correctId), sql`lower(${songs.title}) = lower(${title})`))
          .limit(1)
      )[0]
      if (songRow) dupId = await findDuplicateLine(db, songRow.id, item.line)
    }
    if (dupId) return { itemIndex, status: "duplicate", dedupeOfPunchlineId: dupId, correctArtist: trio.correct, songTitle: title }
    const low = item.confidence < LOW_CONFIDENCE || !songInfo || !!creditMismatch
    return { itemIndex, status: low ? "low_confidence" : "inserted", correctArtist: trio.correct, songTitle: title }
  }

  // ---- commit ----
  try {
    const correct = await resolveOrCreateArtist(db, trio.correct)
    const d1 = await resolveOrCreateArtist(db, trio.d1)
    const d2 = await resolveOrCreateArtist(db, trio.d2)
    assertDistinctArtists(correct.row.id, d1.row.id, d2.row.id)

    const song = await resolveOrCreateSong(db, {
      artistId: correct.row.id,
      title,
      artworkArtistName: songInfo?.artworkArtist ?? correct.row.name,
      album: songInfo?.album ?? null,
      releaseYear: songInfo?.releaseYear ?? null,
    })

    const dupId = await findDuplicateLine(db, song.row.id, item.line)
    if (dupId) {
      await recordItem("duplicate", { dedupeOfPunchlineId: dupId })
      return { itemIndex, status: "duplicate", dedupeOfPunchlineId: dupId, correctArtist: trio.correct, songTitle: title }
    }

    const bar = await insertBar(db, {
      songId: song.row.id,
      line: item.line,
      distractor1Id: d1.row.id,
      distractor2Id: d2.row.id,
    })

    const low = item.confidence < LOW_CONFIDENCE || !songInfo || !!creditMismatch
    const status: PersistOutcome["status"] = low ? "low_confidence" : "inserted"
    await recordItem(status, { punchlineId: bar.id })
    return { itemIndex, status, punchlineId: bar.id, correctArtist: trio.correct, songTitle: title }
  } catch (e) {
    await recordItem("failed").catch(() => {})
    return { itemIndex, status: "failed", error: String(e).slice(0, 300) }
  }
}
