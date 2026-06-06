import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "@tanstack/react-router"
import { useAuth } from "@clerk/tanstack-react-start"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { createChallengeFn } from "../lib/challenge"
import { getShareCarrierFn } from "../lib/referral"
import {
  renderShareCard,
  shareFilenameFor,
  shareUrlFor,
} from "../lib/share-card"
import { incSessionsCompleted } from "../lib/session-progress"
import { logEvent } from "../lib/track"
import { DiscordJoinCard } from "./discord-cta"
import type { TFunction } from "i18next"
import type { ShareCarrier } from "../lib/referral"
import type { ShareCardData } from "../lib/share-card"

type Props = {
  score: number
  total: number
  mode: "artist" | "cloze"
  results: Array<boolean>
  artistName?: string | null
  artistSlug?: string | null
  artistImageUrl?: string | null
  onRestart: () => void
}

type ShareChannel = "native" | "download" | "copy"

const ease = "cubic-bezier(0.16, 1, 0.3, 1)"

function verdictHeadline(
  t: TFunction,
  score: number,
  total: number,
  mode: "artist" | "cloze"
): string {
  if (total === 0) return t("session.headline.ended")
  const r = score / total
  if (score === total)
    return mode === "cloze"
      ? t("session.headline.perfectCloze")
      : t("session.headline.perfectArtist")
  if (r >= 0.8) return t("session.headline.great")
  if (r >= 0.6) return t("session.headline.solid")
  if (r >= 0.4) return t("session.headline.half")
  return t("session.headline.tryAgain")
}

export function SessionSummary({
  score,
  total,
  mode,
  results,
  artistName,
  artistSlug,
  artistImageUrl,
  onRestart,
}: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { isSignedIn } = useAuth()
  const [creatingChallenge, setCreatingChallenge] = useState(false)
  const cardData = useMemo<ShareCardData>(
    () => ({ score, total, mode, artistName, artistImageUrl }),
    [score, total, mode, artistName, artistImageUrl]
  )

  async function createChallenge() {
    if (creatingChallenge) return
    setCreatingChallenge(true)
    try {
      const { slug } = await createChallengeFn()
      logEvent("challenge_created", { slug, from: "session" })
      navigate({ to: "/c/$slug", params: { slug } })
    } catch (e) {
      console.error(e)
      setCreatingChallenge(false)
    }
  }

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [generating, setGenerating] = useState(true)
  const [copied, setCopied] = useState(false)

  // Referral carrier (PUN-119): handle invite for signed-in sharers, opaque code
  // for anon — appended so the share→land→signup loop is attributable.
  const [carrier, setCarrier] = useState<ShareCarrier | null>(null)
  useEffect(() => {
    let active = true
    getShareCarrierFn()
      .then((c) => active && setCarrier(c))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const shareUrl = useMemo(
    () => shareUrlFor({ mode, artistSlug, carrier }),
    [mode, artistSlug, carrier]
  )

  useEffect(() => {
    let cancelled = false
    let createdUrl: string | null = null
    setGenerating(true)
    // Telemetry: we were blind to whether the card renders on real devices
    // (the share button is disabled until the blob is ready). PUN-122.
    const startedAt = performance.now()
    renderShareCard(cardData)
      .then((b) => {
        if (cancelled) return
        createdUrl = URL.createObjectURL(b)
        setBlob(b)
        setPreviewUrl(createdUrl)
        setGenerating(false)
        logEvent("card_render_succeeded", {
          ms: Math.round(performance.now() - startedAt),
          mode,
        })
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setGenerating(false)
        logEvent("card_render_failed", {
          ms: Math.round(performance.now() - startedAt),
          mode,
          message: String(err),
        })
      })
    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [cardData, mode])

  useEffect(() => {
    logEvent("session_completed", {
      score,
      total,
      mode,
      artist_slug: artistSlug ?? null,
    })
    // Bump the completed-runs counter that drives the escalating signup gate
    // (PUN-118). This summary is the single place a finished run is observed.
    incSessionsCompleted()
  }, [score, total, mode, artistSlug])

  function logShare(channel: ShareChannel) {
    logEvent("share_clicked", {
      channel,
      score,
      total,
      mode,
      artist_slug: artistSlug ?? null,
    })
  }

  function onDownload() {
    if (!blob) return
    logShare("download")
    const a = document.createElement("a")
    const url = URL.createObjectURL(blob)
    a.href = url
    a.download = shareFilenameFor(cardData)
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function onCopyLink() {
    logShare("copy")
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // ignore
    }
  }

  async function onNativeShare() {
    const text = t("session.shareText", { score, total })
    const nav = navigator as Navigator & {
      canShare?: (d: ShareData) => boolean
    }
    // The share must NEVER block on the canvas render. PUN-122 telemetry showed
    // the card completed for only ~14% of finishers (and 0 completed shares),
    // because the button was gated on a blob that often never arrived. Always
    // share text+link; attach the rendered card only if it happens to be ready.
    let payload: ShareData = { text, url: shareUrl }
    let withImage = false
    if (blob) {
      const file = new File([blob], shareFilenameFor(cardData), {
        type: "image/png",
      })
      const dataWithFile: ShareData = { files: [file], text, url: shareUrl }
      if (typeof nav.canShare === "function" && nav.canShare(dataWithFile)) {
        payload = dataWithFile
        withImage = true
      }
    }
    try {
      logShare("native")
      await nav.share(payload)
      // Resolves when the OS sheet completes a share (PUN-122 outcome telemetry).
      logEvent("share_completed", {
        channel: "native",
        score,
        total,
        mode,
        artist_slug: artistSlug ?? null,
        with_image: withImage,
      })
    } catch {
      // AbortError = user dismissed the sheet without sharing.
      logEvent("share_dismissed", {
        channel: "native",
        mode,
        artist_slug: artistSlug ?? null,
      })
    }
  }

  const hasNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function"

  return (
    <div
      className="mx-auto flex w-full max-w-md flex-col items-stretch gap-6"
      style={{ animation: `pq-fade-up 0.55s ${ease} both` }}
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="text-xs font-bold tracking-[0.18em] text-primary/80 uppercase">
          {t("session.eyebrow")}
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight">
          {verdictHeadline(t, score, total, mode)}
        </h1>
        <p className="text-sm text-muted-foreground">{t("session.subtitle")}</p>
      </div>

      {/* Result dots — replay of which lines hit */}
      <div
        className="flex items-center justify-center gap-1.5"
        aria-label={t("session.resultsAria", { score, total })}
      >
        {results.map((hit, i) => (
          <span
            key={i}
            className={cn(
              "inline-block h-2 w-7 rounded-full transition-colors",
              hit ? "bg-primary" : "bg-muted-foreground/25"
            )}
            aria-hidden="true"
          />
        ))}
      </div>

      {/* Card preview */}
      <div
        className="relative overflow-hidden rounded-3xl border border-primary/30 bg-card/40 shadow-[0_20px_60px_-20px_rgba(251,191,36,0.25)]"
        style={{
          aspectRatio: "1 / 1",
          animation: `pq-pop-in 0.55s ${ease} 0.1s both`,
        }}
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={t("session.cardAlt")}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
              {generating
                ? t("session.cardGenerating")
                : t("session.cardFailed")}
            </span>
          </div>
        )}
      </div>

      {/* Action buttons (PUN-122 follow-up): the win moment IS the share moment,
          so SHARE is the primary CTA — and it never gates on the canvas render
          (it shares text+link instantly, attaching the card image only if ready).
          "Keep playing" drops to a clear secondary. */}
      <div className="flex flex-col gap-3">
        {/* PRIMARY: share. Native sheet (WhatsApp/X/IG) on mobile; on desktop
            (no navigator.share) the instant copy-link is the primary share. */}
        {hasNativeShare ? (
          <Button
            type="button"
            size="lg"
            onClick={onNativeShare}
            className="cta-glow min-h-12 w-full text-base font-bold"
          >
            {t("common.shareCard")}
          </Button>
        ) : (
          <Button
            type="button"
            size="lg"
            onClick={onCopyLink}
            className="cta-glow min-h-12 w-full text-base font-bold"
          >
            {copied ? `${t("common.linkCopied")} ✓` : t("common.shareCard")}
          </Button>
        )}

        {/* SECONDARY: keep playing — the engagement loop, one tap away. */}
        <Button
          variant="outline"
          size="lg"
          onClick={onRestart}
          className="min-h-12 w-full text-base font-bold"
        >
          {t("session.nextBars")}
          <span aria-hidden="true">→</span>
        </Button>

        {/* Desktop only: save the card image as an optional extra. */}
        {!hasNativeShare && (
          <Button
            type="button"
            variant="ghost"
            onClick={onDownload}
            disabled={!blob}
            className="min-h-11 w-full border border-border/60 text-sm font-bold"
          >
            {generating ? t("session.cardGenerating") : t("common.saveCard")}
          </Button>
        )}

        {/* Challenge a friend — a signed-in UPGRADE of the share, not a competing
            CTA (PUN-122). Signed-out players just get the share card above. */}
        {isSignedIn && (
          <Button
            type="button"
            variant="ghost"
            onClick={createChallenge}
            disabled={creatingChallenge}
            className="min-h-12 w-full text-sm font-bold text-muted-foreground hover:text-foreground"
          >
            {creatingChallenge
              ? t("challenge.creating")
              : t("profile.public.createChallenge")}
          </Button>
        )}

        {/* Community next-step — the post-game high is the right moment to ask. */}
        <DiscordJoinCard placement="session_summary" delay={0.15} />
      </div>
    </div>
  )
}
