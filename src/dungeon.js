// Dungeon floor generation (FR-002, FR-013, FR-017, FR-020, FR-024,
// FR-025, FR-028, FR-039): BSP partitioning into rectangular rooms
// connected by corridors, plus the deterministic seed-99999 test layout.

import { GRID_SIZE, createEnemy, makePotion, makeWeapon, makeArmor, makeRandomItem } from './entities.js';

export const TILE = { WALL: '#', FLOOR: '.', STAIRS: '>' };

export const TEST_SEED = 99999;

function emptyGrid() {
  const grid = new Array(GRID_SIZE);
  for (let y = 0; y < GRID_SIZE; y++) grid[y] = new Array(GRID_SIZE).fill(TILE.WALL);
  return grid;
}

function carveRoom(grid, room) {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) grid[y][x] = TILE.FLOOR;
  }
}

function carveRect(grid, x0, y0, x1, y1) {
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) grid[y][x] = TILE.FLOOR;
  }
}

function roomCenter(room) {
  return { x: room.x + Math.floor(room.w / 2), y: room.y + Math.floor(room.h / 2) };
}

// --- BSP partitioning (Clarification D4) -------------------------------

const MIN_LEAF = 14; // leaves large enough for a >=5x5 room + 1-tile margin
const MIN_ROOM = 5;

function splitLeaves(rng) {
  const leaves = [];
  function split(x, y, w, h, depth) {
    const canSplitH = h >= MIN_LEAF * 2;
    const canSplitV = w >= MIN_LEAF * 2;
    if (depth <= 0 || (!canSplitH && !canSplitV)) {
      leaves.push({ x, y, w, h });
      return;
    }
    let vertical;
    if (canSplitH && canSplitV) vertical = rng.chance(0.5);
    else vertical = canSplitV;
    if (vertical) {
      const cut = rng.int(MIN_LEAF, w - MIN_LEAF);
      split(x, y, cut, h, depth - 1);
      split(x + cut, y, w - cut, h, depth - 1);
    } else {
      const cut = rng.int(MIN_LEAF, h - MIN_LEAF);
      split(x, y, w, cut, depth - 1);
      split(x, y + cut, w, h - cut, depth - 1);
    }
  }
  // Keep a 1-tile wall border around the whole grid.
  split(1, 1, GRID_SIZE - 2, GRID_SIZE - 2, 4);
  return leaves;
}

// --- Public API ---------------------------------------------------------

// Generates a complete floor synchronously (FR-017, FR-028).
// Returns { grid, rooms, spawn, stairs, enemies, items,
//           startRoomIndex, stairsRoomIndex, floor }.
export function generateFloor(floor, rng, seed) {
  if (seed === TEST_SEED && floor === 1) return buildTestFloor();
  return buildProceduralFloor(floor, rng);
}

export function buildProceduralFloor(floor, rng) {
  const grid = emptyGrid();
  const leaves = splitLeaves(rng);
  const rooms = [];
  for (const leaf of leaves) {
    const maxW = Math.min(leaf.w - 2, 16);
    const maxH = Math.min(leaf.h - 2, 16);
    const w = rng.int(MIN_ROOM, maxW);
    const h = rng.int(MIN_ROOM, maxH);
    const x = leaf.x + rng.int(1, leaf.w - w - 1);
    const y = leaf.y + rng.int(1, leaf.h - h - 1);
    const room = { x, y, w, h };
    rooms.push(room);
    carveRoom(grid, room);
  }
  // Connectivity by construction (FR-013): chain successive room centers
  // with L-shaped corridors (a horizontal strip then a vertical strip).
  for (let i = 1; i < rooms.length; i++) {
    const a = roomCenter(rooms[i - 1]);
    const b = roomCenter(rooms[i]);
    if (rng.chance(0.5)) {
      carveRect(grid, a.x, a.y, b.x, a.y);
      carveRect(grid, b.x, a.y, b.x, b.y);
    } else {
      carveRect(grid, a.x, a.y, a.x, b.y);
      carveRect(grid, a.x, b.y, b.x, b.y);
    }
  }

  // FR-024: start room and stairs room are distinct random rooms.
  const startRoomIndex = rng.int(0, rooms.length - 1);
  let stairsRoomIndex = rng.int(0, rooms.length - 1);
  while (stairsRoomIndex === startRoomIndex) stairsRoomIndex = rng.int(0, rooms.length - 1);

  const spawn = roomCenter(rooms[startRoomIndex]);
  const stairsRoom = rooms[stairsRoomIndex];
  const stairs = {
    x: stairsRoom.x + rng.int(0, stairsRoom.w - 1),
    y: stairsRoom.y + rng.int(0, stairsRoom.h - 1),
  };
  grid[stairs.y][stairs.x] = TILE.STAIRS;

  // Floor items: 1-3 per floor on random walkable tiles, at most one item
  // per tile, never on the staircase or the spawn tile (FR-025).
  const items = [];
  const itemCount = rng.int(1, 3);
  let guard = 0;
  while (items.length < itemCount && guard++ < 500) {
    const room = rng.pick(rooms);
    const x = room.x + rng.int(0, room.w - 1);
    const y = room.y + rng.int(0, room.h - 1);
    if (grid[y][x] !== TILE.FLOOR) continue;
    if (x === spawn.x && y === spawn.y) continue;
    if (items.some((it) => it.x === x && it.y === y)) continue;
    const item = makeRandomItem(floor, rng);
    item.x = x;
    item.y = y;
    items.push(item);
  }

  // FR-006: 1-3 enemies per non-starting room; never in the start room;
  // never on stairs or item tiles; one enemy per tile.
  const enemies = [];
  rooms.forEach((room, roomIndex) => {
    if (roomIndex === startRoomIndex) return;
    const count = rng.int(1, 3);
    let placed = 0;
    let tries = 0;
    while (placed < count && tries++ < 60) {
      const x = room.x + rng.int(0, room.w - 1);
      const y = room.y + rng.int(0, room.h - 1);
      if (grid[y][x] !== TILE.FLOOR) continue;
      if (items.some((it) => it.x === x && it.y === y)) continue;
      if (enemies.some((e) => e.x === x && e.y === y)) continue;
      enemies.push(createEnemy(floor, x, y, roomIndex));
      placed++;
    }
    // A room with no valid placement tiles simply has fewer/zero enemies
    // (Edge Cases): acceptable, not an error.
  });

  return { grid, rooms, spawn, stairs, enemies, items, startRoomIndex, stairsRoomIndex, floor };
}

// --- Deterministic test dungeon, seed 99999, floor 1 (FR-039) -----------
//
// Hub layout, all coordinates fixed:
//
//                [ Room D 37..43 x 24..28 ]  stairs (40,26)
//                        | corridor 39..41 x 29..36 (8 long, 3 wide)
//   [ Room A 37..43 x 37..43 ]--corridor 44..51 x 39..41--[ Room B 52..60 x 36..44 ]
//        spawn (40,40)                                       1 Goblin + 11 items
//                        | corridor 39..41 x 44..51
//                [ Room C 36..44 x 52..60 ]  3 Goblins
export function buildTestFloor() {
  const floor = 1;
  const grid = emptyGrid();
  const roomA = { x: 37, y: 37, w: 7, h: 7 }; // start hub, 7x7 (min 5x5)
  const roomB = { x: 52, y: 36, w: 9, h: 9 }; // combat/items, 9x9 (min 7x7)
  const roomC = { x: 36, y: 52, w: 9, h: 9 }; // death room, 9x9 (min 7x7)
  const roomD = { x: 37, y: 24, w: 7, h: 5 }; // descent room, 7x5 (min 5x5)
  const rooms = [roomA, roomB, roomC, roomD];
  rooms.forEach((r) => carveRoom(grid, r));
  // Corridors: exactly 8 tiles long, 3 tiles wide, one per room, all
  // branching directly from Room A (independent access).
  carveRect(grid, 44, 39, 51, 41); // right  -> Room B
  carveRect(grid, 39, 44, 41, 51); // down   -> Room C
  carveRect(grid, 39, 29, 41, 36); // up     -> Room D

  const spawn = { x: 40, y: 40 }; // center of Room A
  const stairs = { x: 40, y: 26 }; // within 3 tiles of Room D entrance (40,28)
  grid[stairs.y][stairs.x] = TILE.STAIRS;

  // Room B: exactly one Goblin, within sight radius (5) of the room
  // entrance column x=52 so it activates on entry (R103).
  // Room C: exactly three Goblins, all within sight radius of entrance
  // (40,52).
  const enemies = [
    createEnemy(floor, 56, 40, 1),
    createEnemy(floor, 38, 56, 2),
    createEnemy(floor, 40, 56, 2),
    createEnemy(floor, 42, 56, 2),
  ];
  // FR-039 requires every enemy to still be within the player's sight
  // radius when the room is entered, and the layout to stay fully
  // deterministic for automated tests. Random idle patrol (R103) would
  // wander them off their mandated positions, so test-floor enemies hold
  // position until activated. Procedural floors patrol normally.
  enemies.forEach((e) => (e.patrol = false));

  // Room B: exactly eleven items — at least one of each type, one per
  // tile, none on the Goblin's tile, all deterministic.
  const fixedRng = { int: () => 1, next: () => 0, pick: (a) => a[0], chance: () => false };
  const items = [];
  const place = (item, x, y) => {
    item.x = x;
    item.y = y;
    items.push(item);
  };
  place(makePotion(floor), 54, 38);
  place(makePotion(floor), 55, 38);
  place(makePotion(floor), 56, 38);
  place(makePotion(floor), 57, 38);
  place(makeWeapon(floor, fixedRng), 54, 42);
  place(makeWeapon(floor, fixedRng), 55, 42);
  place(makeWeapon(floor, fixedRng), 56, 42);
  place(makeWeapon(floor, fixedRng), 57, 42);
  place(makeArmor(floor, fixedRng), 53, 40);
  place(makeArmor(floor, fixedRng), 54, 40);
  place(makeArmor(floor, fixedRng), 55, 40);

  return {
    grid,
    rooms,
    spawn,
    stairs,
    enemies,
    items,
    startRoomIndex: 0,
    stairsRoomIndex: 3,
    floor,
  };
}
