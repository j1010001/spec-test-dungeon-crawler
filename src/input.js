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

// FR-027/FR-004: humans pressing two keys "simultaneously" skew by 10–50ms, so
// simultaneity cannot be detected with a zero-width window (the round-1
// per-frame coalescer resolved real diagonal input as two turns). The first
// direction press therefore opens a fixed coalescing window before its turn
// resolves.
export const DIAGONAL_COALESCE_MS = 30;

// Movement axis of a direction key: 'x' (a/d/left/right) or 'y' (w/s/up/down).
function axisOf(key) {
  const dir = KEY_DIRS[key];
  return dir && dir[0] !== 0 ? 'x' : 'y';
}

// Turn coalescer (FR-027): the FIRST direction keydown arms a
// DIAGONAL_COALESCE_MS window instead of resolving immediately.
// - A cross-axis second keydown inside the window cancels the timer and
//   resolves ONE combined diagonal turn at once (latency = the inter-key skew;
//   enemies respond exactly once).
// - A same-axis second keydown (incl. the same key's OS auto-repeat) replaces
//   the pending key — last-keypress-wins — keeping the window; it never
//   bypasses the window into a second move.
// - The timer expiring resolves the single cardinal move (worst-case added
//   latency = the window, only for a lone press-and-hold's first move).
// - keyup of the pending key resolves it synchronously (a quick tap resolves
//   at release — no lost inputs, no full-window wait).
// - An OS auto-repeat with NO pending turn is held-key continuation: it
//   resolves immediately, one move per repeat, diagonal via the held set.
//
// `timers` provides {set(cb, ms), clear(id)} (win.setTimeout/clearTimeout in
// production, fakes in unit tests); `resolveTurn(key)` executes the turn —
// cross-axis combination with the held set happens there via resolveMove.
export function createTurnCoalescer(timers, resolveTurn) {
  let pendingKey = null;
  let timerId = null;

  function clearTimer() {
    if (timerId !== null) {
      timers.clear(timerId);
      timerId = null;
    }
  }

  // Resolves `key` NOW and closes the window.
  function resolve(key) {
    clearTimer();
    pendingKey = null;
    resolveTurn(key);
  }

  return {
    press(key, isRepeat) {
      if (pendingKey !== null) {
        if (axisOf(key) !== axisOf(pendingKey)) {
          // Cross-axis: forms a diagonal with the pending key — resolve the
          // combined turn immediately (the held set supplies the partner).
          resolve(key);
        } else {
          // Same-axis (w→s, or a repeat of the pending key itself):
          // last-keypress-wins, window kept — exactly one turn will resolve.
          pendingKey = key;
        }
        return;
      }
      if (isRepeat) {
        // Held-key continuation after the first resolution: one move per
        // repeat, no added window (the held set already covers diagonals).
        resolveTurn(key);
        return;
      }
      // First press of a window: arm the timer, do NOT resolve yet.
      pendingKey = key;
      timerId = timers.set(() => {
        timerId = null;
        const k = pendingKey;
        pendingKey = null;
        if (k !== null) resolveTurn(k); // lone press: single cardinal move
      }, DIAGONAL_COALESCE_MS);
    },
    // keyup path: a released pending key resolves synchronously, BEFORE it
    // leaves the held set, so a fast tap combines exactly as physically held.
    release(key) {
      if (pendingKey !== null && key === pendingKey) resolve(key);
    },
    // Drops any pending turn (restart, focus loss).
    cancel() {
      clearTimer();
      pendingKey = null;
    },
  };
}
