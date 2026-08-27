// @vitest-environment jsdom
// Rendering & layout: FR-001/FR-015 (2D grid), FR-012/R102 (glyphs +
// palette classes), FR-032 (enemy visibility), FR-033 (header layout),
// FR-035 (overlays), SC-006 (hint), incremental re-render (FR-029).
import { describe, it, expect, beforeEach } from 'vitest';
import { Game, MODE } from '../src/game.js';
import { Renderer } from '../src/render.js';
import { GRID_W, GRID_H } from '../src/constants.js';

function setup() {
  document.body.innerHTML = '<div id="app"></div>';
  const game = new Game({ explicitSeed: 99999 });
  const renderer = new Renderer(document.getElementById('app'), game);
  renderer.render();
  return { game, renderer };
}

function cellAt(x, y) {
  return document.querySelector(`.t[data-x="${x}"][data-y="${y}"]`);
}

describe('2D character grid (FR-001, FR-015, FR-020)', () => {
  it('renders 80 rows of 80 single-glyph cells', () => {
    setup();
    const rows = document.querySelectorAll('#grid .row');
    expect(rows.length).toBe(GRID_H);
    for (const row of rows) expect(row.children.length).toBe(GRID_W);
    expect(document.querySelectorAll('#grid .t').length).toBe(6400);
    for (const cell of document.querySelectorAll('#grid .t')) {
      expect(cell.textContent.length).toBeLessThanOrEqual(1);
    }
  });

  it('shows the player as a white @ at its position (FR-012, R102)', () => {
    const { game } = setup();
    const cell = cellAt(game.player.x, game.player.y);
    expect(cell.textContent).toBe('@');
    expect(cell.className).toContain('player');
  });

  it('hidden tiles occupy grid space but show no content (US1-AS1)', () => {
    setup();
    const hidden = cellAt(10, 10); // far corner, never visited
    expect(hidden.className).toContain('hid');
    expect(hidden.textContent.trim()).toBe('');
  });

  it('lit terrain, walls and staircase use grey classes; dimmed tiles use the fog class (R102)', () => {
    const { game, renderer } = setup();
    // wall left of the corridor mouth above the spawn room: (38,36) — lit
    const wall = cellAt(38, 36);
    expect(wall.textContent).toBe('#');
    expect(wall.className).toContain('terrain');
    // walk away and verify the old area dims
    for (let i = 0; i < 12; i++) game.step(1, 0);
    renderer.render();
    const dimmed = cellAt(37, 40); // Room A west edge, now beyond radius 5
    expect(dimmed.className).toContain('dim');
    expect(dimmed.textContent).toBe('.'); // terrain only when dimmed
  });
});

describe('entity visibility on the grid (FR-032)', () => {
  it('enemies are hidden until their tile is lit, then drawn with the enemy class', () => {
    const { game, renderer } = setup();
    const goblin = game.floorData.enemies.find((e) => e.roomIndex === 1);
    expect(cellAt(goblin.x, goblin.y).textContent.trim()).toBe(''); // hidden
    for (let i = 0; i < 12; i++) game.step(1, 0); // enter Room B
    renderer.render();
    const cell = cellAt(goblin.x, goblin.y);
    expect(cell.textContent).toBe('g');
    expect(cell.className).toContain('enemy');
  });

  it('items render light-blue glyphs only when lit (R102)', () => {
    const { game, renderer } = setup();
    const item = game.floorData.items[0];
    expect(cellAt(item.x, item.y).textContent.trim()).toBe('');
    for (let i = 0; i < 12; i++) game.step(1, 0);
    renderer.render();
    const litItems = document.querySelectorAll('#grid .t.item');
    expect(litItems.length).toBeGreaterThan(0);
    for (const cell of litItems) expect(['!', '/', ']']).toContain(cell.textContent);
  });

  it('dead enemies disappear from the grid', () => {
    const { game, renderer } = setup();
    const goblin = game.floorData.enemies.find((e) => e.roomIndex === 1);
    game.floorData.enemies = game.floorData.enemies.filter((e) => e !== goblin);
    game.player.x = 54;
    game.player.y = 40;
    game.step(0, 1); // any turn
    renderer.render();
    expect(document.querySelectorAll('#grid .t.enemy').length).toBe(0);
  });
});

describe('HUD header (FR-005, FR-016, FR-018, FR-033, SC-006)', () => {
  it('shows HP, max HP, attack, defense, level and floor at all times', () => {
    const { game } = setup();
    const stats = document.getElementById('stats').textContent;
    expect(stats).toContain('HP 20/20');
    expect(stats).toContain('ATK 5');
    expect(stats).toContain('DEF 1');
    expect(stats).toContain('LVL 1');
    expect(stats).toContain('Floor 1');
  });

  it('stats reflect equipped item bonuses (FR-005)', () => {
    const { game, renderer } = setup();
    game.player.weapon = { kind: 'weapon', value: 3, glyph: '/', name: 'W+3' };
    game.player.armor = { kind: 'armor', value: 2, glyph: ']', name: 'A+2' };
    renderer.render();
    const stats = document.getElementById('stats').textContent;
    expect(stats).toContain('ATK 8');
    expect(stats).toContain('DEF 3');
  });

  it('header holds stats+log in the left column and the hint in the right column', () => {
    setup();
    const hud = document.getElementById('hud');
    const left = document.getElementById('hud-left');
    expect(hud.contains(left)).toBe(true);
    expect(left.contains(document.getElementById('stats'))).toBe(true);
    expect(left.contains(document.getElementById('log'))).toBe(true);
    const hint = document.getElementById('hint');
    expect(hud.contains(hint)).toBe(true);
    expect(left.contains(hint)).toBe(false);
    expect(hint.textContent).toBe('WASD/Arrows to move · I for inventory · Reach > to descend');
  });

  it('hint is visible on floor 1 and hidden after the first descent (SC-006)', () => {
    const { game, renderer } = setup();
    expect(document.getElementById('hint').hasAttribute('hidden')).toBe(false);
    for (let i = 0; i < 14; i++) game.step(0, -1); // descend via Room D
    renderer.render();
    expect(game.player.floor).toBe(2);
    expect(document.getElementById('hint').hasAttribute('hidden')).toBe(true);
  });

  it('the log element renders the retained lines (≤50) and no more', () => {
    const { game, renderer } = setup();
    for (let i = 0; i < 80; i++) game.pushLog(`event ${i}`);
    renderer.render();
    const lines = document.querySelectorAll('#log div');
    expect(lines.length).toBeLessThanOrEqual(50);
    expect(lines[lines.length - 1].textContent).toBe('event 79');
  });
});

describe('overlays (FR-035, FR-008, R101, FR-038)', () => {
  it('all overlays are fully hidden while playing', () => {
    setup();
    for (const id of ['overlay-inventory', 'overlay-gameover', 'overlay-victory']) {
      const el = document.getElementById(id);
      expect(el.hasAttribute('hidden')).toBe(true);
      expect(el.innerHTML).toBe('');
    }
  });

  it('the inventory overlay lists all 10 slots with items and effects (US3-AS5, FR-019)', () => {
    const { game, renderer } = setup();
    game.player.inventory.push({ kind: 'weapon', value: 2, glyph: '/', name: 'Weapon (+2 ATK)' });
    game.openInventory();
    renderer.render();
    const overlay = document.getElementById('overlay-inventory');
    expect(overlay.hasAttribute('hidden')).toBe(false);
    expect(overlay.querySelectorAll('.slot').length).toBe(10);
    expect(overlay.textContent).toContain('Weapon (+2 ATK)');
    expect(overlay.textContent).toContain('empty');
  });

  it('the game-over overlay shows floor, kills, seed and the restart prompt (FR-008)', () => {
    const { game, renderer } = setup();
    game.player.hp = 0;
    game.mode = MODE.GAME_OVER;
    renderer.render();
    const overlay = document.getElementById('overlay-gameover');
    expect(overlay.hasAttribute('hidden')).toBe(false);
    expect(overlay.textContent).toContain('GAME OVER');
    expect(overlay.textContent).toContain('Floor reached: 1');
    expect(overlay.textContent).toContain('Seed: 99999');
    expect(overlay.textContent).toContain('Press R to restart');
  });

  it('the victory overlay shows the same data with a victory banner (R101)', () => {
    const { game, renderer } = setup();
    game.mode = MODE.VICTORY;
    renderer.render();
    const overlay = document.getElementById('overlay-victory');
    expect(overlay.hasAttribute('hidden')).toBe(false);
    expect(overlay.textContent).toContain('VICTORY');
    expect(overlay.textContent).toContain('Seed: 99999');
    expect(overlay.textContent).toContain('Press R to restart');
  });
});

describe('incremental rendering (FR-028/FR-029/SC-005)', () => {
  it('re-renders only cells whose content changed on a turn', () => {
    const { game, renderer } = setup();
    // instrument: count className writes by wrapping the cache comparison
    const before = renderer._cache.slice();
    game.step(1, 0);
    renderer.render();
    let changed = 0;
    for (let i = 0; i < before.length; i++) {
      if (renderer._cache[i] !== before[i]) changed++;
    }
    // one step changes at most the two player cells + a band of newly lit /
    // newly dimmed tiles along the sight-radius edge — far below 6400
    expect(changed).toBeGreaterThan(0);
    expect(changed).toBeLessThan(100);
  });

  it('the DOM node count stays constant across turns (no unbounded growth)', () => {
    const { game, renderer } = setup();
    const count = document.querySelectorAll('*').length;
    for (let i = 0; i < 10; i++) {
      game.step(i % 2 === 0 ? 1 : -1, 0);
      renderer.render();
    }
    expect(document.querySelectorAll('*').length).toBe(count);
  });
});
