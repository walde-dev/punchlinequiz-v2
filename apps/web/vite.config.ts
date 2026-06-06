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

const config = defineConfig({
  define: sentryRelease
    ? { "import.meta.env.VITE_SENTRY_RELEASE": JSON.stringify(sentryRelease) }
    : undefined,
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
