import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"

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
  const { t } = useTranslation()
  const [line, setLine] = useState(bar.line)
  const [clozePrompt, setClozePrompt] = useState(bar.clozePrompt ?? "")
  const [clozeAnswers, setClozeAnswers] = useState(
    (bar.perfectSolution ?? []).join(", "),
  )
  const [clozeEnabled, setClozeEnabled] = useState(bar.clozeEnabled ?? true)
  const [starter, setStarter] = useState(bar.starter ?? false)
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
    if (starter !== (bar.starter ?? false)) {
      patch.starter = starter
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
    if (!confirm(t("admin.edit.deactivateConfirm"))) return
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
    const preview = bar.line.slice(0, 80) + (bar.line.length > 80 ? "…" : "")
    if (!confirm(t("admin.edit.hardDeleteConfirm", { id: bar.id, preview }))) return
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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0 sm:max-w-lg">
        <div className="flex items-center justify-between border-b border-border/40 px-5 py-3">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary/80">
              / {t("admin.edit.title", { id: bar.id })}
            </span>
            <DialogTitle className="text-sm font-semibold">
              {correctArtistName} <span className="opacity-50">·</span> {bar.songTitle}
            </DialogTitle>
          </div>
        </div>

        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto px-5 py-4">
          <Field label={t("admin.edit.line")}>
            <Textarea
              value={line}
              onChange={(e) => setLine(e.target.value)}
              rows={3}
              className="font-semibold"
            />
            <a
              href={`https://genius.com/search?q=${encodeURIComponent(
                line.replace(/\//g, " ").replace(/\s+/g, " ").trim(),
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex w-fit items-center gap-1 self-start rounded-full border border-border/60 bg-background/40 px-3 py-1 text-[11px] font-bold normal-case tracking-normal text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
            >
              {t("admin.edit.geniusSearch")}
              <span aria-hidden="true">↗</span>
            </a>
          </Field>

          <Field label={t("admin.edit.clozePrompt")}>
            <Textarea
              value={clozePrompt}
              onChange={(e) => setClozePrompt(e.target.value)}
              rows={2}
              placeholder={t("admin.edit.clozePromptPlaceholder")}
            />
          </Field>

          <Field label={t("admin.edit.clozeAnswers")}>
            <Input
              value={clozeAnswers}
              onChange={(e) => setClozeAnswers(e.target.value)}
              placeholder={t("admin.edit.clozeAnswersPlaceholder")}
            />
          </Field>

          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox
              checked={clozeEnabled}
              onCheckedChange={(v) => setClozeEnabled(v === true)}
            />
            <span>
              {t("admin.edit.playCloze")}
              <span className="ml-1 text-xs text-muted-foreground">
                {t("admin.edit.playClozeHint")}
              </span>
            </span>
          </label>

          <Field label={t("admin.edit.correctArtist")}>
            <ArtistSelect value={artistId} onChange={setArtistId} artists={artists} />
          </Field>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
            <Field label={t("admin.edit.song")}>
              <Input
                value={songTitle}
                onChange={(e) => setSongTitle(e.target.value)}
              />
            </Field>
            <Field label={t("admin.edit.year")}>
              <Input
                value={releaseYear}
                onChange={(e) => setReleaseYear(e.target.value)}
                inputMode="numeric"
                pattern="[0-9]*"
                className="w-20"
              />
            </Field>
          </div>

          <Field label={t("admin.edit.album")}>
            <Input
              value={album}
              onChange={(e) => setAlbum(e.target.value)}
              placeholder={t("admin.edit.albumEmptyHint")}
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label={t("admin.edit.distractor1")}>
              <ArtistSelect
                value={d1}
                onChange={setD1}
                artists={artists}
                excludeId={artistId}
                sortByOverlapWith={correctArtist}
              />
            </Field>
            <Field label={t("admin.edit.distractor2")}>
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
              {t("admin.edit.conflict")}
            </p>
          )}

          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox
              checked={active}
              onCheckedChange={(v) => setActive(v === true)}
            />
            {t("admin.edit.activeLabel")}
          </label>

          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox
              checked={starter}
              onCheckedChange={(v) => setStarter(v === true)}
            />
            <span>
              {t("admin.edit.starterLabel")}
              <span className="ml-1 text-xs text-muted-foreground">
                {t("admin.edit.starterHint")}
              </span>
            </span>
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
              {t("admin.common.deactivate")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onHardDelete}
              disabled={busy}
              aria-label={t("admin.edit.deleteHardAria")}
              title={t("admin.edit.deleteHardTitle")}
              className="text-xs font-semibold text-destructive/70 hover:bg-destructive/15 hover:text-destructive"
            >
              {t("admin.edit.deleteHard")}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
              {t("admin.common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={onSave}
              disabled={busy || !dirty || conflict}
              className="font-bold"
            >
              {busy ? "…" : t("admin.common.save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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

