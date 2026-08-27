# Implementation Notes — Retro Dungeon Crawler

Implementation of [`spec/001-retro-dungeon-crawler/spec.md`](spec/001-retro-dungeon-crawler/spec.md).
The **shipped artifact is the committed [`index.html`](index.html) at the repository
root** — open it directly via `file://` in Chrome 90+/Firefox 88+/Safari 14+
(no server, no build step, no network). Append `?seed=N` for a reproducible run
(`?seed=99999` produces the deterministic floor-1 test dungeon of FR-039).

## Repository layout

| Path | Purpose |
| --- | --- |
| `index.html` | **Shipped artifact** (generated, committed). Single non-module inline script — browsers block ES modules over `file://` (FR-014, Session 2026-06-25). |
| `src/constants.js` | Spec-mandated constants (80×80 grid, sight radius 5, caps, hint text). |
| `src/rng.js` | Seeded mulberry32 RNG + `?seed=` parsing with NaN → `Date.now()` fallback (FR-038). |
| `src/logger.js` | Structured DevTools-only logging: timestamp/level/component/message (FR-037). |
| `src/entities.js` | Enemy & item factories with the spec's floor-scaling formulas. |
| `src/input.js` | Key mapping; simultaneous-diagonal / last-keypress-wins resolution (FR-004, FR-027). |
| `src/dungeon.js` | BSP procedural generation + deterministic seed-99999 hub (FR-017, FR-039). |
| `src/game.js` | Turn loop: combat, enemy AI, items/inventory, fog, descent, game over/victory. |
| `src/render.js` | DOM/CSS character grid, HUD, overlays; only changed cells are touched per turn. |
| `src/main.js` | Browser bootstrap: seed, keyboard handlers, restart. |
| `scripts/build.js` | Inline build: concatenates `src/` modules into the root `index.html`. |
| `tests/unit/` | vitest unit/acceptance suite (Node, imports the ES modules directly). |
| `tests/e2e/` | Playwright integration suite (US6/SC-008) against the committed `index.html` via `file://`. |

Dev dependencies (`vitest`, `@playwright/test`) never ship: `index.html` is
self-contained and the build refuses to emit a bundle that references them.

## Running the tests

```sh
npm install                    # dev-only dependencies
npm test                       # vitest unit + acceptance suite (includes build checks)
npx playwright install chromium  # one-time browser download (dev machine only)
npm run test:e2e               # US6 integration suite against the committed index.html
```

## Regenerating index.html

```sh
npm run build                  # node scripts/build.js → writes ./index.html
```

The build is deterministic; commit the regenerated `index.html` whenever `src/`
changes. Note `npm test` itself runs the build (the artifact acceptance tests
regenerate `index.html` and fail on module syntax, test tooling, or network
references), so `git status` after a test run reveals a stale committed artifact.

## Spec interpretations (one line each)

- **Wall bump consumes no turn**: blocked movement (US1-AS4) is not an "action",
  so enemies do not respond to it (Assumptions: state advances when the player
  moves or attacks).
- **Enemy-vs-enemy collision**: a tile claimed by another enemy ends that
  enemy's move (it stays, per the Edge Case), while wall/staircase blocks still
  try the FR-022 slide alternatives.
- **Restart seed**: `R` re-reads `?seed=` from the URL (reproducible test runs);
  without the param a fresh `Date.now()` seed is drawn.
- **Dimmed tiles show terrain only** (walls/floor/stairs); items, like enemies,
  render only inside the lit sight radius (FR-032 extended to items).
- **Enemy drops** are skipped when the death tile already holds an item
  (one-item-per-tile, FR-025).
- **Item glyphs**: `!` potion, `/` weapon, `[` armor — all light blue per R102.
