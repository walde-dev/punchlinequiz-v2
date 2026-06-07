import { LOW_CONFIDENCE } from "./config.ts"
import { extractFrames, type FrameExtraction } from "./gemini.ts"
import type { CandidateFrame, RawQuizItem } from "./types.ts"

type Tagged = FrameExtraction & { frame: CandidateFrame }

/** Aggressive normalize for grouping question+reveal frames of one item. */
function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "")
}

/** Parse "Ansu, Tom Hengst & Cato - HELD" → { title: "HELD", credit }. */
export function parseCredit(credit: string | null): { title: string | null; credit: string | null } {
  if (!credit) return { title: null, credit: null }
  const m = credit.split(/\s+[-–—]\s+/)
  if (m.length >= 2) return { title: m[m.length - 1].trim(), credit: credit.trim() }
  return { title: null, credit: credit.trim() }
}

function parseIndex(label: string | null): number | null {
  if (!label) return null
  const m = label.match(/(\d+)\s*\/\s*\d+/)
  return m ? Number(m[1]) : null
}

/** Levenshtein edit distance (small strings, few frames — cost is negligible). */
function lev(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  let cur = new Array<number>(n + 1)
  for (let i = 1; i <= m; i++) {
    cur[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    ;[prev, cur] = [cur, prev]
  }
  return prev[n]
}

/** Similarity 0..1 on normalized lines — tolerant of OCR slips (Dass/Das, JuJu/Juju). */
function sim(a: string, b: string): number {
  if (!a && !b) return 1
  const max = Math.max(a.length, b.length)
  return max === 0 ? 1 : 1 - lev(a, b) / max
}

const CLUSTER_SIM = Number(process.env.INGEST_CLUSTER_SIM ?? 0.82)

/**
 * Cluster a quiz item's frames (question card, green reveal, credit/counter)
 * together by fuzzy line similarity. All three show the same punchline, so even
 * with OCR differences they cluster; the credit/counter-only frame still shares
 * the line. Each cluster anchors on the longest line seen.
 */
function clusterByLine(frames: Array<Tagged>): Array<Array<Tagged>> {
  const clusters: Array<{ key: string; frames: Array<Tagged> }> = []
  for (const t of frames) {
    const key = norm(t.line) || norm(t.correctArtist) || `f${t.frame.tsMs}`
    let best = -1
    let bestS = 0
    clusters.forEach((c, i) => {
      const s = sim(key, c.key)
      if (s > bestS) {
        bestS = s
        best = i
      }
    })
    if (best >= 0 && bestS >= CLUSTER_SIM) {
      clusters[best].frames.push(t)
      if (key.length > clusters[best].key.length) clusters[best].key = key
    } else {
      clusters.push({ key, frames: [t] })
    }
  }
  return clusters.map((c) => c.frames)
}

/** Build one quiz item from its frames; null if it lacks a usable line. */
function buildItem(frames: Array<Tagged>): RawQuizItem | null {
  const withLine = frames.filter((f) => f.line && f.line.trim().length > 0)
  if (withLine.length === 0) return null
  // The fullest line (question card shows the complete bar).
  const line = withLine.map((f) => f.line!).sort((a, b) => b.length - a.length)[0].trim()

  // The richest options list (question card has all three).
  const options = frames
    .map((f) => f.options ?? [])
    .sort((a, b) => b.length - a.length)[0]
    .map((o) => o.trim())
    .filter(Boolean)

  const reveal = frames.find((f) => f.correctArtist) ?? frames.find((f) => f.role === "reveal")
  const correctArtist = reveal?.correctArtist?.trim() ?? null

  let correctIndex = -1
  if (correctArtist) {
    correctIndex = options.findIndex((o) => norm(o) === norm(correctArtist))
    // If the reveal frame only showed the green option, options may be incomplete.
    if (correctIndex === -1 && reveal && (reveal.correctIndex ?? -1) >= 0) {
      correctIndex = reveal.correctIndex!
    }
  }

  const creditFrame = frames.find((f) => f.songCredit)
  const { title: songTitle, credit: songCredit } = parseCredit(creditFrame?.songCredit ?? null)
  const index = parseIndex(frames.map((f) => f.indexLabel).find(Boolean) ?? null)

  const questionFrame = frames.find((f) => (f.options?.length ?? 0) >= 3) ?? frames.find((f) => f.role === "question")
  const revealFrame = reveal

  // Completeness-based confidence (PUN-152: flag, never silently drop).
  let confidence = 1
  const distinctOptions = new Set(options.map(norm)).size
  if (!correctArtist) confidence -= 0.4
  if (options.length !== 3 || distinctOptions !== 3) confidence -= 0.3
  if (correctArtist && correctIndex === -1) confidence -= 0.3
  if (!songCredit) confidence -= 0.1
  confidence = Math.max(0, Math.round(confidence * 100) / 100)

  return {
    index,
    line,
    options,
    correctIndex,
    songTitle,
    songCredit,
    confidence,
    evidence: {
      questionTsMs: questionFrame?.frame.tsMs ?? null,
      revealTsMs: revealFrame?.frame.tsMs ?? null,
    },
  }
}

/**
 * Turn an episode's candidate frames into ordered quiz items: extract every
 * frame via Gemini, drop non-quiz frames, group question+reveal by line, then
 * synthesize one item per group. Items are ordered by their on-screen "X/10"
 * index when present, else by first appearance.
 */
export async function extractQuizItems(frames: Array<CandidateFrame>): Promise<Array<RawQuizItem>> {
  const tagged = await extractFrames(frames)
  const quiz = tagged
    .filter((t) => t.role !== "other" && (t.line || t.options?.length || t.correctArtist))
    .sort((a, b) => a.frame.tsMs - b.frame.tsMs)

  const items: Array<RawQuizItem> = []
  for (const frs of clusterByLine(quiz)) {
    const item = buildItem(frs)
    if (item) items.push(item)
  }
  items.sort((a, b) => {
    if (a.index != null && b.index != null) return a.index - b.index
    return (a.evidence.questionTsMs ?? a.evidence.revealTsMs ?? 0) - (b.evidence.questionTsMs ?? b.evidence.revealTsMs ?? 0)
  })
  return items
}

export function isLowConfidence(item: RawQuizItem): boolean {
  return item.confidence < LOW_CONFIDENCE
}
