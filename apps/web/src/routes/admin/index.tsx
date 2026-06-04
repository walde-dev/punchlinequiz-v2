import { createFileRoute, redirect } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { RiRefreshLine } from "@remixicon/react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { cn } from "@workspace/ui/lib/utils"

import { isAdminFn } from "../../lib/session"
import type { ArtistRow, ArtistTagRow, BarRow } from "../../lib/admin-client"
import {
  fetchAllBars,
  fetchArtists,
  fetchArtistTags,
  createArtist,
  createBar,
  getDeezerTrack,
  patchBar,
  searchDeezerArtists,
  searchDeezerTracks,
  setArtistTags,
} from "../../lib/admin-client"
import { AdminShell } from "../../components/admin-shell"
import { Combobox, type ComboboxItem } from "../../components/combobox"
import { EditBarDrawer } from "../../components/edit-bar-drawer"
import { TagEditor, type SelectedTag } from "../../components/tag-editor"

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
  beforeLoad: async () => {
    const { admin } = await isAdminFn()
    if (!admin) {
      throw redirect({ to: "/admin/login" })
    }
  },
})

type StatusFilter = "all" | "reviewed" | "unreviewed"

/**
 * Module-level cache of the full bar + artist set. Survives navigation away
 * and back so re-entering the dashboard is instant; the "reload" button
 * forces a fresh server fetch.
 */
let dashboardCache: { bars: BarRow[]; artists: ArtistRow[]; at: number } | null = null

function AdminDashboard() {
  const { t } = useTranslation()
  const [allBars, setAllBars] = useState<BarRow[]>(dashboardCache?.bars ?? [])
  const [artists, setArtists] = useState<ArtistRow[]>(dashboardCache?.artists ?? [])
  const [loading, setLoading] = useState(!dashboardCache)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState("")
  const [artistFilterId, setArtistFilterId] = useState<number | null>(null)
  const [artistFilterName, setArtistFilterName] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [includeInactive, setIncludeInactive] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showCreateArtist, setShowCreateArtist] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Pull the full set once (paged) and cache it. `force` re-fetches from the
  // server (hard refresh) while keeping the current rows on screen.
  async function loadAll(force = false) {
    if (force) setRefreshing(true)
    else setLoading(true)
    setErr(null)
    try {
      const [b, a] = await Promise.all([fetchAllBars(), fetchArtists()])
      dashboardCache = { bars: b.items, artists: a.items, at: Date.now() }
      setAllBars(b.items)
      setArtists(a.items)
    } catch (e) {
      setErr(String(e))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (!dashboardCache) loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const statusItems = useMemo(
    () => [
      { value: "all", label: t("admin.dashboard.filterReviewedAll") },
      { value: "reviewed", label: t("admin.dashboard.filterReviewedYes") },
      { value: "unreviewed", label: t("admin.dashboard.filterReviewedNo") },
    ],
    [t],
  )

  const resetFilters = () => {
    setSearch("")
    setArtistFilterName("")
    setArtistFilterId(null)
    setStatusFilter("all")
    setIncludeInactive(false)
  }
  const hasActiveFilters =
    Boolean(search.trim()) ||
    artistFilterId != null ||
    statusFilter !== "all" ||
    includeInactive

  const artistName = useMemo(() => {
    const byId = new Map(artists.map((a) => [a.id, a.name]))
    return (id: number) => byId.get(id) ?? `#${id}`
  }, [artists])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allBars.filter((b) => {
      if (!includeInactive && !b.active) return false
      if (statusFilter === "reviewed" && !b.reviewed) return false
      if (statusFilter === "unreviewed" && b.reviewed) return false
      if (artistFilterId != null && b.artistId !== artistFilterId) return false
      if (q) {
        const hay = `${b.line} ${b.artistName} ${b.songTitle} ${b.songAlbum ?? ""}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [allBars, search, includeInactive, statusFilter, artistFilterId])

  const editingBar = editingId != null ? allBars.find((b) => b.id === editingId) ?? null : null

  return (
    <AdminShell>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{t("admin.dashboard.barsTitle")}</h1>
            <p className="text-sm text-muted-foreground">
              {loading
                ? t("admin.common.loading")
                : t("admin.dashboard.showing", {
                    shown: filtered.length,
                    total: allBars.length,
                  })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => loadAll(true)}
              disabled={loading || refreshing}
              className="font-semibold"
            >
              <RiRefreshLine className={cn(refreshing && "animate-spin")} />
              {refreshing ? t("admin.common.loading") : t("admin.dashboard.reload")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setShowCreateArtist((s) => !s)
                if (!showCreateArtist) setShowCreate(false)
              }}
              className="text-xs font-semibold"
            >
              {showCreateArtist ? t("admin.common.cancel") : t("admin.dashboard.newArtist")}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setShowCreate((s) => !s)
                if (!showCreate) setShowCreateArtist(false)
              }}
              className="font-bold"
            >
              {showCreate ? t("admin.common.cancel") : t("admin.dashboard.newBar")}
            </Button>
          </div>
        </div>

        {showCreateArtist && (
          <CreateArtistForm
            onCreated={async () => {
              setShowCreateArtist(false)
              await loadAll(true)
            }}
          />
        )}

        <ArtistTagsPanel artists={artists} />

        {showCreate && (
          <CreateBarForm
            onCreated={async () => {
              setShowCreate(false)
              await loadAll(true)
            }}
          />
        )}

        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/40 bg-card/40 p-3">
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("admin.dashboard.searchPlaceholder")}
            className="flex-[2] min-w-[200px]"
          />
          <div className="min-w-[200px] flex-1">
            <FilterArtistCombobox
              artists={artists}
              value={artistFilterName}
              onChange={(name) => {
                setArtistFilterName(name)
                // Typing a free string clears any exact-id pick.
                if (artistFilterId != null) setArtistFilterId(null)
              }}
              onPick={(a) => {
                setArtistFilterName(a.name)
                setArtistFilterId(a.id)
              }}
            />
          </div>
          <Select
            items={statusItems}
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as StatusFilter)}
          >
            <SelectTrigger size="sm" className="min-w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusItems.map((it) => (
                <SelectItem key={it.value} value={it.value}>
                  {it.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Checkbox
              checked={includeInactive}
              onCheckedChange={(checked) => setIncludeInactive(checked === true)}
            />
            {t("admin.dashboard.showInactive")}
          </label>
          {hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="text-xs font-semibold text-muted-foreground"
            >
              {t("admin.dashboard.resetFilters")}
            </Button>
          )}
        </div>

        {err && <p className="text-xs text-destructive">{err}</p>}

        <div className="rounded-2xl border border-border/40 bg-card/40">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.dashboard.colBar")}</TableHead>
                <TableHead>{t("admin.dashboard.colArtist")}</TableHead>
                <TableHead>{t("admin.dashboard.colSong")}</TableHead>
                <TableHead>{t("admin.dashboard.colYear")}</TableHead>
                <TableHead>{t("admin.dashboard.vs")}</TableHead>
                <TableHead>{t("admin.dashboard.colStatus")}</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((b) => (
                <TableRow key={b.id} className={cn(!b.active && "opacity-50")}>
                  <TableCell className="max-w-[420px] whitespace-normal">
                    <span className="font-semibold leading-snug text-foreground">{b.line}</span>
                    <span className="ml-1.5 text-[10px] text-muted-foreground/40">#{b.id}</span>
                  </TableCell>
                  <TableCell className="font-semibold text-primary">{b.artistName}</TableCell>
                  <TableCell className="text-muted-foreground">{b.songTitle}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {b.releaseYear ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="muted">{artistName(b.distractor1Id)}</Badge>
                      <Badge variant="muted">{artistName(b.distractor2Id)}</Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {!b.active && (
                        <Badge variant="outline">{t("admin.dashboard.badgeInactive")}</Badge>
                      )}
                      <Badge variant={b.reviewed ? "default" : "muted"}>
                        {b.reviewed
                          ? t("admin.dashboard.badgeReviewed")
                          : t("admin.dashboard.badgeOpen")}
                      </Badge>
                      {b.starter && (
                        <Badge variant="outline">{t("admin.dashboard.badgeStarter")}</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingId(b.id)}
                      className="text-xs font-semibold"
                    >
                      {t("admin.common.edit")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && filtered.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    {t("admin.dashboard.noBars")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {editingBar && (
        <EditBarDrawer
          bar={editingBar}
          artists={artists}
          onClose={() => setEditingId(null)}
          onSaved={async () => {
            setEditingId(null)
            await loadAll(true)
          }}
        />
      )}
    </AdminShell>
  )
}

function CreateBarForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const { t } = useTranslation()
  const [artist, setArtist] = useState("")
  const [song, setSong] = useState("")
  const [line, setLine] = useState("")
  const [d1, setD1] = useState("")
  const [d2, setD2] = useState("")
  const [album, setAlbum] = useState("")
  const [year, setYear] = useState("")
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      await createBar({
        artist: artist.trim(),
        song: song.trim(),
        line: line.trim(),
        distractor1: d1.trim(),
        distractor2: d2.trim(),
        album: album.trim() || undefined,
        releaseYear: year.trim() ? Number(year.trim()) : undefined,
      })
      setArtist("")
      setSong("")
      setLine("")
      setD1("")
      setD2("")
      setAlbum("")
      setYear("")
      setCoverUrl(null)
      await onCreated()
    } catch (e2) {
      setErr(String(e2))
    } finally {
      setBusy(false)
    }
  }

  const inputCls =
    "w-full rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-sm font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/60"
  const labelCls =
    "flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/60 p-4"
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={labelCls}>
          {t("admin.create.artistLabel")}
          <ArtistCombobox value={artist} onChange={setArtist} />
        </label>
        <label className={labelCls}>
          {t("admin.create.songLabel")}
          <TrackCombobox
            value={song}
            onChange={setSong}
            onPickTrack={async (t) => {
              setSong(t.title)
              if (t.albumTitle) setAlbum(t.albumTitle)
              if (t.releaseYear) setYear(String(t.releaseYear))
              if (!artist.trim() && t.artistName) setArtist(t.artistName)
              setCoverUrl(t.albumArtUrl)
              // /search hits don't include release_date — fetch /track/:id for the year.
              if (!t.releaseYear) {
                const full = await getDeezerTrack(t.trackId).catch(() => null)
                if (full?.releaseYear) setYear(String(full.releaseYear))
              }
            }}
          />
        </label>
      </div>
      <label className={labelCls}>
        {t("admin.create.barLabel")}
        <textarea
          value={line}
          onChange={(e) => setLine(e.target.value)}
          required
          rows={2}
          className={cn(inputCls, "resize-none font-semibold")}
        />
      </label>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={labelCls}>
          {t("admin.create.distractor1")}
          <ArtistCombobox value={d1} onChange={setD1} />
        </label>
        <label className={labelCls}>
          {t("admin.create.distractor2")}
          <ArtistCombobox value={d2} onChange={setD2} />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
        <label className={labelCls}>
          {t("admin.create.albumOptional")}
          <input value={album} onChange={(e) => setAlbum(e.target.value)} className={inputCls} />
        </label>
        <label className={labelCls}>
          {t("admin.create.yearOptional")}
          <input
            value={year}
            onChange={(e) => setYear(e.target.value)}
            inputMode="numeric"
            pattern="[0-9]*"
            className={inputCls}
          />
        </label>
        {coverUrl && (
          <div className="flex flex-col items-end gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("admin.create.cover")}
            </span>
            <img
              src={coverUrl}
              alt=""
              className="h-[42px] w-[42px] rounded-md border border-border/60 object-cover"
            />
          </div>
        )}
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={busy} className="font-bold">
          {busy ? "…" : t("admin.create.createBar")}
        </Button>
      </div>
    </form>
  )
}

function CreateArtistForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const { t } = useTranslation()
  const [name, setName] = useState("")
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedTags, setSelectedTags] = useState<SelectedTag[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setErr(null)
    setInfo(null)
    try {
      const result = await createArtist(
        name.trim(),
        selectedTags.map((t) => ({ slug: t.slug, weight: t.weight })),
      )
      const tagCount = result.tagCount ?? selectedTags.length
      const tagPart =
        selectedTags.length > 0 ? t("admin.create.tagPart", { count: tagCount }) : ""
      setInfo(
        result.created
          ? t("admin.create.createdArtist", { name: result.name, id: result.id, tagPart })
          : t("admin.create.existsArtist", { name: result.name, id: result.id, tagPart }),
      )
      setName("")
      setPreviewUrl(null)
      setSelectedTags([])
      await onCreated()
    } catch (e2) {
      setErr(String(e2))
    } finally {
      setBusy(false)
    }
  }

  const labelCls =
    "flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/60 p-4"
    >
      <label className={labelCls}>
        {t("admin.create.deezerArtist")}
        <Combobox
          value={name}
          onChange={(v) => {
            setName(v)
            setPreviewUrl(null)
          }}
          onPick={(item) => {
            setName(item.label)
            setPreviewUrl(item.imageUrl ?? null)
          }}
          search={async (q): Promise<ComboboxItem[]> => {
            const hits = await searchDeezerArtists(q)
            return hits.map((a) => ({ key: a.id, label: a.name, imageUrl: a.imageUrl }))
          }}
          placeholder={t("admin.create.deezerSearchPlaceholder")}
          required
        />
      </label>

      <div className={labelCls}>
        {t("admin.create.tagsLabel")}
        <TagEditor
          value={selectedTags}
          onChange={setSelectedTags}
          hint={t("admin.create.tagsHint")}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt=""
              className="h-12 w-12 rounded-md border border-border/60 object-cover"
            />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-md border border-dashed border-border/40 text-[10px] text-muted-foreground/60">
              {t("admin.create.noImage")}
            </span>
          )}
          <div className="flex flex-col">
            {err && <p className="text-xs text-destructive">{err}</p>}
            {info && <p className="text-xs text-primary">{info}</p>}
            {!err && !info && (
              <p className="text-xs text-muted-foreground/70">
                {t("admin.create.coverAuto")}
              </p>
            )}
          </div>
        </div>
        <Button type="submit" disabled={busy || !name.trim()} className="font-bold">
          {busy ? "…" : t("admin.create.createArtist")}
        </Button>
      </div>
    </form>
  )
}

function ArtistTagsPanel({ artists }: { artists: ArtistRow[] }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [tagsByArtist, setTagsByArtist] = useState<Record<number, ArtistTagRow[]>>({})
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [filter, setFilter] = useState("")
  const [showUntaggedOnly, setShowUntaggedOnly] = useState(false)

  async function loadAll() {
    setLoading(true)
    try {
      const entries = await Promise.all(
        artists.map(async (a) => {
          const r = await fetchArtistTags(a.id)
          return [a.id, r.items] as const
        }),
      )
      const map: Record<number, ArtistTagRow[]> = {}
      for (const [id, items] of entries) map[id] = items
      setTagsByArtist(map)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open && artists.length > 0 && Object.keys(tagsByArtist).length === 0) {
      loadAll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, artists.length])

  const editingArtist = editingId != null ? artists.find((a) => a.id === editingId) ?? null : null

  const visible = artists.filter((a) => {
    if (filter && !a.name.toLowerCase().includes(filter.toLowerCase())) return false
    if (showUntaggedOnly && (tagsByArtist[a.id]?.length ?? 0) > 0) return false
    return true
  })

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border/40 bg-card/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col">
          <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">{t("admin.tags.panelTitle")}</h2>
          <p className="text-[11px] text-muted-foreground">
            {t("admin.tags.panelHint")}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen((o) => !o)}
          className="text-xs font-semibold"
        >
          {open ? t("admin.common.close") : t("admin.tags.manage")}
        </Button>
      </div>

      {open && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("admin.tags.filterPlaceholder")}
              className="flex-1 min-w-[180px] rounded-full border border-border/60 bg-background/60 px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring/60"
            />
            <label className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
              <input
                type="checkbox"
                checked={showUntaggedOnly}
                onChange={(e) => setShowUntaggedOnly(e.target.checked)}
                className="accent-primary"
              />
              {t("admin.tags.untaggedOnly")}
            </label>
            <Button type="button" size="sm" variant="ghost" onClick={loadAll} disabled={loading}>
              {loading ? "…" : t("admin.common.refresh")}
            </Button>
          </div>

          <ul className="flex max-h-[400px] flex-col divide-y divide-border/40 overflow-y-auto rounded-xl border border-border/40 bg-background/30">
            {visible.map((a) => {
              const tagList = tagsByArtist[a.id] ?? []
              return (
                <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-sm font-semibold text-foreground">{a.name}</span>
                    <div className="flex flex-wrap gap-1">
                      {tagList.length === 0 ? (
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60">
                          {t("admin.tags.none")}
                        </span>
                      ) : (
                        tagList.map((t) => (
                          <span
                            key={t.slug}
                            className="rounded-full border border-border/40 bg-background/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                          >
                            {t.label}
                            <span className="ml-1 font-mono text-[9px] text-primary/80">
                              {t.weight.toFixed(2)}
                            </span>
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-xs font-semibold"
                    onClick={() => setEditingId(a.id)}
                  >
                    {t("admin.common.edit")}
                  </Button>
                </li>
              )
            })}
            {!loading && visible.length === 0 && (
              <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                {t("admin.tags.noArtists")}
              </li>
            )}
          </ul>
        </>
      )}

      {editingArtist && (
        <ArtistTagsDrawer
          artist={editingArtist}
          initial={tagsByArtist[editingArtist.id] ?? null}
          onClose={() => setEditingId(null)}
          onSaved={(items) => {
            setTagsByArtist((m) => ({ ...m, [editingArtist.id]: items }))
            setEditingId(null)
          }}
        />
      )}
    </section>
  )
}

function ArtistTagsDrawer({
  artist,
  initial,
  onClose,
  onSaved,
}: {
  artist: ArtistRow
  initial: ArtistTagRow[] | null
  onClose: () => void
  onSaved: (items: ArtistTagRow[]) => void
}) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<SelectedTag[]>([])
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function go() {
      const items = initial ?? (await fetchArtistTags(artist.id)).items
      if (cancelled) return
      setSelected(items.map((t) => ({ slug: t.slug, label: t.label, weight: t.weight })))
      setLoaded(true)
    }
    go()
    return () => {
      cancelled = true
    }
  }, [artist.id, initial])

  async function onSave() {
    setSaving(true)
    setErr(null)
    try {
      const r = await setArtistTags(
        artist.id,
        selected.map((t) => ({ slug: t.slug, weight: t.weight })),
      )
      onSaved(r.items)
    } catch (e) {
      setErr(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm md:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-t-2xl border border-border/60 bg-card p-5 md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("admin.tags.drawerTagsFor")}
            </p>
            <h3 className="text-lg font-extrabold tracking-tight">{artist.name}</h3>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {t("admin.common.close")}
          </Button>
        </header>

        {!loaded ? (
          <p className="text-sm text-muted-foreground">{t("admin.tags.editorLoading")}</p>
        ) : (
          <TagEditor
            value={selected}
            onChange={setSelected}
            hint={t("admin.tags.drawerHint")}
          />
        )}

        {err && <p className="text-xs text-destructive">{err}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            {t("admin.common.cancel")}
          </Button>
          <Button type="button" onClick={onSave} disabled={saving || !loaded} className="font-bold">
            {saving ? "…" : t("admin.common.save")}
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * Filter-only combobox over artists already in the DB (local, no Deezer call).
 * Picking an item filters bars by that artist's exact id.
 */
function FilterArtistCombobox({
  artists,
  value,
  onChange,
  onPick,
}: {
  artists: ArtistRow[]
  value: string
  onChange: (v: string) => void
  onPick: (a: ArtistRow) => void
}) {
  const { t } = useTranslation()
  return (
    <Combobox
      value={value}
      onChange={onChange}
      onPick={(item) => {
        const a = artists.find((x) => String(x.id) === item.key)
        if (a) onPick(a)
        else onChange(item.label)
      }}
      minChars={1}
      search={async (q): Promise<ComboboxItem[]> => {
        const needle = q.trim().toLowerCase()
        return artists
          .filter((a) => a.name.toLowerCase().includes(needle))
          .slice(0, 50)
          .map((a) => ({ key: String(a.id), label: a.name, imageUrl: a.imageUrl }))
      }}
      placeholder={t("admin.dashboard.filterArtistPlaceholder")}
    />
  )
}

function ArtistCombobox({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const { t } = useTranslation()
  return (
    <Combobox
      value={value}
      onChange={onChange}
      onPick={(item) => onChange(item.label)}
      search={async (q): Promise<ComboboxItem[]> => {
        const hits = await searchDeezerArtists(q)
        return hits.map((a) => ({ key: a.id, label: a.name, imageUrl: a.imageUrl }))
      }}
      placeholder={t("admin.create.deezerSearchPlaceholder")}
      required
    />
  )
}

function TrackCombobox({
  value,
  onChange,
  onPickTrack,
}: {
  value: string
  onChange: (v: string) => void
  onPickTrack: (t: {
    trackId: string
    title: string
    artistName: string
    albumTitle: string
    albumArtUrl: string | null
    releaseYear: number | null
  }) => void | Promise<void>
}) {
  const { t } = useTranslation()
  return (
    <Combobox
      value={value}
      onChange={onChange}
      onPick={(item) => {
        const meta = (item as ComboboxItem & {
          meta?: {
            title: string
            artistName: string
            albumTitle: string
            albumArtUrl: string | null
            releaseYear: number | null
          }
        }).meta
        if (meta) {
          onPickTrack({ trackId: item.key, ...meta })
        } else {
          onChange(item.label)
        }
      }}
      search={async (q): Promise<ComboboxItem[]> => {
        const hits = await searchDeezerTracks(q)
        return hits.map((t) => ({
          key: t.trackId,
          label: t.title,
          sublabel: `${t.artistName}${t.albumTitle ? ` · ${t.albumTitle}` : ""}${
            t.releaseYear ? ` · ${t.releaseYear}` : ""
          }`,
          imageUrl: t.albumArtUrl,
          // Carry the full hit so onPick can prefill artist/album/year/cover.
          meta: {
            title: t.title,
            artistName: t.artistName,
            albumTitle: t.albumTitle,
            albumArtUrl: t.albumArtUrl,
            releaseYear: t.releaseYear,
          },
        }))
      }}
      placeholder={t("admin.create.trackSearchPlaceholder")}
      required
    />
  )
}

export { patchBar }
