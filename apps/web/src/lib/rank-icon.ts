/**
 * Path to the rank badge PNG for a level. Deterministic by level id —
 * ships with the app at /ranks/rank-{id}.png. Lives in its own pure module
 * so client components can import it without dragging the server-only
 * xp.ts (which imports db) into the client bundle.
 */
export function rankIconPath(levelId: number): string {
  return `/ranks/rank-${levelId}.png`
}
