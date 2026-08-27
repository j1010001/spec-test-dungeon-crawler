// DOM renderer (FR-001, FR-012, FR-015, FR-032, FR-033, FR-034, FR-035,
// R102). Builds the layout once, then re-renders only cells whose content
// changed (FR-028/FR-029/SC-005 — no unbounded growth, per-turn updates stay
// tiny). Pure DOM; all game logic lives in game.js.

import { GRID_W, GRID_H, TILE, VIS, GLYPHS, MAX_INVENTORY } from './constants.js';
import { MODE } from './game.js';

export class Renderer {
  constructor(root, game) {
    this.root = root;
    this.game = game;
    this._buildLayout();
    this._cache = new Array(GRID_W * GRID_H).fill('');
  }

  _buildLayout() {
    const doc = this.root.ownerDocument;
    this.root.innerHTML = '';

    // Header (FR-033): max 3 lines — stats + log left, controls hint right.
    const header = doc.createElement('header');
    header.id = 'hud';
    const left = doc.createElement('div');
    left.id = 'hud-left';
    this.statsEl = doc.createElement('div');
    this.statsEl.id = 'stats';
    this.logEl = doc.createElement('div');
    this.logEl.id = 'log';
    left.appendChild(this.statsEl);
    left.appendChild(this.logEl);
    this.hintEl = doc.createElement('div');
    this.hintEl.id = 'hint';
    this.hintEl.textContent = 'WASD/Arrows to move · I for inventory · Reach > to descend';
    header.appendChild(left);
    header.appendChild(this.hintEl);
    this.root.appendChild(header);

    // Scrollable grid viewport (FR-034) — focusable (FR-030), scrollbars
    // hidden via CSS (FR-033).
    this.viewport = doc.createElement('div');
    this.viewport.id = 'viewport';
    this.viewport.tabIndex = 0;
    this.grid = doc.createElement('div');
    this.grid.id = 'grid';
    this.cells = new Array(GRID_W * GRID_H);
    for (let y = 0; y < GRID_H; y++) {
      const row = doc.createElement('div');
      row.className = 'row';
      for (let x = 0; x < GRID_W; x++) {
        const cell = doc.createElement('span');
        cell.className = 't hid';
        cell.dataset.x = String(x);
        cell.dataset.y = String(y);
        row.appendChild(cell);
        this.cells[y * GRID_W + x] = cell;
      }
      this.grid.appendChild(row);
    }
    this.viewport.appendChild(this.grid);
    this.root.appendChild(this.viewport);

    // Full-viewport overlays (FR-035) — completely hidden when inactive.
    this.invOverlay = this._makeOverlay(doc, 'overlay-inventory');
    this.gameOverOverlay = this._makeOverlay(doc, 'overlay-gameover');
    this.victoryOverlay = this._makeOverlay(doc, 'overlay-victory');
  }

  _makeOverlay(doc, id) {
    const el = doc.createElement('div');
    el.id = id;
    el.className = 'overlay';
    el.setAttribute('hidden', '');
    this.root.appendChild(el);
    return el;
  }

  // Full render pass: HUD, changed grid cells, overlays, scroll position.
  render() {
    const g = this.game;
    this._renderHud();
    this._renderGrid();
    this._renderOverlays();
    this._centerOnPlayer();
    this.root.ownerDocument.body.dataset.turn = String(g.turn);
    this.root.ownerDocument.body.dataset.mode = g.mode;
    this.root.ownerDocument.body.dataset.floor = String(g.player.floor);
  }

  _renderHud() {
    const g = this.game;
    this.statsEl.textContent =
      `HP ${g.player.hp}/${g.player.maxHp}  ATK ${g.attack}  DEF ${g.defense}` +
      `  LVL ${g.player.level}  Floor ${g.player.floor}  Kills ${g.enemiesDefeated}`;
    // FR-018: render the retained rolling buffer (≤50 lines); CSS caps the
    // visible height and keeps it scrolled to the newest lines.
    const doc = this.root.ownerDocument;
    this.logEl.innerHTML = '';
    for (const line of this.game.log) {
      const div = doc.createElement('div');
      div.textContent = line;
      this.logEl.appendChild(div);
    }
    this.logEl.scrollTop = this.logEl.scrollHeight;
    // SC-006: hint hidden after the first descent.
    if (g.hintVisible) this.hintEl.removeAttribute('hidden');
    else this.hintEl.setAttribute('hidden', '');
  }

  // Desired glyph+class for a cell — entity precedence: player > enemy >
  // item > terrain. Enemies/items render only on lit tiles (FR-032); dimmed
  // tiles show terrain only; hidden tiles show nothing (black).
  _cellState(x, y) {
    const g = this.game;
    const vis = g.visibility(x, y);
    if (vis === VIS.HIDDEN) return ' |hid';
    const tile = g.tileAt(x, y);
    if (vis === VIS.DIM) {
      const glyph = tile === TILE.WALL ? GLYPHS.wall : tile === TILE.STAIRS ? GLYPHS.stairs : GLYPHS.floor;
      return `${glyph}|dim`;
    }
    // lit
    if (g.player.x === x && g.player.y === y) return `${GLYPHS.player}|lit player`;
    const enemy = g.enemyAt(x, y);
    if (enemy) return `${enemy.glyph}|lit enemy`;
    const item = g.itemAt(x, y);
    if (item) return `${item.glyph}|lit item`;
    const glyph = tile === TILE.WALL ? GLYPHS.wall : tile === TILE.STAIRS ? GLYPHS.stairs : GLYPHS.floor;
    return `${glyph}|lit terrain`;
  }

  _renderGrid() {
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const i = y * GRID_W + x;
        const state = this._cellState(x, y);
        if (state === this._cache[i]) continue; // only re-render changes
        this._cache[i] = state;
        const [glyph, cls] = state.split('|');
        const cell = this.cells[i];
        cell.textContent = glyph;
        cell.className = `t ${cls}`;
      }
    }
  }

  _renderOverlays() {
    const g = this.game;
    this._setOverlay(this.invOverlay, g.mode === MODE.INVENTORY, () => this._inventoryHtml());
    this._setOverlay(this.gameOverOverlay, g.mode === MODE.GAME_OVER, () =>
      this._endHtml('GAME OVER', 'You died.'),
    );
    this._setOverlay(this.victoryOverlay, g.mode === MODE.VICTORY, () =>
      this._endHtml('VICTORY!', 'You conquered the dungeon.'),
    );
  }

  _setOverlay(el, active, html) {
    if (active) {
      el.innerHTML = html();
      el.removeAttribute('hidden');
    } else {
      el.setAttribute('hidden', '');
      el.innerHTML = '';
    }
  }

  _esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  _inventoryHtml() {
    const g = this.game;
    const rows = [];
    for (let i = 0; i < MAX_INVENTORY; i++) {
      const item = g.player.inventory[i];
      const cursor = i === g.invCursor ? '&gt; ' : '&nbsp;&nbsp;';
      const label = item ? this._esc(item.name) : '<span class="empty">- empty -</span>';
      const sel = i === g.invCursor ? ' selected' : '';
      rows.push(`<div class="slot${sel}">${cursor}${i + 1}. ${label}</div>`);
    }
    const weapon = g.player.weapon ? this._esc(g.player.weapon.name) : 'none';
    const armor = g.player.armor ? this._esc(g.player.armor.name) : 'none';
    return (
      `<div class="panel"><h2>INVENTORY</h2>` +
      `<div class="equipped">Equipped weapon: ${weapon} · Equipped armor: ${armor}</div>` +
      rows.join('') +
      `<div class="help">Arrows: select · Enter: use/equip · Esc: close</div></div>`
    );
  }

  _endHtml(title, blurb) {
    const g = this.game;
    return (
      `<div class="panel"><h2>${title}</h2><p>${blurb}</p>` +
      `<p>Floor reached: ${g.player.floor} · Enemies defeated: ${g.enemiesDefeated}</p>` +
      `<p>Seed: ${g.seed}</p>` +
      `<p class="help">Press R to restart</p></div>`
    );
  }

  // FR-034: keep the player centered/visible in the scrollable viewport.
  _centerOnPlayer() {
    const cell = this.cells[this.game.player.y * GRID_W + this.game.player.x];
    if (!cell || typeof cell.offsetLeft !== 'number') return;
    const vp = this.viewport;
    // offsets are relative to the offsetParent (body) — make them relative
    // to the viewport box before centering
    vp.scrollLeft = cell.offsetLeft - vp.offsetLeft + cell.offsetWidth / 2 - vp.clientWidth / 2;
    vp.scrollTop = cell.offsetTop - vp.offsetTop + cell.offsetHeight / 2 - vp.clientHeight / 2;
  }
}
