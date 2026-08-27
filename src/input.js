// Keyboard input logic (FR-004, FR-027) — pure, DOM-free, testable.
// WASD and arrow keys, 8-directional. Sequential presses before a turn
// resolves: last one wins (earlier queued inputs are discarded). Keys held
// simultaneously combine into a single diagonal input.

export const KEY_DIRS = {
  w: [0, -1],
  a: [-1, 0],
  s: [0, 1],
  d: [1, 0],
  arrowup: [0, -1],
  arrowleft: [-1, 0],
  arrowdown: [0, 1],
  arrowright: [1, 0],
};

export function isMovementKey(key) {
  return Object.prototype.hasOwnProperty.call(KEY_DIRS, key.toLowerCase());
}

// Combine the direction vectors of all currently-held movement keys into a
// single move (each axis clamped to -1..1). W+A => up-left; opposing keys
// cancel on that axis.
export function combineHeld(heldKeys) {
  let dx = 0;
  let dy = 0;
  for (const key of heldKeys) {
    const dir = KEY_DIRS[key.toLowerCase()];
    if (!dir) continue;
    dx += dir[0];
    dy += dir[1];
  }
  return [Math.max(-1, Math.min(1, dx)), Math.max(-1, Math.min(1, dy))];
}

// Input queue with FR-027 semantics: holds at most ONE pending move — each
// new keypress replaces (discards) whatever was queued before it, so only
// the last keypress before the turn resolves is processed.
export class InputQueue {
  constructor() {
    this.held = new Set();
    this.pending = null;
  }

  // Register a keydown. Returns true if the key was a movement key.
  keyDown(key) {
    const k = key.toLowerCase();
    if (!isMovementKey(k)) return false;
    this.held.add(k);
    const [dx, dy] = combineHeld(this.held);
    if (dx === 0 && dy === 0) {
      // opposing keys cancelled — fall back to the key just pressed
      this.pending = KEY_DIRS[k].slice();
    } else {
      this.pending = [dx, dy];
    }
    return true;
  }

  keyUp(key) {
    this.held.delete(key.toLowerCase());
  }

  clearHeld() {
    this.held.clear();
  }

  // Take the single pending move (or null). Clears the queue.
  consume() {
    const p = this.pending;
    this.pending = null;
    return p;
  }
}
