import { createFileRoute, redirect } from "@tanstack/react-router"
import { useCallback, useEffect, useRef, useState } from "react"

import { Button } from "@workspace/ui/components/button"

import { getClipFn, getSlideBarFn } from "../../lib/slides-data"
import { renderSlides } from "../../lib/slide-card"
import { isAdminFn } from "../../lib/session"
import { logEvent } from "../../lib/track"
import type { SlideData } from "../../lib/slide-card"

/**
 * Internal slideshow clip studio (PUN-180/178). Admin-gated. Default mode steps
 * through the AI manifest (caption + German hooks per verified bar); a fallback
 * mode renders a random verified bar with default hooks. Renders the 4-slide
 * carousel client-side (canvas); each slide downloads as a PNG — the operator
 * uploads them as a TikTok/IG carousel and adds a trending sound in-app.
 */
export const Route = createFileRoute("/admin/slides")({
  component: SlidesStudio,
  beforeLoad: async () => {
    const { admin } = await isAdminFn()
    if (!admin) throw redirect({ to: "/admin/login" })
  },
  validateSearch: (s: Record<string, unknown>) => ({
    i: s.i != null && s.i !== "" ? Number(s.i) : undefined,
    bar: s.bar != null && s.bar !== "" ? Number(s.bar) : undefined,
  }),
})

const SLIDE_LABELS = ["Hook", "Optionen", "Spannung", "Auflösung"]

function SlidesStudio() {
  const { i: iParam, bar: barParam } = Route.useSearch()
  const [urls, setUrls] = useState<Array<string>>([])
  const [caption, setCaption] = useState<string | null>(null)
  const [answer, setAnswer] = useState<string | null>(null)
  const [pos, setPos] = useState<{ index: number; total: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const urlsRef = useRef<Array<string>>([])

  const revoke = useCallback(() => {
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u))
    urlsRef.current = []
  }, [])

  const paint = useCallback(
    async (data: SlideData) => {
      const blobs = await renderSlides(data)
      revoke()
      const next = blobs.map((b) => URL.createObjectURL(b))
      urlsRef.current = next
      setUrls(next)
      setAnswer(data.correctName)
    },
    [revoke],
  )

  /** Manifest mode — AI caption + hooks for the clip at `index`. */
  const loadClip = useCallback(
    async (index: number) => {
      setLoading(true)
      setError(null)
      try {
        const clip = await getClipFn({ data: { index } })
        if (!clip) {
          setError("Kein Clip im Manifest (oder Bar nicht mehr geprüft).")
          return
        }
        await paint({ ...clip.bar, hooks: clip.hooks })
        setCaption(clip.caption)
        setPos({ index: clip.index, total: clip.total })
        logEvent("clip_slides_rendered", { barId: clip.bar.punchlineId, index: clip.index })
      } catch (e) {
        setError(e instanceof Error ? e.message : "Render fehlgeschlagen")
      } finally {
        setLoading(false)
      }
    },
    [paint],
  )

  /** Fallback mode — a random (or specific) verified bar with default hooks. */
  const loadRandom = useCallback(
    async (barId?: number) => {
      setLoading(true)
      setError(null)
      try {
        const bar = await getSlideBarFn({ data: { barId: barId ?? null } })
        if (!bar) {
          setError("Keine geprüfte Bar gefunden.")
          return
        }
        await paint(bar)
        setCaption(null)
        setPos(null)
        logEvent("clip_slides_rendered", { barId: bar.punchlineId })
      } catch (e) {
        setError(e instanceof Error ? e.message : "Render fehlgeschlagen")
      } finally {
        setLoading(false)
      }
    },
    [paint],
  )

  useEffect(() => {
    if (barParam != null) void loadRandom(barParam)
    else void loadClip(iParam ?? 0)
    return () => revoke()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function copyCaption() {
    if (!caption) return
    void navigator.clipboard.writeText(caption).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    })
  }

  function downloadAll() {
    urls.forEach((u, i) => {
      const a = document.createElement("a")
      a.href = u
      a.download = `pq-slide-${i + 1}.png`
      a.click()
    })
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold tracking-tight">Slideshow Studio</h1>
        <p className="text-sm text-muted-foreground">
          „Wer hat’s gesagt?“ — 4 Slides aus einer geprüften Bar. Slides laden, als Karussell posten,
          Sound + Caption in der App dazu.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => loadClip((pos?.index ?? -1) + 1)} disabled={loading}>
          {loading ? "Rendert…" : "Nächster Clip"}
        </Button>
        <Button variant="ghost" onClick={() => loadRandom()} disabled={loading}>
          Zufällige Bar
        </Button>
        <Button variant="ghost" onClick={downloadAll} disabled={loading || urls.length === 0}>
          Alle Slides herunterladen
        </Button>
        {pos && (
          <span className="text-xs text-muted-foreground">
            Clip {pos.index + 1}/{pos.total}
            {answer && <> · Antwort: {answer}</>}
          </span>
        )}
        {!pos && answer && (
          <span className="text-xs text-muted-foreground">Antwort: {answer}</span>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {caption && (
        <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card/40 p-4">
          <span className="text-[10px] font-bold tracking-wider text-primary/70 uppercase">
            Caption
          </span>
          <p className="text-sm text-foreground/90">{caption}</p>
          <Button
            variant="ghost"
            onClick={copyCaption}
            className="self-start text-xs font-semibold text-primary"
          >
            {copied ? "Kopiert ✓" : "Caption kopieren"}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {urls.map((u, i) => (
          <figure key={u} className="flex flex-col gap-2">
            <span className="text-[10px] font-bold tracking-wider text-primary/70 uppercase">
              {i + 1}. {SLIDE_LABELS[i]}
            </span>
            <img src={u} alt={`Slide ${i + 1}`} className="w-full rounded-xl border border-border/60" />
            <a
              href={u}
              download={`pq-slide-${i + 1}.png`}
              className="text-center text-xs font-semibold text-primary hover:underline"
            >
              ↓ Slide {i + 1}
            </a>
          </figure>
        ))}
      </div>
    </main>
  )
}
