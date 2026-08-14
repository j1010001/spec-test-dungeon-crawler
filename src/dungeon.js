// Procedural dungeon generation: BSP partitioning for normal floors (FR-017,
// FR-020, D4) plus the fixed deterministic "test dungeon" layout required by
// FR-039 / User Story 5 when the run seed is 99999 and the floor is 1.

import { GRID_SIZE, TILE, enemyStatsForFloor, enemyTypeForFloor, TEST_SEED } from './constants.js';
import { Rng } from './rng.js';

/** Create an 80x80 grid filled with walls. */
function createEmptyGrid() {
  const grid = [];
  for (let y = 0; y < GRID_SIZE; y += 1) {
    grid.push(new Array(GRID_SIZE).fill(TILE.WALL));
  }
  return grid;
}

function carveRoom(grid, room) {
  for (let y = room.y; y < room.y + room.h; y += 1) {
    for (let x = room.x; x < room.x + room.w; x += 1) {
      grid[y][x] = TILE.FLOOR;
    }
  }
}

function carveCorridor(grid, x1, y1, x2, y2) {
  // L-shaped corridor: horizontal then vertical (order randomized by caller).
  let x = x1;
  let y = y1;
  while (x !== x2) {
    grid[y][x] = TILE.FLOOR;
    x += x < x2 ? 1 : -1;
  }
  while (y !== y2) {
    grid[y][x] = TILE.FLOOR;
    y += y < y2 ? 1 : -1;
  }
  grid[y2][x2] = TILE.FLOOR;
}

function roomCenter(room) {
  return {
    x: room.x + Math.floor(room.w / 2),
    y: room.y + Math.floor(room.h / 2),
  };
}

/**
 * Recursively split a region and carve a room in every leaf, connecting
 * siblings as we bubble back up so the whole tree (and therefore every
 * room) ends up connected by construction (FR-013, SC-002).
 */
function splitAndCarve(grid, region, rng, depth) {
  const MIN_LEAF = 12;
  const canSplitH = region.w >= MIN_LEAF * 2;
  const canSplitV = region.h >= MIN_LEAF * 2;
  const shouldSplit = depth < 4 && (canSplitH || canSplitV) && rng.chance(0.8);

  if (!shouldSplit || (!canSplitH && !canSplitV)) {
    const room = makeRoom(region, rng);
    carveRoom(grid, room);
    return { room, rooms: [room] };
  }

  const splitHorizontally = canSplitH && (!canSplitV || rng.chance(0.5));
  let regionA;
  let regionB;
  if (splitHorizontally) {
    const cut = rng.int(MIN_LEAF, region.w - MIN_LEAF);
    regionA = { x: region.x, y: region.y, w: cut, h: region.h };
    regionB = { x: region.x + cut, y: region.y, w: region.w - cut, h: region.h };
  } else {
    const cut = rng.int(MIN_LEAF, region.h - MIN_LEAF);
    regionA = { x: region.x, y: region.y, w: region.w, h: cut };
    regionB = { x: region.x, y: region.y + cut, w: region.w, h: region.h - cut };
  }

  const resultA = splitAndCarve(grid, regionA, rng, depth + 1);
  const resultB = splitAndCarve(grid, regionB, rng, depth + 1);

  const centerA = roomCenter(resultA.room);
  const centerB = roomCenter(resultB.room);
  if (rng.chance(0.5)) {
    carveCorridor(grid, centerA.x, centerA.y, centerB.x, centerB.y);
  } else {
    // vertical-then-horizontal variant for visual variety
    let y = centerA.y;
    while (y !== centerB.y) {
      grid[y][centerA.x] = TILE.FLOOR;
      y += y < centerB.y ? 1 : -1;
    }
    let x = centerA.x;
    while (x !== centerB.x) {
      grid[centerB.y][x] = TILE.FLOOR;
      x += x < centerB.x ? 1 : -1;
    }
    grid[centerB.y][centerB.x] = TILE.FLOOR;
  }

  return {
    room: rng.chance(0.5) ? resultA.room : resultB.room,
    rooms: [...resultA.rooms, ...resultB.rooms],
  };
}

function makeRoom(region, rng) {
  const minSize = 5;
  const maxW = Math.max(minSize, Math.min(region.w - 2, 14));
  const maxH = Math.max(minSize, Math.min(region.h - 2, 14));
  const w = rng.int(minSize, maxW);
  const h = rng.int(minSize, maxH);
  const x = region.x + rng.int(1, Math.max(1, region.w - w - 1));
  const y = region.y + rng.int(1, Math.max(1, region.h - h - 1));
  return { x, y, w, h };
}

function isTileFree(grid, occupied, x, y) {
  return grid[y][x] === TILE.FLOOR && !occupied.has(`${x},${y}`);
}

function randomFreeTileInRoom(room, grid, occupied, rng, maxAttempts = 200) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const x = rng.int(room.x, room.x + room.w - 1);
    const y = rng.int(room.y, room.y + room.h - 1);
    if (isTileFree(grid, occupied, x, y)) {
      return { x, y };
    }
  }
  return null;
}

function placeEnemiesForFloor(floor, rooms, startRoom, grid, occupied, rng) {
  const enemies = [];
  const { type, glyph } = enemyTypeForFloor(floor);
  for (const room of rooms) {
    if (room === startRoom) continue; // starting room is always safe (FR-006)
    const count = rng.int(1, 3);
    for (let i = 0; i < count; i += 1) {
      const tile = randomFreeTileInRoom(room, grid, occupied, rng);
      if (!tile) continue; // room has no free tile left — acceptable (edge case)
      occupied.add(`${tile.x},${tile.y}`);
      const stats = enemyStatsForFloor(floor);
      enemies.push({
        id: `enemy-${enemies.length}-${floor}`,
        x: tile.x,
        y: tile.y,
        hp: stats.hp,
        maxHp: stats.maxHp,
        attack: stats.attack,
        defense: stats.defense,
        type,
        glyph,
        activated: false,
        roomIndex: rooms.indexOf(room),
        alive: true,
      });
    }
  }
  return enemies;
}

function randomItemType(rng) {
  return rng.pick(['potion', 'weapon', 'armor']);
}

function placeItemsForFloor(floor, rooms, startRoom, stairsPos, grid, occupied, rng) {
  const items = [];
  const count = rng.int(1, 3);
  const candidateRooms = rooms.filter((r) => r !== startRoom);
  for (let i = 0; i < count; i += 1) {
    const room = candidateRooms.length ? rng.pick(candidateRooms) : rooms[0];
    const tile = randomFreeTileInRoom(room, grid, occupied, rng);
    if (!tile) continue;
    if (stairsPos && tile.x === stairsPos.x && tile.y === stairsPos.y) continue;
    occupied.add(`${tile.x},${tile.y}`);
    items.push(makeItem(randomItemType(rng), floor, rng, tile));
  }
  return items;
}

export function makeItem(type, floor, rng, pos) {
  const id = `item-${type}-${Math.random().toString(36).slice(2, 9)}`;
  const base = { id, type, x: pos ? pos.x : undefined, y: pos ? pos.y : undefined };
  if (type === 'potion') {
    return { ...base, glyph: '!', value: 10 + floor * 5, label: 'Health Potion' };
  }
  if (type === 'weapon') {
    return { ...base, glyph: '/', value: floor + rng.int(0, 2), label: 'Weapon' };
  }
  return { ...base, glyph: '[', value: floor + rng.int(0, 2), label: 'Armor' };
}

/**
 * Build the FR-039 fixed test dungeon: a hub of four independently-reachable
 * rooms (A = start, B = combat/items, C = death room, D = stairs-only)
 * connected to the central Room A by 8-tile-long, 3-tile-wide corridors.
 */
function buildTestDungeon(floor, rng) {
  const grid = createEmptyGrid();

  const roomA = { x: 37, y: 37, w: 7, h: 7 }; // start room, min 5x5
  const roomB = { x: 52, y: 36, w: 9, h: 9 }; // right: combat + items, min 7x7
  const roomC = { x: 36, y: 52, w: 9, h: 9 }; // down: death room, min 7x7
  const roomD = { x: 38, y: 24, w: 5, h: 5 }; // up: stairs-only, min 5x5

  carveRoom(grid, roomA);
  carveRoom(grid, roomB);
  carveRoom(grid, roomC);
  carveRoom(grid, roomD);

  // Corridor A -> B: right, 8 tiles long, 3 tiles wide (centered on row 40)
  for (let x = roomA.x + roomA.w; x < roomB.x; x += 1) {
    for (let y = 39; y <= 41; y += 1) grid[y][x] = TILE.FLOOR;
  }
  // Corridor A -> C: down, 8 tiles long, 3 tiles wide (centered on col 40)
  for (let y = roomA.y + roomA.h; y < roomC.y; y += 1) {
    for (let x = 39; x <= 41; x += 1) grid[y][x] = TILE.FLOOR;
  }
  // Corridor A -> D: up, 8 tiles long, 3 tiles wide (centered on col 40)
  for (let y = roomD.y + roomD.h; y < roomA.y; y += 1) {
    for (let x = 39; x <= 41; x += 1) grid[y][x] = TILE.FLOOR;
  }

  const stairsPos = { x: roomD.x + 2, y: roomD.y + 1 }; // within 3 tiles of entrance
  grid[stairsPos.y][stairsPos.x] = TILE.STAIRS;

  const playerStart = roomCenter(roomA);

  const occupied = new Set([`${stairsPos.x},${stairsPos.y}`]);

  // Room B: exactly 1 Goblin + 11 items (>=1 potion, >=1 weapon, >=1 armor)
  const goblinStats = enemyStatsForFloor(1);
  const goblinTile = { x: roomB.x + 1, y: roomB.y + 4 };
  occupied.add(`${goblinTile.x},${goblinTile.y}`);
  const enemies = [
    {
      id: 'test-goblin-b',
      x: goblinTile.x,
      y: goblinTile.y,
      hp: goblinStats.hp,
      maxHp: goblinStats.maxHp,
      attack: goblinStats.attack,
      defense: goblinStats.defense,
      type: 'Goblin',
      glyph: 'g',
      activated: false,
      roomIndex: 1,
      alive: true,
    },
  ];

  const itemTypeSequence = [
    'potion', 'potion', 'potion', 'potion',
    'weapon', 'weapon', 'weapon', 'weapon',
    'armor', 'armor', 'armor',
  ];
  const items = [];
  let placed = 0;
  for (let yy = roomB.y; yy < roomB.y + roomB.h && placed < itemTypeSequence.length; yy += 1) {
    for (let xx = roomB.x; xx < roomB.x + roomB.w && placed < itemTypeSequence.length; xx += 1) {
      const key = `${xx},${yy}`;
      if (occupied.has(key)) continue;
      const type = itemTypeSequence[placed];
      items.push(makeItem(type, floor, rng, { x: xx, y: yy }));
      occupied.add(key);
      placed += 1;
    }
  }

  // Room C: exactly 3 Goblins, no items, no stairs
  const cStats = enemyStatsForFloor(1);
  const cTiles = [
    { x: roomC.x + 1, y: roomC.y + 1 },
    { x: roomC.x + 4, y: roomC.y + 4 },
    { x: roomC.x + 7, y: roomC.y + 7 },
  ];
  cTiles.forEach((tile, i) => {
    occupied.add(`${tile.x},${tile.y}`);
    enemies.push({
      id: `test-goblin-c-${i}`,
      x: tile.x,
      y: tile.y,
      hp: cStats.hp,
      maxHp: cStats.maxHp,
      attack: cStats.attack,
      defense: cStats.defense,
      type: 'Goblin',
      glyph: 'g',
      activated: false,
      roomIndex: 2,
      alive: true,
    });
  });

  const rooms = [roomA, roomB, roomC, roomD];

  return {
    grid,
    rooms,
    roomNames: ['A', 'B', 'C', 'D'],
    startRoom: roomA,
    stairsRoom: roomD,
    stairsPos,
    playerStart,
    enemies,
    items,
  };
}

/**
 * Generate a full floor. When `seed === TEST_SEED` and `floor === 1`, the
 * fixed deterministic layout from FR-039 is produced instead of the normal
 * BSP algorithm (US5). All other floor/seed combinations use procedural
 * BSP generation with guaranteed connectivity (FR-013, FR-017).
 */
export function generateFloor(floor, seed) {
  const rng = new Rng((seed ^ (floor * 0x9e3779b1)) >>> 0);
  if (seed === TEST_SEED && floor === 1) {
    return buildTestDungeon(floor, rng);
  }
  return generateProceduralFloor(floor, rng);
}

function generateProceduralFloor(floor, rng) {
  const grid = createEmptyGrid();
  const region = { x: 1, y: 1, w: GRID_SIZE - 2, h: GRID_SIZE - 2 };
  const { rooms } = splitAndCarve(grid, region, rng, 0);

  const startRoom = rng.pick(rooms);
  let stairsRoom = rng.pick(rooms);
  let guard = 0;
  while (stairsRoom === startRoom && rooms.length > 1 && guard < 50) {
    stairsRoom = rng.pick(rooms);
    guard += 1;
  }

  const stairsPos = roomCenter(stairsRoom);
  grid[stairsPos.y][stairsPos.x] = TILE.STAIRS;

  const playerStart = roomCenter(startRoom);

  const occupied = new Set([`${stairsPos.x},${stairsPos.y}`]);
  const enemies = placeEnemiesForFloor(floor, rooms, startRoom, grid, occupied, rng);
  const items = placeItemsForFloor(floor, rooms, startRoom, stairsPos, grid, occupied, rng);

  return { grid, rooms, startRoom, stairsRoom, stairsPos, playerStart, enemies, items };
}
