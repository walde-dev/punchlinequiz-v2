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
 *
 * The `/*#__PURE__*\/` annotation keeps the *bytes* out of the client too:
 * `new Proxy()` is a side-effectful expression Rollup won't drop on its own, so
 * once any server-fn module that imports `db` is pulled into a client chunk
 * (e.g. a route loader like getDailyChallenge), the proxy — and with it
 * `createDb` → drizzle-orm → @neondatabase/serverless — used to ship to every
 * browser (~200+ KiB). Marking the initializer pure lets tree-shaking drop `db`
 * and its whole import chain from any client build where it's never referenced.
 */
// eslint-disable-next-line @stylistic/spaced-comment -- the space-less /*#__PURE__*/ form is the exact token Rollup recognises; a space breaks the annotation.
export const db = /*#__PURE__*/ new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const real = resolveDb() as object
    const value = Reflect.get(real, prop, receiver)
    return typeof value === "function" ? value.bind(real) : value
  },
})
