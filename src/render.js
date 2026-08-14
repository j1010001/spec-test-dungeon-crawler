// DOM/CSS character-grid renderer (Clarification D1; FR-001, FR-012,
// FR-015, FR-032, FR-033, FR-034, FR-035; R100, R102). Diff-based cell
// updates keep per-turn work bounded (SC-005, FR-029).

import { GRID_SIZE } from './entities.js';
import { TILE } from './dungeon.js';

export function createRenderer(root) {
  const gridEl = root.querySelector('#grid');
  const viewportEl = root.querySelector('#viewport');
  const cells = [];
  const cache = [];

  // Build the 80x80 grid once: one div per row, one span per cell.
  for (let y = 0; y < GRID_SIZE; y++) {
    const row = document.createElement('div');
    row.className = 'row';
    for (let x = 0; x < GRID_SIZE; x++) {
      const cell = document.createElement('span');
      cell.className = 'cell hid';
      cell.textContent = ' ';
      row.appendChild(cell);
      cells.push(cell);
      cache.push('hid| ');
    }
    gridEl.appendChild(row);
  }

  const hpEl = root.querySelector('#stat-hp');
  const atkEl = root.querySelector('#stat-atk');
  const defEl = root.querySelector('#stat-def');
  const lvlEl = root.querySelector('#stat-lvl');
  const floorEl = root.querySelector('#stat-floor');
  const logEl = root.querySelector('#hud-log');
  const hintEl = root.querySelector('#hint');
  const invEl = root.querySelector('#inventory');
  const invListEl = root.querySelector('#inv-list');
  const invEquipEl = root.querySelector('#inv-equipped');
  const overEl = root.querySelector('#gameover');
  const overStatsEl = root.querySelector('#gameover-stats');
  const winEl = root.querySelector('#victory');
  const winStatsEl = root.querySelector('#victory-stats');

  function cellFor(game, x, y) {
    const vis = game.visibility(x, y);
    if (vis === 0) return 'hid| '; // hidden: black square, grid preserved
    const tile = game.tileAt(x, y);
    if (vis === 1) {
      // Dimmed: terrain only — no entities (FR-032).
      return `dim|${tile === TILE.WALL ? '#' : tile === TILE.STAIRS ? '>' : '.'}`;
    }
    // Lit: player > enemy > item > terrain.
    if (x === game.player.x && y === game.player.y) return 'pl|@';
    const enemy = game.enemyAt(x, y);
    if (enemy) return `en|${enemy.glyph}`;
    const item = game.itemAt(x, y);
    if (item) return `it|${item.glyph}`;
    if (tile === TILE.STAIRS) return 'st|>';
    return tile === TILE.WALL ? 'ter|#' : 'ter|.';
  }

  function render(game) {
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const i = y * GRID_SIZE + x;
        const next = cellFor(game, x, y);
        if (cache[i] === next) continue;
        cache[i] = next;
        const sep = next.indexOf('|');
        cells[i].className = 'cell ' + next.slice(0, sep);
        cells[i].textContent = next.slice(sep + 1);
      }
    }

    // HUD (FR-005, FR-016).
    hpEl.textContent = `HP ${game.player.hp}/${game.player.maxHp}`;
    atkEl.textContent = `ATK ${game.attack}`;
    defEl.textContent = `DEF ${game.defense}`;
    lvlEl.textContent = `LVL ${game.level}`;
    floorEl.textContent = `Floor ${game.floorNum}`;

    // HUD log (FR-018): rolling buffer rendered, scrolled to newest.
    logEl.textContent = game.hudLog.join('\n');
    logEl.scrollTop = logEl.scrollHeight;

    // SC-006: hint until first descent.
    hintEl.style.display = game.hasDescended ? 'none' : '';

    renderInventory(game);
    renderEndScreens(game);
    centerOnPlayer(game);
  }

  function renderInventory(game) {
    if (game.state !== 'inventory') {
      invEl.classList.remove('active');
      return;
    }
    invEl.classList.add('active');
    const w = game.player.weapon;
    const a = game.player.armor;
    invEquipEl.textContent =
      `Weapon: ${w ? w.name : 'none'}   Armor: ${a ? a.name : 'none'}`;
    let html = '';
    for (let i = 0; i < 10; i++) {
      const item = game.player.inventory[i];
      const sel = i === game.invCursor ? 'sel' : '';
      const label = item ? `${item.glyph} ${item.name}` : '— empty —';
      html += `<div class="inv-slot ${sel}">${i === game.invCursor ? '>' : ' '} ${i + 1}. ${label}</div>`;
    }
    invListEl.innerHTML = html;
  }

  function renderEndScreens(game) {
    // FR-008, R101, FR-038: floor reached, enemies defeated, seed, restart prompt.
    if (game.state === 'gameover') {
      overStatsEl.textContent =
        `Floor reached: ${game.floorNum}  ·  Enemies defeated: ${game.enemiesDefeated}  ·  Seed: ${game.seed}`;
      overEl.classList.add('active');
    } else {
      overEl.classList.remove('active');
    }
    if (game.state === 'victory') {
      winStatsEl.textContent =
        `Floors conquered: 9  ·  Enemies defeated: ${game.enemiesDefeated}  ·  Seed: ${game.seed}`;
      winEl.classList.add('active');
    } else {
      winEl.classList.remove('active');
    }
  }

  // FR-034: keep the player centered in the scrollable viewport.
  function centerOnPlayer(game) {
    const cell = cells[game.player.y * GRID_SIZE + game.player.x];
    const cw = cell.offsetWidth || 16;
    const ch = cell.offsetHeight || 16;
    viewportEl.scrollLeft = game.player.x * cw + cw / 2 - viewportEl.clientWidth / 2;
    viewportEl.scrollTop = game.player.y * ch + ch / 2 - viewportEl.clientHeight / 2;
  }

  return { render };
}
