// User Story 6 — Inlined Artifact Smoke Test (SC-008).
// Runs against the COMMITTED root index.html via file:// with ?seed=99999.
// Guards the dev-source → shipped-artifact inlining seam: none of these
// assertions may be satisfied by the ES-module dev source.
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const artifact = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../index.html');
const URL = 'file://' + artifact + '?seed=99999';

// Seed-99999 floor-1 facts (FR-039): spawn (40,40) center of Room A;
// corridors open right/down/up; Room B entered at x=52 along y=40.

function trackErrors(page) {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

async function playerPos(page) {
  return page.$eval('.c-player', (el) => [Number(el.dataset.x), Number(el.dataset.y)]);
}

async function cellClass(page, x, y) {
  return page.$eval(`.cell[data-x="${x}"][data-y="${y}"]`, (el) => el.className);
}

test('US6-S1: loads via file:// in <2s with zero console errors; grid holds focus and accepts keys without a mouse', async ({ page }) => {
  const errors = trackErrors(page);
  const t0 = Date.now();
  await page.goto(URL);
  await page.waitForSelector('.c-player');
  expect(Date.now() - t0).toBeLessThan(2000); // SC-007/US6-S1 render budget

  // Focus sits on the grid container without any mouse interaction (FR-030).
  const focusedId = await page.evaluate(() => document.activeElement && document.activeElement.id);
  expect(focusedId).toBe('grid');

  // Keyboard input works immediately — no click first.
  const before = await playerPos(page);
  await page.keyboard.press('ArrowRight');
  const after = await playerPos(page);
  expect(after).toEqual([before[0] + 1, before[1]]);

  expect(errors).toEqual([]);
});

test('US6-S2: Room A hub layout renders — @ visible, radius-5 tiles lit, fog hidden as black', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(URL);
  await page.waitForSelector('.c-player');

  // Player glyph at the hub center (40,40).
  expect(await playerPos(page)).toEqual([40, 40]);
  expect(await page.$eval('.c-player', (el) => el.textContent)).toBe('@');

  // Corridor mouths (dist 4) are lit floor in all three hub directions.
  expect(await cellClass(page, 44, 40)).toContain('c-floor'); // right corridor
  expect(await cellClass(page, 40, 44)).toContain('c-floor'); // down corridor
  expect(await cellClass(page, 40, 36)).toContain('c-floor'); // up corridor
  // Room A wall on the corridor-less west side.
  expect(await cellClass(page, 36, 40)).toContain('c-wall');

  // Beyond the 5-tile Chebyshev radius: hidden black cells that still occupy
  // grid space (US1-AS1).
  expect(await cellClass(page, 46, 40)).toContain('c-hidden');
  expect(await cellClass(page, 40, 46)).toContain('c-hidden');
  const hiddenBox = await page.$eval('.cell[data-x="46"][data-y="40"]', (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  expect(hiddenBox).toBe(true);

  expect(errors).toEqual([]);
});

test('US6-S3: a cardinal move shifts the player exactly one tile and reveals hidden tiles', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(URL);
  await page.waitForSelector('.c-player');

  expect(await cellClass(page, 46, 40)).toContain('c-hidden'); // dist 6: hidden
  await page.keyboard.press('d');
  expect(await playerPos(page)).toEqual([41, 40]); // exactly one tile right
  expect(await cellClass(page, 46, 40)).toContain('c-floor'); // hidden → lit

  expect(errors).toEqual([]);
});

test('US6-S4: moving into a wall is blocked — no position change, no console error', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(URL);
  await page.waitForSelector('.c-player');

  // Walk to Room A's west edge (37,40), then bump the wall at (36,40).
  for (let i = 0; i < 3; i++) await page.keyboard.press('a');
  expect(await playerPos(page)).toEqual([37, 40]);
  await page.keyboard.press('a');
  expect(await playerPos(page)).toEqual([37, 40]); // blocked, unchanged

  expect(errors).toEqual([]);
});

test('US6-S5: walking right reaches Room B within 20 keypresses — goblin g and item glyphs visible', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(URL);
  await page.waitForSelector('.c-player');

  let found = false;
  let presses = 0;
  for (; presses < 20 && !found; ) {
    await page.keyboard.press('d');
    presses++;
    const goblins = await page.$$eval('.c-enemy', (els) =>
      els.filter((el) => el.textContent === 'g').length
    );
    const items = await page.$$eval('.c-item', (els) => els.length);
    found = goblins >= 1 && items >= 1;
  }
  expect(found).toBe(true);
  expect(presses).toBeLessThanOrEqual(20);

  expect(errors).toEqual([]);
});

test('FR-027 regression: a same-task cross-axis keydown pair is ONE combined diagonal turn, not two moves', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(URL);
  await page.waitForSelector('.c-player');
  expect(await playerPos(page)).toEqual([40, 40]); // seed-99999 spawn

  // Deterministic simultaneity: both keydowns of the pair dispatched
  // synchronously within one task — no frame boundary can split them.
  // (The pre-fix build resolved this as TWO turns: (40,40) → (39,38).)
  await page.evaluate(() => {
    const opts = { bubbles: true, cancelable: true };
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', ...opts }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ...opts }));
  });

  // Wait for the coalesced turn to resolve (next animation frame)...
  await page.waitForFunction(() => {
    const el = document.querySelector('.c-player');
    return el && !(Number(el.dataset.x) === 40 && Number(el.dataset.y) === 40);
  });
  // ...then give any (erroneous) second turn two full frames to land.
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  );

  // Exactly one diagonal step: delta (−1,−1), NOT (−1,−2)/(−2,−1).
  expect(await playerPos(page)).toEqual([39, 39]);

  // Releasing the keys triggers no further movement.
  await page.evaluate(() => {
    const opts = { bubbles: true, cancelable: true };
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', ...opts }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', ...opts }));
  });
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  );
  expect(await playerPos(page)).toEqual([39, 39]);

  expect(errors).toEqual([]);
});

test('FR-027 regression: sequential presses stay one-tile-per-press (last keypress wins)', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(URL);
  await page.waitForSelector('.c-player');

  // Two clean sequential presses = two cardinal moves (US6-S3 semantics).
  await page.keyboard.press('d');
  expect(await playerPos(page)).toEqual([41, 40]);
  await page.keyboard.press('s');
  expect(await playerPos(page)).toEqual([41, 41]);

  expect(errors).toEqual([]);
});
