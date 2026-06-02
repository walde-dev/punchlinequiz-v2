import { createFileRoute } from "@tanstack/react-router"

import { listSeoArtists } from "../lib/artist"
import { SITE_URL } from "../lib/seo"

/**
 * Dynamic sitemap (PUN-79): the indexable set only — home + static entry pages
 * + every SEO-eligible artist page. noindex/app-utility routes are excluded.
 */
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const artists = await listSeoArtists()
        const staticPaths = ["/", "/play", "/daily", "/leaderboard", "/artists"]
        const locs = [
          ...staticPaths.map((p) => `${SITE_URL}${p}`),
          ...artists.map((a) => `${SITE_URL}/artist/${a.slug}`),
        ]
        const body =
          `<?xml version="1.0" encoding="UTF-8"?>\n` +
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
          locs.map((loc) => `  <url><loc>${loc}</loc></url>`).join("\n") +
          `\n</urlset>\n`
        return new Response(body, {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        })
      },
    },
  },
})
