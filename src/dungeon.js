// Floor generation: BSP partitioning with rectangular rooms and connecting
// corridors (FR-013, FR-017, FR-020, FR-024, FR-025, FR-006), plus the
// deterministic seed-99999 test dungeon for floor 1 (FR-039 / US5).

import {
  GRID_W,
  GRID_H,
  TILE,
  TEST_SEED,
  enemyTypeForFloor,
  enemyStatsForFloor,
  potionValue,
  weaponValue,
  armorValue,
} from './constants.js';

// ---------------------------------------------------------------- items ----

export function makeItem(kind, floor, rng) {
  if (kind === 'potion') {
    const v = potionValue(floor);
    return { kind: 'potion', value: v, glyph: '!', name: `Health Potion (+${v} HP)` };
  }
  if (kind === 'weapon') {
    const v = weaponValue(floor, rng.int(0, 2));
    return { kind: 'weapon', value: v, glyph: '/', name: `Weapon (+${v} ATK)` };
  }
  const v = armorValue(floor, rng.int(0, 2));
  return { kind: 'armor', value: v, glyph: ']', name: `Armor (+${v} DEF)` };
}

export function randomItem(floor, rng) {
  const kind = rng.pick(['potion', 'weapon', 'armor']);
  return makeItem(kind, floor, rng);
}

export function makeEnemy(floor, x, y, roomIndex, { patrols = true } = {}) {
  const t = enemyTypeForFloor(floor);
  const s = enemyStatsForFloor(floor);
  return {
    x,
    y,
    hp: s.hp,
    maxHp: s.hp,
    attack: s.attack,
    defense: s.defense,
    type: t.type,
    glyph: t.glyph,
    roomIndex, // spawning room (patrol boundary, R103)
    activated: false,
    // R103 idle patrol. FR-039 overrides it for the seed-99999 test dungeon:
    // its enemies MUST still be within sight radius of the room entrance
    // whenever the player enters, so they hold position until activated.
    patrols,
  };
}

// ------------------------------------------------------------ BSP floors ----

const MIN_LEAF = 12; // leaf side incl. margin
const ROOM_MARGIN = 2;

function splitLeaves(rng, x, y, w, h, depth, out) {
  const canSplitH = h >= MIN_LEAF * 2;
  const canSplitV = w >= MIN_LEAF * 2;
  if (depth <= 0 || (!canSplitH && !canSplitV)) {
    out.push({ x, y, w, h });
    return;
  }
  let vertical;
  if (canSplitH && canSplitV) vertical = rng.chance(w > h ? 0.7 : 0.3);
  else vertical = canSplitV;
  if (vertical) {
    const cut = rng.int(MIN_LEAF, w - MIN_LEAF);
    splitLeaves(rng, x, y, cut, h, depth - 1, out);
    splitLeaves(rng, x + cut, y, w - cut, h, depth - 1, out);
  } else {
    const cut = rng.int(MIN_LEAF, h - MIN_LEAF);
    splitLeaves(rng, x, y, w, cut, depth - 1, out);
    splitLeaves(rng, x, y + cut, w, h - cut, depth - 1, out);
  }
}

function carveRoom(tiles, room) {
  for (let yy = room.y; yy < room.y + room.h; yy++) {
    for (let xx = room.x; xx < room.x + room.w; xx++) {
      tiles[yy][xx] = TILE.FLOOR;
    }
  }
}

function carveCorridorSegment(tiles, x1, y1, x2, y2) {
  // Horizontal or vertical strip of floor tiles.
  if (x1 === x2) {
    for (let yy = Math.min(y1, y2); yy <= Math.max(y1, y2); yy++) tiles[yy][x1] = TILE.FLOOR;
  } else {
    for (let xx = Math.min(x1, x2); xx <= Math.max(x1, x2); xx++) tiles[y1][xx] = TILE.FLOOR;
  }
}

function connect(tiles, rng, roomA, roomB) {
  // L-shaped corridor between room centers (each leg a horizontal or
  // vertical strip per the Corridor entity definition).
  const ax = Math.floor(roomA.x + roomA.w / 2);
  const ay = Math.floor(roomA.y + roomA.h / 2);
  const bx = Math.floor(roomB.x + roomB.w / 2);
  const by = Math.floor(roomB.y + roomB.h / 2);
  if (rng.chance(0.5)) {
    carveCorridorSegment(tiles, ax, ay, bx, ay);
    carveCorridorSegment(tiles, bx, ay, bx, by);
  } else {
    carveCorridorSegment(tiles, ax, ay, ax, by);
    carveCorridorSegment(tiles, ax, by, bx, by);
  }
}

function emptyTiles() {
  const tiles = [];
  for (let y = 0; y < GRID_H; y++) tiles.push(new Array(GRID_W).fill(TILE.WALL));
  return tiles;
}

function roomCenter(room) {
  return { x: Math.floor(room.x + room.w / 2), y: Math.floor(room.y + room.h / 2) };
}

export function tileInRoom(room, x, y) {
  return x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h;
}

function generateBspFloor(rng, floor) {
  const tiles = emptyTiles();
  const leaves = [];
  // Keep a 1-tile wall border around the whole grid.
  splitLeaves(rng, 1, 1, GRID_W - 2, GRID_H - 2, 4, leaves);

  const rooms = [];
  for (const leaf of leaves) {
    const maxW = leaf.w - ROOM_MARGIN * 2;
    const maxH = leaf.h - ROOM_MARGIN * 2;
    const w = rng.int(Math.min(4, maxW), Math.min(maxW, 14));
    const h = rng.int(Math.min(4, maxH), Math.min(maxH, 14));
    const x = leaf.x + rng.int(ROOM_MARGIN, leaf.w - w - ROOM_MARGIN);
    const y = leaf.y + rng.int(ROOM_MARGIN, leaf.h - h - ROOM_MARGIN);
    rooms.push({ x, y, w, h });
  }
  for (const room of rooms) carveRoom(tiles, room);
  // Connect each room to the next (chain over the leaf order) — connectivity
  // by construction, every room reachable (FR-013/FR-017).
  for (let i = 1; i < rooms.length; i++) connect(tiles, rng, rooms[i - 1], rooms[i]);

  // FR-024: starting room and staircase room are distinct random rooms.
  const startIdx = rng.int(0, rooms.length - 1);
  let stairsIdx = rng.int(0, rooms.length - 1);
  while (stairsIdx === startIdx) stairsIdx = rng.int(0, rooms.length - 1);

  const playerStart = roomCenter(rooms[startIdx]);

  // Staircase: random floor tile in the staircase room.
  const stairsRoom = rooms[stairsIdx];
  let stairsPos = roomCenter(stairsRoom);
  const candidates = [];
  for (let y = stairsRoom.y; y < stairsRoom.y + stairsRoom.h; y++) {
    for (let x = stairsRoom.x; x < stairsRoom.x + stairsRoom.w; x++) {
      if (!(x === playerStart.x && y === playerStart.y)) candidates.push({ x, y });
    }
  }
  if (candidates.length) stairsPos = rng.pick(candidates);
  tiles[stairsPos.y][stairsPos.x] = TILE.STAIRS;

  // Items: 1-3 per floor on random walkable floor tiles, at most one per
  // tile, never on the staircase or the player start (FR-025).
  const items = [];
  const itemCount = rng.int(1, 3);
  let guard = 0;
  while (items.length < itemCount && guard++ < 500) {
    const room = rng.pick(rooms);
    const x = rng.int(room.x, room.x + room.w - 1);
    const y = rng.int(room.y, room.y + room.h - 1);
    if (tiles[y][x] !== TILE.FLOOR) continue; // skips staircase
    if (x === playerStart.x && y === playerStart.y) continue;
    if (items.some((it) => it.x === x && it.y === y)) continue; // FR-025
    const item = randomItem(floor, rng);
    item.x = x;
    item.y = y;
    items.push(item);
  }

  // Enemies: 1-3 per non-starting room (FR-006); starting room always safe.
  // Tiles occupied by items or the staircase are invalid enemy spawns; a
  // room with no valid tiles simply gets fewer/zero enemies (edge case).
  const enemies = [];
  for (let r = 0; r < rooms.length; r++) {
    if (r === startIdx) continue;
    const room = rooms[r];
    const want = rng.int(1, 3);
    const free = [];
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        if (tiles[y][x] !== TILE.FLOOR) continue;
        if (items.some((it) => it.x === x && it.y === y)) continue;
        if (x === playerStart.x && y === playerStart.y) continue;
        free.push({ x, y });
      }
    }
    for (let n = 0; n < want && free.length > 0; n++) {
      const i = rng.int(0, free.length - 1);
      const pos = free.splice(i, 1)[0];
      enemies.push(makeEnemy(floor, pos.x, pos.y, r));
    }
  }

  return {
    tiles,
    rooms,
    startRoomIndex: startIdx,
    stairsRoomIndex: stairsIdx,
    playerStart,
    stairsPos,
    items,
    enemies,
  };
}

// ------------------------------------------------- FR-039 test dungeon ----

// Fixed hub layout, floor 1, seed 99999. Four rooms around central Room A,
// each linked by its own corridor exactly 8 tiles long and 3 tiles wide.
export const TEST_LAYOUT = {
  roomA: { x: 37, y: 37, w: 7, h: 7 }, // start (min 5x5)
  roomB: { x: 52, y: 36, w: 9, h: 9 }, // right — combat/items (min 7x7)
  roomC: { x: 36, y: 52, w: 9, h: 9 }, // down — death room (min 7x7)
  roomD: { x: 37, y: 22, w: 7, h: 7 }, // up — descent room (min 5x5)
  corridorRight: { x: 44, y: 39, w: 8, h: 3 },
  corridorDown: { x: 39, y: 44, w: 3, h: 8 },
  corridorUp: { x: 39, y: 29, w: 3, h: 8 },
  playerStart: { x: 40, y: 40 },
  stairs: { x: 40, y: 26 }, // within 3 tiles of Room D entrance (40,28)
  goblinB: { x: 55, y: 40 }, // within sight radius of Room B entrance (52,40)
  goblinsC: [
    { x: 38, y: 55 },
    { x: 40, y: 56 },
    { x: 42, y: 55 },
  ], // all within sight radius of Room C entrance (40,52)
  // Eleven items in Room B, each on its own tile (FR-025), mix of all three
  // types with at least one of each.
  itemsB: [
    { kind: 'potion', x: 53, y: 37 },
    { kind: 'weapon', x: 55, y: 37 },
    { kind: 'armor', x: 57, y: 37 },
    { kind: 'potion', x: 53, y: 39 },
    { kind: 'weapon', x: 57, y: 39 },
    { kind: 'potion', x: 53, y: 41 },
    { kind: 'armor', x: 57, y: 41 },
    { kind: 'potion', x: 53, y: 43 },
    { kind: 'weapon', x: 55, y: 43 },
    { kind: 'armor', x: 57, y: 43 },
    { kind: 'potion', x: 59, y: 40 },
  ],
};

function generateTestFloor(rng) {
  const L = TEST_LAYOUT;
  const tiles = emptyTiles();
  const rooms = [L.roomA, L.roomB, L.roomC, L.roomD];
  for (const room of rooms) carveRoom(tiles, room);
  for (const c of [L.corridorRight, L.corridorDown, L.corridorUp]) {
    for (let y = c.y; y < c.y + c.h; y++) {
      for (let x = c.x; x < c.x + c.w; x++) tiles[y][x] = TILE.FLOOR;
    }
  }
  tiles[L.stairs.y][L.stairs.x] = TILE.STAIRS;

  const items = L.itemsB.map((spec) => {
    const item = makeItem(spec.kind, 1, rng);
    item.x = spec.x;
    item.y = spec.y;
    return item;
  });

  const enemies = [makeEnemy(1, L.goblinB.x, L.goblinB.y, 1, { patrols: false })];
  for (const g of L.goblinsC) enemies.push(makeEnemy(1, g.x, g.y, 2, { patrols: false }));

  return {
    tiles,
    rooms,
    startRoomIndex: 0,
    stairsRoomIndex: 3,
    playerStart: { ...L.playerStart },
    stairsPos: { ...L.stairs },
    items,
    enemies,
  };
}

// ----------------------------------------------------------- entry point ----

// FR-039: seed 99999 + floor 1 => deterministic test dungeon; every other
// (seed, floor) combination uses normal BSP procedural generation.
export function generateFloor(rng, floor, seed) {
  if (seed === TEST_SEED && floor === 1) return generateTestFloor(rng);
  return generateBspFloor(rng, floor);
}
