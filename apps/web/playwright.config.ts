import { defineConfig, devices } from "@playwright/test"

/**
 * One Chromium smoke against the app's own dev server. Dev mode (not a prod
 * bundle) is deliberate: it reliably runs SSR + server-fns + the DB without
 * guessing the Nitro output path, and the prod *build* is already gated by the
 * `quality` CI job. The webServer inherits the process env — VITE_CLERK_*,
 * CLERK_SECRET_KEY and DATABASE_URL must be set (locally via .env, in CI via
 * the e2e job). See docs/ci.md.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
