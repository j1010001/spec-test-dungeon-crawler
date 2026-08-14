// User Story 6 — Inlined Artifact Smoke Test (SC-008).
// Runs against the shipped ./index.html via file:// with ?seed=99999 —
// the post-inline artifact, NOT the dev ES-module source. Guards the
// dev-source -> shipped-artifact seam (global collisions, dropped module
// boundaries, missing DOM, script-order regressions).

import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const artifactUrl = 'file://' + join(root, 'index.html') + '?seed=99999';

// Collects console errors + uncaught exceptions and asserts none happened.
function watchErrors(page) {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  return errors;
}

// Grid coordinates of the player glyph, derived purely from the DOM.
async function playerPos(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.cell.pl');
    if (!el) return null;
    const row = el.parentElement;
    return {
      x: Array.prototype.indexOf.call(row.children, el),
      y: Array.prototype.indexOf.call(row.parentElement.children, row),
    };
  });
}

test('US6-S1: loads via file:// in <2s, zero console errors, grid holds focus', async ({ page }) => {
  const errors = watchErrors(page);
  const requests = [];
  page.on('request', (req) => requests.push(req.url()));

  const t0 = Date.now();
  await page.goto(artifactUrl);
  await expect(page.locator('.cell.pl')).toHaveText('@');
  expect(Date.now() - t0).toBeLessThan(2000); // SC-007

  // FR-014: no external network requests — file:// only.
  for (const url of requests) expect(url.startsWith('file://')).toBe(true);

  // FR-030: grid container holds focus without a mouse click.
  const focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
  expect(focused).toBe('viewport');

  // Keyboard works with zero clicks: a move changes the player's cell.
  const before = await playerPos(page);
  await page.keyboard.press('d');
  const after = await playerPos(page);
  expect(after.x).toBe(before.x + 1);

  expect(errors).toEqual([]);
});

test('US6-S2: Room A hub renders — @ glyph, lit radius, hidden fog', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(artifactUrl);

  // Player at test-layout spawn (40,40).
  const pos = await playerPos(page);
  expect(pos).toEqual({ x: 40, y: 40 });
  await expect(page.locator('.cell.pl')).toHaveCount(1);

  const cellInfo = await page.evaluate(() => {
    const rows = document.querySelectorAll('#grid .row');
    const cls = (x, y) => rows[y].children[x].className;
    return {
      floorNear: cls(41, 40), // lit floor next to player
      wallLit: cls(36, 40), // Room A west wall, within radius 5
      hiddenFar: cls(60, 60), // far tile: hidden fog
      hiddenRoomB: cls(56, 40), // goblin tile: beyond sight radius at spawn
    };
  });
  expect(cellInfo.floorNear).toContain('ter');
  expect(cellInfo.wallLit).toContain('ter');
  expect(cellInfo.hiddenFar).toContain('hid');
  expect(cellInfo.hiddenRoomB).toContain('hid');

  // Hidden cells render as black squares (R102) but still occupy the grid.
  const hidStyle = await page.evaluate(() => {
    const el = document.querySelector('.cell.hid');
    const s = getComputedStyle(el);
    return { color: s.color, width: el.offsetWidth };
  });
  expect(hidStyle.color).toBe('rgb(0, 0, 0)');
  expect(hidStyle.width).toBeGreaterThan(0);

  expect(errors).toEqual([]);
});

test('US6-S3: cardinal movement moves one tile and reveals new tiles', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(artifactUrl);
  await expect(page.locator('.cell.pl')).toHaveText('@');

  const hiddenBefore = await page.evaluate(() => document.querySelectorAll('.cell.hid').length);
  const before = await playerPos(page);
  await page.keyboard.press('ArrowRight');
  const after = await playerPos(page);
  expect(after).toEqual({ x: before.x + 1, y: before.y });
  const hiddenAfter = await page.evaluate(() => document.querySelectorAll('.cell.hid').length);
  expect(hiddenAfter).toBeLessThan(hiddenBefore); // newly lit tiles left the fog

  expect(errors).toEqual([]);
});

test('US6-S4: moving into a wall changes nothing and emits no errors', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(artifactUrl);
  await expect(page.locator('.cell.pl')).toHaveText('@');

  // Room A spans x=37..43; three steps left reaches the west edge.
  for (let i = 0; i < 3; i++) await page.keyboard.press('a');
  const atWall = await playerPos(page);
  expect(atWall.x).toBe(37);
  await page.keyboard.press('a'); // into the wall
  const after = await playerPos(page);
  expect(after).toEqual(atWall);

  expect(errors).toEqual([]);
});

test('US6-S5: walking right reaches Room B — goblin and item glyphs visible within 20 keypresses', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(artifactUrl);
  await expect(page.locator('.cell.pl')).toHaveText('@');

  let goblinSeen = false;
  let itemSeen = false;
  for (let i = 0; i < 20 && !(goblinSeen && itemSeen); i++) {
    await page.keyboard.press('d');
    const counts = await page.evaluate(() => ({
      goblins: document.querySelectorAll('.cell.en').length,
      items: document.querySelectorAll('.cell.it').length,
      goblinGlyphs: Array.from(document.querySelectorAll('.cell.en')).map((e) => e.textContent),
    }));
    if (counts.goblins > 0 && counts.goblinGlyphs.includes('g')) goblinSeen = true;
    if (counts.items > 0) itemSeen = true;
  }
  expect(goblinSeen).toBe(true);
  expect(itemSeen).toBe(true);

  expect(errors).toEqual([]);
});

test('artifact is self-contained: single file, no test code, no module scripts', async ({ page }) => {
  // US6-S6 / FR-036 supporting check on the artifact itself.
  const fs = await import('node:fs');
  const html = fs.readFileSync(join(root, 'index.html'), 'utf8');
  expect(html).not.toMatch(/<script[^>]*type="module"/);
  expect(html).not.toMatch(/\bimport\s*\{/);
  expect(html).not.toMatch(/playwright|vitest/i);
  expect(html).not.toMatch(/<script[^>]*src=/); // no external scripts
  expect(html).not.toMatch(/https?:\/\/(?!www\.w3\.org)/); // no runtime URLs

  // HUD shows the SC-006 hint and stats on floor 1.
  const errors = watchErrors(page);
  await page.goto(artifactUrl);
  await expect(page.locator('#hint')).toContainText('WASD/Arrows to move');
  await expect(page.locator('#stat-hp')).toHaveText('HP 20/20');
  await expect(page.locator('#stat-floor')).toHaveText('Floor 1');
  expect(errors).toEqual([]);
});
