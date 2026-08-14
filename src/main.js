// Bootstrap: parse the seed, start the run, wire renderer + input
// (FR-014, FR-030, FR-038).

import { parseSeed } from './rng.js';
import { createLogger } from './logger.js';
import { Game } from './game.js';
import { createRenderer } from './render.js';
import { attachInput } from './input.js';

const bootLog = createLogger('main');

function currentSeed() {
  const fromUrl = parseSeed(window.location.search);
  return fromUrl !== null ? fromUrl : Date.now();
}

function boot() {
  const seed = currentSeed();
  const game = new Game(seed);
  const renderer = createRenderer(document);
  const viewport = document.querySelector('#viewport');

  // FR-030: the grid container holds focus and answers the keyboard
  // without a mouse click; a window-level listener backstops focus loss.
  viewport.setAttribute('tabindex', '0');
  attachInput(window, game, () => game.restart(currentSeed()), () => renderer.render(game));
  viewport.focus();

  renderer.render(game);
  bootLog.info('booted', { seed });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
