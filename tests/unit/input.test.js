import { describe, it, expect } from 'vitest';
import { normalizeKey, isDirectionKey, resolveMove, createTurnCoalescer } from '../../src/input.js';

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

// FR-027 regression: keydowns landing within one animation frame must resolve
// as ONE turn (the review measured a held W+A pair moving the player twice).
describe('turn coalescer: same-frame keydowns resolve exactly one turn (FR-027)', () => {
  // Fake requestAnimationFrame: collects callbacks; frame() runs one frame.
  function fakeScheduler() {
    const queue = [];
    return {
      schedule: (cb) => queue.push(cb),
      frame() {
        const cbs = queue.splice(0);
        for (const cb of cbs) cb();
      },
      pending: () => queue.length,
    };
  }

  function setup() {
    const s = fakeScheduler();
    const turns = [];
    const c = createTurnCoalescer(s.schedule, (key) => turns.push(key));
    return { s, turns, c };
  }

  it('two cross-axis presses in one frame yield a single turn for the newest key', () => {
    const { s, turns, c } = setup();
    c.press('w');
    c.press('a'); // same frame: merges, does NOT queue a second turn
    expect(turns).toEqual([]); // nothing resolves before the frame
    s.frame();
    expect(turns).toEqual(['a']); // newest press wins; held-set makes it diagonal
    s.frame();
    expect(turns).toEqual(['a']); // and never a second turn afterwards
  });

  it('presses in separate frames resolve as separate turns (sequential input)', () => {
    const { s, turns, c } = setup();
    c.press('w');
    s.frame();
    c.press('a');
    s.frame();
    expect(turns).toEqual(['w', 'a']);
  });

  it('a lone press resolves exactly once on the next frame', () => {
    const { s, turns, c } = setup();
    c.press('d');
    s.frame();
    s.frame();
    expect(turns).toEqual(['d']);
  });

  it('flush() resolves the pending turn synchronously (keyup path) and the frame callback then no-ops', () => {
    const { s, turns, c } = setup();
    c.press('d');
    c.flush(); // keyup before the frame: turn resolves NOW
    expect(turns).toEqual(['d']);
    s.frame(); // scheduled callback still fires...
    expect(turns).toEqual(['d']); // ...but finds no pending turn
  });

  it('cancel() drops the pending turn (restart/blur)', () => {
    const { s, turns, c } = setup();
    c.press('w');
    c.cancel();
    s.frame();
    expect(turns).toEqual([]);
  });

  it('schedules at most one callback per window, and re-arms after it fires', () => {
    const { s, turns, c } = setup();
    c.press('w');
    c.press('s');
    c.press('d');
    expect(s.pending()).toBe(1); // one frame callback despite three presses
    s.frame();
    expect(turns).toEqual(['d']);
    c.press('w'); // next window re-arms
    expect(s.pending()).toBe(1);
    s.frame();
    expect(turns).toEqual(['d', 'w']);
  });

  it('repeat presses of one held key resolve once per frame, not once per event', () => {
    const { s, turns, c } = setup();
    c.press('d');
    c.press('d'); // OS auto-repeat landing in the same frame
    s.frame();
    expect(turns).toEqual(['d']);
    c.press('d'); // next repeat, next frame
    s.frame();
    expect(turns).toEqual(['d', 'd']);
  });
});
