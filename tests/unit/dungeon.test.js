import { describe, it, expect } from 'vitest';
import { generateFloor } from '../../src/dungeon.js';
import { TILE, GRID_SIZE, TEST_SEED } from '../../src/constants.js';

function floodFillReachable(grid, start) {
  const seen = new Set();
  const stack = [start];
  const key = (x, y) => `${x},${y}`;
  seen.add(key(start.x, start.y));
  while (stack.length) {
    const { x, y } = stack.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= GRID_SIZE || ny >= GRID_SIZE) continue;
      if (grid[ny][nx] === TILE.WALL) continue;
      const k = key(nx, ny);
      if (seen.has(k)) continue;
      seen.add(k);
      stack.push({ x: nx, y: ny });
    }
  }
  return seen;
}

describe('dungeon.js — procedural generation (FR-013, FR-017, FR-020, SC-002)', () => {
  it('generates an 80x80 grid', () => {
    const floor = generateFloor(1, 555);
    expect(floor.grid.length).toBe(GRID_SIZE);
    expect(floor.grid[0].length).toBe(GRID_SIZE);
  });

  it('guarantees every room is reachable from the player start (connectivity)', () => {
    const floor = generateFloor(3, 777);
    const reachable = floodFillReachable(floor.grid, floor.playerStart);
    for (const room of floor.rooms) {
      const center = { x: room.x + Math.floor(room.w / 2), y: room.y + Math.floor(room.h / 2) };
      expect(reachable.has(`${center.x},${center.y}`)).toBe(true);
    }
  });

  it('places exactly one staircase tile', () => {
    const floor = generateFloor(2, 4242);
    let stairCount = 0;
    for (const row of floor.grid) {
      for (const cell of row) if (cell === TILE.STAIRS) stairCount += 1;
    }
    expect(stairCount).toBe(1);
  });

  it('places zero enemies in the starting room (FR-006)', () => {
    const floor = generateFloor(5, 8675309);
    const inStart = floor.enemies.filter(
      (e) =>
        e.x >= floor.startRoom.x &&
        e.x < floor.startRoom.x + floor.startRoom.w &&
        e.y >= floor.startRoom.y &&
        e.y < floor.startRoom.y + floor.startRoom.h
    );
    expect(inStart.length).toBe(0);
  });

  it('scales enemy stats linearly with floor number', () => {
    const f1 = generateFloor(1, 1);
    const f5 = generateFloor(5, 1);
    if (f1.enemies.length && f5.enemies.length) {
      expect(f5.enemies[0].hp).toBeGreaterThan(f1.enemies[0].hp);
      expect(f5.enemies[0].attack).toBeGreaterThan(f1.enemies[0].attack);
    }
    expect(f1.enemies.every((e) => e.hp === 15 && e.attack === 5 && e.defense === 1)).toBe(true);
    expect(f5.enemies.every((e) => e.hp === 35 && e.attack === 13 && e.defense === 5)).toBe(true);
  });

  it('is deterministic for a given seed and floor', () => {
    const a = generateFloor(3, 999);
    const b = generateFloor(3, 999);
    expect(a.playerStart).toEqual(b.playerStart);
    expect(a.enemies.length).toBe(b.enemies.length);
    expect(a.grid).toEqual(b.grid);
  });
});

describe('dungeon.js — FR-039 deterministic test dungeon (seed 99999, floor 1)', () => {
  const floor = generateFloor(1, TEST_SEED);

  it('produces exactly four rooms in a hub pattern', () => {
    expect(floor.rooms.length).toBe(4);
  });

  it('Room A (start) has no enemies, no items, no stairs', () => {
    const roomA = floor.rooms[0];
    const inRoom = (e) => e.x >= roomA.x && e.x < roomA.x + roomA.w && e.y >= roomA.y && e.y < roomA.y + roomA.h;
    expect(floor.enemies.filter(inRoom).length).toBe(0);
    expect(floor.items.filter(inRoom).length).toBe(0);
    expect(floor.grid[floor.playerStart.y][floor.playerStart.x]).toBe(TILE.FLOOR);
  });

  it('Room B has exactly 1 Goblin and 11 items (all three types present), no stairs', () => {
    const roomB = floor.rooms[1];
    const inRoom = (e) => e.x >= roomB.x && e.x < roomB.x + roomB.w && e.y >= roomB.y && e.y < roomB.y + roomB.h;
    const enemies = floor.enemies.filter(inRoom);
    const items = floor.items.filter(inRoom);
    expect(enemies.length).toBe(1);
    expect(enemies[0].type).toBe('Goblin');
    expect(items.length).toBe(11);
    expect(items.some((i) => i.type === 'potion')).toBe(true);
    expect(items.some((i) => i.type === 'weapon')).toBe(true);
    expect(items.some((i) => i.type === 'armor')).toBe(true);
  });

  it('Room C has exactly 3 Goblins, no items, no stairs', () => {
    const roomC = floor.rooms[2];
    const inRoom = (e) => e.x >= roomC.x && e.x < roomC.x + roomC.w && e.y >= roomC.y && e.y < roomC.y + roomC.h;
    expect(floor.enemies.filter(inRoom).length).toBe(3);
    expect(floor.enemies.filter(inRoom).every((e) => e.type === 'Goblin')).toBe(true);
    expect(floor.items.filter(inRoom).length).toBe(0);
  });

  it('Room D has exactly one staircase, no enemies, no items', () => {
    const roomD = floor.rooms[3];
    const inRoom = (p) => p.x >= roomD.x && p.x < roomD.x + roomD.w && p.y >= roomD.y && p.y < roomD.y + roomD.h;
    expect(inRoom(floor.stairsPos)).toBe(true);
    expect(floor.grid[floor.stairsPos.y][floor.stairsPos.x]).toBe(TILE.STAIRS);
    const enemiesInD = floor.enemies.filter((e) => inRoom(e));
    const itemsInD = floor.items.filter((i) => inRoom(i));
    expect(enemiesInD.length).toBe(0);
    expect(itemsInD.length).toBe(0);
  });

  it('each of Rooms B, C, D is reachable from Room A independently (hub, not chained)', () => {
    const reachable = floodFillReachable(floor.grid, floor.playerStart);
    for (const room of floor.rooms) {
      const center = { x: room.x + Math.floor(room.w / 2), y: room.y + Math.floor(room.h / 2) };
      expect(reachable.has(`${center.x},${center.y}`)).toBe(true);
    }
  });

  it('produces the normal procedural layout on floor 2+ even with seed 99999', () => {
    const floor2 = generateFloor(2, TEST_SEED);
    expect(floor2.rooms.length).not.toBe(4);
  });

  it('is bit-for-bit deterministic across repeated calls', () => {
    const again = generateFloor(1, TEST_SEED);
    expect(again.grid).toEqual(floor.grid);
    expect(again.enemies.map((e) => ({ x: e.x, y: e.y, type: e.type }))).toEqual(
      floor.enemies.map((e) => ({ x: e.x, y: e.y, type: e.type }))
    );
  });
});
