// Browser bootstrap: reads ?seed=, constructs the Game, wires input and
// renders. This file (bundled with the rest of src/ into a single IIFE) is
// the entry point for both the dev harness and the shipped inlined artifact.

import { Game } from './game.js';
import { render } from './render.js';
import { attachInput } from './input.js';
import { resolveSeed } from './rng.js';
import { logger } from './logger.js';

function boot(doc = document, win = window) {
  const params = new URLSearchParams(win.location.search);
  const seed = resolveSeed(params.get('seed'));
  const game = new Game(seed);

  const focusTarget = doc.getElementById('grid-wrapper');
  if (focusTarget) {
    focusTarget.setAttribute('tabindex', '0');
  }

  function redraw() {
    render(game, doc);
  }

  redraw();

  if (focusTarget) {
    attachInput(focusTarget, game, redraw);
    focusTarget.focus({ preventScroll: false });
    // Clicking anywhere in the game area returns focus to the grid so
    // keyboard input keeps working (FR-030 requires no mouse click needed
    // at all for the *first* input, but we defensively re-focus anyway).
    doc.addEventListener('click', () => focusTarget.focus({ preventScroll: true }));
  }

  logger.info('Main', 'boot complete', { seed });
  return game;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => boot());
  } else {
    boot();
  }
}

export { boot };
