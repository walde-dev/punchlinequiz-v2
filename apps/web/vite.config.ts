import { defineConfig } from "vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import viteTsConfigPaths from "vite-tsconfig-paths"
import tailwindcss from "@tailwindcss/vite"
import { nitro } from "nitro/vite"
import { sentryVitePlugin } from "@sentry/vite-plugin"

// NOTE: Sentry is wired client-only at RUNTIME (see src/lib/sentry.client.ts) —
// the server SDK is never imported, since this nitro setup inlines all deps and
// rollup can't bundle @sentry/node. @sentry/vite-plugin below is a BUILD-time
// tool only (it uploads source maps + injects debug-id comments); it ships no
// runtime server code, so it doesn't reintroduce that problem.

// Tag every client Sentry event with a release so issues pin to a deploy.
// Prefer an explicit VITE_SENTRY_RELEASE; otherwise fall back to Vercel's
// per-deploy commit SHA, which is present in the build env automatically. Left
// undefined for local/non-Vercel builds (Sentry.init then just omits release).
const sentryRelease = process.env.VITE_SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA

// Separate preview deploys from production in Sentry. Without this the client
// falls back to import.meta.env.MODE, which is "production" for ANY Vite prod
// build — so preview-only failures (e.g. Clerk JS blocked on *.vercel.app
// origins) page as production errors. VERCEL_ENV is "production" | "preview" |
// "development"; prefer an explicit override. Undefined off Vercel (MODE wins).
const sentryEnvironment = process.env.VITE_SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV

// Upload client source maps to Sentry so production errors symbolicate to real
// file:line instead of minified `main-…js:12:35833`. Gated to production Vercel
// builds with an auth token present: previews and local builds skip it (no
// quota burn, no accidental uploads). Needs SENTRY_ORG/SENTRY_PROJECT and, for
// the EU org, SENTRY_URL=https://de.sentry.io in the build env.
const uploadSourceMaps =
  !!process.env.SENTRY_AUTH_TOKEN && process.env.VERCEL_ENV === "production"

const config = defineConfig({
  define: {
    ...(sentryRelease
      ? { "import.meta.env.VITE_SENTRY_RELEASE": JSON.stringify(sentryRelease) }
      : {}),
    ...(sentryEnvironment
      ? { "import.meta.env.VITE_SENTRY_ENVIRONMENT": JSON.stringify(sentryEnvironment) }
      : {}),
  },
  // "hidden" emits maps without a sourceMappingURL comment, so they're uploaded
  // to Sentry (via debug ids) but never advertised to browsers; the plugin then
  // deletes them from the output so they're not served publicly.
  build: { sourcemap: uploadSourceMaps ? "hidden" : false },
  plugins: [
    nitro(),
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    // Must come last so it sees the final emitted bundle + maps.
    ...(uploadSourceMaps
      ? [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: process.env.SENTRY_AUTH_TOKEN,
            // EU org lives on de.sentry.io; undefined falls back to sentry.io.
            url: process.env.SENTRY_URL,
            telemetry: false,
            // Match the runtime release tag (sentry.client.ts) so maps bind to
            // the right release — otherwise events stay unsymbolicated.
            release: sentryRelease ? { name: sentryRelease } : undefined,
            // Delete maps post-upload so they're never served. Paths name the
            // dotted output dir explicitly — a bare `**/*.map` won't match,
            // since glob skips hidden dirs like `.vercel` unless named.
            sourcemaps: {
              filesToDeleteAfterUpload: [
                "./.vercel/output/static/**/*.map", // Vercel preset (prod build)
                "./.output/public/**/*.map", // default nitro output (fallback)
              ],
            },
          }),
        ]
      : []),
  ],
})

export default config
