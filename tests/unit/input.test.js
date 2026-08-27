import { describe, it, expect } from 'vitest';
import {
  normalizeKey,
  isDirectionKey,
  resolveMove,
  createTurnCoalescer,
  DIAGONAL_COALESCE_MS,
} from '../../src/input.js';

describe('keyboard mapping (FR-004: WASD and arrows, 8-directional)', () => {
  it('WASD map to the four cardinal directions', () => {
    expect(resolveMove('w', new Set())).toEqual([0, -1]);
    expect(resolveMove('a', new Set())).toEqual([-1, 0]);
    expect(resolveMove('s', new Set())).toEqual([0, 1]);
    expect(resolveMove('d', new Set())).toEqual([1, 0]);
  });

  it('arrow keys map identically', () => {
    expect(resolveMove('arrowup', new Set())).toEqual([0, -1]);
    expect(resolveMove('arrowleft', new Set())).toEqual([-1, 0]);
    expect(resolveMove('arrowdown', new Set())).toEqual([0, 1]);
    expect(resolveMove('arrowright', new Set())).toEqual([1, 0]);
  });

  it('normalizeKey lower-cases event keys', () => {
    expect(normalizeKey('ArrowUp')).toBe('arrowup');
    expect(normalizeKey('W')).toBe('w');
  });

  it('isDirectionKey identifies movement keys only', () => {
    expect(isDirectionKey('w')).toBe(true);
    expect(isDirectionKey('arrowdown')).toBe(true);
    expect(isDirectionKey('i')).toBe(false);
    expect(isDirectionKey('enter')).toBe(false);
  });
});

describe('simultaneous keys → diagonal; sequential → last wins (FR-027)', () => {
  it('a second key held on the other axis combines into a diagonal', () => {
    expect(resolveMove('a', new Set(['w']))).toEqual([-1, -1]); // W+A = up-left
    expect(resolveMove('w', new Set(['d']))).toEqual([1, -1]); // D held, W pressed = up-right
    expect(resolveMove('arrowdown', new Set(['arrowright']))).toEqual([1, 1]);
  });

  it('mixed WASD + arrow combos also form diagonals', () => {
    expect(resolveMove('s', new Set(['arrowleft']))).toEqual([-1, 1]);
  });

  it('same-axis conflict resolves to the newest keypress (last wins)', () => {
    expect(resolveMove('d', new Set(['a']))).toEqual([1, 0]);
    expect(resolveMove('a', new Set(['d']))).toEqual([-1, 0]);
    expect(resolveMove('w', new Set(['s']))).toEqual([0, -1]);
  });

  it('a lone keypress is a pure cardinal move', () => {
    expect(resolveMove('d', new Set(['d']))).toEqual([1, 0]); // its own key in the held set
  });

  it('non-direction keys resolve to null', () => {
    expect(resolveMove('i', new Set())).toBeNull();
    expect(resolveMove('escape', new Set(['w']))).toBeNull();
  });
});

// FR-027 regression (fix round 2): the FIRST direction press arms a
// DIAGONAL_COALESCE_MS window — a cross-axis second press inside it resolves
// ONE combined diagonal turn immediately at the skew (the round-1 per-frame
// coalescer resolved 4–25ms-skewed pairs as TWO turns); same-axis is
// last-keypress-wins; the timer expiring resolves the lone cardinal; keyup
// flushes synchronously. These replace the round-1 frame-based coalescer
// tests, which asserted the obsolete contract.
describe('turn coalescer: 30ms first-press window (FR-027)', () => {
  // Deterministic fake timer: advance(ms) fires due timers in order.
  function fakeTimers() {
    let now = 0;
    let nextId = 1;
    const armed = new Map(); // id -> { due, cb }
    return {
      set: (cb, ms) => {
        const id = nextId++;
        armed.set(id, { due: now + ms, cb });
        return id;
      },
      clear: (id) => armed.delete(id),
      advance(ms) {
        now += ms;
        for (const [id, t] of [...armed]) {
          if (t.due <= now) {
            armed.delete(id);
            t.cb();
          }
        }
      },
      armedCount: () => armed.size,
    };
  }

  function setup() {
    const t = fakeTimers();
    const turns = [];
    const c = createTurnCoalescer(t, (key) => turns.push(key));
    return { t, turns, c };
  }

  it('exposes a 30ms named window constant', () => {
    expect(DIAGONAL_COALESCE_MS).toBe(30);
  });

  it('arms the window on the first press: no turn resolves before it elapses', () => {
    const { t, turns, c } = setup();
    c.press('w', false);
    expect(turns).toEqual([]); // does NOT resolve yet
    expect(t.armedCount()).toBe(1);
    t.advance(DIAGONAL_COALESCE_MS - 1);
    expect(turns).toEqual([]); // still inside the window
  });

  it('timer expiry with no second key resolves the single cardinal move exactly once', () => {
    const { t, turns, c } = setup();
    c.press('w', false);
    t.advance(DIAGONAL_COALESCE_MS);
    expect(turns).toEqual(['w']);
    t.advance(500);
    expect(turns).toEqual(['w']); // never a second turn
  });

  it('a cross-axis second press inside the window resolves ONE combined turn immediately (latency = the skew)', () => {
    const { t, turns, c } = setup();
    c.press('w', false);
    t.advance(10); // realistic human skew
    c.press('a', false);
    expect(turns).toEqual(['a']); // resolved AT the second press, no added wait
    t.advance(500);
    expect(turns).toEqual(['a']); // timer was cancelled: no second move
    expect(t.armedCount()).toBe(0);
  });

  it('a same-axis second press replaces the pending key (last-keypress-wins), one turn total', () => {
    const { t, turns, c } = setup();
    c.press('w', false);
    t.advance(10);
    c.press('s', false); // opposite key, same axis
    expect(turns).toEqual([]); // no immediate resolution
    t.advance(DIAGONAL_COALESCE_MS);
    expect(turns).toEqual(['s']); // newest press wins, exactly once
  });

  it('presses skewed wider than the window resolve as two sequential turns', () => {
    const { t, turns, c } = setup();
    c.press('w', false);
    t.advance(60); // window expired at 30ms
    c.press('a', false);
    t.advance(60);
    expect(turns).toEqual(['w', 'a']);
  });

  it('keyup of the pending key resolves the turn synchronously (quick tap, no lost input)', () => {
    const { t, turns, c } = setup();
    c.press('d', false);
    c.release('d'); // released before the timer
    expect(turns).toEqual(['d']); // resolves NOW, at release
    t.advance(500);
    expect(turns).toEqual(['d']); // cancelled timer never double-fires
  });

  it('keyup of a NON-pending key does not flush the window', () => {
    const { t, turns, c } = setup();
    c.press('w', false);
    c.release('a'); // some other key released
    expect(turns).toEqual([]);
    t.advance(DIAGONAL_COALESCE_MS);
    expect(turns).toEqual(['w']); // window ran to expiry as normal
    c.release('w'); // keyup after resolution: nothing pending
    expect(turns).toEqual(['w']);
  });

  it('cancel() drops the pending turn and its timer (restart/blur)', () => {
    const { t, turns, c } = setup();
    c.press('w', false);
    c.cancel();
    expect(t.armedCount()).toBe(0);
    t.advance(500);
    expect(turns).toEqual([]);
    c.release('w'); // late keyup after cancel: still nothing
    expect(turns).toEqual([]);
  });

  it('OS auto-repeat inside the pending window does not bypass it or double-move', () => {
    const { t, turns, c } = setup();
    c.press('w', false);
    t.advance(10);
    c.press('w', true); // repeat of the pending key: same-axis last-wins
    expect(turns).toEqual([]);
    t.advance(DIAGONAL_COALESCE_MS);
    expect(turns).toEqual(['w']); // exactly one move
  });

  it('OS auto-repeat with no pending turn is held-key continuation: one move per repeat, immediately', () => {
    const { t, turns, c } = setup();
    c.press('d', false);
    t.advance(DIAGONAL_COALESCE_MS); // first move resolves at the window
    expect(turns).toEqual(['d']);
    c.press('d', true); // subsequent repeats resolve without a new window
    expect(turns).toEqual(['d', 'd']);
    c.press('d', true);
    expect(turns).toEqual(['d', 'd', 'd']);
    expect(t.armedCount()).toBe(0);
  });

  it('after a cross-axis resolution, repeats continue diagonally via the held set (one turn each)', () => {
    const { t, turns, c } = setup();
    c.press('w', false);
    t.advance(15);
    c.press('a', false); // diagonal resolved immediately
    expect(turns).toEqual(['a']);
    c.press('a', true); // held-pair continuation: repeats of the newest key
    c.press('a', true); // (resolveMove combines with held 'w' → diagonal)
    expect(turns).toEqual(['a', 'a', 'a']);
  });

  it('a fresh press after resolution re-arms a new window', () => {
    const { t, turns, c } = setup();
    c.press('w', false);
    t.advance(DIAGONAL_COALESCE_MS);
    c.press('s', false); // next window
    expect(turns).toEqual(['w']);
    t.advance(DIAGONAL_COALESCE_MS);
    expect(turns).toEqual(['w', 's']);
  });
});
