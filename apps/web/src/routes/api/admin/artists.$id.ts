import { createFileRoute } from "@tanstack/react-router"
import { eq } from "drizzle-orm"
import { artists } from "@workspace/db"

import { db } from "../../../lib/db"
import {
  audit,
  handleError,
  HttpError,
  json,
  optionalString,
  readJsonBody,
  requireAdmin,
} from "../../../lib/admin"
import { getArtistById } from "../../../lib/deezer"

export const Route = createFileRoute("/api/admin/artists/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const unauthorized = requireAdmin(request)
        if (unauthorized) return unauthorized
        try {
          const id = Number(params.id)
          if (!Number.isInteger(id) || id <= 0)
            throw new HttpError(400, "invalid_id", "Id must be a positive integer.")
          const existing = (
            await db.select().from(artists).where(eq(artists.id, id)).limit(1)
          )[0]
          if (!existing) throw new HttpError(404, "not_found", "Artist not found.")

          const body = await readJsonBody<Record<string, unknown>>(request)
          const patch: Record<string, unknown> = {}
          const name = optionalString(body.name, "name", { max: 200 })
          if (name !== undefined) patch.name = name
          const imageUrl = optionalString(body.imageUrl, "imageUrl", { max: 2048 })
          if (imageUrl !== undefined) patch.imageUrl = imageUrl
          // Artwork override: paste a Deezer artist ID to re-resolve image,
          // or null to clear it.
          if (body.artworkExternalId !== undefined) {
            if (body.artworkExternalId === null) {
              patch.artworkProvider = null
              patch.artworkExternalId = null
              patch.imageUrl = null
            } else {
              const extId = optionalString(body.artworkExternalId, "artworkExternalId", {
                max: 32,
              })
              if (extId) {
                const match = await getArtistById(extId)
                if (!match) {
                  throw new HttpError(
                    400,
                    "artwork_lookup_failed",
                    "Could not resolve Deezer artist by that id.",
                  )
                }
                patch.artworkProvider = "deezer"
                patch.artworkExternalId = match.id
                patch.imageUrl = match.imageUrl
                audit("artwork_overridden", {
                  provider: "deezer",
                  kind: "artist",
                  entity_id: id,
                  external_id: match.id,
                })
              }
            }
          }
          if (body.active !== undefined) {
            if (typeof body.active !== "boolean")
              throw new HttpError(400, "invalid_field", "active must be boolean.")
            patch.active = body.active
          }
          if (Object.keys(patch).length === 0)
            throw new HttpError(400, "empty_patch", "Provide at least one field to update.")

          const [updated] = await db
            .update(artists)
            .set(patch)
            .where(eq(artists.id, id))
            .returning()
          audit("edit_artist", { id, fields: Object.keys(patch) })
          return json(updated)
        } catch (err) {
          return handleError(err)
        }
      },
    },
  },
})
