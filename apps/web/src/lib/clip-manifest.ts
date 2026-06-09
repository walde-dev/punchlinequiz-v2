/**
 * Clip manifest (PUN-178) — the "AI" half of the slideshow machine.
 *
 * v1 (now): authored by Claude Code from the verified bar pool — a deliberate MIX
 * of recognizable bars (broad reach + high completion) and deeper cuts (comment
 * bait / flex), with German hooks + captions matched to difficulty. The slide
 * engine (PUN-180, `slide-card.ts`) renders straight from these entries.
 *
 * v2 (later): swap this static list for a cheap LLM API call producing the same
 * shape — `ClipManifestEntry[]` is the stable contract, so it's a one-file change.
 *
 * RULES baked in:
 *  - Every `barId` here MUST be `reviewed = true` (the content guardrail; the
 *    server re-checks via `fetchSlideBar`).
 *  - Captions NEVER name the artist (it plays on-screen → would spoil the guess).
 *  - Comment-bait in the tension/caption ("Tipp in die Kommentare") drives the
 *    engagement the algorithm rewards.
 */

export type ClipManifestEntry = {
  /** A verified (reviewed) punchline id. */
  barId: number
  /** Post caption — NO artist spoiler. Comment-bait + hashtags. */
  caption: string
  /** Per-slide copy passed to the renderer (slide 1 / slide 3 / slide 4). */
  hooks: { hook: string; tension: string; flex: string }
}

const TAGS = "#deutschrap #rap #hiphop #rapquiz #punchline"

export const CLIP_MANIFEST: Array<ClipManifestEntry> = [
  // --- Recognizable / mainstream → "should be easy" tone ---
  {
    barId: 322, // Apache 207
    caption: `Das kennt doch jeder… oder? 🎤 Schreib deinen Tipp in die Kommentare 👇 ${TAGS}`,
    hooks: {
      hook: "Das kennt jeder… oder?",
      tension: "Na, schon sicher? 👀 Schreib's in die Kommentare",
      flex: "Gewusst? Dann bist du safe.",
    },
  },
  {
    barId: 332, // Bonez MC
    caption: `Das muss eigentlich sitzen… oder? 👀 Wer war's? 👇 ${TAGS}`,
    hooks: {
      hook: "Diese Line MUSS sitzen.",
      tension: "Letzte Chance — wer ist es?",
      flex: "Zu einfach? Ab zur nächsten Bar.",
    },
  },
  {
    barId: 337, // Haftbefehl
    caption: `Wenn du DAS nicht weißt… 😬 Tipp in die Kommentare 👇 ${TAGS}`,
    hooks: {
      hook: "Erkennst du den Künstler?",
      tension: "Bist du dir sicher? 🤔",
      flex: "Klar gewusst? Echter Kenner.",
    },
  },
  {
    barId: 214, // K.I.Z
    caption: `Eine der härtesten Lines. Wer war's? 👇 ${TAGS}`,
    hooks: {
      hook: "Wer spittet das?",
      tension: "Dein letzter Tipp… 👇",
      flex: "Wer das wusste, hört richtig.",
    },
  },
  {
    barId: 312, // Kollegah
    caption: `Punchline-Königsklasse. Wer hat's gesagt? 👇 ${TAGS}`,
    hooks: {
      hook: "Wer hat das gerappt?",
      tension: "Sicher? 👀",
      flex: "Gewusst — Doppelreim-Detektor aktiviert.",
    },
  },
  {
    barId: 264, // Farid Bang
    caption: `Wer hat diese Line rausgehauen? 👇 ${TAGS}`,
    hooks: {
      hook: "Wer war das?",
      tension: "Noch zu retten? 👇",
      flex: "Gewusst? Respekt.",
    },
  },

  // --- Deeper cuts / newer → "only real ones know" + comment bait ---
  {
    barId: 113, // Pashanim
    caption: `90% raten falsch. Du auch? 👇 ${TAGS}`,
    hooks: {
      hook: "90% raten das falsch.",
      tension: "Gehörst du zu den 10%? 👇",
      flex: "Richtig? Du kennst dich aus.",
    },
  },
  {
    barId: 681, // Ski Aggu
    caption: `Nur echte Kenner wissen das. Wer war's? 👇 ${TAGS}`,
    hooks: {
      hook: "Nur echte Kenner wissen das.",
      tension: "Letzte Chance — Tipp abgeben 👇",
      flex: "Gewusst? Du bist echt tief drin.",
    },
  },
  {
    barId: 411, // Ayliva
    caption: `Schwerer als es aussieht. Wer hat's gesagt? 👇 ${TAGS}`,
    hooks: {
      hook: "Wer hat das gesungen?",
      tension: "Sicher? 👀",
      flex: "Richtig getippt? Stark.",
    },
  },
  {
    barId: 507, // Makko
    caption: `Die wenigsten kriegen die. Wer war's? 👇 ${TAGS}`,
    hooks: {
      hook: "Erkennst du den Künstler?",
      tension: "Dein Tipp? 👇",
      flex: "Gewusst? Nicht selbstverständlich.",
    },
  },
  {
    barId: 1079, // Yassin
    caption: `Für die echten Heads. Wer hat das gerappt? 👇 ${TAGS}`,
    hooks: {
      hook: "Nur für echte Heads.",
      tension: "Schon sicher? 🤔",
      flex: "Richtig? Du hörst nicht nur Charts.",
    },
  },
  {
    barId: 381, // Luciano
    caption: `Wer hat das gespittet? Tipp in die Kommentare 👇 ${TAGS}`,
    hooks: {
      hook: "Wer hat das gerappt?",
      tension: "Letzte Chance 👇",
      flex: "Gewusst? Sauber.",
    },
  },
]
