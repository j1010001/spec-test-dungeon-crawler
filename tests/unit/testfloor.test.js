import { describe, it, expect } from 'vitest';
import { GRID_W, GRID_H, TILE_FLOOR, TILE_STAIRS, TEST_SEED } from '../../src/constants.js';
import { createRng } from '../../src/rng.js';
import { generateFloor, tileIndex, roomContains, roomAt, chebyshev } from '../../src/dungeon.js';

function genTest() {
  return generateFloor(1, TEST_SEED, createRng(TEST_SEED));
}

function enemiesIn(d, room) {
  return d.enemies.filter((e) => roomContains(room, e.x, e.y));
}
function itemsIn(d, room) {
  return d.items.filter((it) => roomContains(room, it.x, it.y));
}
function stairsIn(d, room) {
  let n = 0;
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      if (d.tiles[tileIndex(x, y)] === TILE_STAIRS) n++;
    }
  }
  return n;
}

// Identify the hub rooms by direction relative to the spawn room.
function hubRooms(d) {
  const A = d.rooms[d.spawnRoom];
  const others = d.rooms.filter((_, i) => i !== d.spawnRoom);
  const B = others.find((r) => r.x > A.x + A.w); // right
  const C = others.find((r) => r.y > A.y + A.h); // down
  const D = others.find((r) => r.y + r.h < A.y); // up
  return { A, B, C, D };
}

describe('seed 99999 deterministic test dungeon — floor 1 (FR-039, US5)', () => {
  const d = genTest();
  const { A, B, C, D } = hubRooms(d);

  it('consists of exactly four rooms in a hub pattern (US5-AS1)', () => {
    expect(d.rooms.length).toBe(4);
    expect(A).toBeTruthy();
    expect(B).toBeTruthy();
    expect(C).toBeTruthy();
    expect(D).toBeTruthy();
    expect(d.isTestLayout).toBe(true);
  });

  it('meets minimum room sizes: A>=5x5, B>=7x7, C>=7x7, D>=5x5', () => {
    expect(A.w).toBeGreaterThanOrEqual(5);
    expect(A.h).toBeGreaterThanOrEqual(5);
    expect(B.w).toBeGreaterThanOrEqual(7);
    expect(B.h).toBeGreaterThanOrEqual(7);
    expect(C.w).toBeGreaterThanOrEqual(7);
    expect(C.h).toBeGreaterThanOrEqual(7);
    expect(D.w).toBeGreaterThanOrEqual(5);
    expect(D.h).toBeGreaterThanOrEqual(5);
  });

  it('player spawns at the center of Room A', () => {
    expect(d.spawn.x).toBe(A.x + Math.floor(A.w / 2));
    expect(d.spawn.y).toBe(A.y + Math.floor(A.h / 2));
  });

  it('has exactly three corridors, each exactly 8 tiles long and 3 tiles wide', () => {
    expect(d.corridors.length).toBe(3);
    for (const c of d.corridors) {
      const len = Math.max(c.w, c.h);
      const wid = Math.min(c.w, c.h);
      expect(len).toBe(8);
      expect(wid).toBe(3);
      // carved as floor
      for (let y = c.y; y < c.y + c.h; y++) {
        for (let x = c.x; x < c.x + c.w; x++) {
          expect(d.tiles[tileIndex(x, y)]).toBe(TILE_FLOOR);
        }
      }
    }
  });

  it('corridors extend right, down and up from Room A (hub, independently accessible)', () => {
    const right = d.corridors.find((c) => c.x === A.x + A.w && c.w === 8);
    const down = d.corridors.find((c) => c.y === A.y + A.h && c.h === 8);
    const up = d.corridors.find((c) => c.y + c.h === A.y && c.h === 8);
    expect(right).toBeTruthy();
    expect(down).toBeTruthy();
    expect(up).toBeTruthy();
    // each corridor lands exactly on its room
    expect(right.x + right.w).toBe(B.x);
    expect(down.y + down.h).toBe(C.y);
    expect(up.y).toBe(D.y + D.h);
  });

  it('Room A: no enemies, no items, no stairs (safe spawn, US5-AS9)', () => {
    expect(enemiesIn(d, A)).toHaveLength(0);
    expect(itemsIn(d, A)).toHaveLength(0);
    expect(stairsIn(d, A)).toBe(0);
  });

  it('Room B: exactly one Goblin and exactly eleven items, no stairs (US5-AS3)', () => {
    const es = enemiesIn(d, B);
    expect(es).toHaveLength(1);
    expect(es[0]).toMatchObject({ name: 'Goblin', glyph: 'g', hp: 15, atk: 5, def: 1 });
    const its = itemsIn(d, B);
    expect(its).toHaveLength(11);
    const kinds = its.map((i) => i.kind);
    expect(kinds.filter((k) => k === 'potion').length).toBeGreaterThanOrEqual(1);
    expect(kinds.filter((k) => k === 'weapon').length).toBeGreaterThanOrEqual(1);
    expect(kinds.filter((k) => k === 'armor').length).toBeGreaterThanOrEqual(1);
    // one item per tile (FR-025)
    const tilesUsed = new Set(its.map((i) => `${i.x},${i.y}`));
    expect(tilesUsed.size).toBe(11);
    // no item under the goblin
    expect(its.some((i) => i.x === es[0].x && i.y === es[0].y)).toBe(false);
    expect(stairsIn(d, B)).toBe(0);
  });

  it('Room C: exactly three Goblins, no items, no stairs (US5-AS5)', () => {
    const es = enemiesIn(d, C);
    expect(es).toHaveLength(3);
    for (const e of es) expect(e.glyph).toBe('g');
    expect(itemsIn(d, C)).toHaveLength(0);
    expect(stairsIn(d, C)).toBe(0);
  });

  it('Room D: exactly one staircase within 3 tiles of the entrance, nothing else (US5-AS7)', () => {
    expect(stairsIn(d, D)).toBe(1);
    expect(enemiesIn(d, D)).toHaveLength(0);
    expect(itemsIn(d, D)).toHaveLength(0);
    // entrance = corridor mouth on Room D's bottom edge (corridor extends up from A)
    const up = d.corridors.find((c) => c.y + c.h === A.y);
    const entrance = { x: up.x + 1, y: D.y + D.h - 1 };
    expect(chebyshev(d.stairs.x, d.stairs.y, entrance.x, entrance.y)).toBeLessThanOrEqual(3);
  });

  it('floor totals: exactly 4 enemies, 11 items, 1 staircase — nothing extra (US5-AS9)', () => {
    expect(d.enemies.length).toBe(4);
    expect(d.items.length).toBe(11);
    let stairsCount = 0;
    for (let i = 0; i < d.tiles.length; i++) if (d.tiles[i] === TILE_STAIRS) stairsCount++;
    expect(stairsCount).toBe(1);
  });

  it('every walkable tile belongs to one of the 4 rooms or 3 corridors (no extra geometry)', () => {
    const regions = [...d.rooms, ...d.corridors];
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const t = d.tiles[tileIndex(x, y)];
        if (t === TILE_FLOOR || t === TILE_STAIRS) {
          expect(regions.some((r) => roomContains(r, x, y))).toBe(true);
        }
      }
    }
  });

  it('all enemies sit within sight radius (5, Chebyshev) of their room entrance (FR-039/R103)', () => {
    const right = d.corridors.find((c) => c.x === A.x + A.w);
    const down = d.corridors.find((c) => c.y === A.y + A.h);
    const entryB = { x: B.x, y: right.y + 1 };
    const entryC = { x: down.x + 1, y: C.y };
    for (const e of enemiesIn(d, B)) expect(chebyshev(e.x, e.y, entryB.x, entryB.y)).toBeLessThanOrEqual(5);
    for (const e of enemiesIn(d, C)) expect(chebyshev(e.x, e.y, entryC.x, entryC.y)).toBeLessThanOrEqual(5);
  });

  it('each room is reachable from spawn walking a straight line within 20 steps (US5-AS2/4/6)', () => {
    // right toward B
    let steps = 0;
    let x = d.spawn.x;
    while (roomAt(d.rooms, x, d.spawn.y) !== d.rooms.indexOf(B) && steps <= 20) {
      x++;
      steps++;
      expect(d.tiles[tileIndex(x, d.spawn.y)]).toBe(TILE_FLOOR);
    }
    expect(steps).toBeLessThanOrEqual(20);
    // down toward C
    steps = 0;
    let y = d.spawn.y;
    while (roomAt(d.rooms, d.spawn.x, y) !== d.rooms.indexOf(C) && steps <= 20) {
      y++;
      steps++;
      expect(d.tiles[tileIndex(d.spawn.x, y)]).toBe(TILE_FLOOR);
    }
    expect(steps).toBeLessThanOrEqual(20);
    // up toward D
    steps = 0;
    y = d.spawn.y;
    while (roomAt(d.rooms, d.spawn.x, y) !== d.rooms.indexOf(D) && steps <= 20) {
      y--;
      steps++;
      const t = d.tiles[tileIndex(d.spawn.x, y)];
      expect(t === TILE_FLOOR || t === TILE_STAIRS).toBe(true);
    }
    expect(steps).toBeLessThanOrEqual(20);
  });

  it('the layout is byte-for-byte deterministic across generations', () => {
    const a = genTest();
    const b = genTest();
    expect(Array.from(a.tiles)).toEqual(Array.from(b.tiles));
    expect(JSON.parse(JSON.stringify(a.enemies))).toEqual(JSON.parse(JSON.stringify(b.enemies)));
    expect(JSON.parse(JSON.stringify(a.items))).toEqual(JSON.parse(JSON.stringify(b.items)));
  });

  it('floors 2+ with seed 99999 use normal procedural generation (US5-AS8)', () => {
    const f2 = generateFloor(2, TEST_SEED, createRng(TEST_SEED));
    expect(f2.isTestLayout).not.toBe(true);
    // procedural determinism still holds
    const f2b = generateFloor(2, TEST_SEED, createRng(TEST_SEED));
    expect(Array.from(f2.tiles)).toEqual(Array.from(f2b.tiles));
  });

  it('other seeds on floor 1 do NOT produce the test layout', () => {
    const other = generateFloor(1, 12345, createRng(12345));
    expect(other.isTestLayout).not.toBe(true);
  });
});
