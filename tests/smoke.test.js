// Smoke/integration test for the shipped, inlined index.html (User Story 6).
// Loads the artifact via file:// with ?seed=99999 and drives it with the keyboard.
const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

const GRID_W = 80;
const ARTIFACT = pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;

function attachWatchers(page) {
  const problems = { errors: [], external: [] };
  page.on('console', (msg) => { if (msg.type() === 'error') problems.errors.push(msg.text()); });
  page.on('pageerror', (err) => problems.errors.push(String(err)));
  page.on('request', (req) => { if (!req.url().startsWith('file://')) problems.external.push(req.url()); });
  return problems;
}

async function load(page, seed = 99999) {
  await page.goto(`${ARTIFACT}?seed=${seed}`);
  await expect(page.locator('#grid span').first()).toBeAttached();
}

// Player position derived purely from the rendered DOM grid.
async function playerPos(page) {
  const i = await page.$$eval('#grid span', (cells) => cells.findIndex((c) => c.textContent === '@'));
  return { x: i % GRID_W, y: Math.floor(i / GRID_W) };
}

async function cellsWithClass(page, cls) {
  return page.$$eval('#grid span', (cells, c) => cells
    .map((el, i) => ({ i, g: el.textContent, c: el.className }))
    .filter((o) => o.c === c), cls);
}

async function press(page, key, times = 1) {
  for (let i = 0; i < times; i++) await page.keyboard.press(key);
}

test.describe('shipped index.html via file://', () => {
  test('S1: loads within 2s, grid has focus, no errors or external requests', async ({ page }) => {
    const problems = attachWatchers(page);
    const t0 = Date.now();
    await load(page);
    await expect(page.locator('#grid span', { hasText: '@' })).toBeVisible();
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('dungeon');
    expect(await page.locator('#grid span').count()).toBe(80 * 80);
    // 2D grid: second row is below the first, not beside it.
    const a = await page.locator('#grid span').nth(0).boundingBox();
    const b = await page.locator('#grid span').nth(GRID_W).boundingBox();
    expect(b.y).toBeGreaterThan(a.y);
    expect(b.x).toBe(a.x);
    expect(problems.errors).toEqual([]);
    expect(problems.external).toEqual([]);
  });

  test('S2: HUD present, Room A rendered around the player, rest is fog', async ({ page }) => {
    const problems = attachWatchers(page);
    await load(page);
    for (const id of ['#hp', '#maxhp', '#atk', '#def', '#level', '#floor']) {
      await expect(page.locator(id)).toBeVisible();
    }
    await expect(page.locator('#hp')).toHaveText('20');
    await expect(page.locator('#maxhp')).toHaveText('20');
    await expect(page.locator('#atk')).toHaveText('5');
    await expect(page.locator('#def')).toHaveText('1');
    await expect(page.locator('#level')).toHaveText('1');
    await expect(page.locator('#floor')).toHaveText('1');
    await expect(page.locator('#hint')).toContainText('WASD/Arrows to move');
    const header = await page.locator('#header').boundingBox();
    expect(header.height).toBeLessThanOrEqual(50);

    const p = await playerPos(page);
    expect(p).toEqual({ x: 40, y: 40 });
    const player = page.locator('#grid span', { hasText: '@' });
    await expect(player).toBeInViewport();

    // Only tiles within Chebyshev radius 5 of the player are seen; nothing else.
    const visible = await page.$$eval('#grid span', (cells) => cells
      .map((el, i) => ({ i, c: el.className, g: el.textContent }))
      .filter((o) => o.c !== 'h'));
    for (const v of visible) {
      const x = v.i % 80, y = Math.floor(v.i / 80);
      expect(Math.max(Math.abs(x - 40), Math.abs(y - 40))).toBeLessThanOrEqual(5);
    }
    // Room A is safe: no enemies or items in view.
    expect(await cellsWithClass(page, 'e')).toEqual([]);
    expect(await cellsWithClass(page, 'i')).toEqual([]);
    expect(await page.locator('#grid span.h').count()).toBeGreaterThan(6000);
    expect(problems.errors).toEqual([]);
  });

  test('S3: cardinal move shifts exactly one tile and reveals new tiles', async ({ page }) => {
    const problems = attachWatchers(page);
    await load(page);
    const hiddenBefore = await page.locator('#grid span.h').count();
    await press(page, 'ArrowRight');
    expect(await playerPos(page)).toEqual({ x: 41, y: 40 });
    const hiddenAfter = await page.locator('#grid span.h').count();
    expect(hiddenAfter).toBeLessThan(hiddenBefore);
    await press(page, 'w');
    expect(await playerPos(page)).toEqual({ x: 41, y: 39 });
    await press(page, 'a');
    expect(await playerPos(page)).toEqual({ x: 40, y: 39 });
    await press(page, 'ArrowDown');
    expect(await playerPos(page)).toEqual({ x: 40, y: 40 });
    expect(problems.errors).toEqual([]);
  });

  test('diagonal movement via two simultaneously held keys', async ({ page }) => {
    await load(page);
    await page.keyboard.down('w');
    await page.keyboard.down('d');
    await page.keyboard.up('w');
    await page.keyboard.up('d');
    expect(await playerPos(page)).toEqual({ x: 41, y: 39 });
  });

  test('S4: moving into a wall does not change position', async ({ page }) => {
    const problems = attachWatchers(page);
    await load(page);
    // Room A spans x 37..43; wall at x 36 on row 38 (no corridor there).
    await press(page, 'ArrowUp', 2);
    await press(page, 'ArrowLeft', 3);
    expect(await playerPos(page)).toEqual({ x: 37, y: 38 });
    await press(page, 'ArrowLeft', 3);
    expect(await playerPos(page)).toEqual({ x: 37, y: 38 });
    expect(problems.errors).toEqual([]);
  });

  test('S5: walking right reaches Room B with a goblin and items within 20 presses', async ({ page }) => {
    const problems = attachWatchers(page);
    await load(page);
    await press(page, 'ArrowRight', 12);
    expect(await playerPos(page)).toEqual({ x: 52, y: 40 });
    const enemies = await cellsWithClass(page, 'e');
    expect(enemies.map((e) => e.g)).toEqual(['g']);
    const items = await cellsWithClass(page, 'i');
    expect(items.length).toBe(11);
    const glyphs = new Set(items.map((i) => i.g));
    expect(glyphs).toEqual(new Set(['!', '/', '[']));
    expect(await page.locator('#grid span', { hasText: '>' }).count()).toBe(0);
    expect(problems.errors).toEqual([]);
  });

  test('combat in Room B: goblin dies, player survives, items fill inventory', async ({ page }) => {
    const problems = attachWatchers(page);
    await load(page);
    await press(page, 'ArrowRight', 12);
    // Bump the goblin until it is gone (it approaches the player).
    for (let i = 0; i < 20 && (await cellsWithClass(page, 'e')).length; i++) {
      const e = (await cellsWithClass(page, 'e'))[0];
      const p = await playerPos(page);
      const ex = e.i % 80, ey = Math.floor(e.i / 80);
      const dx = Math.sign(ex - p.x), dy = Math.sign(ey - p.y);
      if (Math.max(Math.abs(ex - p.x), Math.abs(ey - p.y)) === 1) {
        if (dx && dy) {
          await page.keyboard.down(dy < 0 ? 'w' : 's');
          await page.keyboard.down(dx < 0 ? 'a' : 'd');
          await page.keyboard.up(dy < 0 ? 'w' : 's');
          await page.keyboard.up(dx < 0 ? 'a' : 'd');
        } else {
          await press(page, dx > 0 ? 'd' : dx < 0 ? 'a' : dy > 0 ? 's' : 'w');
        }
      } else {
        await press(page, 'ArrowLeft'); // step back and let it come
        await press(page, 'ArrowRight');
      }
    }
    expect((await cellsWithClass(page, 'e')).length).toBe(0);
    await expect(page.locator('#kills')).toHaveText('1');
    const hp = Number(await page.locator('#hp').textContent());
    expect(hp).toBeGreaterThan(0);
    await expect(page.locator('#log')).toContainText('You hit Goblin for 4.');

    // Pick up everything on row 37 (6 items) then row 43 (5 items).
    let p = await playerPos(page);
    for (let i = 0; i < 10 && p.x < 52; i++) { await press(page, 'd'); p = await playerPos(page); }
    for (let i = 0; i < 10 && p.y > 37; i++) { await press(page, 'w'); p = await playerPos(page); }
    for (let i = 0; i < 10 && p.x > 52; i++) { await press(page, 'a'); p = await playerPos(page); }
    expect(p).toEqual({ x: 52, y: 37 });
    await press(page, 'd', 5);          // x 52..57 on row 37
    await press(page, 's', 6);          // down to row 43 at x 57 (no item there)
    await press(page, 'a', 5);          // x 56..52 on row 43
    await expect(page.locator('#log')).toContainText('Inventory full');
    // The 11th item stays on the floor; step off it so it is not hidden under '@'.
    await press(page, 'w');
    expect((await cellsWithClass(page, 'i')).length).toBeGreaterThanOrEqual(1);

    await press(page, 'i');
    await expect(page.locator('#inventory')).toBeVisible();
    expect(await page.locator('#inv-list li .it').count()).toBe(10);
    const slots = await page.locator('#inv-list li').allTextContents();
    const weaponSlot = slots.findIndex((t) => t.includes('ATK'));
    expect(weaponSlot).toBeGreaterThanOrEqual(0);
    await press(page, 'ArrowDown', weaponSlot);
    await press(page, 'Enter');
    const atk = Number(await page.locator('#atk').textContent());
    expect(atk).toBeGreaterThan(5);
    await press(page, 'Escape');
    await expect(page.locator('#inventory')).toBeHidden();
    expect(problems.errors).toEqual([]);
  });

  test('Room C goblins kill the player; R restarts from floor 1', async ({ page }) => {
    const problems = attachWatchers(page);
    await load(page);
    await press(page, 'ArrowDown', 12);
    for (let i = 0; i < 20 && !(await page.locator('#gameover').isVisible()); i++) {
      await press(page, 'ArrowDown');
    }
    await expect(page.locator('#gameover')).toBeVisible();
    await expect(page.locator('#gameover')).toContainText('Press R to restart');
    await expect(page.locator('#go-seed')).toHaveText('99999');
    await press(page, 'r');
    await expect(page.locator('#gameover')).toBeHidden();
    await expect(page.locator('#hp')).toHaveText('20');
    expect(await playerPos(page)).toEqual({ x: 40, y: 40 });
    expect(problems.errors).toEqual([]);
  });

  test('Room D stairs lead to procedurally generated floor 2', async ({ page }) => {
    const problems = attachWatchers(page);
    await load(page);
    await press(page, 'ArrowUp', 12);
    await expect(page.locator('#floor')).toHaveText('1');
    await press(page, 'ArrowUp', 2);
    await expect(page.locator('#floor')).toHaveText('2');
    await expect(page.locator('#level')).toHaveText('2');
    await expect(page.locator('#hint')).toBeHidden();
    await expect(page.locator('#grid span', { hasText: '@' })).toBeInViewport();
    expect(problems.errors).toEqual([]);
  });
});
