// Dungeon generation: BSP procedural floors (FR-017, FR-020, FR-013, FR-024,
// FR-006, FR-025) and the deterministic seed-99999 test hub on floor 1 (FR-039).
import {
  GRID_W,
  GRID_H,
  TILE_WALL,
  TILE_FLOOR,
  TILE_STAIRS,
  TEST_SEED,
} from './constants.js';
import { makeEnemy, makeItem, makeRandomItem } from './entities.js';

export function tileIndex(x, y) {
  return y * GRID_W + x;
}

export function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;
}

export function chebyshev(x1, y1, x2, y2) {
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
}

export function roomContains(room, x, y) {
  return x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h;
}

export function roomAt(rooms, x, y) {
  for (let i = 0; i < rooms.length; i++) {
    if (roomContains(rooms[i], x, y)) return i;
  }
  return -1;
}

function carveRect(tiles, x0, y0, w, h, tile) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) tiles[tileIndex(x, y)] = tile;
  }
}

// ---------------------------------------------------------------------------
// Seed 99999, floor 1: deterministic four-room hub (FR-039).
// Room A center hub at grid center; corridors exactly 8 long x 3 wide.
// ---------------------------------------------------------------------------
function generateTestFloor(rng) {
  const tiles = new Uint8Array(GRID_W * GRID_H).fill(TILE_WALL);

  const roomA = { x: 37, y: 37, w: 7, h: 7 }; // spawn hub  (min 5x5)
  const roomB = { x: 52, y: 37, w: 7, h: 7 }; // right: combat/items (min 7x7)
  const roomC = { x: 37, y: 52, w: 7, h: 7 }; // down: death room (min 7x7)
  const roomD = { x: 38, y: 24, w: 5, h: 5 }; // up: staircase room (min 5x5)
  const rooms = [roomA, roomB, roomC, roomD];

  const corridors = [
    { x: 44, y: 39, w: 8, h: 3 }, // A → B, right
    { x: 39, y: 44, w: 3, h: 8 }, // A → C, down
    { x: 39, y: 29, w: 3, h: 8 }, // A → D, up
  ];

  for (const r of rooms) carveRect(tiles, r.x, r.y, r.w, r.h, TILE_FLOOR);
  for (const c of corridors) carveRect(tiles, c.x, c.y, c.w, c.h, TILE_FLOOR);

  const spawn = { x: 40, y: 40 }; // center of Room A
  const stairs = { x: 40, y: 26 }; // Room D, 2 tiles from its entrance (40,28)
  tiles[tileIndex(stairs.x, stairs.y)] = TILE_STAIRS;

  // Room B: exactly one Goblin + exactly eleven items (>=1 of each kind),
  // all within sight radius 5 of the room entrance (52,40).
  const enemies = [
    makeEnemy(1, 55, 40, 1),
    // Room C: exactly three Goblins, within radius 5 of entrance (40,52).
    makeEnemy(1, 38, 54, 2),
    makeEnemy(1, 40, 55, 2),
    makeEnemy(1, 42, 54, 2),
  ];

  const itemPlan = [
    ['potion', 53, 38],
    ['weapon', 54, 38],
    ['armor', 55, 38],
    ['potion', 56, 38],
    ['weapon', 53, 39],
    ['armor', 54, 39],
    ['potion', 53, 41],
    ['weapon', 54, 41],
    ['armor', 53, 42],
    ['potion', 54, 42],
    ['potion', 55, 42],
  ];
  const items = itemPlan.map(([kind, x, y]) => ({ ...makeItem(kind, 1, rng), x, y }));

  return {
    tiles,
    rooms,
    corridors,
    spawn,
    spawnRoom: 0,
    stairs,
    stairsRoom: 3,
    enemies,
    items,
    isTestLayout: true,
  };
}

// ---------------------------------------------------------------------------
// Procedural BSP generation (all other floors/seeds).
// ---------------------------------------------------------------------------
const BSP_MIN_LEAF = 12;

function splitRegion(node, rng, leaves) {
  const canSplitW = node.w >= BSP_MIN_LEAF * 2;
  const canSplitH = node.h >= BSP_MIN_LEAF * 2;
  if (!canSplitW && !canSplitH) {
    leaves.push(node);
    return;
  }
  let vertical;
  if (canSplitW && canSplitH) {
    vertical = node.w === node.h ? rng.chance(0.5) : node.w > node.h;
  } else {
    vertical = canSplitW;
  }
  if (vertical) {
    const cut = rng.int(BSP_MIN_LEAF, node.w - BSP_MIN_LEAF);
    splitRegion({ x: node.x, y: node.y, w: cut, h: node.h, side: 'a' }, rng, leaves);
    splitRegion({ x: node.x + cut, y: node.y, w: node.w - cut, h: node.h, side: 'b' }, rng, leaves);
  } else {
    const cut = rng.int(BSP_MIN_LEAF, node.h - BSP_MIN_LEAF);
    splitRegion({ x: node.x, y: node.y, w: node.w, h: cut, side: 'a' }, rng, leaves);
    splitRegion({ x: node.x, y: node.y + cut, w: node.w, h: node.h - cut, side: 'b' }, rng, leaves);
  }
}

function carveCorridorBetween(tiles, ax, ay, bx, by, rng) {
  // L-shaped, 1 tile wide, horizontal-first or vertical-first at random.
  const horizontalFirst = rng.chance(0.5);
  const carve = (x, y) => {
    if (tiles[tileIndex(x, y)] === TILE_WALL) tiles[tileIndex(x, y)] = TILE_FLOOR;
  };
  if (horizontalFirst) {
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) carve(x, ay);
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) carve(bx, y);
  } else {
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) carve(ax, y);
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) carve(x, by);
  }
}

function roomCenter(room) {
  return { x: room.x + Math.floor(room.w / 2), y: room.y + Math.floor(room.h / 2) };
}

// Enemy placement (FR-006): 1-3 per non-starting room; skips tiles holding
// the staircase, an item, or another enemy. A room with no free tile simply
// gets fewer/zero enemies (Edge Case).
export function placeEnemies(data, floor, rng) {
  for (let i = 0; i < data.rooms.length; i++) {
    if (i === data.spawnRoom) continue;
    const room = data.rooms[i];
    const count = rng.int(1, 3);
    for (let n = 0; n < count; n++) {
      const free = [];
      for (let y = room.y; y < room.y + room.h; y++) {
        for (let x = room.x; x < room.x + room.w; x++) {
          if (data.tiles[tileIndex(x, y)] !== TILE_FLOOR) continue;
          if (data.items.some((it) => it.x === x && it.y === y)) continue;
          if (data.enemies.some((e) => e.x === x && e.y === y)) continue;
          if (x === data.spawn.x && y === data.spawn.y) continue;
          free.push([x, y]);
        }
      }
      if (free.length === 0) break;
      const [x, y] = free[rng.int(0, free.length - 1)];
      data.enemies.push(makeEnemy(floor, x, y, i));
    }
  }
}

// Floor item placement (Item entity, FR-025): 1-3 items on random walkable
// floor tiles; never the staircase, never a tile already holding an item,
// never under an enemy or the player spawn.
export function placeItems(data, floor, rng) {
  const count = rng.int(1, 3);
  let placed = 0;
  let attempts = 0;
  while (placed < count && attempts < 500) {
    attempts++;
    const room = data.rooms[rng.int(0, data.rooms.length - 1)];
    const x = rng.int(room.x, room.x + room.w - 1);
    const y = rng.int(room.y, room.y + room.h - 1);
    if (data.tiles[tileIndex(x, y)] !== TILE_FLOOR) continue;
    if (x === data.spawn.x && y === data.spawn.y) continue;
    if (data.items.some((it) => it.x === x && it.y === y)) continue;
    if (data.enemies.some((e) => e.x === x && e.y === y)) continue;
    data.items.push({ ...makeRandomItem(floor, rng), x, y });
    placed++;
  }
}

function generateProceduralFloor(floor, rng) {
  const tiles = new Uint8Array(GRID_W * GRID_H).fill(TILE_WALL);
  const leaves = [];
  splitRegion({ x: 1, y: 1, w: GRID_W - 2, h: GRID_H - 2 }, rng, leaves);

  // One rectangular room per BSP leaf.
  const rooms = leaves.map((leaf) => {
    const w = rng.int(5, Math.min(leaf.w - 2, 12));
    const h = rng.int(5, Math.min(leaf.h - 2, 12));
    const x = leaf.x + rng.int(1, leaf.w - w - 1);
    const y = leaf.y + rng.int(1, leaf.h - h - 1);
    return { x, y, w, h };
  });
  for (const r of rooms) carveRect(tiles, r.x, r.y, r.w, r.h, TILE_FLOOR);

  // Connectivity by construction: chain each room to the previous one
  // (equivalent to connecting BSP siblings — the leaf order follows the
  // partition tree) — every room is reachable from every other (FR-013).
  for (let i = 1; i < rooms.length; i++) {
    const a = roomCenter(rooms[i - 1]);
    const b = roomCenter(rooms[i]);
    carveCorridorBetween(tiles, a.x, a.y, b.x, b.y, rng);
  }

  // Spawn room and a DIFFERENT staircase room (FR-024). The rejection loop is
  // bounded: after 100 attempts (astronomically unlikely with >=2 rooms) fall
  // back to a deterministic different room rather than spinning forever.
  const spawnRoom = rng.int(0, rooms.length - 1);
  let stairsRoom = spawnRoom;
  for (let attempts = 0; stairsRoom === spawnRoom && attempts < 100; attempts++) {
    stairsRoom = rng.int(0, rooms.length - 1);
  }
  if (stairsRoom === spawnRoom) stairsRoom = (spawnRoom + 1) % rooms.length;
  const spawn = roomCenter(rooms[spawnRoom]);
  const sr = rooms[stairsRoom];
  const stairs = {
    x: rng.int(sr.x, sr.x + sr.w - 1),
    y: rng.int(sr.y, sr.y + sr.h - 1),
  };
  tiles[tileIndex(stairs.x, stairs.y)] = TILE_STAIRS;

  const data = {
    tiles,
    rooms,
    corridors: [],
    spawn,
    spawnRoom,
    stairs,
    stairsRoom,
    enemies: [],
    items: [],
    isTestLayout: false,
  };
  placeItems(data, floor, rng);
  placeEnemies(data, floor, rng);
  return data;
}

// Entry point (FR-002: whole floor generated at floor entry).
export function generateFloor(floor, seed, rng) {
  if (seed === TEST_SEED && floor === 1) return generateTestFloor(rng);
  return generateProceduralFloor(floor, rng);
}
