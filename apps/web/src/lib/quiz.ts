/**
 * Artist Quiz Landing Pages (PUN-106/107/108) — shared constants.
 *
 * Pure module (no server imports) so it's safe in both the client and server
 * graphs: the /play loader uses QUIZ_MIN_BARS to decide the redirect, and the
 * /quiz route uses both.
 */

/** Minimum active bars an artist needs before they get a /quiz page. */
export const QUIZ_MIN_BARS = 15

/** Bars per quiz run. Shorter than the cold-open 10 to keep drop-off low. */
export const QUIZ_ROUND_SIZE = 5
