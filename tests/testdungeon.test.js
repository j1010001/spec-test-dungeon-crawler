// FR-039 / US5: the seed-99999 deterministic test dungeon — every constraint.
import { describe, it, expect } from 'vitest';
import { Game } from '../src/game.js';
import { Rng } from '../src/rng.js';
import { generateFloor, tileInRoom, TEST_LAYOUT } from '../src/dungeon.js';
import { GRID_W, GRID_H, TILE, chebyshev, VIS } from '../src/constants.js';

const SEED = 99999;

function genTestFloor() {
  return generateFloor(new Rng(SEED), 1, SEED);
}

function walkableSet(f) {
  const s = new Set();
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (f.tiles[y][x] !== TILE.WALL) s.add(`${x},${y}`);
    }
  }
  return s;
}

function rectCells(r) {
  const cells = [];
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) cells.push(`${x},${y}`);
  return cells;
}

describe('seed-99999 floor 1 geometry (FR-039, US5-AS1)', () => {
  const f = genTestFloor();

  it('consists of exactly four rooms in a hub around the central start room', () => {
    expect(f.rooms.length).toBe(4);
    const [A, B, C, D] = f.rooms;
    // A central; B right of A; C below A; D above A
    expect(B.x).toBeGreaterThan(A.x + A.w);
    expect(C.y).toBeGreaterThan(A.y + A.h);
    expect(D.y + D.h).toBeLessThan(A.y + 1);
  });

  it('meets the minimum room sizes (A/D ≥ 5×5, B/C ≥ 7×7)', () => {
    const [A, B, C, D] = f.rooms;
    expect(A.w).toBeGreaterThanOrEqual(5);
    expect(A.h).toBeGreaterThanOrEqual(5);
    expect(B.w).toBeGreaterThanOrEqual(7);
    expect(B.h).toBeGreaterThanOrEqual(7);
    expect(C.w).toBeGreaterThanOrEqual(7);
    expect(C.h).toBeGreaterThanOrEqual(7);
    expect(D.w).toBeGreaterThanOrEqual(5);
    expect(D.h).toBeGreaterThanOrEqual(5);
  });

  it('has exactly three corridors, each exactly 8 tiles long and 3 tiles wide', () => {
    const { corridorRight, corridorDown, corridorUp } = TEST_LAYOUT;
    expect(corridorRight.w).toBe(8);
    expect(corridorRight.h).toBe(3);
    expect(corridorDown.h).toBe(8);
    expect(corridorDown.w).toBe(3);
    expect(corridorUp.h).toBe(8);
    expect(corridorUp.w).toBe(3);
    // and the walkable area is EXACTLY rooms + corridors — no extra rooms,
    // corridors or branches anywhere on the floor (US5-AS1)
    const expected = new Set();
    for (const r of f.rooms) for (const c of rectCells(r)) expected.add(c);
    for (const c of [corridorRight, corridorDown, corridorUp]) {
      for (const cell of rectCells(c)) expected.add(cell);
    }
    expect(walkableSet(f)).toEqual(expected);
  });

  it('corridors leave Room A rightward, downward and upward and connect directly (no room-through-room paths)', () => {
    const [A, B, C, D] = f.rooms;
    const { corridorRight, corridorDown, corridorUp } = TEST_LAYOUT;
    // right corridor spans the gap A->B
    expect(corridorRight.x).toBe(A.x + A.w);
    expect(corridorRight.x + corridorRight.w).toBe(B.x);
    // down corridor spans the gap A->C
    expect(corridorDown.y).toBe(A.y + A.h);
    expect(corridorDown.y + corridorDown.h).toBe(C.y);
    // up corridor spans the gap D->A
    expect(corridorUp.y).toBe(D.y + D.h);
    expect(corridorUp.y + corridorUp.h).toBe(A.y);
  });

  it('the player spawns at the center of Room A', () => {
    const A = f.rooms[0];
    expect(f.startRoomIndex).toBe(0);
    expect(f.playerStart).toEqual({ x: A.x + (A.w - 1) / 2, y: A.y + (A.h - 1) / 2 });
  });

  it('is fully deterministic — two generations are identical (FR-039)', () => {
    const a = genTestFloor();
    const b = genTestFloor();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('only floor 1 uses the test layout; other seeds are unaffected', () => {
    const other = generateFloor(new Rng(12345), 1, 12345);
    expect(JSON.stringify(other.rooms)).not.toBe(JSON.stringify(f.rooms));
    const floor2 = generateFloor(new Rng(SEED), 2, SEED);
    expect(JSON.stringify(floor2.rooms)).not.toBe(JSON.stringify(f.rooms));
  });
});

describe('seed-99999 room contents (FR-039, US5-AS3/5/7/9)', () => {
  const f = genTestFloor();
  const [A, B, C, D] = f.rooms;

  function enemiesIn(r) {
    return f.enemies.filter((e) => tileInRoom(r, e.x, e.y));
  }
  function itemsIn(r) {
    return f.items.filter((it) => tileInRoom(r, it.x, it.y));
  }
  function stairsIn(r) {
    return tileInRoom(r, f.stairsPos.x, f.stairsPos.y);
  }

  it('Room A: no enemies, no items, no stairs (safe hub)', () => {
    expect(enemiesIn(A).length).toBe(0);
    expect(itemsIn(A).length).toBe(0);
    expect(stairsIn(A)).toBe(false);
  });

  it('Room B: exactly one Goblin and exactly eleven items, no stairs', () => {
    const enemies = enemiesIn(B);
    expect(enemies.length).toBe(1);
    expect(enemies[0].type).toBe('Goblin');
    expect(enemies[0].glyph).toBe('g');
    // FR-039 balance: Goblin HP 15, killable in 4 player turns
    expect(enemies[0].hp).toBe(15);
    expect(enemies[0].defense).toBe(1);
    const items = itemsIn(B);
    expect(items.length).toBe(11);
    const kinds = new Set(items.map((i) => i.kind));
    expect(kinds).toEqual(new Set(['potion', 'weapon', 'armor'])); // ≥1 of each
    // each item on its own floor tile (FR-025)
    const tiles = new Set(items.map((i) => `${i.x},${i.y}`));
    expect(tiles.size).toBe(11);
    for (const it of items) expect(f.tiles[it.y][it.x]).toBe(TILE.FLOOR);
    // no item under the goblin
    expect(items.some((i) => i.x === enemies[0].x && i.y === enemies[0].y)).toBe(false);
    expect(stairsIn(B)).toBe(false);
  });

  it('Room C: exactly three Goblins, no items, no stairs', () => {
    const enemies = enemiesIn(C);
    expect(enemies.length).toBe(3);
    for (const e of enemies) expect(e.type).toBe('Goblin');
    expect(itemsIn(C).length).toBe(0);
    expect(stairsIn(C)).toBe(false);
  });

  it('Room D: exactly one staircase, no enemies, no items', () => {
    expect(stairsIn(D)).toBe(true);
    expect(enemiesIn(D).length).toBe(0);
    expect(itemsIn(D).length).toBe(0);
    let stairsCount = 0;
    for (const row of f.tiles) for (const t of row) if (t === TILE.STAIRS) stairsCount++;
    expect(stairsCount).toBe(1);
  });

  it('no entity is misplaced outside its designated room (US5-AS9)', () => {
    expect(f.enemies.length).toBe(4); // 1 (B) + 3 (C), nowhere else
    expect(f.items.length).toBe(11); // all in B
    for (const e of f.enemies) {
      expect(tileInRoom(B, e.x, e.y) || tileInRoom(C, e.x, e.y)).toBe(true);
    }
    for (const it of f.items) expect(tileInRoom(B, it.x, it.y)).toBe(true);
  });

  it('all room enemies sit within sight radius of the room entrance (FR-039/R103)', () => {
    // entrances: first room tile on the corridor axis
    const entranceB = { x: B.x, y: 40 };
    const entranceC = { x: 40, y: C.y };
    for (const e of enemiesIn(B)) {
      expect(chebyshev(e.x, e.y, entranceB.x, entranceB.y)).toBeLessThanOrEqual(5);
    }
    for (const e of enemiesIn(C)) {
      expect(chebyshev(e.x, e.y, entranceC.x, entranceC.y)).toBeLessThanOrEqual(5);
    }
  });

  it('the staircase sits within 3 tiles of the Room D entrance (FR-039)', () => {
    const entranceD = { x: 40, y: D.y + D.h - 1 }; // first Room D tile walking up
    expect(chebyshev(f.stairsPos.x, f.stairsPos.y, entranceD.x, entranceD.y)).toBeLessThanOrEqual(3);
  });
});

describe('seed-99999 walk distances (US5-AS2/4/6, independent test)', () => {
  it('walking right enters Room B within 20 keypresses', () => {
    const g = new Game({ explicitSeed: SEED });
    const B = g.floorData.rooms[1];
    let presses = 0;
    while (!tileInRoom(B, g.player.x, g.player.y) && presses < 20) {
      g.step(1, 0);
      presses++;
    }
    expect(tileInRoom(B, g.player.x, g.player.y)).toBe(true);
    expect(presses).toBeLessThanOrEqual(20);
  });

  it('walking down enters Room C within 20 keypresses', () => {
    const g = new Game({ explicitSeed: SEED });
    const C = g.floorData.rooms[2];
    let presses = 0;
    while (!tileInRoom(C, g.player.x, g.player.y) && presses < 20) {
      g.step(0, 1);
      presses++;
    }
    expect(tileInRoom(C, g.player.x, g.player.y)).toBe(true);
  });

  it('walking up enters Room D within 20 keypresses', () => {
    const g = new Game({ explicitSeed: SEED });
    const D = g.floorData.rooms[3];
    let presses = 0;
    while (!tileInRoom(D, g.player.x, g.player.y) && presses < 20) {
      g.step(0, -1);
      presses++;
    }
    expect(tileInRoom(D, g.player.x, g.player.y)).toBe(true);
  });

  it('all four rooms are reachable within 30 steps of spawn (US5 independent test)', () => {
    // straight-line distances from (40,40): B 12 right, C 12 down, D 12 up
    const f = genTestFloor();
    const [, B, C, D] = f.rooms;
    expect(B.x - f.playerStart.x).toBeLessThanOrEqual(30);
    expect(C.y - f.playerStart.y).toBeLessThanOrEqual(30);
    expect(f.playerStart.y - (D.y + D.h - 1)).toBeLessThanOrEqual(30);
  });

  it('stepping on the Room D staircase generates a procedural floor 2 (US5-AS8)', () => {
    const g = new Game({ explicitSeed: SEED });
    for (let i = 0; i < 14; i++) g.step(0, -1);
    expect(g.player.floor).toBe(2);
    expect(JSON.stringify(g.floorData.rooms)).not.toBe(
      JSON.stringify([TEST_LAYOUT.roomA, TEST_LAYOUT.roomB, TEST_LAYOUT.roomC, TEST_LAYOUT.roomD]),
    );
  });

  it('entering Room B makes the goblin and items visible (US5-AS3 visibility)', () => {
    const g = new Game({ explicitSeed: SEED });
    for (let i = 0; i < 12; i++) g.step(1, 0); // enter Room B at (52,40)
    const goblin = g.floorData.enemies.find((e) => e.roomIndex === 1);
    expect(g.visibility(goblin.x, goblin.y)).toBe(VIS.LIT); // within sight radius
    const visibleItems = g.floorData.items.filter((it) => g.visibility(it.x, it.y) === VIS.LIT);
    expect(visibleItems.length).toBeGreaterThan(0);
  });
});
