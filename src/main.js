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

  // FR-027: direction keydowns arriving within the same animation frame merge
  // into ONE turn (near-simultaneous cross-axis presses = one diagonal move,
  // enemies respond once). Resolution runs inside requestAnimationFrame —
  // before the frame's paint — so input-to-render latency stays within the
  // 16ms frame budget (SC-005); keyup flushes synchronously, so a completed
  // press never waits even that long.
  const turns = createTurnCoalescer(
    (cb) => win.requestAnimationFrame(cb),
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
      turns.press(key); // coalesced: resolves once per frame (FR-027)
    }
  });

  doc.addEventListener('keyup', (e) => {
    const key = normalizeKey(e.key);
    // Resolve any pending turn BEFORE the key leaves the held set, so a fast
    // press-and-release still combines exactly as it was physically held.
    if (isDirectionKey(key)) turns.flush();
    held.delete(key);
  });
  win.addEventListener('blur', () => {
    held.clear();
    turns.cancel();
  });

  ui.render();
  ui.focusGrid();
}
