## UI Components — READ BEFORE WRITING ANY JSX

**All UI primitives live in `@workspace/ui/components`. Use them. Never hand-roll one.**

The shared library (`packages/ui`) is the single source of truth for styling. It is
shadcn (base-ui + `base-maia` style), already rebranded to the app's look — dark, gold
accent, `rounded-xl` controls, blurred popovers. The whole point is that **styling lives
in the root component**, so call sites import and use, never re-style.

Available today: `Button`, `Badge`, `Card`, `Table`, `Input`, `Textarea`, `Label`,
`Select`, `Checkbox`, `Switch`, `Slider`, `Dialog`, `Sheet`, `Popover`, `Combobox`,
`Command`, `InputGroup`.

### Hard rules
- **Never** write a raw `<input>`, `<textarea>`, or `<select>`. Import `Input` / `Textarea`
  / `Select` from `@workspace/ui/components/*`. (ESLint enforces this in `apps/web`.)
- **Never** hand-roll a modal/overlay (`fixed inset-0` + `role="dialog"` + Esc/outside-click
  effects). Use `Dialog` (centered) or `Sheet` (edge drawer). They handle focus-trap,
  scroll-lock, and a11y for you.
- **Never** copy a `const inputCls = "rounded-xl border …"` Tailwind string into a file.
  If you're styling a control inline, you're doing it wrong — the component already carries it.
- **Don't** override the component's look with `className` for one-offs. `className` is for
  layout (width, margin), not re-skinning. If a real variant is missing, add it to the
  component in `packages/ui` so everyone gets it.

### Missing a primitive?
Add it to the library, not the app:
```bash
cd packages/ui && pnpm dlx shadcn@latest add <name> --yes   # decline overwriting existing files
```
Then rebrand its base classes to match the others (rounded-xl controls, `border-border/60`,
`bg-background/60`, gold `focus-visible:ring-ring/50`, `bg-popover/95 backdrop-blur-sm`
popovers, `bg-card` dialogs) so it's reusable with zero call-site overrides.

See `docs/ui-components.md` for the full convention reference.

## Design Context

### Users
German hip hop fans, age 16–30. Using the app on their phone during downtime — commuting, between classes, late at night. They know the culture deeply and want to prove it. The job: **flex rap knowledge, beat friends, feel like the real one in the room.** They arrived via a Reddit post or WhatsApp share card.

### Brand Personality
**Competitive, Cultural, Slick.** Tone is a skilled trash talker who respects the culture — like a friend who roasts you but buys the next round. Not mean, not friendly. The energy is: *"You should know this. Let's see."*

Correct: "Ehre. Du kennst das." / Wrong (3 fails): "Nicht mal nah dran. Hier ist die Lösung."

### Aesthetic Direction
- **Background:** Deep charcoal blacks, #121212–#1f1f1f. Never white or light. Dark only.
- **Accent:** Gold #fbbf24 — ONE accent, used consistently. Never a second accent color.
- **Font:** Figtree Variable — geometric, modern, confident.
- **Buttons:** Pill-shaped (9999px radius). Gold primary, ghost for secondary.
- **Visuals:** Album art and artist photos only — no stock illustrations, no decorative icons.
- **Anti-patterns:** Glassmorphism, light backgrounds, serif fonts, multiple accents, "fun learning" feel.

### Design Principles
1. **The punchline is the hero.** UI chrome recedes, content glows.
2. **One accent, everywhere consistently.** Gold only.
3. **Competitive but not cruel.** Edge in copy, never punching the user — punching the lack of knowledge.
4. **Share-first design.** Every result state should feel worth screenshotting. The share card is the growth engine.
5. **Speed over spectacle.** Animations serve feedback, not decoration. Never delay a game interaction.

---

# Logging Rules

## Always Aggressive Log

Every discrete user action gets a structured event. No exceptions.

### Why
Paste a session_id into an LLM with Axiom MCP → replay the entire user timeline → debug anything. No guessing, no "can you reproduce it?"

### Stack
- Axiom (free tier: 500MB/month)
- Vercel log drain (automatic server logs)
- Axiom MCP (LLM queries)

### How

**Client-side** — fire-and-forget via `sendBeacon`:
```typescript
logEvent("event_name", { key: "value" });
```

**Server-side** — forward to Axiom ingest API:
```typescript
logToAxiom("event_name", { key: "value" });
```

### Event Format
```json
{ "event": "verb_noun", "session_id": "uuid", "key": "value", "timestamp": "ISO8601" }
```

### What to Log
- Every user action: clicks, submissions, selections
- Every state change: created, updated, deleted
- Every error: API errors, validation failures
- Every distribution moment: shares, referrals
- Include enough context to reconstruct what happened

### Rules
- Log first, optimize later. Over-logging > under-logging.
- No PII. Session IDs are anonymous UUIDs. No IPs, emails, names.
- Non-blocking. `sendBeacon` from client, fire-and-forget from server.
- Structured JSON always. Never plain text.
- Always include `session_id` and `timestamp`.
