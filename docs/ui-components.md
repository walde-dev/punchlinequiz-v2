# UI Components

`packages/ui` (`@workspace/ui`) is the **single source of truth for every UI primitive**
in the app. It's shadcn built on [base-ui](https://base-ui.com) using the `base-maia`
style, then rebranded once to the app's look. The rule is simple:

> **Import primitives. Never hand-roll or re-style them.**

If you find yourself writing a raw `<input>`, a `fixed inset-0` modal, or a
`const inputCls = "rounded-xl border …"` string, stop — the component already exists.

## What's available

| Component | Import | Replaces |
|---|---|---|
| `Button`, `buttonVariants` | `@workspace/ui/components/button` | any clickable / link-button |
| `Badge` | `…/badge` | hand-rolled status pills |
| `Card`, `CardHeader`, `CardContent`, … | `…/card` | `bg-card` panel `<div>`s |
| `Table`, `TableHeader`, `TableRow`, … | `…/table` | raw `<table>` / div grids |
| `Input` | `…/input` | raw `<input type=text/number/…>` |
| `Textarea` | `…/textarea` | raw `<textarea>` |
| `Label` | `…/label` | `<label>` form captions |
| `Select`, `SelectTrigger`, `SelectItem`, … | `…/select` | raw `<select>` |
| `Checkbox` | `…/checkbox` | `<input type=checkbox>` |
| `Switch` | `…/switch` | toggle inputs |
| `Slider` | `…/slider` | `<input type=range>` |
| `Dialog`, `DialogContent`, … | `…/dialog` | centered modals |
| `Sheet`, `SheetContent`, … | `…/sheet` | edge drawers (bottom on mobile) |
| `Popover`, `PopoverContent`, … | `…/popover` | hover/click popouts |
| `Combobox`, `ComboboxInput`, … | `…/combobox` | autocomplete / typeahead |
| `Command`, `CommandInput`, … | `…/command` | command palette / searchable list |
| `InputGroup`, `InputGroupAddon`, … | `…/input-group` | inputs with inline icons/buttons |

## The brand tokens (already baked in)

You should not need these — they're in the components. They're here so that **when you
add a new primitive, you rebrand it to match**:

- **Controls** (input, textarea, select trigger, checkbox, combobox chips):
  `rounded-xl border border-border/60 bg-background/60`, text `text-sm font-medium`,
  placeholder `text-muted-foreground/50`,
  focus `focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring/50`.
- **Popovers / dropdowns** (select, combobox, popover content):
  `rounded-2xl border border-border/60 bg-popover/95 shadow-2xl backdrop-blur-sm`;
  highlighted item `data-highlighted:bg-primary/15 data-highlighted:text-foreground`;
  check indicator `text-primary` (gold).
- **Dialog / Sheet**: overlay `bg-black/60 backdrop-blur-sm`; panel
  `rounded-3xl border border-border/60 bg-card shadow-2xl` (Sheet bottom = `rounded-t-3xl`).
- **Accent**: gold (`--primary` / `--ring`) is the only accent. Checked/selected/active = gold.

## Styling at the call site

`className` on a primitive is for **layout only** — `w-full`, `mt-2`, `flex-1`, grid
placement. It is **not** for re-skinning (changing radius, border, background, colors).

```tsx
//  Good — layout tweak, look untouched
<Input className="w-32" inputMode="numeric" />

//  Bad — re-skinning a one-off; this drift is exactly what we removed
<Input className="rounded-md border-2 border-white bg-zinc-900" />
```

If a genuinely new look is needed in more than one place, add a `variant` (CVA) to the
component in `packages/ui` so it's reusable — don't fork it inline.

## Adding a missing primitive

```bash
cd packages/ui
pnpm dlx shadcn@latest add <name> --yes
# If it prompts to overwrite button/input/etc, answer "no" — those are already rebranded.
```

`base-maia` ships defaults like `rounded-4xl`, `border-input`, `bg-input/30`,
`data-highlighted:bg-accent`. Rebrand them to the tokens above before committing, then
add the export is automatic (the package exports `./components/*`). Run
`pnpm --filter @workspace/ui typecheck` to verify.

## Enforcement

`apps/web/eslint.config.js` flags raw `<input>` / `<textarea>` / `<select>` and
`role="dialog"` as a hard **error** — the whole app is migrated, so any new raw
control or hand-rolled modal fails lint. Reach for the `@workspace/ui` component instead.
