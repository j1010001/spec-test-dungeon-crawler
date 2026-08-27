// Browser bootstrap: seed handling (FR-038), keyboard loop (FR-004/FR-027),
// inventory screen (FR-019), restart (FR-008/R101). Browser-only module.
import { parseSeedParam } from './rng.js';
import { createGame, movePlayer, useInventoryItem } from './game.js';
import { createUI } from './render.js';
import { createLogger } from './logger.js';
import { normalizeKey, isDirectionKey, resolveMove, createTurnCoalescer } from './input.js';

export function startGame(win) {
  const doc = win.document;
  const logger = createLogger(win.console);

  function newRun() {
    const seed = parseSeedParam(win.location.search, Date.now);
    return createGame(seed, undefined, logger);
  }

  let game = newRun();
  const ui = createUI(doc, () => game);
  const held = new Set();

  // FR-027: the first direction keydown arms a DIAGONAL_COALESCE_MS window; a
  // cross-axis second press inside it resolves ONE combined diagonal turn
  // immediately (enemies respond once), same-axis is last-keypress-wins, the
  // timer expiring resolves the lone cardinal, and keyup resolves the pending
  // press synchronously. SC-005's 16ms budget covers the render pipeline AFTER
  // a turn resolves (movePlayer + render below run synchronously, well inside
  // one frame); only a lone press-and-hold's FIRST move waits the full window.
  // Status/inventory are re-checked here, at resolution time, so a turn armed
  // before a restart/blur/inventory-open/game-end never lands afterwards.
  const turns = createTurnCoalescer(
    {
      set: (cb, ms) => win.setTimeout(cb, ms),
      clear: (id) => win.clearTimeout(id),
    },
    (key) => {
      if (ui.isInventoryOpen() || game.status !== 'playing') return;
      const move = resolveMove(key, held);
      if (move) {
        movePlayer(game, move[0], move[1]);
        ui.render();
      }
    }
  );

  logger.info('boot', `game booted, seed ${game.seed}`);

  doc.addEventListener('keydown', (e) => {
    const key = normalizeKey(e.key);

    // Inventory screen: pause the game loop while open (FR-019).
    if (ui.isInventoryOpen()) {
      e.preventDefault();
      if (key === 'escape' || key === 'i') {
        ui.closeInventory();
      } else if (key === 'arrowup' || key === 'w') {
        ui.moveSelection(-1);
      } else if (key === 'arrowdown' || key === 's') {
        ui.moveSelection(1);
      } else if (key === 'enter') {
        useInventoryItem(game, ui.getSelection());
        ui.render();
      }
      return;
    }

    // End screens: R restarts from floor 1 (FR-008, R101).
    if (game.status !== 'playing') {
      if (key === 'r') {
        e.preventDefault();
        logger.info('game', 'run restarted');
        game = newRun();
        held.clear();
        turns.cancel();
        ui.resetCache();
        ui.focusGrid();
      }
      return;
    }

    if (key === 'i') {
      e.preventDefault();
      ui.openInventory();
      return;
    }

    if (isDirectionKey(key)) {
      e.preventDefault(); // keep arrows from scrolling the page
      if (!e.repeat) held.add(key);
      turns.press(key, e.repeat === true); // 30ms diagonal window (FR-027)
    }
  });

  doc.addEventListener('keyup', (e) => {
    const key = normalizeKey(e.key);
    // Resolve a pending turn for THIS key BEFORE it leaves the held set, so a
    // fast press-and-release still combines exactly as it was physically held.
    if (isDirectionKey(key)) turns.release(key);
    held.delete(key);
  });
  win.addEventListener('blur', () => {
    held.clear();
    turns.cancel();
  });

  ui.render();
  ui.focusGrid();
}
