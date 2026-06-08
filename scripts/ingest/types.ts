/** Shared types for the WHO DAT?! ingestion pipeline. */

/** A candidate frame after sampling + crop + perceptual-hash dedup. */
export type CandidateFrame = {
  path: string
  /** Source timestamp in the episode (ms). */
  tsMs: number
  /** 64-bit dHash (hex) of the cropped overlay band, for dedup/debug. */
  hash: string
}

/** One quiz item as reconstructed by the extractor from its frames. */
export type RawQuizItem = {
  /** The on-screen "X/10" index (1-based). Null if the counter wasn't read. */
  index: number | null
  /** Canonical punchline: rap bars joined by " / " with a trailing " /". */
  line: string
  /** The individual rap bars (the "/" segments the game renders). */
  bars: Array<string>
  /** The three artist options, top-to-bottom (from the question-card frame). */
  options: Array<string>
  /** 0-based index of the green-highlighted correct option. */
  correctIndex: number
  /** Song title from the reveal credit (e.g. "HELD"), if shown. */
  songTitle: string | null
  /** Full reveal credit (e.g. "Ansu, Tom Hengst & Cato - HELD"), if shown. */
  songCredit: string | null
  /** Extractor self-reported confidence, 0..1. */
  confidence: number
  /** Evidence timestamps (ms) for the question-card and reveal frames. */
  evidence: { questionTsMs: number | null; revealTsMs: number | null }
}

/** Episode metadata from the playlist/flat-playlist dump. */
export type EpisodeMeta = {
  videoId: string
  title: string
  durationSec?: number | null
}

/** Outcome of persisting one quiz item. */
export type PersistOutcome = {
  itemIndex: number
  status: "inserted" | "duplicate" | "failed" | "low_confidence"
  punchlineId?: number
  dedupeOfPunchlineId?: number
  error?: string
  correctArtist?: string
  songTitle?: string | null
}
