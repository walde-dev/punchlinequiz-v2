import { eq, sql } from "drizzle-orm"
import { ingestEpisodes } from "@workspace/db"
import type { IngestDb } from "./db.ts"

export type EpisodeCounts = {
  itemCount: number
  insertedCount: number
  skippedCount: number
  failedCount: number
}

/** Has this episode already been fully processed? (PUN-143 idempotency.) */
export async function hasProcessed(db: IngestDb, videoId: string): Promise<boolean> {
  const row = (
    await db
      .select({ status: ingestEpisodes.status })
      .from(ingestEpisodes)
      .where(eq(ingestEpisodes.videoId, videoId))
      .limit(1)
  )[0]
  return row?.status === "done"
}

/** Mark an episode as in-flight (upsert). A crash leaves it 'processing' → reprocessed. */
export async function markProcessing(db: IngestDb, videoId: string, title: string): Promise<void> {
  await db
    .insert(ingestEpisodes)
    .values({ videoId, title, status: "processing" })
    .onConflictDoUpdate({
      target: ingestEpisodes.videoId,
      set: { status: "processing", title, updatedAt: sql`now()` },
    })
}

export async function markDone(db: IngestDb, videoId: string, counts: EpisodeCounts): Promise<void> {
  await db
    .update(ingestEpisodes)
    .set({ status: "done", lastError: null, updatedAt: sql`now()`, ...counts })
    .where(eq(ingestEpisodes.videoId, videoId))
}

export async function markFailed(db: IngestDb, videoId: string, error: string): Promise<void> {
  await db
    .update(ingestEpisodes)
    .set({ status: "failed", lastError: error.slice(0, 2000), updatedAt: sql`now()` })
    .where(eq(ingestEpisodes.videoId, videoId))
}
