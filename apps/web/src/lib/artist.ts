import { createServerFn } from "@tanstack/react-start"
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm"
import { artistTags, artists, punchlines, songs, tags } from "@workspace/db"

import { db } from "./db"

/**
 * Crawlable artist catalog data (PUN-78/79). No lyric text is ever returned —
 * only artist metadata + counts + tags + related artists. An artist is only
 * "SEO-eligible" when active AND has ≥1 active punchline (avoids thin/empty
 * indexable pages).
 */

export type SeoArtist = {
  slug: string
  name: string
  imageUrl: string | null
  barCount: number
}

export type ArtistPage = {
  slug: string
  name: string
  imageUrl: string | null
  barCount: number
  tags: Array<{ slug: string; label: string }>
  related: Array<{ slug: string; name: string; imageUrl: string | null }>
}

/** All SEO-eligible artists (active + ≥1 active bar) — powers the /artists hub + sitemap. */
export async function listSeoArtists(): Promise<Array<SeoArtist>> {
  const rows = await db
    .select({
      slug: artists.slug,
      name: artists.name,
      imageUrl: artists.imageUrl,
      barCount: sql<number>`count(${punchlines.id})::int`,
    })
    .from(artists)
    .innerJoin(songs, eq(songs.artistId, artists.id))
    .innerJoin(
      punchlines,
      and(eq(punchlines.songId, songs.id), eq(punchlines.active, true))
    )
    .where(eq(artists.active, true))
    .groupBy(artists.id)
    .orderBy(desc(sql`count(${punchlines.id})`), artists.name)
  return rows.map((r) => ({ ...r, barCount: Number(r.barCount) }))
}

/** Server-fn wrapper for the /artists hub loader (DB access can't run client-side). */
export const getSeoArtistsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<Array<SeoArtist>> => listSeoArtists()
)

/** Full artist page payload, or null (→ 404) for unknown/inactive/empty artists. */
export const getArtistPageFn = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => d)
  .handler(async ({ data }): Promise<ArtistPage | null> => {
    const slug = (data.slug ?? "").trim()
    if (!slug) return null

    const [a] = await db
      .select({
        id: artists.id,
        slug: artists.slug,
        name: artists.name,
        imageUrl: artists.imageUrl,
      })
      .from(artists)
      .where(and(eq(artists.slug, slug), eq(artists.active, true)))
      .limit(1)
    if (!a) return null

    const [{ barCount }] = await db
      .select({ barCount: sql<number>`count(*)::int` })
      .from(punchlines)
      .innerJoin(songs, eq(songs.id, punchlines.songId))
      .where(and(eq(songs.artistId, a.id), eq(punchlines.active, true)))
    if (!barCount) return null // no playable bars → don't serve a thin page

    const tagRows = await db
      .select({ slug: tags.slug, label: tags.label, tagId: artistTags.tagId })
      .from(artistTags)
      .innerJoin(tags, eq(tags.id, artistTags.tagId))
      .where(eq(artistTags.artistId, a.id))
      .orderBy(desc(artistTags.weight))
      .limit(6)

    let related: Array<{
      slug: string
      name: string
      imageUrl: string | null
    }> = []
    const tagIds = tagRows.map((t) => t.tagId)
    if (tagIds.length > 0) {
      related = await db
        .selectDistinct({
          slug: artists.slug,
          name: artists.name,
          imageUrl: artists.imageUrl,
        })
        .from(artists)
        .innerJoin(artistTags, eq(artistTags.artistId, artists.id))
        .innerJoin(songs, eq(songs.artistId, artists.id))
        .innerJoin(
          punchlines,
          and(eq(punchlines.songId, songs.id), eq(punchlines.active, true))
        )
        .where(
          and(
            inArray(artistTags.tagId, tagIds),
            ne(artists.id, a.id),
            eq(artists.active, true)
          )
        )
        .orderBy(artists.name)
        .limit(6)
    }

    return {
      slug: a.slug,
      name: a.name,
      imageUrl: a.imageUrl,
      barCount: Number(barCount),
      tags: tagRows.map((t) => ({ slug: t.slug, label: t.label })),
      related,
    }
  })
