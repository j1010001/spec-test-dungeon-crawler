// User Story 6 — Inlined Artifact Smoke Test (US6 scenarios 1-5, SC-008).
// Runs the COMMITTED /index.html (the post-inline shipped artifact, not the
// dev ES-module source) via file:// with ?seed=99999 in headless Chromium.
//
// Prerequisites:  npm run build   (artifact must exist & be current)
//                 npx playwright install chromium
// Run with:       npm run test:integration
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ARTIFACT = fileURLToPath(new URL('../../index.html', import.meta.url));
const ARTIFACT_URL = `${pathToFileURL(ARTIFACT).href}?seed=99999`;

let browser;
let page;
let consoleErrors;
let pageErrors;
let loadMs;

beforeAll(async () => {
  expect(existsSync(ARTIFACT), 'committed /index.html must exist — run `npm run build`').toBe(true);
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

beforeEach(async () => {
  page = await browser.newPage();
  consoleErrors = [];
  pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  const t0 = Date.now();
  await page.goto(ARTIFACT_URL);
  await page.waitForSelector('#grid .t', { state: 'attached', timeout: 2000 });
  loadMs = Date.now() - t0;
});

afterEach(async () => {
  await page?.close();
});

async function playerPos() {
  return page.evaluate(() => {
    const cell = [...document.querySelectorAll('#grid .t')].find((c) => c.textContent === '@');
    return cell ? { x: Number(cell.dataset.x), y: Number(cell.dataset.y) } : null;
  });
}

async function turn() {
  return page.evaluate(() => Number(document.body.dataset.turn ?? 0));
}

// One keypress = one processed turn: press, then wait for the turn counter
// to advance (the game batches input per animation frame).
async function press(key) {
  const before = await turn();
  await page.keyboard.press(key);
  await page.waitForFunction(
    (t) => Number(document.body.dataset.turn ?? 0) > t,
    before,
    { timeout: 2000 },
  );
}

function expectNoErrors() {
  expect(consoleErrors, `console.error output: ${consoleErrors.join(' | ')}`).toEqual([]);
  expect(pageErrors, `uncaught exceptions: ${pageErrors.join(' | ')}`).toEqual([]);
}

describe('US6 — inlined artifact via file:// with ?seed=99999', () => {
  it('S1: renders within 2s, zero console errors, keyboard focus without a click', async () => {
    // page rendered (beforeEach waited on the grid) within the 2s budget
    expect(loadMs).toBeLessThan(2000);
    expectNoErrors();
    // the grid viewport holds focus with no mouse interaction (FR-030)
    const focused = await page.evaluate(() => document.activeElement?.id);
    expect(focused).toBe('viewport');
    // and responds to keyboard events immediately
    await press('ArrowRight');
    expect(await turn()).toBeGreaterThan(0);
    expectNoErrors();
  });

  it('S2: renders the Room A hub — @ glyph, lit radius-5 tiles, hidden fog (R100/R102)', async () => {
    // player glyph at the Room A center (40,40)
    const pos = await playerPos();
    expect(pos).toEqual({ x: 40, y: 40 });
    const cellInfo = await page.evaluate(() => {
      const get = (x, y) =>
        document.querySelector(`.t[data-x="${x}"][data-y="${y}"]`);
      const playerCell = get(40, 40);
      const litFloor = get(42, 40); // Room A floor within radius
      const litWall = get(36, 40); // Room A west wall, within radius
      const hidden = get(60, 60); // far away, never visited
      const style = (el) => getComputedStyle(el);
      return {
        player: { text: playerCell.textContent, color: style(playerCell).color },
        litFloor: { text: litFloor.textContent, cls: litFloor.className },
        litWall: { text: litWall.textContent, cls: litWall.className },
        hidden: {
          text: hidden.textContent.trim(),
          cls: hidden.className,
          bg: style(hidden).backgroundColor,
          color: style(hidden).color,
        },
        litCount: document.querySelectorAll('#grid .t.lit').length,
      };
    });
    expect(cellInfo.player.text).toBe('@');
    expect(cellInfo.player.color).toBe('rgb(255, 255, 255)'); // white player
    expect(cellInfo.litFloor.text).toBe('.');
    expect(cellInfo.litFloor.cls).toContain('lit');
    expect(cellInfo.litWall.text).toBe('#');
    // full 11×11 sight box is lit around the spawn
    expect(cellInfo.litCount).toBe(121);
    // hidden tiles render as black squares with no content
    expect(cellInfo.hidden.text).toBe('');
    expect(cellInfo.hidden.cls).toContain('hid');
    expect(cellInfo.hidden.bg).toBe('rgb(0, 0, 0)');
    expectNoErrors();
  });

  it('S3: a cardinal keypress moves exactly one tile and reveals hidden tiles', async () => {
    const before = await playerPos();
    const hiddenBefore = await page.evaluate(
      () => document.querySelectorAll('#grid .t.hid').length,
    );
    await press('ArrowUp'); // toward the unexplored Room D corridor
    const after = await playerPos();
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y - 1); // exactly one tile
    const hiddenAfter = await page.evaluate(
      () => document.querySelectorAll('#grid .t.hid').length,
    );
    expect(hiddenAfter).toBeLessThan(hiddenBefore); // hidden -> lit transition
    expectNoErrors();
  });

  it('S4: moving into a wall changes nothing and emits no console error', async () => {
    // walk to Room A's west edge (x=37), then push into the wall
    await press('ArrowLeft');
    await press('ArrowLeft');
    await press('ArrowLeft');
    let pos = await playerPos();
    expect(pos).toEqual({ x: 37, y: 40 });
    await press('ArrowLeft'); // wall at x=36 — blocked
    pos = await playerPos();
    expect(pos).toEqual({ x: 37, y: 40 }); // position unchanged
    expectNoErrors();
  });

  it('S5: walking right reaches Room B — goblin g and item glyphs visible within 20 keypresses', async () => {
    let sawGoblin = false;
    let sawItems = false;
    let presses = 0;
    while (presses < 20 && !(sawGoblin && sawItems)) {
      await press('ArrowRight');
      presses++;
      const seen = await page.evaluate(() => {
        const cells = [...document.querySelectorAll('#grid .t.lit')];
        return {
          goblin: cells.some((c) => c.textContent === 'g' && c.className.includes('enemy')),
          items: cells.some(
            (c) => ['!', '/', ']'].includes(c.textContent) && c.className.includes('item'),
          ),
        };
      });
      sawGoblin = sawGoblin || seen.goblin;
      sawItems = sawItems || seen.items;
    }
    expect(presses).toBeLessThanOrEqual(20);
    expect(sawGoblin, 'goblin glyph g must become visible').toBe(true);
    expect(sawItems, 'item glyphs must become visible').toBe(true);
    expectNoErrors();
  });
});
