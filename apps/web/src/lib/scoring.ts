/**
 * Pure scoring / streak math for XP grants.
 *
 * Side-effect free (only a type-only import from the schema) so the
 * correctness core — how many points a correct answer is worth and whether a
 * streak is still alive — is unit-testable in plain Node. `xp.ts` imports
 * these into its DB-bound grant functions. See `scoring.test.ts`.
 */
import type { XpConfig } from "@workspace/db"

/**
 * A streak survives if the last correct answer was within the idle window.
 * `now` is injectable for deterministic tests; defaults to wall-clock.
 */
export function isStreakAlive(
  lastCorrectAt: Date | null,
  idleMinutes: number,
  now: number = Date.now()
): boolean {
  if (!lastCorrectAt) return false
  const idleMs = idleMinutes * 60_000
  return now - lastCorrectAt.getTime() < idleMs
}

/** Linear streak bonus, capped at the configured maximum. */
export function streakBonus(streak: number, cfg: XpConfig): number {
  return Math.min(streak * cfg.streakBonusPerStep, cfg.streakMaxBonus)
}
