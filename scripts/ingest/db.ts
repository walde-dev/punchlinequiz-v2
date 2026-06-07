import { createDb } from "@workspace/db"
import { requireEnv } from "./config.ts"

export type IngestDb = ReturnType<typeof createDb>

let _db: IngestDb | undefined

/** Lazily construct the CLI's own DB connection from DATABASE_URL. */
export function ingestDb(): IngestDb {
  if (!_db) _db = createDb(requireEnv("DATABASE_URL"))
  return _db
}
