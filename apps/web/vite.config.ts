import { defineConfig } from "vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import viteTsConfigPaths from "vite-tsconfig-paths"
import tailwindcss from "@tailwindcss/vite"
import { nitro } from "nitro/vite"

// NOTE: Sentry is wired client-only (see src/lib/sentry.client.ts). The Sentry
// vite plugin (source-map upload) and the server SDK are intentionally NOT used
// here — this nitro setup inlines all deps and rollup can't bundle @sentry/node,
// so any server-side @sentry presence breaks the deployed function. Client
// source-map upload is deferred; re-add @sentry/vite-plugin deliberately later.

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

const config = defineConfig({
  define: {
    ...(sentryRelease
      ? { "import.meta.env.VITE_SENTRY_RELEASE": JSON.stringify(sentryRelease) }
      : {}),
    ...(sentryEnvironment
      ? { "import.meta.env.VITE_SENTRY_ENVIRONMENT": JSON.stringify(sentryEnvironment) }
      : {}),
  },
  plugins: [
    nitro(),
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
