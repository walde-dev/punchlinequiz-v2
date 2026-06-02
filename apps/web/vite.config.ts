import { defineConfig } from "vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import { sentryTanstackStart } from "@sentry/tanstackstart-react/vite"
import viteReact from "@vitejs/plugin-react"
import viteTsConfigPaths from "vite-tsconfig-paths"
import tailwindcss from "@tailwindcss/vite"
import { nitro } from "nitro/vite"

// Source-map upload only runs when an auth token is present (i.e. the Vercel
// build env). Local/dev builds skip the Sentry plugin entirely so they don't
// try to upload. org/project come from env to avoid hardcoding the slug.
const sentryPlugins = process.env.SENTRY_AUTH_TOKEN
  ? [
      sentryTanstackStart({
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
        // EU-region org: source-map upload must target de.sentry.io. The plugin
        // reads this from the SENTRY_URL env var (the sntrys_ token also embeds
        // its region_url as a fallback). Set SENTRY_URL=https://de.sentry.io.
      }),
    ]
  : []

// Sentry's Node SDK (OpenTelemetry + require-in-the-middle instrumentation)
// must NOT be bundled into the Nitro server output: rollup chokes on its
// `export *` namespace re-exports, and the runtime instrumentation only works
// unbundled. Keep these external so they're required at runtime from the
// traced node_modules. Only affects the server bundle; the client build
// (separate vite pipeline) bundles @sentry/react normally.
const sentryServerExternal = (id: string): boolean =>
  /^@sentry\//.test(id) ||
  /^@opentelemetry\//.test(id) ||
  id === "import-in-the-middle" ||
  id === "require-in-the-middle"

const config = defineConfig({
  plugins: [
    nitro({
      rollupConfig: { external: sentryServerExternal },
      rolldownConfig: { external: sentryServerExternal },
    }),
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    ...sentryPlugins,
  ],
})

export default config
