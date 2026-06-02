import { createDb } from "@workspace/db"

type Db = ReturnType<typeof createDb>

let _db: Db | undefined

function resolveDb(): Db {
  if (_db) return _db
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL is required")
  _db = createDb(url)
  return _db
}

/**
 * Lazy DB handle. Importing this module has **no side effects** — the neon
 * connection (and the DATABASE_URL check) only run on first property access,
 * which happens server-side inside server-fn handlers / route loaders.
 *
 * Why: TanStack's server-fn plugin strips server-only imports from the client,
 * but if a server module's `db` import ever slips into a client chunk, a
 * module-load `throw` (the old `createDb(process.env.DATABASE_URL!)` at top
 * level) would crash the client with "DATABASE_URL is required". Keeping this
 * module inert on import makes that impossible — the proxy is simply never
 * touched on the client.
 */
export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const real = resolveDb() as object
    const value = Reflect.get(real, prop, receiver)
    return typeof value === "function" ? value.bind(real) : value
  },
})
