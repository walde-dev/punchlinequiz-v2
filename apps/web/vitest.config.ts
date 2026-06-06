import { defineConfig } from "vitest/config"

// Unit tests run in plain Node — the tested modules (lib/answer-matching,
// lib/scoring) are deliberately side-effect free, so no DOM, no Vite plugins,
// and no DB are needed. Keep it that way: anything requiring a server-fn or the
// database belongs in the Playwright e2e smoke, not here.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Playwright specs live under e2e/ and run via `pnpm e2e`, not vitest.
    exclude: ["e2e/**", "node_modules/**"],
  },
})
