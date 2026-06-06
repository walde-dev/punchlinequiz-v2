import { expect, test } from "@playwright/test"

/**
 * The one end-to-end smoke: prove the deployed app serves a playable round.
 *
 * Hits `/play` on the real deployment (SSR + the `getRound` server-fn + the
 * Neon DB). If a deploy is fundamentally broken — won't boot, DB unreachable,
 * no playable bars — this fails. It plays anonymously, so no login is needed
 * (CI passes the Vercel protection-bypass header; see playwright.config.ts).
 */
test("the play page serves an interactive round", async ({ page }) => {
  await page.goto("/play")

  // A round renders one of two answer affordances depending on its mode:
  // artist multiple-choice tiles, or a free-typed cloze/song input.
  const choices = page.getByTestId("artist-choice")
  const textInput = page.getByRole("textbox")

  // `.or(...).first()` collapses to a single element — no strict-mode violation
  // even when both a choice and an input happen to be present.
  await expect(choices.or(textInput).first()).toBeVisible({ timeout: 20_000 })

  // If it's an artist round, submit an answer and confirm the UI reacts (the
  // chosen tile flips to aria-pressed) — proving the round is interactive.
  if ((await choices.count()) > 0) {
    await choices.first().click()
    await expect(choices.first()).toHaveAttribute("aria-pressed", "true")
  }
})
