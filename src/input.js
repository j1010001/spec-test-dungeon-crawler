// Keyboard input mapping (FR-004, FR-027).
const KEY_DIRS = {
  w: [0, -1],
  a: [-1, 0],
  s: [0, 1],
  d: [1, 0],
  arrowup: [0, -1],
  arrowleft: [-1, 0],
  arrowdown: [0, 1],
  arrowright: [1, 0],
};

export function normalizeKey(key) {
  return String(key).toLowerCase();
}

export function isDirectionKey(key) {
  return Object.prototype.hasOwnProperty.call(KEY_DIRS, key);
}

// Resolves the movement vector for a keypress. `held` is the set of direction
// keys physically held at that moment: a held key on the OTHER axis combines
// into a single diagonal move (simultaneous two-key diagonal, FR-027); a held
// key on the SAME axis is overridden by the newest press (last-keypress-wins).
export function resolveMove(key, held) {
  const dir = KEY_DIRS[key];
  if (!dir) return null;
  let [dx, dy] = dir;
  for (const h of held) {
    if (h === key) continue;
    const other = KEY_DIRS[h];
    if (!other) continue;
    if (other[0] !== 0 && dx === 0) dx = other[0];
    if (other[1] !== 0 && dy === 0) dy = other[1];
  }
  return [dx, dy];
}

// Turn coalescer (FR-027): direction keydowns landing within one scheduling
// window (one animation frame in the browser) merge into a SINGLE turn instead
// of resolving as sequential presses. The newest key of the window wins as the
// primary direction (last-keypress-wins); cross-axis combination with the held
// set happens later in resolveTurn via resolveMove, so a near-simultaneous
// two-key press produces exactly one diagonal move and ONE enemy response.
//
// `schedule(cb)` defers cb (requestAnimationFrame in production, a fake in
// unit tests); `resolveTurn(key)` executes the coalesced turn.
export function createTurnCoalescer(schedule, resolveTurn) {
  let pendingKey = null;
  let scheduled = false;

  // Resolves the pending turn NOW. Called by the scheduler, and synchronously
  // from keyup so a completed press never waits on the next frame (SC-005).
  function flush() {
    const key = pendingKey;
    pendingKey = null;
    if (key !== null) resolveTurn(key);
  }

  return {
    press(key) {
      pendingKey = key; // newest press of the window wins (FR-027)
      if (!scheduled) {
        scheduled = true;
        schedule(() => {
          scheduled = false;
          flush();
        });
      }
    },
    flush,
    // Drops any pending turn (restart, focus loss). A still-scheduled callback
    // then flushes a null key and does nothing.
    cancel() {
      pendingKey = null;
    },
  };
}
