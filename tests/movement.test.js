// Movement & input: FR-004 (8-directional, one tile per keypress), US1-AS4/
// AS5 (wall/boundary blocking), FR-027 (last-keypress-wins + simultaneous
// diagonal combination).
import { describe, it, expect } from 'vitest';
import { Game } from '../src/game.js';
import { InputQueue, combineHeld, isMovementKey, KEY_DIRS } from '../src/input.js';

function testGame() {
  return new Game({ explicitSeed: 99999 });
}

describe('player movement (FR-004, US1)', () => {
  it('moves exactly one tile per input in all 8 directions', () => {
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];
    for (const [dx, dy] of dirs) {
      const g = testGame();
      const { x, y } = g.player;
      g.step(dx, dy);
      expect(g.player.x).toBe(x + dx);
      expect(g.player.y).toBe(y + dy);
    }
  });

  it('blocks movement into walls with no position change (US1-AS4)', () => {
    const g = testGame();
    // Room A spans x 37..43; walk to the left wall then push into it
    g.step(-1, 0);
    g.step(-1, 0);
    g.step(-1, 0);
    expect(g.player.x).toBe(37);
    const hpBefore = g.player.hp;
    g.step(-1, 0); // wall at x=36
    expect(g.player.x).toBe(37);
    expect(g.player.y).toBe(40);
    expect(g.player.hp).toBe(hpBefore);
  });

  it('blocks movement outside the dungeon boundary', () => {
    const g = testGame();
    // brute-force many left moves — must never escape the 80×80 grid
    for (let i = 0; i < 100; i++) g.step(-1, 0);
    expect(g.player.x).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < 100; i++) g.step(0, -1);
    expect(g.player.y).toBeGreaterThanOrEqual(0);
  });

  it('diagonal movement moves one tile on both axes (FR-004)', () => {
    const g = testGame();
    const { x, y } = g.player;
    g.step(1, 1);
    expect(g.player.x).toBe(x + 1);
    expect(g.player.y).toBe(y + 1);
  });

  it('does nothing when the game is not in play mode', () => {
    const g = testGame();
    g.mode = 'gameover';
    const { x, y } = g.player;
    g.step(1, 0);
    expect(g.player.x).toBe(x);
    expect(g.player.y).toBe(y);
  });
});

describe('input queue (FR-027)', () => {
  it('recognizes WASD and arrow keys as movement keys', () => {
    for (const k of ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      expect(isMovementKey(k)).toBe(true);
    }
    expect(isMovementKey('x')).toBe(false);
    expect(isMovementKey('Enter')).toBe(false);
  });

  it('keeps only the LAST keypress when keys arrive sequentially before the turn resolves', () => {
    const q = new InputQueue();
    q.keyDown('w');
    q.keyUp('w');
    q.keyDown('d');
    q.keyUp('d');
    q.keyDown('s');
    q.keyUp('s');
    // only 's' (down) survives
    expect(q.consume()).toEqual(KEY_DIRS.s);
    expect(q.consume()).toBeNull(); // earlier presses were discarded
  });

  it('combines two simultaneously held keys into one diagonal move', () => {
    const q = new InputQueue();
    q.keyDown('w'); // held
    q.keyDown('a'); // held at the same time
    expect(q.consume()).toEqual([-1, -1]); // up-left, single combined input
  });

  it('supports arrow-key + WASD combinations and opposing-key cancellation', () => {
    expect(combineHeld(new Set(['arrowup', 'd']))).toEqual([1, -1]);
    // opposing keys cancel on the axis
    expect(combineHeld(new Set(['a', 'd']))).toEqual([0, 0]);
  });

  it('falls back to the latest key when held keys fully cancel', () => {
    const q = new InputQueue();
    q.keyDown('a');
    q.keyDown('d'); // cancels a — latest key wins
    expect(q.consume()).toEqual([1, 0]);
  });

  it('releases held keys on keyup', () => {
    const q = new InputQueue();
    q.keyDown('w');
    q.keyUp('w');
    q.keyDown('d');
    expect(q.consume()).toEqual([1, 0]); // w no longer held, no diagonal
  });
});
