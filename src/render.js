// DOM/CSS character-grid renderer (Rendering Backend clarification, FR-001,
// FR-012, FR-015, FR-032, FR-033, FR-034, FR-035, R102, SC-006).
// Browser-only module: exercised by the US6 integration suite.
import { GRID_W, GRID_H, TILE_WALL, TILE_STAIRS, CONTROL_HINT, INVENTORY_CAP } from './constants.js';
import { visibilityAt, enemyAt, itemAt, playerAtk, playerDef } from './game.js';
import { itemLabel } from './entities.js';

export function createUI(doc, getGame) {
  const app = doc.getElementById('app');

  // --- header (max 3 lines: stats + log left, controls hint right, FR-033) ---
  const header = doc.createElement('header');
  header.id = 'hud';
  const hudLeft = doc.createElement('div');
  hudLeft.id = 'hud-left';
  const statsEl = doc.createElement('div');
  statsEl.id = 'stats';
  const logEl = doc.createElement('div');
  logEl.id = 'log';
  hudLeft.appendChild(statsEl);
  hudLeft.appendChild(logEl);
  const hudRight = doc.createElement('div');
  hudRight.id = 'hud-right';
  const hintEl = doc.createElement('span');
  hintEl.id = 'hint';
  hintEl.textContent = CONTROL_HINT;
  hudRight.appendChild(hintEl);
  header.appendChild(hudLeft);
  header.appendChild(hudRight);

  // --- scrollable grid viewport, player kept centered (FR-034) ---
  const viewport = doc.createElement('main');
  viewport.id = 'viewport';
  const grid = doc.createElement('div');
  grid.id = 'grid';
  grid.tabIndex = 0; // FR-030: grid container holds browser focus
  viewport.appendChild(grid);

  const cells = new Array(GRID_W * GRID_H);
  const cellCache = new Array(GRID_W * GRID_H).fill('');
  for (let y = 0; y < GRID_H; y++) {
    const row = doc.createElement('div');
    row.className = 'row';
    for (let x = 0; x < GRID_W; x++) {
      const cell = doc.createElement('span');
      cell.className = 'cell c-hidden';
      cell.textContent = ' ';
      cell.dataset.x = x;
      cell.dataset.y = y;
      cells[y * GRID_W + x] = cell;
      row.appendChild(cell);
    }
    grid.appendChild(row);
  }

  // --- full-viewport overlays (FR-035) ---
  function makeOverlay(id) {
    const el = doc.createElement('div');
    el.id = id;
    el.className = 'overlay';
    doc.body.appendChild(el);
    return el;
  }
  app.appendChild(header);
  app.appendChild(viewport);
  const invOverlay = makeOverlay('inventory-overlay');
  const endOverlay = makeOverlay('end-overlay');

  let inventoryOpen = false;
  let selection = 0;

  function cellView(game, x, y) {
    const vis = visibilityAt(game, x, y);
    if (vis === 'hidden') return [' ', 'cell c-hidden']; // black square, layout preserved
    const t = game.tiles[y * GRID_W + x];
    const terrainGlyph = t === TILE_WALL ? '#' : t === TILE_STAIRS ? '>' : '.';
    if (vis === 'dimmed') return [terrainGlyph, 'cell c-dim']; // terrain only (FR-032)
    if (game.player.x === x && game.player.y === y) return ['@', 'cell c-player'];
    const enemy = enemyAt(game, x, y); // alive + in sight radius only (FR-032)
    if (enemy) return [enemy.glyph, 'cell c-enemy'];
    const item = itemAt(game, x, y);
    if (item) return [item.glyph, 'cell c-item'];
    if (t === TILE_STAIRS) return ['>', 'cell c-stairs']; // grey, NOT item blue (2026-07-14)
    return [terrainGlyph, t === TILE_WALL ? 'cell c-wall' : 'cell c-floor'];
  }

  function renderGrid(game) {
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const i = y * GRID_W + x;
        const [glyph, cls] = cellView(game, x, y);
        const key = glyph + '|' + cls;
        if (cellCache[i] === key) continue; // update only changed tiles (FR-029)
        cellCache[i] = key;
        cells[i].textContent = glyph;
        cells[i].className = cls;
      }
    }
  }

  function centerOnPlayer(game) {
    const cell = cells[game.player.y * GRID_W + game.player.x];
    viewport.scrollLeft = cell.offsetLeft - viewport.clientWidth / 2 + cell.offsetWidth / 2;
    viewport.scrollTop = cell.offsetTop - viewport.clientHeight / 2 + cell.offsetHeight / 2;
  }

  function renderHud(game) {
    statsEl.textContent =
      `HP ${game.player.hp}/${game.player.maxHp} · ATK ${playerAtk(game)} · ` +
      `DEF ${playerDef(game)} · LV ${game.floor} · Floor ${game.floor}`;
    logEl.textContent = game.log.join('\n');
    logEl.scrollTop = logEl.scrollHeight;
    hintEl.style.display = game.floor === 1 && game.status === 'playing' ? '' : 'none';
  }

  function renderInventory(game) {
    if (!inventoryOpen) {
      invOverlay.classList.remove('open');
      return;
    }
    invOverlay.classList.add('open');
    const inv = game.player.inventory;
    const lines = ['INVENTORY  (↑/↓ select · Enter use/equip · Esc close)', ''];
    lines.push(`Equipped weapon: ${game.player.weapon ? itemLabel(game.player.weapon) : 'none'}`);
    lines.push(`Equipped armor:  ${game.player.armor ? itemLabel(game.player.armor) : 'none'}`);
    lines.push('');
    for (let i = 0; i < INVENTORY_CAP; i++) {
      const marker = i === selection ? '>' : ' ';
      const label = inv[i] ? itemLabel(inv[i]) : '— empty —';
      lines.push(`${marker} ${String(i + 1).padStart(2)}. ${label}`);
    }
    invOverlay.textContent = lines.join('\n');
  }

  function renderEnd(game) {
    if (game.status === 'playing') {
      endOverlay.classList.remove('open');
      return;
    }
    endOverlay.classList.add('open');
    const title = game.status === 'victory' ? 'VICTORY!' : 'GAME OVER';
    endOverlay.textContent = [
      title,
      '',
      `Floor reached: ${game.floor}`,
      `Enemies defeated: ${game.enemiesDefeated}`,
      `Seed: ${game.seed}`,
      '',
      'Press R to restart',
    ].join('\n');
  }

  function render() {
    const game = getGame();
    renderHud(game);
    renderGrid(game);
    renderInventory(game);
    renderEnd(game);
    centerOnPlayer(game);
  }

  function focusGrid() {
    grid.focus();
  }

  return {
    render,
    focusGrid,
    isInventoryOpen: () => inventoryOpen,
    openInventory() {
      inventoryOpen = true;
      selection = 0;
      render();
    },
    closeInventory() {
      inventoryOpen = false;
      render();
      focusGrid();
    },
    moveSelection(delta) {
      selection = (selection + delta + INVENTORY_CAP) % INVENTORY_CAP;
      render();
    },
    getSelection: () => selection,
    resetCache() {
      cellCache.fill('');
      render();
    },
  };
}
