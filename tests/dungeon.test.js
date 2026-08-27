// BSP floor generation: FR-013, FR-017, FR-020, FR-024, FR-025, FR-006,
// FR-028, item formulas, and full-run determinism.
import { describe, it, expect } from 'vitest';
import { Rng } from '../src/rng.js';
import { generateFloor, tileInRoom } from '../src/dungeon.js';
import { GRID_W, GRID_H, TILE, enemyStatsForFloor } from '../src/constants.js';

function gen(seed, floor) {
  return generateFloor(new Rng(seed), floor, seed);
}

function bfsReachable(tiles, start) {
  const seen = new Set([`${start.x},${start.y}`]);
  const queue = [start];
  while (queue.length) {
    const { x, y } = queue.shift();
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
        if (tiles[ny][nx] === TILE.WALL) continue;
        const k = `${nx},${ny}`;
        if (!seen.has(k)) {
          seen.add(k);
          queue.push({ x: nx, y: ny });
        }
      }
    }
  }
  return seen;
}

const SEEDS = [1, 7, 424242, 2026, 987654321];

describe('procedural floor generation (BSP)', () => {
  it('generates an 80×80 grid with everything inside it (FR-020)', () => {
    for (const seed of SEEDS) {
      const f = gen(seed, 1);
      expect(f.tiles.length).toBe(80);
      for (const row of f.tiles) expect(row.length).toBe(80);
      for (const room of f.rooms) {
        expect(room.x).toBeGreaterThanOrEqual(0);
        expect(room.y).toBeGreaterThanOrEqual(0);
        expect(room.x + room.w).toBeLessThanOrEqual(80);
        expect(room.y + room.h).toBeLessThanOrEqual(80);
      }
      for (const e of f.enemies) expect(f.tiles[e.y][e.x]).not.toBe(TILE.WALL);
      for (const it of f.items) expect(f.tiles[it.y][it.x]).toBe(TILE.FLOOR);
    }
  });

  it('rooms are rectangular regions of floor tiles (FR-017, Key Entities)', () => {
    for (const seed of SEEDS) {
      const f = gen(seed, 1);
      expect(f.rooms.length).toBeGreaterThanOrEqual(2);
      for (const room of f.rooms) {
        expect(room.w).toBeGreaterThanOrEqual(3);
        expect(room.h).toBeGreaterThanOrEqual(3);
        for (let y = room.y; y < room.y + room.h; y++) {
          for (let x = room.x; x < room.x + room.w; x++) {
            expect(f.tiles[y][x]).not.toBe(TILE.WALL);
          }
        }
      }
    }
  });

  it('every room and the staircase are reachable from the start (FR-013/FR-017/SC-002)', () => {
    for (const seed of SEEDS) {
      for (const floor of [1, 5, 9]) {
        const f = gen(seed, floor);
        const reach = bfsReachable(f.tiles, f.playerStart);
        for (const room of f.rooms) {
          for (let y = room.y; y < room.y + room.h; y++) {
            for (let x = room.x; x < room.x + room.w; x++) {
              expect(reach.has(`${x},${y}`)).toBe(true);
            }
          }
        }
        expect(reach.has(`${f.stairsPos.x},${f.stairsPos.y}`)).toBe(true);
      }
    }
  });

  it('staircase room differs from starting room; exactly one staircase (FR-024/FR-011)', () => {
    for (const seed of SEEDS) {
      const f = gen(seed, 1);
      expect(f.stairsRoomIndex).not.toBe(f.startRoomIndex);
      let stairs = 0;
      for (const row of f.tiles) for (const t of row) if (t === TILE.STAIRS) stairs++;
      expect(stairs).toBe(1);
      // player spawns at the center of the starting room
      const sr = f.rooms[f.startRoomIndex];
      expect(tileInRoom(sr, f.playerStart.x, f.playerStart.y)).toBe(true);
    }
  });

  it('places 1-3 items per floor, at most one per tile, never on stairs or spawn (FR-025)', () => {
    for (const seed of SEEDS) {
      const f = gen(seed, 3);
      expect(f.items.length).toBeGreaterThanOrEqual(1);
      expect(f.items.length).toBeLessThanOrEqual(3);
      const keys = new Set(f.items.map((it) => `${it.x},${it.y}`));
      expect(keys.size).toBe(f.items.length); // no tile stacking
      for (const it of f.items) {
        expect(f.tiles[it.y][it.x]).toBe(TILE.FLOOR); // not staircase
        expect(it.x === f.playerStart.x && it.y === f.playerStart.y).toBe(false);
      }
    }
  });

  it('starting room has zero enemies; other rooms have 1-3 (FR-006)', () => {
    for (const seed of SEEDS) {
      const f = gen(seed, 1);
      const perRoom = new Map();
      for (const e of f.enemies) perRoom.set(e.roomIndex, (perRoom.get(e.roomIndex) ?? 0) + 1);
      expect(perRoom.get(f.startRoomIndex)).toBeUndefined();
      for (const e of f.enemies) {
        expect(tileInRoom(f.rooms[e.roomIndex], e.x, e.y)).toBe(true);
      }
      for (const [, count] of perRoom) {
        expect(count).toBeGreaterThanOrEqual(1);
        expect(count).toBeLessThanOrEqual(3);
      }
      // staircase room is NOT excluded from enemy placement rules — it is
      // simply subject to the same 1-3 roll, so no assertion of zero there.
      const enemyKeys = new Set(f.enemies.map((e) => `${e.x},${e.y}`));
      expect(enemyKeys.size).toBe(f.enemies.length); // one enemy per tile
      for (const e of f.enemies) {
        // enemies never spawn on items or stairs
        expect(f.items.some((it) => it.x === e.x && it.y === e.y)).toBe(false);
        expect(f.tiles[e.y][e.x]).toBe(TILE.FLOOR);
      }
    }
  });

  it('enemy type follows floor range and stats follow the formulas (FR-006)', () => {
    const cases = [
      [1, 'Goblin', 'g'],
      [3, 'Goblin', 'g'],
      [4, 'Orc', 'o'],
      [6, 'Orc', 'o'],
      [7, 'Wraith', 'w'],
      [9, 'Wraith', 'w'],
    ];
    for (const [floor, type, glyph] of cases) {
      const f = gen(11, floor);
      expect(f.enemies.length).toBeGreaterThan(0);
      for (const e of f.enemies) {
        expect(e.type).toBe(type);
        expect(e.glyph).toBe(glyph);
        expect(e.hp).toBe(10 + floor * 5);
        expect(e.maxHp).toBe(10 + floor * 5);
        expect(e.attack).toBe(3 + floor * 2);
        expect(e.defense).toBe(floor);
      }
    }
  });

  it('deeper floors have strictly higher base stats (US4-AS3)', () => {
    for (let floor = 1; floor < 9; floor++) {
      const a = enemyStatsForFloor(floor);
      const b = enemyStatsForFloor(floor + 1);
      expect(b.hp).toBeGreaterThan(a.hp);
      expect(b.attack).toBeGreaterThan(a.attack);
      expect(b.defense).toBeGreaterThan(a.defense);
    }
  });

  it('item effect values follow the floor formulas (Key Entities)', () => {
    for (const seed of SEEDS) {
      for (const floor of [1, 4, 8]) {
        const f = gen(seed, floor);
        for (const it of f.items) {
          if (it.kind === 'potion') expect(it.value).toBe(10 + floor * 5);
          if (it.kind === 'weapon') {
            expect(it.value).toBeGreaterThanOrEqual(floor);
            expect(it.value).toBeLessThanOrEqual(floor + 2);
          }
          if (it.kind === 'armor') {
            expect(it.value).toBeGreaterThanOrEqual(floor);
            expect(it.value).toBeLessThanOrEqual(floor + 2);
          }
        }
      }
    }
  });

  it('same seed => identical floor; different seed => different floor', () => {
    const a = gen(555, 2);
    const b = gen(555, 2);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = gen(556, 2);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  it('generates an 80×80 floor within 50ms (FR-028)', () => {
    const t0 = performance.now();
    for (const seed of SEEDS) gen(seed, 5);
    const elapsed = (performance.now() - t0) / SEEDS.length;
    expect(elapsed).toBeLessThan(50);
  });
});
