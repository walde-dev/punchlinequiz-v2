//  @ts-check

import { tanstackConfig } from "@tanstack/eslint-config"
import reactHooks from "eslint-plugin-react-hooks"

/**
 * Guardrail: keep UI consistent by routing every primitive through
 * `@workspace/ui/components`. See CLAUDE.md → "UI Components".
 *
 * Raw form controls and hand-rolled modals are the two ways styling drifts,
 * so they are flagged here. All legacy call sites are migrated, so this is a
 * hard error — new raw controls/modals fail lint.
 */
const noHandRolledUi = {
  files: ["src/**/*.tsx"],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: "JSXOpeningElement[name.name='input']",
        message:
          "Use <Input> from @workspace/ui/components/input (or <Checkbox>/<Switch>/<Slider> for those types) — never a raw <input>. Styling lives in the component.",
      },
      {
        selector: "JSXOpeningElement[name.name='textarea']",
        message:
          "Use <Textarea> from @workspace/ui/components/textarea — never a raw <textarea>.",
      },
      {
        selector: "JSXOpeningElement[name.name='select']",
        message:
          "Use <Select> from @workspace/ui/components/select — never a raw <select>.",
      },
      {
        selector: "JSXAttribute[name.name='role'][value.value='dialog']",
        message:
          "Don't hand-roll modals. Use <Dialog> (centered) or <Sheet> (drawer) from @workspace/ui — they handle focus-trap, scroll-lock and a11y.",
      },
    ],
  },
}

/**
 * Launch-pragmatic relaxation (added alongside CI so lint can be a hard merge
 * gate without a risky mass-rewrite of existing code):
 *
 * `no-unnecessary-condition` is a type-aware *style* rule, not a bug-catcher.
 * It flags defensive guards on values TS *types* as non-null but which are
 * runtime-nullable (DB rows, external API payloads). Auto-"fixing" it would
 * strip real null checks, so it's off rather than warn.
 *
 * Everything else in tanstackConfig — and the no-hand-rolled-UI guardrail above
 * — stays a hard error. Re-enable this (and burn down the backlog) when you
 * want stricter enforcement.
 */
const launchRelaxations = {
  // Scoped to where @typescript-eslint is registered (flat config only resolves
  // a plugin's rules for files some config attached it to).
  files: ["**/*.{ts,tsx}"],
  rules: {
    "@typescript-eslint/no-unnecessary-condition": "off",
  },
}

/**
 * React Hooks linting. `@tanstack/eslint-config` no longer bundles this plugin,
 * but the codebase relies on it (it carries `eslint-disable react-hooks/...`
 * directives). Register it so those directives resolve, with:
 * - `rules-of-hooks` as a hard error — a genuine bug catcher.
 * - `exhaustive-deps` as a warning — real but often intentional; visible,
 *   non-blocking, and matches how the code already treats it.
 */
const reactHooksConfig = {
  files: ["**/*.{jsx,tsx}"],
  plugins: { "react-hooks": reactHooks },
  rules: {
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
  },
}

/**
 * Never lint build output. A standalone `ignores`-only object is a global
 * ignore in flat config — without it, running `eslint` after a local build
 * parses the generated bundles in `.output`/`.vercel`/`.nitro` and reports
 * dozens of bogus parse/rule errors. (CI lints a clean checkout, so this only
 * bit local runs.)
 */
const ignores = {
  ignores: [".output/**", ".vercel/**", ".nitro/**", "dist/**"],
}

export default [
  ignores,
  ...tanstackConfig,
  noHandRolledUi,
  launchRelaxations,
  reactHooksConfig,
]
