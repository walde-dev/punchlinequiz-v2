/**
 * Resolved (build-hashed) URL of the latin Figtree Variable woff2, for a
 * `<link rel="preload">` in the app's document head (PUN-112).
 *
 * Why preload: the font is otherwise only discovered after the main CSS is
 * fetched + parsed and the @font-face unicode-range is matched. The homepage
 * LCP element is the hero <h1> text, so kicking the font fetch off immediately
 * speeds the final-font paint.
 *
 * Why only latin: globals.css imports the full @fontsource-variable/figtree,
 * but its @font-face rules are unicode-range split — German UI text (incl.
 * ä/ö/ü/ß, which live in U+0000-00FF) only ever pulls the `latin` subset. The
 * `latin-ext` subset stays lazy (loads on demand for the rare artist name with
 * extended-latin glyphs), so it is intentionally NOT preloaded.
 *
 * Imported here (not in apps/web) because @fontsource-variable/figtree is a
 * dependency of this package; @workspace/ui exposes lib/* as source so Vite in
 * the app resolves this `?url` import to the same emitted asset the CSS uses.
 */
import figtreeLatinWoff2 from "@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2?url"

export { figtreeLatinWoff2 }
