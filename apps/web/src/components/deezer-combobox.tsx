import { useTranslation } from "react-i18next"

import { searchDeezerArtists, searchDeezerTracks } from "../lib/admin-client"
import { Combobox } from "./combobox"
import type { ComboboxItem } from "./combobox"

/**
 * Artist name field with live Deezer autocomplete (name + photo). Free typing is
 * allowed — picking a hit just fills the name. Shared by the create form, the
 * distractor fields, and the submission review screen.
 */
export function ArtistCombobox({
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
      search={async (q): Promise<Array<ComboboxItem>> => {
        const hits = await searchDeezerArtists(q)
        return hits.map((a) => ({
          key: a.id,
          label: a.name,
          imageUrl: a.imageUrl,
        }))
      }}
      placeholder={t("admin.create.deezerSearchPlaceholder")}
      required
    />
  )
}

export type TrackPick = {
  trackId: string
  title: string
  artistName: string
  albumTitle: string
  albumArtUrl: string | null
  releaseYear: number | null
}

/**
 * Song field with live Deezer track autocomplete (title + artist · album · year,
 * with cover art). Picking a hit hands the full track meta to `onPickTrack` so
 * the caller can prefill artist/album/year/cover.
 */
export function TrackCombobox({
  value,
  onChange,
  onPickTrack,
}: {
  value: string
  onChange: (v: string) => void
  onPickTrack: (t: TrackPick) => void | Promise<void>
}) {
  const { t } = useTranslation()
  return (
    <Combobox
      value={value}
      onChange={onChange}
      onPick={(item) => {
        const meta = (item as ComboboxItem & { meta?: TrackPick }).meta
        if (meta) {
          onPickTrack({ ...meta, trackId: item.key })
        } else {
          onChange(item.label)
        }
      }}
      search={async (q): Promise<Array<ComboboxItem>> => {
        const hits = await searchDeezerTracks(q)
        return hits.map((tr) => ({
          key: tr.trackId,
          label: tr.title,
          sublabel: `${tr.artistName}${tr.albumTitle ? ` · ${tr.albumTitle}` : ""}${
            tr.releaseYear ? ` · ${tr.releaseYear}` : ""
          }`,
          imageUrl: tr.albumArtUrl,
          // Carry the full hit so onPick can prefill artist/album/year/cover.
          meta: {
            title: tr.title,
            artistName: tr.artistName,
            albumTitle: tr.albumTitle,
            albumArtUrl: tr.albumArtUrl,
            releaseYear: tr.releaseYear,
          },
        }))
      }}
      placeholder={t("admin.create.trackSearchPlaceholder")}
      required
    />
  )
}
