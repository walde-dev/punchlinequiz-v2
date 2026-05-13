import { createDb } from "@workspace/db"

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required")
}

export const db = createDb(process.env.DATABASE_URL)
