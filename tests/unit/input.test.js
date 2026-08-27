import { describe, it, expect } from 'vitest';
import { normalizeKey, isDirectionKey, resolveMove } from '../../src/input.js';

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
