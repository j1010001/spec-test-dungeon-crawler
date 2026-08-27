import { describe, it, expect } from 'vitest';
import { SIGHT_RADIUS } from '../../src/constants.js';
import { movePlayer, visibilityAt } from '../../src/game.js';
import { makeGame, arenaSpec } from './helpers.js';

// Big open room so sight-radius geometry is unobstructed.
const bigRoom = () =>
  arenaSpec({
    rooms: [{ x: 5, y: 5, w: 40, h: 40 }],
    spawn: { x: 25, y: 25 },
    stairs: { x: 6, y: 6 },
  });

describe('fog of war, Chebyshev radius exactly 5 (FR-003, R100)', () => {
  it('sight radius constant is 5', () => {
    expect(SIGHT_RADIUS).toBe(5);
  });

  it('tiles within Chebyshev distance 5 are lit, including the diagonal corner', () => {
    const g = makeGame(bigRoom);
    expect(visibilityAt(g, 25, 25)).toBe('lit');
    expect(visibilityAt(g, 30, 25)).toBe('lit'); // dist 5 cardinal
    expect(visibilityAt(g, 30, 30)).toBe('lit'); // dist 5 diagonal (Chebyshev)
    expect(visibilityAt(g, 25, 20)).toBe('lit');
  });

  it('tiles at distance 6 that were never seen are hidden (US1-AS1)', () => {
    const g = makeGame(bigRoom);
    expect(visibilityAt(g, 31, 25)).toBe('hidden');
    expect(visibilityAt(g, 31, 31)).toBe('hidden');
    expect(visibilityAt(g, 25, 19)).toBe('hidden');
  });

  it('moving reveals new tiles at the far edge of the radius (US1-AS2)', () => {
    const g = makeGame(bigRoom);
    expect(visibilityAt(g, 31, 25)).toBe('hidden');
    movePlayer(g, 1, 0); // now at (26,25)
    expect(visibilityAt(g, 31, 25)).toBe('lit');
  });

  it('previously seen tiles out of radius become dimmed, not hidden (US1-AS3)', () => {
    const g = makeGame(bigRoom);
    // (20,25) is lit at spawn (dist 5). Walk right until it leaves the radius.
    expect(visibilityAt(g, 20, 25)).toBe('lit');
    movePlayer(g, 1, 0);
    expect(visibilityAt(g, 20, 25)).toBe('dimmed');
    // walk back: lit again
    movePlayer(g, -1, 0);
    expect(visibilityAt(g, 20, 25)).toBe('lit');
  });

  it('fog state fully resets on floor descent (FR-003, Session 2026-06-26)', () => {
    const g = makeGame((floor) =>
      floor === 1
        ? arenaSpec({
            rooms: [{ x: 5, y: 5, w: 40, h: 40 }],
            spawn: { x: 25, y: 25 },
            stairs: { x: 26, y: 25 },
          })
        : arenaSpec({
            rooms: [{ x: 5, y: 5, w: 40, h: 40 }],
            spawn: { x: 10, y: 10 },
            stairs: { x: 6, y: 6 },
          })
    );
    movePlayer(g, 1, 0); // step on stairs → floor 2
    expect(g.floor).toBe(2);
    // around the new spawn: lit; everything beyond: hidden (no carry-over)
    expect(visibilityAt(g, 10, 10)).toBe('lit');
    expect(visibilityAt(g, 25, 25)).toBe('hidden');
    expect(visibilityAt(g, 20, 20)).toBe('hidden');
  });
});
