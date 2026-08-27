# Run it / Develop it

## Run the game

Open **`index.html`** (repository root) directly in a browser — double-click
it or use a `file://` URL. No server, no build step, no network access needed
(FR-014). Optional: append `?seed=N` for a reproducible run (`?seed=99999`
produces the deterministic FR-039 test dungeon on floor 1; a non-integer seed
falls back to an auto seed).

Controls: `WASD`/arrows to move (hold two keys for diagonals), `I` inventory
(arrows select, `Enter` use/equip, `Esc` close), `R` restart on the
game-over/victory screen. Reach `>` to descend; win by taking the stairs on
floor 9.

## Repository layout

| Path | Purpose |
| --- | --- |
| `index.html` | **Shipped artifact** — single file, all JS inlined in one non-module script block, all CSS inlined. Generated; do not edit by hand. |
| `src/` | Dev source, browser-flavored ES modules. Game logic (`game.js`, `dungeon.js`, `fov.js`, `rng.js`, `input.js`, `constants.js`, `logger.js`) is DOM-free; `render.js`/`main.js` hold the DOM layer. |
| `tests/` | Vitest unit/logic suites (logic in Node, rendering via jsdom). |
| `tests/integration/` | Playwright suite — US6 scenarios 1–5 against the committed `index.html` over `file://`. |
| `tools/build.mjs` | Inline build script (Node stdlib only). |

## Develop

```sh
npm install                      # dev deps only: vitest, jsdom, playwright
npm test                         # unit/logic suite (vitest)
npm run build                    # regenerate /index.html from src/ (commit the result)
npx playwright install chromium  # once, for the integration suite
npm run test:integration         # US6 artifact smoke test (headless Chromium)
```

`npm run build` must be re-run (and `index.html` re-committed) after any
`src/` change — the integration suite tests the committed artifact, not the
dev modules.
