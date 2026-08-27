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
