# work/

Poor man's Linear. File-based task management for agents and humans.

## directories

| dir | purpose |
|---|---|
| `ideas/` | Raw ideas, not yet validated. Cheap to create. |
| `features/` | Scoped features with acceptance criteria. Ready to build. |
| `bugs/` | Confirmed bugs with reproduction steps. |
| `plans/` | Multi-step implementation plans (linked to features). |

## lifecycle

```
idea → (validated) → feature → (planned) → plan → (built) → done
bug → (confirmed) → fix → (verified) → done
```

## file naming

```
{priority}-{slug}.md
```

- priority: `p0` (critical), `p1` (high), `p2` (medium), `p3` (low)
- slug: kebab-case, short
- examples: `p0-share-cards.md`, `p2-xp-system.md`

## frontmatter schema

```yaml
---
title: "Human-readable title"
status: idea | scoped | planned | in_progress | done | cancelled
priority: p0 | p1 | p2 | p3
created: YYYY-MM-DD
updated: YYYY-MM-DD
tags: [viral, retention, ux]
depends: []        # file paths of blockers
blocks: []         # file paths this blocks
---
```

## agent conventions

- **read `work/index.md`** at session start for current state
- **update `status`** when moving between lifecycle stages
- **update `updated`** on every edit
- **move files** between directories when lifecycle changes
- **regenerate `index.md`** after any structural change
- keep entries terse. agents scan, they don't read essays.

## index

auto-generated table of all work items, sorted by priority.
