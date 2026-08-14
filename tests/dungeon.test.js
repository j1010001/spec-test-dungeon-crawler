import { describe, it, expect } from 'vitest';
import { buildProceduralFloor, buildTestFloor, generateFloor, TILE } from '../src/dungeon.js';
import { GRID_SIZE } from '../src/entities.js';
import { createRng } from '../src/rng.js';

function reachableTiles(grid, start) {
  const seen = new Set([`${start.x},${start.y}`]);
  const queue = [start];
  while (queue.length) {
    const { x, y } = queue.pop();
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= GRID_SIZE || ny >= GRID_SIZE) continue;
        if (grid[ny][nx] === TILE.WALL) continue;
        const key = `${nx},${ny}`;
        if (!seen.has(key)) {
          seen.add(key);
          queue.push({ x: nx, y: ny });
        }
      }
    }
  }
  return seen;
}

describe('procedural generation (FR-013, FR-017, FR-020, FR-024, FR-025, FR-028)', () => {
  const seeds = [1, 2, 42, 12345, 987654321];

  it('produces an 80x80 grid with everything in bounds', () => {
    for (const seed of seeds) {
      const f = buildProceduralFloor(1, createRng(seed));
      expect(f.grid.length).toBe(80);
      f.grid.forEach((row) => expect(row.length).toBe(80));
      for (const r of f.rooms) {
        expect(r.x).toBeGreaterThanOrEqual(1);
        expect(r.y).toBeGreaterThanOrEqual(1);
        expect(r.x + r.w).toBeLessThanOrEqual(79);
        expect(r.y + r.h).toBeLessThanOrEqual(79);
      }
    }
  });

  it('every room and the stairs are reachable from spawn (SC-002)', () => {
    for (const seed of seeds) {
      const f = buildProceduralFloor(1, createRng(seed));
      const seen = reachableTiles(f.grid, f.spawn);
      expect(seen.has(`${f.stairs.x},${f.stairs.y}`)).toBe(true);
      for (const r of f.rooms) {
        for (let y = r.y; y < r.y + r.h; y++) {
          for (let x = r.x; x < r.x + r.w; x++) {
            expect(seen.has(`${x},${y}`)).toBe(true);
          }
        }
      }
    }
  });

  it('start room and stairs room differ; spawn is the start-room center', () => {
    for (const seed of seeds) {
      const f = buildProceduralFloor(1, createRng(seed));
      expect(f.startRoomIndex).not.toBe(f.stairsRoomIndex);
      const r = f.rooms[f.startRoomIndex];
      expect(f.spawn.x).toBe(r.x + Math.floor(r.w / 2));
      expect(f.spawn.y).toBe(r.y + Math.floor(r.h / 2));
    }
  });

  it('exactly one staircase tile per floor (FR-011)', () => {
    for (const seed of seeds) {
      const f = buildProceduralFloor(3, createRng(seed));
      let count = 0;
      f.grid.forEach((row) => row.forEach((t) => t === TILE.STAIRS && count++));
      expect(count).toBe(1);
    }
  });

  it('no enemies in the start room; 0-3 per other room; correct type per floor (FR-006)', () => {
    for (const seed of seeds) {
      for (const floor of [1, 5, 9]) {
        const f = buildProceduralFloor(floor, createRng(seed));
        const expected = floor <= 3 ? 'Goblin' : floor <= 6 ? 'Orc' : 'Wraith';
        for (const e of f.enemies) {
          expect(e.roomIndex).not.toBe(f.startRoomIndex);
          expect(e.type).toBe(expected);
        }
        const perRoom = new Map();
        f.enemies.forEach((e) => perRoom.set(e.roomIndex, (perRoom.get(e.roomIndex) || 0) + 1));
        for (const n of perRoom.values()) {
          expect(n).toBeGreaterThanOrEqual(1);
          expect(n).toBeLessThanOrEqual(3);
        }
      }
    }
  });

  it('places 1-3 items per floor, one per tile, never on stairs or spawn (FR-025)', () => {
    for (const seed of seeds) {
      const f = buildProceduralFloor(2, createRng(seed));
      expect(f.items.length).toBeGreaterThanOrEqual(1);
      expect(f.items.length).toBeLessThanOrEqual(3);
      const tiles = new Set();
      for (const it of f.items) {
        const key = `${it.x},${it.y}`;
        expect(tiles.has(key)).toBe(false);
        tiles.add(key);
        expect(f.grid[it.y][it.x]).toBe(TILE.FLOOR);
        expect(key).not.toBe(`${f.spawn.x},${f.spawn.y}`);
      }
    }
  });

  it('no two enemies share a tile; enemies never spawn on stairs or items', () => {
    for (const seed of seeds) {
      const f = buildProceduralFloor(4, createRng(seed));
      const tiles = new Set();
      for (const e of f.enemies) {
        const key = `${e.x},${e.y}`;
        expect(tiles.has(key)).toBe(false);
        tiles.add(key);
        expect(f.grid[e.y][e.x]).toBe(TILE.FLOOR);
        expect(f.items.some((it) => it.x === e.x && it.y === e.y)).toBe(false);
      }
    }
  });

  it('same seed reproduces the same floor exactly (FR-038)', () => {
    const a = buildProceduralFloor(1, createRng(777));
    const b = buildProceduralFloor(1, createRng(777));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('generates within 50ms (FR-028)', () => {
    const rng = createRng(1);
    const t0 = performance.now();
    buildProceduralFloor(1, rng);
    expect(performance.now() - t0).toBeLessThan(50);
  });
});

describe('test dungeon, seed 99999 floor 1 (FR-039, User Story 5)', () => {
  const f = buildTestFloor();

  it('is selected by generateFloor only for floor 1 with seed 99999', () => {
    const rng = createRng(99999);
    const t = generateFloor(1, rng, 99999);
    expect(t.rooms.length).toBe(4);
    const f2 = generateFloor(2, rng, 99999);
    expect(f2.rooms.length).toBeGreaterThan(4); // procedural on floor 2+ (US5-AS8)
    const other = generateFloor(1, createRng(123), 123);
    expect(other.rooms.length).toBeGreaterThan(4);
  });

  it('has exactly four rooms in a hub pattern around the start room', () => {
    expect(f.rooms.length).toBe(4);
    expect(f.startRoomIndex).toBe(0);
    const [A, B, C, D] = f.rooms;
    // minimum sizes
    expect(A.w).toBeGreaterThanOrEqual(5);
    expect(A.h).toBeGreaterThanOrEqual(5);
    expect(B.w).toBeGreaterThanOrEqual(7);
    expect(B.h).toBeGreaterThanOrEqual(7);
    expect(C.w).toBeGreaterThanOrEqual(7);
    expect(C.h).toBeGreaterThanOrEqual(7);
    expect(D.w).toBeGreaterThanOrEqual(5);
    expect(D.h).toBeGreaterThanOrEqual(5);
    // hub directions from A
    expect(B.x).toBeGreaterThan(A.x + A.w); // right
    expect(C.y).toBeGreaterThan(A.y + A.h); // down
    expect(D.y + D.h).toBeLessThan(A.y); // up
  });

  it('spawns the player at the center of Room A with no entities in Room A', () => {
    const A = f.rooms[0];
    expect(f.spawn).toEqual({ x: A.x + Math.floor(A.w / 2), y: A.y + Math.floor(A.h / 2) });
    const inA = (p) => p.x >= A.x && p.x < A.x + A.w && p.y >= A.y && p.y < A.y + A.h;
    expect(f.enemies.some(inA)).toBe(false);
    expect(f.items.some(inA)).toBe(false);
    expect(inA(f.stairs)).toBe(false);
  });

  it('corridors are exactly 8 tiles long and 3 tiles wide, one per branch room', () => {
    const [A, B, C, D] = f.rooms;
    // Right corridor: between A's right edge and B's left edge. Width is
    // measured within the vertical band of Rooms A/B (other rooms may
    // share grid columns further away).
    expect(B.x - (A.x + A.w)).toBe(8);
    for (let x = A.x + A.w; x < B.x; x++) {
      let width = 0;
      for (let y = A.y - 2; y < A.y + A.h + 2; y++) if (f.grid[y][x] !== TILE.WALL) width++;
      expect(width).toBe(3);
    }
    // Down corridor.
    expect(C.y - (A.y + A.h)).toBe(8);
    for (let y = A.y + A.h; y < C.y; y++) {
      let width = 0;
      for (let x = A.x - 2; x < A.x + A.w + 2; x++) if (f.grid[y][x] !== TILE.WALL) width++;
      expect(width).toBe(3);
    }
    // Up corridor.
    expect(A.y - (D.y + D.h)).toBe(8);
    for (let y = D.y + D.h; y < A.y; y++) {
      let width = 0;
      for (let x = A.x - 2; x < A.x + A.w + 2; x++) if (f.grid[y][x] !== TILE.WALL) width++;
      expect(width).toBe(3);
    }
  });

  it('rooms are independently accessible: no path between branch rooms except through A', () => {
    // Blocking Room A must disconnect B, C and D from each other.
    const grid = f.grid.map((row) => row.slice());
    const A = f.rooms[0];
    for (let y = A.y; y < A.y + A.h; y++)
      for (let x = A.x; x < A.x + A.w; x++) grid[y][x] = TILE.WALL;
    const B = f.rooms[1];
    const seen = reachableTiles(grid, { x: B.x + 1, y: B.y + 1 });
    const C = f.rooms[2];
    const D = f.rooms[3];
    expect(seen.has(`${C.x + 1},${C.y + 1}`)).toBe(false);
    expect(seen.has(`${D.x + 1},${D.y + 1}`)).toBe(false);
  });

  it('Room B: exactly 1 Goblin and 11 items with all three types, no stairs (US5-AS3)', () => {
    const B = f.rooms[1];
    const inB = (p) => p.x >= B.x && p.x < B.x + B.w && p.y >= B.y && p.y < B.y + B.h;
    const enemies = f.enemies.filter(inB);
    expect(enemies.length).toBe(1);
    expect(enemies[0].type).toBe('Goblin');
    const items = f.items.filter(inB);
    expect(items.length).toBe(11);
    const types = new Set(items.map((i) => i.type));
    expect(types).toEqual(new Set(['potion', 'weapon', 'armor']));
    expect(inB(f.stairs)).toBe(false);
    // one item per tile, none under the goblin
    const tiles = new Set(items.map((i) => `${i.x},${i.y}`));
    expect(tiles.size).toBe(11);
    expect(tiles.has(`${enemies[0].x},${enemies[0].y}`)).toBe(false);
  });

  it('Room C: exactly 3 Goblins, no items, no stairs (US5-AS5)', () => {
    const C = f.rooms[2];
    const inC = (p) => p.x >= C.x && p.x < C.x + C.w && p.y >= C.y && p.y < C.y + C.h;
    const enemies = f.enemies.filter(inC);
    expect(enemies.length).toBe(3);
    enemies.forEach((e) => expect(e.type).toBe('Goblin'));
    expect(f.items.filter(inC).length).toBe(0);
    expect(inC(f.stairs)).toBe(false);
  });

  it('Room D: only the staircase, within 3 tiles of the room entrance (US5-AS7)', () => {
    const D = f.rooms[3];
    const inD = (p) => p.x >= D.x && p.x < D.x + D.w && p.y >= D.y && p.y < D.y + D.h;
    expect(inD(f.stairs)).toBe(true);
    expect(f.enemies.filter(inD).length).toBe(0);
    expect(f.items.filter(inD).length).toBe(0);
    // Entrance: the room tile adjacent to the up corridor (corridor center x=40).
    const entrance = { x: 40, y: D.y + D.h - 1 };
    const dist = Math.max(Math.abs(f.stairs.x - entrance.x), Math.abs(f.stairs.y - entrance.y));
    expect(dist).toBeLessThanOrEqual(3);
  });

  it('no entities exist outside the four rooms; enemy total is 4', () => {
    expect(f.enemies.length).toBe(4);
    const inSomeRoom = (p) =>
      f.rooms.some((r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h);
    f.enemies.forEach((e) => expect(inSomeRoom(e)).toBe(true));
    f.items.forEach((i) => expect(inSomeRoom(i)).toBe(true));
    expect(f.items.length).toBe(11);
  });

  it('every enemy is within sight radius (5) of its room entrance (R103 setup)', () => {
    // Entrances: B at (52, 39..41), C at (39..41, 52).
    const B = f.rooms[1];
    const bEnemy = f.enemies.find((e) => e.roomIndex === 1);
    expect(Math.max(Math.abs(bEnemy.x - B.x), Math.abs(bEnemy.y - 40))).toBeLessThanOrEqual(5);
    const C = f.rooms[2];
    for (const e of f.enemies.filter((en) => en.roomIndex === 2)) {
      expect(Math.max(Math.abs(e.x - 40), Math.abs(e.y - C.y))).toBeLessThanOrEqual(5);
    }
  });

  it('is byte-for-byte deterministic', () => {
    expect(JSON.stringify(buildTestFloor())).toBe(JSON.stringify(buildTestFloor()));
  });
});
