import { useEffect, useRef, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { patchBar, deleteBar, type ArtistRow, type BarRow } from "../lib/admin-client"

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
  const [active, setActive] = useState(bar.active)
  const [d1, setD1] = useState(bar.distractor1Id)
  const [d2, setD2] = useState(bar.distractor2Id)
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

  const correctArtistName =
    artists.find((a) => a.id === bar.artistId)?.name ?? bar.artistName

  function buildPatch() {
    const patch: Parameters<typeof patchBar>[1] = {}
    if (line.trim() !== bar.line) patch.line = line.trim()
    if (active !== bar.active) patch.active = active
    if (d1 !== bar.distractor1Id) patch.distractor1Id = d1
    if (d2 !== bar.distractor2Id) patch.distractor2Id = d2
    return patch
  }

  const dirty = Object.keys(buildPatch()).length > 0
  const conflict = d1 === bar.artistId || d2 === bar.artistId || d1 === d2

  async function onSave() {
    if (!dirty || conflict) return
    setBusy(true)
    setErr(null)
    try {
      await patchBar(bar.id, buildPatch())
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

        <div className="flex flex-col gap-4 px-5 py-4">
          <Field label="Line">
            <textarea
              value={line}
              onChange={(e) => setLine(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-ring/60"
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Distractor 1">
              <ArtistSelect
                value={d1}
                onChange={setD1}
                artists={artists}
                excludeId={bar.artistId}
              />
            </Field>
            <Field label="Distractor 2">
              <ArtistSelect
                value={d2}
                onChange={setD2}
                artists={artists}
                excludeId={bar.artistId}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
      {children}
    </label>
  )
}

function ArtistSelect({
  value,
  onChange,
  artists,
  excludeId,
}: {
  value: number
  onChange: (id: number) => void
  artists: ArtistRow[]
  excludeId?: number
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cn(
        "w-full rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-sm font-medium",
        "focus:outline-none focus:ring-2 focus:ring-ring/60",
      )}
    >
      {artists
        .filter((a) => a.id !== excludeId || a.id === value)
        .map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
            {!a.active ? " (inaktiv)" : ""}
          </option>
        ))}
    </select>
  )
}
