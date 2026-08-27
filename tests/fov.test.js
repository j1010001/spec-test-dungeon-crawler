// Fog-of-war: R100 (Chebyshev radius 5, lit/dim/hidden), FR-003 (reset on
// descent), US1 acceptance scenarios at the logic level.
import { describe, it, expect } from 'vitest';
import { Game } from '../src/game.js';
import { VIS, TILE, GRID_W, GRID_H } from '../src/constants.js';
import { makeVisited, markVisible, visibilityAt } from '../src/fov.js';

function testGame() {
  return new Game({ explicitSeed: 99999 });
}

describe('fog-of-war core (R100)', () => {
  it('lights exactly the tiles within Chebyshev radius 5', () => {
    const visited = makeVisited();
    markVisible(visited, 40, 40);
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const d = Math.max(Math.abs(x - 40), Math.abs(y - 40));
        const vis = visibilityAt(visited, 40, 40, x, y);
        if (d <= 5) expect(vis).toBe(VIS.LIT);
        else expect(vis).not.toBe(VIS.LIT);
      }
    }
    // diagonal corner at Chebyshev distance exactly 5 is lit (8-dir metric)
    expect(visibilityAt(visited, 40, 40, 45, 45)).toBe(VIS.LIT);
    expect(visibilityAt(visited, 40, 40, 46, 45)).not.toBe(VIS.LIT);
  });

  it('previously visited tiles beyond the radius are dimmed, never-visited hidden', () => {
    const visited = makeVisited();
    markVisible(visited, 40, 40);
    // player moves far away
    const px = 60;
    const py = 60;
    expect(visibilityAt(visited, px, py, 40, 40)).toBe(VIS.DIM);
    expect(visibilityAt(visited, px, py, 10, 10)).toBe(VIS.HIDDEN);
  });
});

describe('fog-of-war in a run (US1, FR-002, FR-003)', () => {
  it('on load only the starting surroundings are visible; the rest is hidden (US1-AS1)', () => {
    const g = testGame();
    // start room tiles lit
    expect(g.visibility(40, 40)).toBe(VIS.LIT);
    expect(g.visibility(37, 37)).toBe(VIS.LIT);
    // Room B (starts at x=52) far right is hidden
    expect(g.visibility(55, 40)).toBe(VIS.HIDDEN);
    // Room C and D interiors hidden
    expect(g.visibility(40, 56)).toBe(VIS.HIDDEN);
    expect(g.visibility(40, 26)).toBe(VIS.HIDDEN);
  });

  it('moving reveals new tiles in that direction (US1-AS2, SC-001)', () => {
    const g = testGame();
    expect(g.visibility(47, 40)).toBe(VIS.HIDDEN); // corridor tile 7 to the right
    g.step(1, 0);
    g.step(1, 0);
    expect(g.visibility(47, 40)).toBe(VIS.LIT);
  });

  it('previously revealed tiles remain visible (dimmed) after leaving (US1-AS3)', () => {
    const g = testGame();
    // walk right into the corridor, then back left
    for (let i = 0; i < 6; i++) g.step(1, 0);
    expect(g.visibility(51, 40)).toBe(VIS.LIT);
    for (let i = 0; i < 6; i++) g.step(-1, 0);
    // corridor end still visited => dimmed, not hidden
    expect(g.visibility(51, 40)).toBe(VIS.DIM);
  });

  it('the whole floor is generated up front — fog only hides it (FR-002)', () => {
    const g = testGame();
    // Room B goblin exists in state even though its tile is hidden
    expect(g.floorData.enemies.some((e) => e.x === 55 && e.y === 40)).toBe(true);
    expect(g.visibility(55, 40)).toBe(VIS.HIDDEN);
  });

  it('fog state resets fully on descent — no visited memory carries over (FR-003)', () => {
    const g = testGame();
    // explore: go up to Room D stairs (14 moves up: y 40 -> 26)
    for (let i = 0; i < 14; i++) g.step(0, -1);
    expect(g.player.floor).toBe(2);
    // freshly generated floor: count non-hidden tiles == tiles within the
    // starting sight box only
    let nonHidden = 0;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (g.visibility(x, y) !== VIS.HIDDEN) nonHidden++;
      }
    }
    expect(nonHidden).toBeLessThanOrEqual(11 * 11);
  });
});
