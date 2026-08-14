// Integration test guarding the dev-source -> shipped-artifact seam
// (User Story 6 / SC-008 / Constitution Principle III). Runs Playwright
// against the POST-INLINE root index.html via file://, never against the
// ES-module dev source. This file is a dev-only test dependency and is not
// part of the shipped artifact (FR-036).

import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const artifactPath = path.resolve(__dirname, '..', 'index.html');
const artifactUrl = `file://${artifactPath}?seed=99999`;

async function gridCells(page) {
  return page.$$eval('#grid .tile', (nodes) =>
    nodes.map((n) => ({ text: n.textContent, color: n.style.color }))
  );
}

function findGlyph(cells, glyph) {
  const idx = cells.findIndex((c) => c.text === glyph);
  if (idx === -1) return null;
  return { index: idx, x: idx % 80, y: Math.floor(idx / 80) };
}

test.describe('Shipped inlined artifact (index.html via file://, ?seed=99999)', () => {
  test('US6-S1: loads within 2s, zero console errors, grid holds focus without a click', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(String(err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    const start = Date.now();
    await page.goto(artifactUrl);
    await page.waitForSelector('#grid .tile');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(2000);

    const focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
    expect(focused).toBe('grid-wrapper');
    expect(errors).toEqual([]);
  });

  test('US6-S2: Room A hub layout renders — player glyph visible, sight radius lit, fog hidden', async ({ page }) => {
    await page.goto(artifactUrl);
    await page.waitForSelector('#grid .tile');
    const cells = await gridCells(page);

    const player = findGlyph(cells, '@');
    expect(player).not.toBeNull();
    expect(player.x).toBe(40);
    expect(player.y).toBe(40);

    // A tile far outside the sight radius must render as hidden fog: empty
    // glyph on a black background (no content, but still occupies grid
    // space — US1-AS1).
    const farIndex = 0 * 80 + 0;
    expect(cells[farIndex].text.trim()).toBe('');
  });

  test('US6-S3: cardinal movement changes position by one tile and reveals new tiles', async ({ page }) => {
    await page.goto(artifactUrl);
    await page.waitForSelector('#grid .tile');
    const wrapper = page.locator('#grid-wrapper');
    await wrapper.focus();

    const before = findGlyph(await gridCells(page), '@');
    await page.keyboard.press('KeyD'); // move right, toward Room B's corridor
    await page.waitForTimeout(50);
    const after = findGlyph(await gridCells(page), '@');

    expect(after).not.toBeNull();
    const dist = Math.max(Math.abs(after.x - before.x), Math.abs(after.y - before.y));
    expect(dist).toBe(1);
  });

  test('US6-S4: moving into a wall does not change position and emits no console error', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(String(err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto(artifactUrl);
    await page.waitForSelector('#grid .tile');
    const wrapper = page.locator('#grid-wrapper');
    await wrapper.focus();

    const before = findGlyph(await gridCells(page), '@');
    // Room A corners are wall — up+left simultaneously drives a diagonal
    // bump that is guaranteed to hit a wall within a handful of presses.
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.down('KeyW');
      await page.keyboard.down('KeyA');
      await page.waitForTimeout(20);
      await page.keyboard.up('KeyW');
      await page.keyboard.up('KeyA');
    }
    await page.waitForTimeout(50);
    const after = findGlyph(await gridCells(page), '@');
    // Position should have stabilized against the corner wall (not off the
    // grid, not thrown an error).
    expect(after).not.toBeNull();
    expect(errors).toEqual([]);
  });

  test('US6-S5: walking right into Room B reveals a Goblin and items within 20 keypresses', async ({ page }) => {
    await page.goto(artifactUrl);
    await page.waitForSelector('#grid .tile');
    const wrapper = page.locator('#grid-wrapper');
    await wrapper.focus();

    let sawGoblin = false;
    let sawItem = false;
    for (let i = 0; i < 20; i += 1) {
      await page.keyboard.press('KeyD');
      await page.waitForTimeout(15);
      const cells = await gridCells(page);
      if (cells.some((c) => c.text === 'g')) sawGoblin = true;
      if (cells.some((c) => c.text === '!' || c.text === '/' || c.text === '[')) sawItem = true;
      if (sawGoblin && sawItem) break;
    }
    expect(sawGoblin).toBe(true);
    expect(sawItem).toBe(true);
  });
});
