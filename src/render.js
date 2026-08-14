// DOM/CSS character-grid renderer (Clarification D1: DOM/CSS rendering
// backend). Builds the 80x80 grid once and mutates cell glyph/color/class
// on every render call so turn updates stay cheap (FR-005, FR-029).

import { GRID_SIZE, GLYPH, COLOR, TILE, VISIBILITY } from './constants.js';

const CELL_PX = 14;

let cells = null; // GRID_SIZE x GRID_SIZE array of <span> elements, built lazily
let gridEl = null;
let wrapperEl = null;

function ensureGrid(doc) {
  gridEl = doc.getElementById('grid');
  wrapperEl = doc.getElementById('grid-wrapper');
  if (cells && gridEl.childElementCount === GRID_SIZE * GRID_SIZE) return;

  gridEl.innerHTML = '';
  gridEl.style.display = 'grid';
  gridEl.style.gridTemplateColumns = `repeat(${GRID_SIZE}, ${CELL_PX}px)`;
  gridEl.style.gridTemplateRows = `repeat(${GRID_SIZE}, ${CELL_PX}px)`;
  gridEl.style.lineHeight = `${CELL_PX}px`;

  cells = [];
  const frag = doc.createDocumentFragment();
  for (let y = 0; y < GRID_SIZE; y += 1) {
    const row = [];
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const span = doc.createElement('span');
      span.className = 'tile';
      span.style.width = `${CELL_PX}px`;
      span.style.height = `${CELL_PX}px`;
      span.style.display = 'inline-block';
      span.style.textAlign = 'center';
      span.style.fontFamily = 'monospace';
      row.push(span);
      frag.appendChild(span);
    }
    cells.push(row);
  }
  gridEl.appendChild(frag);
}

function glyphForEnemy(enemy) {
  return enemy.glyph;
}

function renderCell(game, x, y) {
  const span = cells[y][x];
  const visibility = game.getVisibility(x, y);

  if (visibility === VISIBILITY.HIDDEN) {
    span.textContent = GLYPH.FOG;
    span.style.color = COLOR.BACKGROUND;
    span.style.backgroundColor = COLOR.BACKGROUND;
    return;
  }

  const tile = game.dungeon.grid[y][x];
  let glyph = GLYPH.FLOOR;
  let color = COLOR.FLOOR;

  if (tile === TILE.WALL) {
    glyph = GLYPH.WALL;
    color = COLOR.WALL;
  } else if (tile === TILE.STAIRS) {
    glyph = GLYPH.STAIRS;
    color = COLOR.STAIRS;
  } else if (tile === TILE.FLOOR) {
    glyph = GLYPH.FLOOR;
    color = COLOR.FLOOR;
    const item = game.dungeon.items.find((it) => it.x === x && it.y === y);
    if (item) {
      glyph = item.glyph;
      color = COLOR.ITEM;
    }
  }

  // Enemies only render when the tile is currently lit (FR-032) — stale
  // dimmed/previously-visited tiles show terrain only.
  if (visibility === VISIBILITY.LIT) {
    const enemy = game.dungeon.enemies.find((e) => e.alive && e.x === x && e.y === y);
    if (enemy) {
      glyph = glyphForEnemy(enemy);
      color = COLOR.ENEMY;
    }
    if (x === game.player.x && y === game.player.y) {
      glyph = GLYPH.PLAYER;
      color = COLOR.PLAYER;
    }
  }

  span.textContent = glyph;
  span.style.color = color;
  span.style.backgroundColor = visibility === VISIBILITY.DIMMED ? COLOR.FOG_DIM : COLOR.BACKGROUND;
}

function renderVisibleRegion(game) {
  // Turn-based game: a full 80x80 repaint (6400 simple style/text writes)
  // happens only once per player action, comfortably inside the frame
  // budget (FR-005, FR-028) while guaranteeing hidden tiles are painted as
  // explicit black squares (US1-AS1) and stale enemy glyphs never linger.
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      renderCell(game, x, y);
    }
  }
}

function centerOnPlayer(game) {
  if (!wrapperEl) return;
  const targetLeft = game.player.x * CELL_PX + CELL_PX / 2 - wrapperEl.clientWidth / 2;
  const targetTop = game.player.y * CELL_PX + CELL_PX / 2 - wrapperEl.clientHeight / 2;
  wrapperEl.scrollLeft = Math.max(0, targetLeft);
  wrapperEl.scrollTop = Math.max(0, targetTop);
}

function renderHud(game, doc) {
  const stats = game.getStats();
  const statsEl = doc.getElementById('hud-stats');
  if (statsEl) {
    statsEl.textContent =
      `HP ${stats.hp}/${stats.maxHp}  ATK ${stats.attack}  DEF ${stats.defense}  ` +
      `Lvl ${stats.level}  Floor ${stats.floor}`;
  }

  const logEl = doc.getElementById('hud-log');
  if (logEl) {
    const recent = game.log.slice(-3);
    logEl.textContent = recent.join(' ');
    logEl.title = game.log.join('\n');
  }

  const hintEl = doc.getElementById('hud-hint');
  if (hintEl) {
    hintEl.style.display = game.showControlHint ? '' : 'none';
    hintEl.textContent = 'WASD/Arrows to move · I for inventory · Reach > to descend';
  }
}

function renderInventory(game, doc) {
  const overlay = doc.getElementById('inventory-overlay');
  if (!overlay) return;
  const active = game.status === 'inventory';
  overlay.style.display = active ? 'flex' : 'none';
  if (!active) return;

  const listEl = doc.getElementById('inventory-list');
  listEl.innerHTML = '';
  if (game.player.inventory.length === 0) {
    const empty = doc.createElement('div');
    empty.textContent = '(empty)';
    listEl.appendChild(empty);
  }
  game.player.inventory.forEach((item, i) => {
    const row = doc.createElement('div');
    const selected = i === game.inventoryCursor;
    const effect =
      item.type === 'potion' ? `heal ${item.value}` :
      item.type === 'weapon' ? `+${item.value} ATK` :
      `+${item.value} DEF`;
    row.textContent = `${selected ? '> ' : '  '}${item.label} (${effect})`;
    row.style.color = selected ? COLOR.PLAYER : COLOR.ITEM;
    listEl.appendChild(row);
  });

  const equippedEl = doc.getElementById('inventory-equipped');
  if (equippedEl) {
    const w = game.player.equippedWeapon;
    const a = game.player.equippedArmor;
    equippedEl.textContent =
      `Equipped — Weapon: ${w ? `${w.label} (+${w.value})` : 'none'} · ` +
      `Armor: ${a ? `${a.label} (+${a.value})` : 'none'}`;
  }
}

function renderEndScreen(id, active, info, doc, title) {
  const overlay = doc.getElementById(id);
  if (!overlay) return;
  overlay.style.display = active ? 'flex' : 'none';
  if (!active || !info) return;
  const body = doc.getElementById(`${id}-body`);
  if (body) {
    body.textContent =
      `${title} — Floor reached: ${info.floor} · Enemies defeated: ${info.enemiesDefeated} · Seed: ${info.seed}`;
  }
}

/** Full render pass: HUD, grid, scroll centering, and overlays. */
export function render(game, doc = document) {
  ensureGrid(doc);
  renderVisibleRegion(game);
  centerOnPlayer(game);
  renderHud(game, doc);
  renderInventory(game, doc);
  renderEndScreen('gameover-overlay', game.status === 'gameover', game.gameOverInfo, doc, 'Game Over');
  renderEndScreen('victory-overlay', game.status === 'victory', game.gameOverInfo, doc, 'Victory!');
}

export function resetRenderCache() {
  cells = null;
  gridEl = null;
  wrapperEl = null;
}
