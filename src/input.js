// Keyboard input (FR-004, FR-019, FR-027, FR-030): WASD + arrows,
// 8-directional. Simultaneously held direction keys combine into one
// diagonal move; sequential presses each resolve their own turn
// synchronously, so only the last keypress before a turn resolves ever
// takes effect.

const DIRS = {
  w: [0, -1],
  a: [-1, 0],
  s: [0, 1],
  d: [1, 0],
  arrowup: [0, -1],
  arrowleft: [-1, 0],
  arrowdown: [0, 1],
  arrowright: [1, 0],
};

export function attachInput(target, game, onRestart, onUpdate) {
  const held = new Set();

  function heldVector() {
    let dx = 0;
    let dy = 0;
    for (const key of held) {
      const [vx, vy] = DIRS[key];
      dx += vx;
      dy += vy;
    }
    return [Math.max(-1, Math.min(1, dx)), Math.max(-1, Math.min(1, dy))];
  }

  target.addEventListener('keydown', (ev) => {
    const key = ev.key.toLowerCase();

    if (game.state === 'inventory') {
      if (key === 'escape' || key === 'i') {
        game.closeInventory();
      } else if (key === 'arrowup' || key === 'w' || key === 'arrowleft') {
        game.moveInvCursor(-1);
      } else if (key === 'arrowdown' || key === 's' || key === 'arrowright') {
        game.moveInvCursor(1);
      } else if (key === 'enter') {
        game.useSelected();
      } else {
        return;
      }
      ev.preventDefault();
      onUpdate();
      return;
    }

    if (game.state === 'gameover' || game.state === 'victory') {
      if (key === 'r') {
        onRestart();
        onUpdate();
        ev.preventDefault();
      }
      return;
    }

    if (key === 'i') {
      game.openInventory();
      ev.preventDefault();
      onUpdate();
      return;
    }

    if (key in DIRS) {
      ev.preventDefault();
      held.add(key);
      const [dx, dy] = heldVector();
      game.move(dx, dy);
      onUpdate();
    }
  });

  target.addEventListener('keyup', (ev) => {
    held.delete(ev.key.toLowerCase());
  });

  // Losing focus must not leave stale held keys behind.
  window.addEventListener('blur', () => held.clear());
}
