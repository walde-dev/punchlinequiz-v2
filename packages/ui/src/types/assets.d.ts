// Vite resolves `?url` asset imports (e.g. the bundled Figtree woff2 in
// lib/fonts.ts) to a string URL at build time. `tsc --noEmit` doesn't know the
// Vite resolver, so declare the shape here. Without this, typecheck fails on
// any `import x from "...?url"`.
declare module "*?url" {
  const src: string
  export default src
}
