import { useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import {
  patchBar,
  patchSong,
  deleteBar,
  type ArtistRow,
  type BarRow,
} from "../lib/admin-client"
import { ArtistSelect } from "./artist-select"

export function EditBarDrawer({
  bar,
  artists,
  onClose,
  onSaved,
}: {
  bar: BarRow
  artists: ArtistRow[]
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const [line, setLine] = useState(bar.line)
  const [clozePrompt, setClozePrompt] = useState(bar.clozePrompt ?? "")
  const [clozeAnswers, setClozeAnswers] = useState(
    (bar.perfectSolution ?? []).join(", "),
  )
  const [clozeEnabled, setClozeEnabled] = useState(bar.clozeEnabled ?? true)
  const [active, setActive] = useState(bar.active)
  const [d1, setD1] = useState(bar.distractor1Id)
  const [d2, setD2] = useState(bar.distractor2Id)
  const [artistId, setArtistId] = useState(bar.artistId)
  const [songTitle, setSongTitle] = useState(bar.songTitle)
  const [album, setAlbum] = useState(bar.songAlbum ?? "")
  const [releaseYear, setReleaseYear] = useState(
    bar.releaseYear == null ? "" : String(bar.releaseYear),
  )
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Esc to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const correctArtist = useMemo(
    () => artists.find((a) => a.id === artistId) ?? null,
    [artists, artistId],
  )
  const correctArtistName = correctArtist?.name ?? bar.artistName

  function buildBarPatch() {
    const patch: Parameters<typeof patchBar>[1] = {}
    if (line.trim() !== bar.line) patch.line = line.trim()
    if (active !== bar.active) patch.active = active
    if (d1 !== bar.distractor1Id) patch.distractor1Id = d1
    if (d2 !== bar.distractor2Id) patch.distractor2Id = d2

    const nextCloze = clozePrompt.trim()
    const origCloze = bar.clozePrompt ?? ""
    if (nextCloze !== origCloze) {
      // Explicit empty = clear it (disable cloze mode for this row).
      patch.clozePrompt = nextCloze.length === 0 ? null : nextCloze
    }
    const nextAnswers = clozeAnswers
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    const origAnswers = bar.perfectSolution ?? []
    if (
      nextAnswers.length !== origAnswers.length ||
      nextAnswers.some((a, i) => a !== origAnswers[i])
    ) {
      patch.perfectSolution = nextAnswers
    }
    if (clozeEnabled !== (bar.clozeEnabled ?? true)) {
      patch.clozeEnabled = clozeEnabled
    }
    return patch
  }

  function buildSongPatch() {
    const patch: Parameters<typeof patchSong>[1] = {}
    if (artistId !== bar.artistId) patch.artistId = artistId
    if (songTitle.trim() !== bar.songTitle) patch.title = songTitle.trim()
    const normAlbum = album.trim()
    const origAlbum = bar.songAlbum ?? ""
    if (normAlbum !== origAlbum) patch.album = normAlbum || null
    const trimmedYear = releaseYear.trim()
    const yearNum = trimmedYear ? Number(trimmedYear) : null
    if (yearNum !== (bar.releaseYear ?? null) && yearNum !== null) {
      patch.releaseYear = yearNum
    }
    return patch
  }

  const barPatch = buildBarPatch()
  const songPatch = buildSongPatch()
  const dirty = Object.keys(barPatch).length > 0 || Object.keys(songPatch).length > 0
  const conflict = d1 === artistId || d2 === artistId || d1 === d2

  async function onSave() {
    if (!dirty || conflict) return
    setBusy(true)
    setErr(null)
    try {
      if (Object.keys(songPatch).length > 0) {
        await patchSong(bar.songId, songPatch)
      }
      if (Object.keys(barPatch).length > 0) {
        await patchBar(bar.id, barPatch)
      }
      await onSaved()
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  async function onDelete() {
    if (!confirm("Bar wirklich deaktivieren?")) return
    setBusy(true)
    setErr(null)
    try {
      await deleteBar(bar.id)
      await onSaved()
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  async function onHardDelete() {
    if (
      !confirm(
        `Bar #${bar.id} ENDGÜLTIG löschen?\n\n„${bar.line.slice(0, 80)}${
          bar.line.length > 80 ? "…" : ""
        }“\n\nDas lässt sich nicht rückgängig machen.`,
      )
    )
      return
    setBusy(true)
    setErr(null)
    try {
      await deleteBar(bar.id, true)
      await onSaved()
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose()
      }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-t-3xl border border-border/60 bg-card shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-border/40 px-5 py-3">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary/80">
              / bar #{bar.id}
            </span>
            <span className="text-sm font-semibold">
              {correctArtistName} <span className="opacity-50">·</span> {bar.songTitle}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto px-5 py-4">
          <Field label="Line">
            <textarea
              value={line}
              onChange={(e) => setLine(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-ring/60"
            />
            <a
              href={`https://genius.com/search?q=${encodeURIComponent(
                line.replace(/\//g, " ").replace(/\s+/g, " ").trim(),
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex w-fit items-center gap-1 self-start rounded-full border border-border/60 bg-background/40 px-3 py-1 text-[11px] font-bold normal-case tracking-normal text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
            >
              Auf Genius suchen
              <span aria-hidden="true">↗</span>
            </a>
          </Field>

          <Field label="Cloze prompt (Finishing-Lines)">
            <textarea
              value={clozePrompt}
              onChange={(e) => setClozePrompt(e.target.value)}
              rows={2}
              placeholder="z.B. „Ich chille in meinem Haus / und sehe eine ___“ — leer = im Artist-Modus ausgeblendet"
              className="w-full resize-none rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-sm font-medium placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/60"
            />
          </Field>

          <Field label="Akzeptierte Antworten (Komma-getrennt)">
            <input
              value={clozeAnswers}
              onChange={(e) => setClozeAnswers(e.target.value)}
              placeholder="z.B. Maus, die Maus"
              className={textInputCls}
            />
          </Field>

          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={clozeEnabled}
              onChange={(e) => setClozeEnabled(e.target.checked)}
              className="accent-primary"
            />
            <span>
              im Cloze-Modus spielen
              <span className="ml-1 text-xs text-muted-foreground">
                (Artist-Modus zeigt diese Bar)
              </span>
            </span>
          </label>

          <Field label="Korrekter Artist">
            <ArtistSelect value={artistId} onChange={setArtistId} artists={artists} />
          </Field>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
            <Field label="Song">
              <input
                value={songTitle}
                onChange={(e) => setSongTitle(e.target.value)}
                className={textInputCls}
              />
            </Field>
            <Field label="Jahr">
              <input
                value={releaseYear}
                onChange={(e) => setReleaseYear(e.target.value)}
                inputMode="numeric"
                pattern="[0-9]*"
                className={cn(textInputCls, "w-20")}
              />
            </Field>
          </div>

          <Field label="Album">
            <input
              value={album}
              onChange={(e) => setAlbum(e.target.value)}
              className={textInputCls}
              placeholder="(leer = nicht gesetzt)"
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Distractor 1">
              <ArtistSelect
                value={d1}
                onChange={setD1}
                artists={artists}
                excludeId={artistId}
                sortByOverlapWith={correctArtist}
              />
            </Field>
            <Field label="Distractor 2">
              <ArtistSelect
                value={d2}
                onChange={setD2}
                artists={artists}
                excludeId={artistId}
                sortByOverlapWith={correctArtist}
              />
            </Field>
          </div>

          {conflict && (
            <p className="text-xs text-destructive">
              Distractors müssen sich vom korrekten Artist und voneinander unterscheiden.
            </p>
          )}

          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="accent-primary"
            />
            aktiv (im Spiel sichtbar)
          </label>

          {err && <p className="text-xs text-destructive">{err}</p>}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border/40 bg-background/30 px-5 py-3">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDelete}
              disabled={busy}
              className="text-xs font-semibold text-destructive hover:bg-destructive/10"
            >
              Deaktivieren
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onHardDelete}
              disabled={busy}
              aria-label="Bar endgültig löschen"
              title="Endgültig löschen (nicht umkehrbar)"
              className="text-xs font-semibold text-destructive/70 hover:bg-destructive/15 hover:text-destructive"
            >
              Löschen ✕
            </Button>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
              Abbrechen
            </Button>
            <Button
              type="button"
              onClick={onSave}
              disabled={busy || !dirty || conflict}
              className="font-bold"
            >
              {busy ? "…" : "Speichern"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

const textInputCls =
  "w-full rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-sm font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/60"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
      {children}
    </label>
  )
}

