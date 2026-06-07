/**
 * Minimal runtime polyfills for older mobile browsers. Imported FIRST in
 * router.tsx so it evaluates before any server-fn response is (de)serialized.
 *
 * `Object.hasOwn` (ES2022) is missing on Samsung Internet ≤16 — still real
 * traffic on Galaxy S10-era Androids. seroval, the (de)serializer TanStack Start
 * uses for server-fn payloads, calls `Object.hasOwn` while parsing; without it
 * the call throws "Object.hasOwn is not a function" → "Seroval Error (step: 3)"
 * and the whole route loader rejects (Sentry PUNCHLINEQUIZ-8). It's a pure
 * runtime API (no new syntax), so a one-line shim suffices. Harmless on Node
 * and modern browsers — the guard makes it a no-op where the native method
 * already exists.
 */
if (typeof Object.hasOwn !== "function") {
  Object.defineProperty(Object, "hasOwn", {
    value: function hasOwn(obj: object, key: PropertyKey): boolean {
      return Object.prototype.hasOwnProperty.call(obj, key)
    },
    configurable: true,
    writable: true,
  })
}

export {}
