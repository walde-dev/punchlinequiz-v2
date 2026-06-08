import fs from "node:fs"
import { GEMINI_MODEL, requireEnv } from "./config.ts"
import type { CandidateFrame } from "./types.ts"

/**
 * What the model reads off a single candidate frame. The quiz overlay shows all
 * of this as on-screen graphics (no captions exist on the channel), so vision
 * reads it directly. `role`:
 *   - "question" — punchline + 3 neutral artist options visible
 *   - "reveal"   — one option highlighted green; often a song credit + "X/10"
 *   - "other"    — no quiz overlay (talking head, intro, …) → dropped
 */
export type FrameExtraction = {
  n: number
  role: "question" | "reveal" | "other"
  line: string | null
  /** The punchline split into its individual rap bars (canonical "/" segments). */
  bars: Array<string>
  options: Array<string>
  correctIndex: number | null
  correctArtist: string | null
  songCredit: string | null
  indexLabel: string | null
}

const ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

const PROMPT = `You are reading frames from the German rap show "splash! Punchline Quiz".
Each quiz item shows a punchline (bottom-left box, multiple lines) and three artist
options (stacked, right). On the "reveal" the correct option is HIGHLIGHTED in an accent
colour (it varies by episode — green, pink, etc.) so it stands out from the other two,
and a song credit ("Artist - Title", e.g. "Ansu, Tom Hengst & Cato - HELD") plus an
"X/10" counter often appear. The images below are candidate frames in time order, each
labelled "Image n".

For EACH image return one object with:
- n: the image number.
- role: ALWAYS "question" or "reveal" when a punchline box with artist options is
  visible — "reveal" if exactly one option is highlighted in an accent colour, otherwise
  "question". Use "other" ONLY when there is no punchline/options card at all (pure
  talking head, intro, outro). When in doubt but a card is visible, extract it.
- line: the FULL punchline text exactly as shown — preserve German umlauts (ä ö ü ß)
  and quotes. CRITICAL: keep a normal space between every word and after punctuation;
  NEVER run two words together (e.g. "verlor'n. Die", not "verlor'n.Die"; "wir die",
  not "wirdie"). Preserve line breaks as \\n. null if no punchline box is visible.
- bars: the punchline split into its individual RAP BARS, one string per bar, in order.
  A bar is one rhymed line as it would be written out (a bar may wrap across two
  displayed lines — merge those into one bar). Each bar must have correct spacing and
  no trailing slash. [] if no punchline. This is the canonical segmentation we store.
- options: the artist option names top-to-bottom (only those actually shown; [] if none).
- correctIndex: 0-based index of the option HIGHLIGHTED in an accent colour (visually
  distinct from the other two — any colour); null if none is highlighted.
- correctArtist: the exact name of the highlighted option; null if none.
- songCredit: the "Artist - Title" credit line if shown; else null.
- indexLabel: the "X/10" counter if shown (e.g. "3/10"); else null.
Output ONLY the JSON array, one object per image, in image order.`

const RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      n: { type: "INTEGER" },
      role: { type: "STRING", enum: ["question", "reveal", "other"] },
      line: { type: "STRING", nullable: true },
      bars: { type: "ARRAY", items: { type: "STRING" } },
      options: { type: "ARRAY", items: { type: "STRING" } },
      correctIndex: { type: "INTEGER", nullable: true },
      correctArtist: { type: "STRING", nullable: true },
      songCredit: { type: "STRING", nullable: true },
      indexLabel: { type: "STRING", nullable: true },
    },
    required: ["n", "role"],
  },
}

function toPart(frame: CandidateFrame, n: number) {
  const b64 = fs.readFileSync(frame.path).toString("base64")
  return [
    { text: `Image ${n} (t=${Math.round(frame.tsMs / 1000)}s):` },
    { inline_data: { mime_type: "image/jpeg", data: b64 } },
  ]
}

/** Low-level Gemini call for one batch of frames. Retries with backoff. */
async function callBatch(
  frames: Array<CandidateFrame>,
): Promise<{ blocked: boolean; results: Array<FrameExtraction> }> {
  const key = requireEnv("GEMINI_API_KEY")
  const parts: Array<unknown> = [{ text: PROMPT }]
  frames.forEach((f, i) => parts.push(...toPart(f, i)))
  const body = {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
    // German rap bars (slurs/violence/explicit) are core to the content and
    // routinely trip Gemini's safety filters — a blocked batch returns no
    // candidates, which silently drops a whole episode. We never filter this
    // content (see project policy), so disable all safety thresholds.
    safetySettings: [
      "HARM_CATEGORY_HARASSMENT",
      "HARM_CATEGORY_HATE_SPEECH",
      "HARM_CATEGORY_SEXUALLY_EXPLICIT",
      "HARM_CATEGORY_DANGEROUS_CONTENT",
      "HARM_CATEGORY_CIVIC_INTEGRITY",
    ].map((category) => ({ category, threshold: "BLOCK_NONE" })),
  }

  let lastErr = ""
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(ENDPOINT(GEMINI_MODEL), {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        lastErr = `${res.status} ${await res.text().catch(() => "")}`.slice(0, 300)
        if (res.status === 429 || res.status >= 500) {
          await new Promise((r) => setTimeout(r, 1500 * Math.pow(2, attempt)))
          continue
        }
        throw new Error(`gemini ${lastErr}`)
      }
      const json = (await res.json()) as {
        promptFeedback?: { blockReason?: string }
        candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }>
      }
      const cand = json.candidates?.[0]
      // Input-level block (HTTP 200, no candidate): Gemini refused the whole
      // batch (promptFeedback.blockReason, often "OTHER" for edgy rap content).
      // safetySettings don't override this. Signal so the caller can split.
      if (!cand || json.promptFeedback?.blockReason) return { blocked: true, results: [] }
      const text = cand.content?.parts?.[0]?.text ?? "[]"
      return { blocked: false, results: JSON.parse(text) as Array<FrameExtraction> }
    } catch (e) {
      lastErr = String(e)
      await new Promise((r) => setTimeout(r, 1500 * Math.pow(2, attempt)))
    }
  }
  throw new Error(`gemini batch failed after retries: ${lastErr}`)
}

function otherFrame(frame: CandidateFrame): FrameExtraction & { frame: CandidateFrame } {
  return {
    n: 0,
    role: "other",
    line: null,
    bars: [],
    options: [],
    correctIndex: null,
    correctArtist: null,
    songCredit: null,
    indexLabel: null,
    frame,
  }
}

/**
 * Extract a group of frames in one call. If Gemini blocks the batch at the
 * input level (edgy content trips the filter in aggregate), recursively split
 * and retry — single frames almost always pass. A lone frame that still blocks
 * is logged and dropped (rare), never silently swallowing a whole episode.
 */
async function extractGroup(
  frames: Array<CandidateFrame>,
): Promise<Array<FrameExtraction & { frame: CandidateFrame }>> {
  if (frames.length === 0) return []
  const { blocked, results } = await callBatch(frames)
  if (blocked) {
    if (frames.length === 1) {
      console.warn(`[gemini] frame blocked @${frames[0].tsMs}ms — skipping`)
      return [otherFrame(frames[0])]
    }
    const mid = Math.floor(frames.length / 2)
    const [a, b] = await Promise.all([
      extractGroup(frames.slice(0, mid)),
      extractGroup(frames.slice(mid)),
    ])
    return [...a, ...b]
  }
  const byN = new Map(results.map((r) => [r.n, r]))
  return frames.map((frame, j) => {
    const r = byN.get(j)
    if (!r) return otherFrame(frame)
    return { ...r, bars: r.bars ?? [], options: r.options ?? [], frame }
  })
}

/**
 * Extract every candidate frame, in batches (keeps each request sane and bounds
 * token use). Returns one FrameExtraction per input frame, aligned by index.
 */
export async function extractFrames(
  frames: Array<CandidateFrame>,
  batchSize = 12,
): Promise<Array<FrameExtraction & { frame: CandidateFrame }>> {
  const out: Array<FrameExtraction & { frame: CandidateFrame }> = []
  for (let i = 0; i < frames.length; i += batchSize) {
    out.push(...(await extractGroup(frames.slice(i, i + batchSize))))
  }
  return out
}
