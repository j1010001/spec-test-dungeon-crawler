import { describe, it, expect } from 'vitest';
import {
  GRID_W,
  GRID_H,
  TILE_WALL,
  TILE_FLOOR,
  TILE_STAIRS,
} from '../../src/constants.js';
import { createRng } from '../../src/rng.js';
import { generateFloor, tileIndex, roomContains, roomAt, chebyshev, placeEnemies } from '../../src/dungeon.js';

function gen(floor, seed) {
  return generateFloor(floor, seed, createRng(seed));
}

function bfsReachable(tiles, start) {
  const seen = new Set([start.y * GRID_W + start.x]);
  const queue = [[start.x, start.y]];
  while (queue.length) {
    const [x, y] = queue.shift();
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
        const i = ny * GRID_W + nx;
        if (seen.has(i)) continue;
        if (tiles[i] === TILE_FLOOR || tiles[i] === TILE_STAIRS) {
          seen.add(i);
          queue.push([nx, ny]);
        }
      }
    }
  }
  return seen;
}

const SEEDS = [1, 7, 42, 20260615];

describe('procedural floor generation (FR-017, FR-020, FR-013, FR-024)', () => {
  it('generates an 80x80 tile grid', () => {
    const d = gen(1, 42);
    expect(d.tiles.length).toBe(GRID_W * GRID_H);
    expect(GRID_W).toBe(80);
    expect(GRID_H).toBe(80);
  });

  it('has at least two rectangular rooms, all inside the grid', () => {
    for (const seed of SEEDS) {
      const d = gen(1, seed);
      expect(d.rooms.length).toBeGreaterThanOrEqual(2);
      for (const r of d.rooms) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(GRID_W);
        expect(r.y + r.h).toBeLessThanOrEqual(GRID_H);
        expect(r.w).toBeGreaterThanOrEqual(4);
        expect(r.h).toBeGreaterThanOrEqual(4);
        // every room tile is walkable floor (or the staircase)
        for (let y = r.y; y < r.y + r.h; y++) {
          for (let x = r.x; x < r.x + r.w; x++) {
            expect([TILE_FLOOR, TILE_STAIRS]).toContain(d.tiles[tileIndex(x, y)]);
          }
        }
      }
    }
  });

  it('spawn room and staircase room are different rooms (FR-024)', () => {
    for (const seed of SEEDS) {
      const d = gen(1, seed);
      expect(d.spawnRoom).not.toBe(d.stairsRoom);
      expect(roomContains(d.rooms[d.spawnRoom], d.spawn.x, d.spawn.y)).toBe(true);
      expect(roomContains(d.rooms[d.stairsRoom], d.stairs.x, d.stairs.y)).toBe(true);
      expect(d.tiles[tileIndex(d.stairs.x, d.stairs.y)]).toBe(TILE_STAIRS);
    }
  });

  it('exactly one staircase tile exists per floor (FR-011)', () => {
    for (const seed of SEEDS) {
      const d = gen(1, seed);
      let count = 0;
      for (let i = 0; i < d.tiles.length; i++) if (d.tiles[i] === TILE_STAIRS) count++;
      expect(count).toBe(1);
    }
  });

  it('all rooms and the staircase are reachable from spawn (FR-013, SC-002)', () => {
    for (const seed of SEEDS) {
      for (const floor of [1, 2, 5, 9]) {
        const d = gen(floor, seed);
        const reach = bfsReachable(d.tiles, d.spawn);
        expect(reach.has(d.stairs.y * GRID_W + d.stairs.x)).toBe(true);
        for (const r of d.rooms) {
          for (let y = r.y; y < r.y + r.h; y++) {
            for (let x = r.x; x < r.x + r.w; x++) {
              expect(reach.has(y * GRID_W + x)).toBe(true);
            }
          }
        }
      }
    }
  });

  it('generates a floor in under 50ms (FR-028)', () => {
    // warm-up
    gen(1, 555);
    for (let floor = 1; floor <= 9; floor++) {
      const t0 = performance.now();
      gen(floor, 1000 + floor);
      const dt = performance.now() - t0;
      expect(dt).toBeLessThan(50);
    }
  });

  it('is fully deterministic for a given seed (FR-038)', () => {
    for (const seed of SEEDS) {
      const a = gen(3, seed);
      const b = gen(3, seed);
      expect(Array.from(a.tiles)).toEqual(Array.from(b.tiles));
      expect(a.spawn).toEqual(b.spawn);
      expect(a.stairs).toEqual(b.stairs);
      expect(JSON.parse(JSON.stringify(a.enemies))).toEqual(JSON.parse(JSON.stringify(b.enemies)));
      expect(JSON.parse(JSON.stringify(a.items))).toEqual(JSON.parse(JSON.stringify(b.items)));
    }
  });
});

describe('enemy placement (FR-006, FR-026)', () => {
  it('spawn room contains zero enemies (safe spawn)', () => {
    for (const seed of SEEDS) {
      const d = gen(1, seed);
      const spawnRoom = d.rooms[d.spawnRoom];
      for (const e of d.enemies) {
        expect(roomContains(spawnRoom, e.x, e.y)).toBe(false);
      }
    }
  });

  it('each non-starting room holds 1-3 enemies', () => {
    for (const seed of SEEDS) {
      const d = gen(1, seed);
      const byRoom = new Map();
      for (const e of d.enemies) byRoom.set(e.roomIndex, (byRoom.get(e.roomIndex) || 0) + 1);
      for (let i = 0; i < d.rooms.length; i++) {
        if (i === d.spawnRoom) continue;
        const n = byRoom.get(i) || 0;
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(3);
      }
    }
  });

  it('enemies stand on floor tiles, never on the staircase, one per tile', () => {
    for (const seed of SEEDS) {
      const d = gen(2, seed);
      const occupied = new Set();
      for (const e of d.enemies) {
        const key = `${e.x},${e.y}`;
        expect(occupied.has(key)).toBe(false);
        occupied.add(key);
        expect(d.tiles[tileIndex(e.x, e.y)]).toBe(TILE_FLOOR);
      }
    }
  });

  it('enemy type matches floor range in generated floors', () => {
    expect(gen(1, 42).enemies.every((e) => e.glyph === 'g')).toBe(true);
    expect(gen(4, 42).enemies.every((e) => e.glyph === 'o')).toBe(true);
    expect(gen(8, 42).enemies.every((e) => e.glyph === 'w')).toBe(true);
  });

  it('a room with no free tiles gets zero enemies without error (Edge Case)', () => {
    // Build a minimal data object whose single non-spawn room is fully
    // covered by items — no valid enemy placement tile remains.
    const tiles = new Uint8Array(GRID_W * GRID_H).fill(TILE_WALL);
    const roomA = { x: 5, y: 5, w: 5, h: 5 };
    const roomB = { x: 20, y: 5, w: 3, h: 3 };
    for (const r of [roomA, roomB]) {
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) tiles[tileIndex(x, y)] = TILE_FLOOR;
      }
    }
    const items = [];
    for (let y = roomB.y; y < roomB.y + roomB.h; y++) {
      for (let x = roomB.x; x < roomB.x + roomB.w; x++) {
        items.push({ kind: 'potion', name: 'Potion', glyph: '!', value: 15, x, y });
      }
    }
    const data = {
      tiles,
      rooms: [roomA, roomB],
      spawnRoom: 0,
      spawn: { x: 7, y: 7 },
      stairs: { x: 5, y: 5 },
      stairsRoom: 0,
      enemies: [],
      items,
    };
    expect(() => placeEnemies(data, 1, createRng(1))).not.toThrow();
    expect(data.enemies.length).toBe(0);
  });
});

describe('floor item placement (FR-025, Item entity: 1-3 items per floor)', () => {
  it('places 1-3 items per floor on unique walkable floor tiles, never the staircase', () => {
    for (const seed of SEEDS) {
      const d = gen(1, seed);
      expect(d.items.length).toBeGreaterThanOrEqual(1);
      expect(d.items.length).toBeLessThanOrEqual(3);
      const seen = new Set();
      for (const it of d.items) {
        const key = `${it.x},${it.y}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
        expect(d.tiles[tileIndex(it.x, it.y)]).toBe(TILE_FLOOR);
        expect(it.x === d.stairs.x && it.y === d.stairs.y).toBe(false);
      }
    }
  });

  it('items never start under an enemy or on the spawn tile', () => {
    for (const seed of SEEDS) {
      const d = gen(1, seed);
      for (const it of d.items) {
        expect(d.enemies.some((e) => e.x === it.x && e.y === it.y)).toBe(false);
        expect(it.x === d.spawn.x && it.y === d.spawn.y).toBe(false);
      }
    }
  });
});

describe('geometry helpers', () => {
  it('chebyshev distance is 8-directional (Session 2026-06-26)', () => {
    expect(chebyshev(0, 0, 3, 3)).toBe(3);
    expect(chebyshev(0, 0, 0, 5)).toBe(5);
    expect(chebyshev(2, 2, 1, 1)).toBe(1);
  });
  it('roomAt finds the containing room index', () => {
    const rooms = [{ x: 0, y: 0, w: 5, h: 5 }, { x: 10, y: 10, w: 3, h: 3 }];
    expect(roomAt(rooms, 2, 2)).toBe(0);
    expect(roomAt(rooms, 11, 12)).toBe(1);
    expect(roomAt(rooms, 7, 7)).toBe(-1);
  });
});
