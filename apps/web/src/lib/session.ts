import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"

import { getActor } from "./auth"
import { getProfileSnapshot, levelFor, levelInfos, loadLevels, type ProfileSnapshot, type LevelInfo } from "./xp"

/** Client-callable server function: am I currently logged in as admin? */
export const isAdminFn = createServerFn({ method: "GET" }).handler(async () => {
  const req = getRequest()
  const result = await getActor(req)
  return { admin: result?.isAdmin === true }
})

export type ProfileFnResult =
  | { signedIn: true; profile: ProfileSnapshot }
  | {
      signedIn: false
      preview: { level: LevelInfo; nextLevel: LevelInfo | null }
    }

/**
 * Profile snapshot for the signed-in user. Anonymous callers get a soft
 * preview (level 1 + next threshold) so the /profile page can still render
 * a useful sign-in pitch.
 */
export const getProfileFn = createServerFn({ method: "GET" }).handler(async (): Promise<ProfileFnResult> => {
  const req = getRequest()
  const result = await getActor(req)
  if (result?.actor.kind === "clerk") {
    return { signedIn: true, profile: await getProfileSnapshot(result.actor.userId) }
  }
  const sorted = await loadLevels()
  const { current, next } = levelFor(0, sorted)
  return { signedIn: false, preview: { level: current, nextLevel: next } }
})

/**
 * All levels in threshold-ascending order. Drives the XP-system explainer
 * dialog (teases the full ladder). Server-cached via loadLevels().
 */
export const getLevelsFn = createServerFn({ method: "GET" }).handler(async (): Promise<LevelInfo[]> => {
  return levelInfos(await loadLevels())
})

/** Lightweight version for the header chip — strips recent + sparkline. */
export type HeaderXp = {
  signedIn: boolean
  totalXp: number
  currentStreak: number
  level: LevelInfo
  nextLevel: LevelInfo | null
  progressPct: number
}

export const getHeaderXpFn = createServerFn({ method: "GET" }).handler(async (): Promise<HeaderXp> => {
  const req = getRequest()
  const result = await getActor(req)
  const sorted = await loadLevels()
  if (result?.actor.kind !== "clerk") {
    const { current, next } = levelFor(0, sorted)
    return { signedIn: false, totalXp: 0, currentStreak: 0, level: current, nextLevel: next, progressPct: 0 }
  }
  const snap = await getProfileSnapshot(result.actor.userId)
  return {
    signedIn: true,
    totalXp: snap.totalXp,
    currentStreak: snap.currentStreak,
    level: snap.level,
    nextLevel: snap.nextLevel,
    progressPct: snap.progressPct,
  }
})
