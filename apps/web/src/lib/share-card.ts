/**
 * Client-side share card renderer. Draws a 1080×1080 PNG on a canvas using
 * the same gold-on-charcoal aesthetic as the play UI. No external deps.
 *
 * Why canvas (vs html-to-image): zero install footprint, deterministic
 * output across browsers, doesn't depend on the live DOM render of the
 * summary screen — so the image always looks the same regardless of
 * viewport size or scroll position.
 */

import i18n from "../i18n"

export type ShareMode = "artist" | "cloze"

export type ShareCardData = {
  score: number
  total: number
  mode: ShareMode
  artistName?: string | null
  artistImageUrl?: string | null
}

const GOLD = "#fbbf24"
const FG = "#fafafa"
const BG_TOP = "#1a1a1a"
const BG_BOTTOM = "#0d0d0d"

function verdict(score: number, total: number): string {
  return i18n.t("share.verdict", { context: verdictKey(score, total) })
}

function verdictKey(score: number, total: number): string {
  if (total === 0) return "empty"
  const r = score / total
  if (score === total) return "perfect"
  if (r >= 0.8) return "great"
  if (r >= 0.6) return "solid"
  if (r >= 0.4) return "half"
  if (r >= 0.2) return "low"
  return "miss"
}

function eyebrow(data: ShareCardData): string {
  if (data.artistName) return i18n.t("share.eyebrowArtist", { name: data.artistName }).toUpperCase()
  if (data.mode === "cloze") return i18n.t("share.eyebrowCloze").toUpperCase()
  return i18n.t("share.eyebrowClassic").toUpperCase()
}

async function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

async function ensureFonts(): Promise<void> {
  if (typeof document === "undefined") return
  // Pre-load the weights we use on the card so canvas measures them right.
  try {
    await Promise.all([
      document.fonts.load("900 360px 'Figtree Variable'"),
      document.fonts.load("900 180px 'Figtree Variable'"),
      document.fonts.load("700 44px 'Figtree Variable'"),
      document.fonts.load("700 36px 'Figtree Variable'"),
      document.fonts.load("700 28px 'Figtree Variable'"),
    ])
    await document.fonts.ready
  } catch {
    // Fall back to system font if Figtree never resolves.
  }
}

export async function renderShareCard(data: ShareCardData): Promise<Blob> {
  await ensureFonts()
  const size = 1080
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")!

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, 0, size)
  bg.addColorStop(0, BG_TOP)
  bg.addColorStop(1, BG_BOTTOM)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, size, size)

  // Radial gold spotlight (matches .pq-spotlight in CSS)
  const glow = ctx.createRadialGradient(
    size * 0.5,
    size * 0.38,
    0,
    size * 0.5,
    size * 0.38,
    size * 0.75,
  )
  glow.addColorStop(0, "rgba(251, 191, 36, 0.22)")
  glow.addColorStop(0.5, "rgba(251, 191, 36, 0.06)")
  glow.addColorStop(1, "rgba(251, 191, 36, 0)")
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, size, size)

  // Subtle dot grid for texture
  ctx.fillStyle = "rgba(255,255,255,0.022)"
  for (let y = 40; y < size; y += 44) {
    for (let x = 40; x < size; x += 44) {
      ctx.beginPath()
      ctx.arc(x, y, 1.4, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const pad = 80
  const font = "'Figtree Variable', system-ui, sans-serif"

  // Wordmark — top-left
  ctx.textBaseline = "top"
  ctx.font = `700 44px ${font}`
  ctx.fillStyle = FG
  ctx.fillText("punchline", pad, pad)
  const pm = ctx.measureText("punchline")
  ctx.fillStyle = GOLD
  ctx.fillText("/quiz", pad + pm.width, pad)

  // Score dots — top-right (mirrors the in-app round history)
  const dotR = 9
  const dotGap = 30
  const dotsW = (data.total - 1) * dotGap
  const dotsStartX = size - pad - dotsW
  const dotsY = pad + 22
  for (let i = 0; i < data.total; i++) {
    ctx.beginPath()
    ctx.arc(dotsStartX + i * dotGap, dotsY, dotR, 0, Math.PI * 2)
    ctx.fillStyle = i < data.score ? GOLD : "rgba(255,255,255,0.16)"
    ctx.fill()
  }

  // Eyebrow (mode / artist tag)
  ctx.font = `700 26px ${font}`
  ctx.fillStyle = "rgba(251, 191, 36, 0.85)"
  // letterSpacing is supported in modern Chrome/Safari; cast to widen the type
  const ctxAny = ctx as CanvasRenderingContext2D & { letterSpacing?: string }
  if ("letterSpacing" in ctxAny) ctxAny.letterSpacing = "4px"
  ctx.fillText(eyebrow(data), pad, 340)
  if ("letterSpacing" in ctxAny) ctxAny.letterSpacing = "0px"

  // Optional artist avatar — circular, beside eyebrow on second line
  let avatarOffset = 0
  if (data.artistImageUrl) {
    const img = await loadImage(data.artistImageUrl)
    if (img) {
      const ar = 56
      const ax = pad
      const ay = 390
      ctx.save()
      ctx.beginPath()
      ctx.arc(ax + ar, ay + ar, ar, 0, Math.PI * 2)
      ctx.closePath()
      ctx.clip()
      ctx.drawImage(img, ax, ay, ar * 2, ar * 2)
      ctx.restore()
      // Gold ring
      ctx.beginPath()
      ctx.arc(ax + ar, ay + ar, ar + 1, 0, Math.PI * 2)
      ctx.strokeStyle = "rgba(251, 191, 36, 0.5)"
      ctx.lineWidth = 2
      ctx.stroke()
      avatarOffset = ar * 2 + 24
    }
  }

  // The hero: big score
  ctx.textBaseline = "alphabetic"
  ctx.font = `900 360px ${font}`
  ctx.fillStyle = FG
  const scoreText = String(data.score)
  const scoreY = 760
  ctx.fillText(scoreText, pad, scoreY)
  const sw = ctx.measureText(scoreText).width

  // " / total " in muted gold, smaller, slightly raised baseline
  ctx.font = `900 180px ${font}`
  ctx.fillStyle = "rgba(251, 191, 36, 0.45)"
  ctx.fillText(`/${data.total}`, pad + sw + 24, scoreY - 12)

  // Verdict line
  ctx.font = `700 38px ${font}`
  ctx.fillStyle = "rgba(250, 250, 250, 0.72)"
  ctx.textBaseline = "top"
  ctx.fillText(verdict(data.score, data.total), pad, scoreY + 30)

  // Bottom CTA
  ctx.font = `700 28px ${font}`
  ctx.fillStyle = "rgba(250,250,250,0.55)"
  ctx.fillText(i18n.t("share.cta"), pad, size - 150)

  ctx.font = `900 44px ${font}`
  ctx.fillStyle = GOLD
  ctx.fillText("punchlinequiz.de", pad, size - 105)

  // Suppress unused-var lint without affecting layout above
  void avatarOffset

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("canvas.toBlob returned null"))),
      "image/png",
      0.95,
    )
  })
}

export function shareUrlFor(data: { mode: ShareMode; artistSlug?: string | null }): string {
  const base =
    typeof window !== "undefined" ? `${window.location.origin}/play` : "https://punchlinequiz.de/play"
  const params = new URLSearchParams()
  if (data.mode === "cloze") params.set("mode", "cloze")
  if (data.artistSlug) params.set("artist", data.artistSlug)
  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}

export function shareFilenameFor(data: ShareCardData): string {
  const slug = data.artistName
    ? data.artistName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
    : data.mode
  return `punchlinequiz-${slug}-${data.score}-${data.total}.png`
}
