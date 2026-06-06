import { describe, expect, it } from "vitest"
import { isStreakAlive, streakBonus } from "./scoring"
import type { XpConfig } from "@workspace/db"

// Only the two fields streakBonus reads; cast keeps the test free of the full
// XpConfig row shape.
const cfg = { streakBonusPerStep: 25, streakMaxBonus: 100 } as XpConfig

describe("streakBonus", () => {
  it("scales linearly with the streak", () => {
    expect(streakBonus(0, cfg)).toBe(0)
    expect(streakBonus(1, cfg)).toBe(25)
    expect(streakBonus(3, cfg)).toBe(75)
  })

  it("is capped at the configured maximum", () => {
    expect(streakBonus(4, cfg)).toBe(100)
    expect(streakBonus(1000, cfg)).toBe(100)
  })
})

describe("isStreakAlive", () => {
  const now = new Date("2026-06-06T12:00:00Z").getTime()
  const idleMinutes = 30

  it("is dead with no prior correct answer", () => {
    expect(isStreakAlive(null, idleMinutes, now)).toBe(false)
  })

  it("is alive within the idle window", () => {
    const tenMinAgo = new Date(now - 10 * 60_000)
    expect(isStreakAlive(tenMinAgo, idleMinutes, now)).toBe(true)
  })

  it("is dead past the idle window", () => {
    const hourAgo = new Date(now - 60 * 60_000)
    expect(isStreakAlive(hourAgo, idleMinutes, now)).toBe(false)
  })
})
