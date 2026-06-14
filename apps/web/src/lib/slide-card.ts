/**
 * Slideshow clip renderer (PUN-180). Draws the 4 slides of a "Wer hat's gesagt?"
 * TikTok/Reels carousel as 1080×1350 PNGs on a canvas, reusing the gold-on-
 * charcoal aesthetic + helpers from share-card.ts. The operator screenshots /
 * downloads these, uploads them as a native carousel, and adds a trending sound
 * in-app (see the TikTok/Insta playbook). No video, no audio, no AI imagery —
 * real album art / artist photos only.
 *
 * Slide order (artist-guess, hook on every slide):
 *   1. HOOK     — the bar + "Wer hat das gerappt?"  (scroll-stopper)
 *   2. OPTIONS  — the 3 real distractor artists, A/B/C
 *   3. TENSION  — a swipe-bait beat
 *   4. REVEAL   — correct artist photo + name + flex + CTA
 */

import { FG, GOLD, ensureFonts, loadImage } from "./share-card"

const BG_TOP = "#1a1a1a"
const BG_BOTTOM = "#0d0d0d"
const W = 1080
const H = 1350
const PAD = 80
const FONT = "'Figtree Variable', system-ui, sans-serif"

export type SlideChoice = { id: number; name: string; imageUrl: string | null }

export type SlideData = {
  line: string
  /** The 3 artist choices, already shuffled (one is the correct answer). */
  choices: Array<SlideChoice>
  correctId: number
  correctName: string
  correctImageUrl: string | null
  /**
   * Optional copy overrides — the manifest (PUN-178) fills these per clip.
   * When absent, sensible German defaults are used so the engine works
   * standalone before the AI step is wired.
   */
  hooks?: { hook?: string; tension?: string; flex?: string }
}

type Ctx = CanvasRenderingContext2D

function setLetterSpacing(ctx: Ctx, px: string) {
  const c = ctx as Ctx & { letterSpacing?: string }
  if ("letterSpacing" in c) c.letterSpacing = px
}

function background(ctx: Ctx) {
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, BG_TOP)
  bg.addColorStop(1, BG_BOTTOM)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  const glow = ctx.createRadialGradient(W * 0.5, H * 0.4, 0, W * 0.5, H * 0.4, H * 0.62)
  glow.addColorStop(0, "rgba(251, 191, 36, 0.20)")
  glow.addColorStop(0.5, "rgba(251, 191, 36, 0.05)")
  glow.addColorStop(1, "rgba(251, 191, 36, 0)")
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  ctx.fillStyle = "rgba(255,255,255,0.022)"
  for (let y = 40; y < H; y += 44) {
    for (let x = 40; x < W; x += 44) {
      ctx.beginPath()
      ctx.arc(x, y, 1.4, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function wordmark(ctx: Ctx) {
  ctx.textBaseline = "top"
  ctx.font = `700 40px ${FONT}`
  ctx.fillStyle = FG
  ctx.fillText("punchline", PAD, PAD)
  const pm = ctx.measureText("punchline")
  ctx.fillStyle = GOLD
  ctx.fillText("/quiz", PAD + pm.width, PAD)
}

function eyebrow(ctx: Ctx, text: string, y: number) {
  ctx.textBaseline = "top"
  ctx.font = `700 26px ${FONT}`
  ctx.fillStyle = "rgba(251, 191, 36, 0.9)"
  setLetterSpacing(ctx, "4px")
  ctx.fillText(text.toUpperCase(), PAD, y)
  setLetterSpacing(ctx, "0px")
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function circleAvatar(
  ctx: Ctx,
  img: HTMLImageElement | null,
  cx: number,
  cy: number,
  r: number,
  initials: string,
) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()
  if (img) {
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2)
  } else {
    ctx.fillStyle = "rgba(251,191,36,0.12)"
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
    ctx.fillStyle = "rgba(251,191,36,0.85)"
    ctx.font = `900 ${Math.round(r * 0.9)}px ${FONT}`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(initials, cx, cy + 2)
    ctx.textAlign = "left"
  }
  ctx.restore()
  ctx.beginPath()
  ctx.arc(cx, cy, r + 1, 0, Math.PI * 2)
  ctx.strokeStyle = "rgba(251, 191, 36, 0.5)"
  ctx.lineWidth = 3
  ctx.stroke()
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

/** Wrap the bar into lines, honouring the "/" rhyme-break used in the play UI. */
function wrapBar(ctx: Ctx, line: string, maxW: number): Array<string> {
  const segments = line.split("/").map((s) => s.trim()).filter(Boolean)
  const out: Array<string> = []
  for (const seg of segments) {
    const words = seg.split(/\s+/)
    let cur = ""
    for (const w of words) {
      const trial = cur ? `${cur} ${w}` : w
      if (ctx.measureText(trial).width > maxW && cur) {
        out.push(cur)
        cur = w
      } else {
        cur = trial
      }
    }
    if (cur) out.push(cur)
  }
  return out
}

/** Pick the largest font (within [min,max]) at which the bar fits the box. */
function fitBar(
  ctx: Ctx,
  line: string,
  maxW: number,
  maxH: number,
  weight: number,
  max = 78,
  min = 32,
): { size: number; lines: Array<string> } {
  for (let size = max; size >= min; size -= 2) {
    ctx.font = `${weight} ${size}px ${FONT}`
    const lines = wrapBar(ctx, line, maxW)
    if (lines.length * size * 1.18 <= maxH) return { size, lines }
  }
  ctx.font = `${weight} ${min}px ${FONT}`
  return { size: min, lines: wrapBar(ctx, line, maxW) }
}

function drawBar(ctx: Ctx, line: string, top: number, maxH: number, weight = 900, max = 78) {
  const maxW = W - PAD * 2
  const { size, lines } = fitBar(ctx, line, maxW, maxH, weight, max)
  ctx.font = `${weight} ${size}px ${FONT}`
  ctx.fillStyle = FG
  ctx.textBaseline = "top"
  const lineH = size * 1.18
  let y = top
  // Opening quote
  ctx.fillStyle = "rgba(251,191,36,0.45)"
  ctx.fillText("„", PAD - 4, top - size * 0.1)
  ctx.fillStyle = FG
  for (const l of lines) {
    ctx.fillText(l, PAD, y)
    y += lineH
  }
  return y
}

/** Big bold headline (the scroll-stopper hook). Returns the bottom y. */
function drawHeadline(ctx: Ctx, text: string, top: number, maxH: number, color: string): number {
  const maxW = W - PAD * 2
  const { size, lines } = fitBar(ctx, text, maxW, maxH, 900, 92, 52)
  ctx.font = `900 ${size}px ${FONT}`
  ctx.fillStyle = color
  ctx.textBaseline = "top"
  const lineH = size * 1.08
  let y = top
  for (const l of lines) {
    ctx.fillText(l, PAD, y)
    y += lineH
  }
  return y
}

async function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("canvas.toBlob returned null"))),
      "image/png",
      0.95,
    ),
  )
}

function newCanvas(): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext("2d")!
  background(ctx)
  wordmark(ctx)
  return { canvas, ctx }
}

function footerCta(ctx: Ctx, line: string) {
  ctx.textBaseline = "top"
  ctx.font = `700 30px ${FONT}`
  ctx.fillStyle = "rgba(250,250,250,0.55)"
  ctx.fillText(line, PAD, H - 150)
  ctx.font = `900 46px ${FONT}`
  ctx.fillStyle = GOLD
  ctx.fillText("punchlinequiz.de", PAD, H - 100)
}

/** Renders the 3 carousel slides for one bar and returns them in order. */
export async function renderSlides(data: SlideData): Promise<Array<Blob>> {
  await ensureFonts()
  const hook = data.hooks?.hook?.trim() || "Wer hat das gerappt?"
  const flex = data.hooks?.flex?.trim() || "Gewusst? Dann kennst du dich aus."

  // Preload the artist images once (reused on options + reveal slides).
  const imgs = new Map<number, HTMLImageElement | null>()
  await Promise.all(
    data.choices.map(async (c) => {
      imgs.set(c.id, c.imageUrl ? await loadImage(c.imageUrl) : null)
    }),
  )
  const correctImg = data.correctImageUrl
    ? imgs.get(data.correctId) ?? (await loadImage(data.correctImageUrl))
    : null

  // ---- Slide 1: HOOK ----
  // The hook is the scroll-stopper, rendered BIG (gold). The bar sits below as
  // smaller supporting text so the slide leads with a hook, not a wall of lyrics.
  const s1 = newCanvas()
  const hookBottom = drawHeadline(s1.ctx, hook, 340, 340, GOLD)
  const barTop = Math.max(hookBottom + 56, 700)
  s1.ctx.font = `700 26px ${FONT}`
  s1.ctx.fillStyle = "rgba(250,250,250,0.45)"
  s1.ctx.textBaseline = "top"
  s1.ctx.fillText("DIE LINE", PAD, barTop - 44)
  drawBar(s1.ctx, data.line, barTop, H - barTop - 150, 700, 50)
  s1.ctx.font = `700 28px ${FONT}`
  s1.ctx.fillStyle = "rgba(251,191,36,0.7)"
  s1.ctx.textBaseline = "top"
  s1.ctx.fillText("swipe →", PAD, H - 120)

  // ---- Slide 2: OPTIONS (comment-bait moved here, where the eyeballs are) ----
  const s2 = newCanvas()
  eyebrow(s2.ctx, "Wer war’s?", 340)
  drawBar(s2.ctx, data.line, 410, 240, 700, 46)
  s2.ctx.font = `800 36px ${FONT}`
  s2.ctx.fillStyle = GOLD
  s2.ctx.textBaseline = "top"
  s2.ctx.fillText("Tipp in die Kommentare 👇", PAD, 720)
  const letters = ["A", "B", "C"]
  const rowH = 124
  const rowGap = 22
  const rowsTop = 800
  data.choices.slice(0, 3).forEach((c, i) => {
    const y = rowsTop + i * (rowH + rowGap)
    s2.ctx.fillStyle = "rgba(255,255,255,0.05)"
    roundRect(s2.ctx, PAD, y, W - PAD * 2, rowH, rowH / 2)
    s2.ctx.fill()
    s2.ctx.strokeStyle = "rgba(251,191,36,0.25)"
    s2.ctx.lineWidth = 2
    roundRect(s2.ctx, PAD, y, W - PAD * 2, rowH, rowH / 2)
    s2.ctx.stroke()
    const cy = y + rowH / 2
    circleAvatar(s2.ctx, imgs.get(c.id) ?? null, PAD + rowH / 2, cy, rowH / 2 - 12, initialsOf(c.name))
    s2.ctx.fillStyle = GOLD
    s2.ctx.font = `900 42px ${FONT}`
    s2.ctx.textBaseline = "middle"
    s2.ctx.fillText(letters[i], PAD + rowH + 14, cy)
    s2.ctx.fillStyle = FG
    s2.ctx.font = `800 44px ${FONT}`
    s2.ctx.fillText(c.name, PAD + rowH + 82, cy)
  })

  // ---- Slide 3: REVEAL (the payoff — now reached in one fewer swipe) ----
  const s3 = newCanvas()
  eyebrow(s3.ctx, "Die Antwort", 360)
  const avR = 150
  circleAvatar(s3.ctx, correctImg, W / 2, 620, avR, initialsOf(data.correctName))
  s3.ctx.textAlign = "center"
  s3.ctx.fillStyle = GOLD
  s3.ctx.font = `900 72px ${FONT}`
  s3.ctx.textBaseline = "top"
  s3.ctx.fillText(data.correctName, W / 2, 810)
  s3.ctx.fillStyle = "rgba(250,250,250,0.75)"
  s3.ctx.font = `700 36px ${FONT}`
  // flex line (wrapped, centered)
  {
    const flexLines = wrapBar(s3.ctx, flex, W - PAD * 2)
    let y = 910
    for (const l of flexLines) {
      s3.ctx.fillText(l, W / 2, y)
      y += 36 * 1.25
    }
  }
  s3.ctx.textAlign = "left"
  // Week-2: the UTM bio link is live → drive to it.
  footerCta(s3.ctx, "500+ Bars → Link in Bio")

  return Promise.all([toBlob(s1.canvas), toBlob(s2.canvas), toBlob(s3.canvas)])
}
