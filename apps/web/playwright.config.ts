import { defineConfig, devices } from "@playwright/test"

/**
 * One Chromium smoke. Two ways to run:
 *
 * 1. Against a deployed URL — set `PLAYWRIGHT_BASE_URL` (CI points it at the
 *    Vercel preview deploy). No local server is started; the deployed app
 *    brings its own DB/Clerk/env. This is what CI uses, because the app's DB
 *    layer is Neon-serverless and can't talk to a plain Postgres container.
 *
 * 2. Locally — no env needed; Playwright boots `pnpm dev` against your `.env`
 *    (which has a real Neon `DATABASE_URL` + Clerk keys). Run `pnpm e2e`.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"
const usingDeployedUrl = !!process.env.PLAYWRIGHT_BASE_URL

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Only boot a local server when not targeting a deployed URL.
  webServer: usingDeployedUrl
    ? undefined
    : {
        command: "pnpm dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
