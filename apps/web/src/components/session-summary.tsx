import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { renderShareCard, shareFilenameFor, shareUrlFor } from "../lib/share-card"
import { logEvent } from "../lib/track"
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

type ShareChannel = "native" | "whatsapp" | "twitter" | "instagram" | "download" | "copy"

const ease = "cubic-bezier(0.16, 1, 0.3, 1)"

function verdictHeadline(
  t: TFunction,
  score: number,
  total: number,
  mode: "artist" | "cloze",
): string {
  if (total === 0) return t("session.headline.ended")
  const r = score / total
  if (score === total) return mode === "cloze" ? t("session.headline.perfectCloze") : t("session.headline.perfectArtist")
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
  const cardData = useMemo<ShareCardData>(
    () => ({ score, total, mode, artistName, artistImageUrl }),
    [score, total, mode, artistName, artistImageUrl],
  )

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [generating, setGenerating] = useState(true)
  const [copied, setCopied] = useState(false)

  const shareUrl = useMemo(() => shareUrlFor({ mode, artistSlug }), [mode, artistSlug])

  useEffect(() => {
    let cancelled = false
    let createdUrl: string | null = null
    setGenerating(true)
    renderShareCard(cardData)
      .then((b) => {
        if (cancelled) return
        createdUrl = URL.createObjectURL(b)
        setBlob(b)
        setPreviewUrl(createdUrl)
        setGenerating(false)
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setGenerating(false)
      })
    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [cardData])

  useEffect(() => {
    logEvent("session_completed", {
      score,
      total,
      mode,
      artist_slug: artistSlug ?? null,
    })
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
    if (!blob) return
    const text = t("session.shareText", { score, total })
    const file = new File([blob], shareFilenameFor(cardData), { type: "image/png" })
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
    const dataWithFile: ShareData = { files: [file], text, url: shareUrl }
    const canShareFile = typeof nav.canShare === "function" && nav.canShare(dataWithFile)
    try {
      logShare("native")
      await nav.share(canShareFile ? dataWithFile : { text, url: shareUrl })
    } catch {
      // user cancelled — no-op
    }
  }

  function onWhatsApp() {
    logShare("whatsapp")
    const text = encodeURIComponent(`${t("session.shareText", { score, total })} ${shareUrl}`)
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener")
  }

  function onTwitter() {
    logShare("twitter")
    const text = encodeURIComponent(t("session.shareTextTwitter", { score, total }))
    const url = encodeURIComponent(shareUrl)
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, "_blank", "noopener")
  }

  function onInstagram() {
    logShare("instagram")
    // Instagram has no web share intent — download the card and tell the user.
    onDownload()
  }

  const hasNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function"

  return (
    <div
      className="mx-auto flex w-full max-w-md flex-col items-stretch gap-6"
      style={{ animation: `pq-fade-up 0.55s ${ease} both` }}
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="text-xs font-bold tracking-[0.18em] uppercase text-primary/80">
          {t("session.eyebrow")}
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight">
          {verdictHeadline(t, score, total, mode)}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("session.subtitle")}
        </p>
      </div>

      {/* Result dots — replay of which lines hit */}
      <div className="flex items-center justify-center gap-1.5" aria-label={t("session.resultsAria", { score, total })}>
        {results.map((hit, i) => (
          <span
            key={i}
            className={cn(
              "inline-block h-2 w-7 rounded-full transition-colors",
              hit ? "bg-primary" : "bg-muted-foreground/25",
            )}
            aria-hidden="true"
          />
        ))}
      </div>

      {/* Card preview */}
      <div
        className="relative overflow-hidden rounded-3xl border border-primary/30 bg-card/40 shadow-[0_20px_60px_-20px_rgba(251,191,36,0.25)]"
        style={{ aspectRatio: "1 / 1", animation: `pq-pop-in 0.55s ${ease} 0.1s both` }}
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={t("session.cardAlt")}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {generating ? t("session.cardGenerating") : t("session.cardFailed")}
            </span>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-3">
        {hasNativeShare ? (
          <Button
            size="lg"
            onClick={onNativeShare}
            disabled={!blob}
            className="cta-glow min-h-12 w-full text-base font-bold"
          >
            {t("common.shareCard")}
          </Button>
        ) : (
          <Button
            size="lg"
            onClick={onDownload}
            disabled={!blob}
            className="cta-glow min-h-12 w-full text-base font-bold"
          >
            {t("common.saveCard")}
          </Button>
        )}

        <div className="grid grid-cols-3 gap-2">
          <ShareChip label="WhatsApp" onClick={onWhatsApp} />
          <ShareChip label="X / Twitter" onClick={onTwitter} />
          <ShareChip label="Instagram" onClick={onInstagram} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onCopyLink}
            className="min-h-11 rounded-full border border-border/60 text-sm font-bold"
          >
            {copied ? `${t("common.linkCopied")} ✓` : t("common.copyLink")}
          </Button>
          {hasNativeShare && (
            <Button
              type="button"
              variant="ghost"
              onClick={onDownload}
              disabled={!blob}
              className="min-h-11 rounded-full border border-border/60 text-sm font-bold"
            >
              {t("common.saveCard")}
            </Button>
          )}
          {!hasNativeShare && (
            <Button
              type="button"
              variant="ghost"
              onClick={onCopyLink}
              className="min-h-11 rounded-full border border-border/60 text-sm font-bold"
            >
              {copied ? `${t("common.linkCopied")} ✓` : t("common.copyLink")}
            </Button>
          )}
        </div>

        <Button
          type="button"
          variant="ghost"
          onClick={onRestart}
          className="min-h-12 w-full rounded-full text-base font-bold text-muted-foreground hover:text-foreground"
        >
          {t("session.restart")}
        </Button>
      </div>
    </div>
  )
}

function ShareChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex min-h-11 items-center justify-center rounded-full",
        "border border-border/60 bg-card/40 px-3 text-xs font-bold tracking-tight",
        "hover:border-primary/50 hover:bg-primary/10 hover:text-primary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        "transition-colors",
      )}
    >
      {label}
    </button>
  )
}
