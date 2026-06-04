//  @ts-check

import { tanstackConfig } from "@tanstack/eslint-config"

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

export default [...tanstackConfig, noHandRolledUi]
