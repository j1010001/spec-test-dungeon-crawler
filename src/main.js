// Browser bootstrap: seed parsing (FR-038), game + renderer wiring, keyboard
// handling (FR-004/FR-027/FR-019/FR-008/R101), rAF-batched turn processing.

import { parseSeedParam } from './rng.js';
import { Game, MODE } from './game.js';
import { Renderer } from './render.js';
import { InputQueue, isMovementKey } from './input.js';
import { logEvent } from './logger.js';

export function boot(win) {
  const w = win ?? window;
  const doc = w.document;
  const explicitSeed = parseSeedParam(w.location.search);
  const game = new Game({ explicitSeed });

  let root = doc.getElementById('app');
  if (!root) {
    root = doc.createElement('div');
    root.id = 'app';
    doc.body.appendChild(root);
  }
  const renderer = new Renderer(root, game);
  const input = new InputQueue();

  renderer.render();
  renderer.viewport.focus(); // FR-030: keyboard works with no mouse click

  let scheduled = false;
  function scheduleTurn() {
    if (scheduled) return;
    scheduled = true;
    w.requestAnimationFrame(() => {
      scheduled = false;
      const move = input.consume(); // FR-027: only the last queued keypress
      if (move && game.mode === MODE.PLAY) {
        game.step(move[0], move[1]);
        renderer.render();
      }
    });
  }

  w.addEventListener('keydown', (ev) => {
    const key = ev.key;
    const lower = key.toLowerCase();

    if (game.mode === MODE.GAME_OVER || game.mode === MODE.VICTORY) {
      if (lower === 'r') {
        game.restart();
        renderer.render();
        renderer.viewport.focus();
      }
      ev.preventDefault();
      return;
    }

    if (game.mode === MODE.INVENTORY) {
      if (lower === 'escape' || lower === 'i') {
        game.closeInventory();
      } else if (lower === 'arrowup' || lower === 'w') {
        game.moveInventoryCursor(-1);
      } else if (lower === 'arrowdown' || lower === 's') {
        game.moveInventoryCursor(1);
      } else if (lower === 'enter') {
        game.useSelected();
      }
      renderer.render();
      ev.preventDefault();
      return;
    }

    // PLAY mode
    if (lower === 'i') {
      game.openInventory();
      renderer.render();
      ev.preventDefault();
      return;
    }
    if (isMovementKey(lower)) {
      input.keyDown(lower); // held keys combine into diagonals (FR-027)
      scheduleTurn();
      ev.preventDefault();
    }
  });

  w.addEventListener('keyup', (ev) => input.keyUp(ev.key));
  w.addEventListener('blur', () => input.clearHeld());

  logEvent('info', 'boot', `game booted (seed ${game.seed})`, { seed: game.seed });
  return { game, renderer, input };
}

// Auto-boot in a real browser (the inlined artifact relies on this).
if (typeof window !== 'undefined' && typeof document !== 'undefined' && !window.__NO_AUTOBOOT__) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => boot(window));
  } else {
    boot(window);
  }
}
