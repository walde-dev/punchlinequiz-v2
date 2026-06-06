import { createFileRoute } from "@tanstack/react-router"
import { ImageResponse } from "@vercel/og"

import { DEFAULT_OG_IMAGE, absoluteUrl } from "../../lib/seo"

/**
 * Reusable dynamic OG image generator (PUN-105).
 *
 * Generic, content-agnostic: callers pass `title`, `subtitle`, and an optional
 * `image` URL via query params; we render a branded 1200×630 PNG (charcoal +
 * gold + bold type) for link unfurls (Reddit/WhatsApp/Twitter/Discord). The
 * /quiz pages are the first consumer (PUN-106); the Daily Share Card project
 * (PUN-39) reuses this same endpoint.
 *
 * Robustness: any failure (bad params, font/image fetch, rasterizer) falls back
 * to a 302 → the static banner, so a pasted link never previews broken.
 *
 * Crawlers can't run the client canvas in lib/share-card.ts, so OG images must
 * be produced server-side — hence this route rather than reusing that renderer.
 */

const WIDTH = 1200
const HEIGHT = 630
const GOLD = "#fbbf24"
const FG = "#fafafa"

/** Fetch a Figtree TTF for crisp branded type; null → satori's default font. */
async function loadFigtree(): Promise<ArrayBuffer | null> {
  try {
    // Google Fonts static TTF (stable URL). Cached by the platform between
    // invocations; a miss just falls back to the default font.
    const css = await fetch(
      "https://fonts.googleapis.com/css2?family=Figtree:wght@800&display=swap",
      { headers: { "user-agent": "Mozilla/5.0" } }
    ).then((r) => r.text())
    const url = css.match(
      /src:\s*url\(([^)]+)\)\s*format\(['"]?(?:truetype|opentype)['"]?\)/
    )?.[1]
    if (!url) return null
    return await fetch(url).then((r) => r.arrayBuffer())
  } catch {
    return null
  }
}

function fallback(): Response {
  return Response.redirect(absoluteUrl(DEFAULT_OG_IMAGE), 302)
}

export const Route = createFileRoute("/api/og")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const params = new URL(request.url).searchParams
          const title = (params.get("title") ?? "").slice(0, 80)
          const subtitle = (params.get("subtitle") ?? "").slice(0, 90)
          const image = params.get("image") ?? null
          if (!title) return fallback()

          const figtree = await loadFigtree()
          const fonts = figtree
            ? [
                {
                  name: "Figtree",
                  data: figtree,
                  weight: 800 as const,
                  style: "normal" as const,
                },
              ]
            : undefined

          const png = await new ImageResponse(
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                padding: 72,
                backgroundColor: "#121212",
                backgroundImage:
                  "radial-gradient(900px 600px at 30% 18%, rgba(251,191,36,0.18), rgba(251,191,36,0) 60%), linear-gradient(135deg, #1a1a1a, #0d0d0d)",
                color: FG,
                fontFamily: fonts ? "Figtree" : "sans-serif",
              }}
            >
              {/* Wordmark */}
              <div style={{ display: "flex", fontSize: 40, fontWeight: 800 }}>
                <span style={{ color: FG }}>punchline</span>
                <span style={{ color: GOLD }}>/quiz</span>
              </div>

              {/* Hero: optional artist photo + title/subtitle */}
              <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
                {image ? (
                  <img
                    src={image}
                    width={180}
                    height={180}
                    style={{
                      width: 180,
                      height: 180,
                      borderRadius: 180,
                      objectFit: "cover",
                      border: `4px solid ${GOLD}`,
                    }}
                  />
                ) : null}
                <div
                  style={{ display: "flex", flexDirection: "column", flex: 1 }}
                >
                  {subtitle ? (
                    <div
                      style={{
                        fontSize: 30,
                        fontWeight: 800,
                        letterSpacing: 2,
                        textTransform: "uppercase",
                        color: GOLD,
                        marginBottom: 12,
                      }}
                    >
                      {subtitle}
                    </div>
                  ) : null}
                  <div
                    style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.05 }}
                  >
                    {title}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div
                style={{
                  display: "flex",
                  fontSize: 38,
                  fontWeight: 800,
                  color: GOLD,
                }}
              >
                punchlinequiz.de
              </div>
            </div>,
            { width: WIDTH, height: HEIGHT, fonts }
          ).arrayBuffer()

          // Materialize to a plain Response so the server handler returns a
          // standard body (not the ImageResponse subclass) with our own headers.
          return new Response(png, {
            headers: {
              "content-type": "image/png",
              // Cache hard per param set — content for a given quiz is stable.
              "cache-control":
                "public, max-age=86400, s-maxage=604800, immutable",
            },
          })
        } catch {
          return fallback()
        }
      },
    },
  },
})
