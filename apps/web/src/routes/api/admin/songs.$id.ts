import { createFileRoute } from "@tanstack/react-router"
import { eq } from "drizzle-orm"
import { artists, songs } from "@workspace/db"

import { db } from "../../../lib/db"
import {
  audit,
  handleError,
  HttpError,
  json,
  optionalInt,
  optionalString,
  readJsonBody,
  requireAdmin,
} from "../../../lib/admin"
import { getTrackById } from "../../../lib/deezer"

export const Route = createFileRoute("/api/admin/songs/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const unauthorized = requireAdmin(request)
        if (unauthorized) return unauthorized
        try {
          const id = Number(params.id)
          if (!Number.isInteger(id) || id <= 0)
            throw new HttpError(400, "invalid_id", "Id must be a positive integer.")
          const existing = (await db.select().from(songs).where(eq(songs.id, id)).limit(1))[0]
          if (!existing) throw new HttpError(404, "not_found", "Song not found.")

          const body = await readJsonBody<Record<string, unknown>>(request)
          const patch: Record<string, unknown> = {}
          const title = optionalString(body.title, "title", { max: 300 })
          if (title !== undefined) patch.title = title
          const album = optionalString(body.album, "album", { max: 300 })
          if (album !== undefined) patch.album = album
          const albumArtUrl = optionalString(body.albumArtUrl, "albumArtUrl", { max: 2048 })
          if (albumArtUrl !== undefined) patch.albumArtUrl = albumArtUrl
          // Artwork override: paste a Deezer track ID to re-resolve cover,
          // or null to clear it.
          if (body.artworkTrackId !== undefined) {
            if (body.artworkTrackId === null) {
              patch.artworkProvider = null
              patch.artworkTrackId = null
              patch.artworkAlbumId = null
              patch.albumArtUrl = null
            } else {
              const trackId = optionalString(body.artworkTrackId, "artworkTrackId", { max: 32 })
              if (trackId) {
                const match = await getTrackById(trackId)
                if (!match) {
                  throw new HttpError(
                    400,
                    "artwork_lookup_failed",
                    "Could not resolve Deezer track by that id.",
                  )
                }
                patch.artworkProvider = "deezer"
                patch.artworkTrackId = match.trackId
                patch.artworkAlbumId = match.albumId || null
                patch.albumArtUrl = match.albumArtUrl
                audit("artwork_overridden", {
                  provider: "deezer",
                  kind: "track",
                  entity_id: id,
                  external_id: match.trackId,
                })
              }
            }
          }
          const releaseYear = optionalInt(body.releaseYear, "releaseYear", {
            min: 1980,
            max: 2100,
          })
          if (releaseYear !== undefined) patch.releaseYear = releaseYear
          const artistId = optionalInt(body.artistId, "artistId", { min: 1 })
          if (artistId !== undefined) {
            const artistRow = (
              await db.select().from(artists).where(eq(artists.id, artistId)).limit(1)
            )[0]
            if (!artistRow) {
              throw new HttpError(400, "invalid_field", "artistId does not exist.")
            }
            patch.artistId = artistId
          }
          if (Object.keys(patch).length === 0)
            throw new HttpError(400, "empty_patch", "Provide at least one field to update.")

          const [updated] = await db
            .update(songs)
            .set(patch)
            .where(eq(songs.id, id))
            .returning()
          audit("edit_song", { id, fields: Object.keys(patch) })
          return json(updated)
        } catch (err) {
          return handleError(err)
        }
      },
    },
  },
})
