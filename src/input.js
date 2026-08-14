// Keyboard input handling (FR-004, FR-027): WASD/arrows, 8-directional
// movement via simultaneous key combos, last-keypress-wins for sequential
// presses, `I` to toggle inventory, arrow keys + Enter/Esc inside it, and
// `R` to restart from game-over/victory screens.

const DIRECTION_KEYS = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

const DIAGONAL_FROM_PAIR = {
  'up,left': { dx: -1, dy: -1 },
  'left,up': { dx: -1, dy: -1 },
  'up,right': { dx: 1, dy: -1 },
  'right,up': { dx: 1, dy: -1 },
  'down,left': { dx: -1, dy: 1 },
  'left,down': { dx: -1, dy: 1 },
  'down,right': { dx: 1, dy: 1 },
  'right,down': { dx: 1, dy: 1 },
};

const CARDINAL_DELTA = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

/**
 * Wire keyboard listeners on `target` that drive `game`, re-rendering via
 * `onChange` after every action that mutates state. Returns a disposer.
 */
export function attachInput(target, game, onChange) {
  const held = new Set(); // currently-held direction keys, insertion order

  function resolveDelta() {
    if (held.size >= 2) {
      const dirs = [...held];
      const key = `${dirs[dirs.length - 2]},${dirs[dirs.length - 1]}`;
      const diagonal = DIAGONAL_FROM_PAIR[key];
      if (diagonal) return diagonal;
    }
    if (held.size >= 1) {
      const last = [...held][held.size - 1];
      return CARDINAL_DELTA[last];
    }
    return null;
  }

  function onKeyDown(e) {
    const direction = DIRECTION_KEYS[e.code];

    if (game.status === 'inventory') {
      if (e.code === 'ArrowUp' || e.code === 'KeyW') game.moveInventoryCursor(-1);
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') game.moveInventoryCursor(1);
      else if (e.code === 'Enter') game.useSelectedInventoryItem();
      else if (e.code === 'Escape') game.closeInventory();
      else return;
      e.preventDefault();
      onChange();
      return;
    }

    if (game.status === 'gameover' || game.status === 'victory') {
      if (e.code === 'KeyR') {
        game.restart();
        onChange();
      }
      return;
    }

    if (e.code === 'KeyI') {
      game.openInventory();
      e.preventDefault();
      onChange();
      return;
    }

    if (direction) {
      // FR-027: last-keypress-wins for sequential presses — re-inserting an
      // already-held key would not change order, so drop and re-add to push
      // it to "most recent".
      held.delete(direction);
      held.add(direction);
      const delta = resolveDelta();
      if (delta) game.move(delta);
      e.preventDefault();
      onChange();
    }
  }

  function onKeyUp(e) {
    const direction = DIRECTION_KEYS[e.code];
    if (direction) held.delete(direction);
  }

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);

  return function dispose() {
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('keyup', onKeyUp);
  };
}
