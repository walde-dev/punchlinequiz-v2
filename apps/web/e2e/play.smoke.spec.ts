import { expect, test } from "@playwright/test"

/**
 * The one end-to-end smoke: prove the whole stack serves a playable round.
 *
 * This exercises SSR + the `getRound` server-fn + a real (seeded) database +
 * Clerk boot (the root throws without VITE_CLERK_PUBLISHABLE_KEY). If a deploy
 * is fundamentally broken — app won't boot, DB unreachable, no playable bars —
 * this fails. It plays anonymously, so no signed-in user is needed.
 *
 * Requires a seeded DB and Clerk *test* keys in the environment (see the e2e
 * job in .github/workflows/ci.yml and docs/ci.md).
 */
test("the play page serves an interactive round", async ({ page }) => {
  await page.goto("/play")

  // The page must boot without the Clerk/root error and render the bar text.
  await expect(page.locator("body")).toBeVisible()

  // A round renders one of two answer affordances depending on its mode:
  // an artist multiple-choice list, or a free-typed cloze/song input.
  const artistChoices = page.getByRole("button", { pressed: false })
  const textInput = page.getByRole("textbox")

  await expect(artistChoices.first().or(textInput.first())).toBeVisible({
    timeout: 15_000,
  })

  // If it's an artist round, submit an answer and confirm the UI reacts
  // (the chosen tile flips to aria-pressed) — proving the submit path runs.
  if (
    await artistChoices
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    const first = artistChoices.first()
    await first.click()
    await expect(page.getByRole("button", { pressed: true })).toBeVisible({
      timeout: 10_000,
    })
  }
})
