import { describe, it, expect } from 'vitest';
import { LOG_MAX, CONTROL_HINT } from '../../src/constants.js';
import { pushLog, movePlayer } from '../../src/game.js';
import { makeGame, arenaSpec } from './helpers.js';

describe('HUD combat log rolling buffer (FR-018, Session 2026-06-25)', () => {
  it('retains at most the last 50 lines', () => {
    expect(LOG_MAX).toBe(50);
    const g = makeGame(() => arenaSpec({}));
    g.log.length = 0;
    for (let i = 1; i <= 60; i++) pushLog(g, `line ${i}`);
    expect(g.log).toHaveLength(50);
    expect(g.log[0]).toBe('line 11'); // oldest lines discarded
    expect(g.log[49]).toBe('line 60');
  });
});

describe('control hint (SC-006)', () => {
  it('is exactly the mandated string', () => {
    expect(CONTROL_HINT).toBe('WASD/Arrows to move · I for inventory · Reach > to descend');
  });

  it('shows on floor 1 and hides from floor 2 on (state drives the HUD)', () => {
    const g = makeGame(() =>
      arenaSpec({ spawn: { x: 12, y: 12 }, stairs: { x: 13, y: 12 } })
    );
    expect(g.floor).toBe(1); // renderer shows hint iff floor === 1
    movePlayer(g, 1, 0);
    expect(g.floor).toBe(2); // renderer hides hint
  });
});
