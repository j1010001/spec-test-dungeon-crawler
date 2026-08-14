# Retro Dungeon Crawler

A birdseye-view, ASCII-glyph, fog-of-war dungeon crawler RPG. Procedurally
generated floors (BSP rooms + corridors), turn-based bump combat, an
inventory/equipment system, and a 9-floor roguelike descent with permadeath.

Implements `spec/001-retro-dungeon-crawler/spec.md`.

## Play it

The shippable game is the single file **`index.html`** at the repo root.
Open it directly in a browser — no server, no build step, no network:

```
open index.html          # macOS
xdg-open index.html      # Linux
# or just double-click it / drag it into a browser tab
```

**Controls**

| Key             | Action                              |
|-----------------|--------------------------------------|
| `W`/`A`/`S`/`D` or arrows | Move (hold two for diagonal) |
| Bump into an enemy | Attack it                        |
| `I`             | Open/close inventory                |
| Arrows (in inventory) | Move selection cursor         |
| `Enter` (in inventory) | Use potion / equip weapon or armor |
| `Esc`           | Close inventory                     |
| `R` (on game-over/victory) | Restart from floor 1     |

Add `?seed=12345` to the URL to pin the run's RNG seed (shown on the
game-over/victory screen). `?seed=99999` loads the fixed test dungeon
described in User Story 5 of the spec.

## Development

The game is developed as ES modules under `src/` (for unit testing with
Vitest) and bundled into the single shipped `index.html` by esbuild — the
browser never sees an `import`/`export` at runtime (`file://` blocks ES
modules), satisfying FR-014 and FR-036.

```
npm install
npm test            # unit tests (Vitest) against src/*.js
npm run build       # bundles src/ into index.html at the repo root
npm run test:e2e    # builds, then runs Playwright against the shipped index.html
npm run verify      # unit tests + build + e2e, all in one
```

## Project layout

| Path                         | Responsibility |
|-------------------------------|----------------|
| `src/rng.js`                  | Seeded PRNG (mulberry32) + `?seed=` resolution |
| `src/constants.js`             | Grid size, glyphs, colors, stat formulas |
| `src/dungeon.js`               | BSP floor generation + the fixed seed-99999 test dungeon |
| `src/entities.js`              | Player factory, inventory, equip/use logic |
| `src/combat.js`                | Damage formula, attack resolution, drop rolls |
| `src/game.js`                  | Turn state machine: movement, AI, fog, descent, win/lose |
| `src/render.js`                | DOM/CSS character-grid renderer + HUD/overlays |
| `src/input.js`                 | Keyboard handling (diagonals, last-key-wins, menus) |
| `src/main.js`                  | Browser bootstrap (entry point) |
| `src/logger.js`                | Structured DevTools-only logging |
| `build/inline.mjs`             | esbuild bundle → inlined shipped `index.html` |
| `tests/unit/`                  | Vitest unit tests against the ES-module source |
| `tests-e2e/`                   | Playwright integration test against the shipped artifact |
