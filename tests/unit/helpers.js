// Shared test helpers: hand-crafted floor data for deterministic game-logic tests.
import { GRID_W, GRID_H, TILE_WALL, TILE_FLOOR, TILE_STAIRS } from '../../src/constants.js';
import { tileIndex } from '../../src/dungeon.js';
import { createGame } from '../../src/game.js';

// Builds a floor-data object from a spec:
// { rooms: [{x,y,w,h}], corridorTiles: [[x,y],...], spawnRoom, spawn, stairs, stairsRoom, enemies, items }
export function makeFloorData(spec) {
  const tiles = new Uint8Array(GRID_W * GRID_H).fill(TILE_WALL);
  for (const r of spec.rooms) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) tiles[tileIndex(x, y)] = TILE_FLOOR;
    }
  }
  for (const [x, y] of spec.corridorTiles || []) tiles[tileIndex(x, y)] = TILE_FLOOR;
  if (spec.stairs) tiles[tileIndex(spec.stairs.x, spec.stairs.y)] = TILE_STAIRS;
  return {
    tiles,
    rooms: spec.rooms,
    corridors: [],
    spawnRoom: spec.spawnRoom ?? 0,
    spawn: spec.spawn,
    stairs: spec.stairs || { x: 1, y: 1 },
    stairsRoom: spec.stairsRoom ?? 0,
    enemies: spec.enemies || [],
    items: spec.items || [],
  };
}

// A game whose floors come from the provided spec factory. `specForFloor(floor)`
// must return a FRESH spec each call (data is mutated by the game).
export function makeGame(specForFloor, seed = 1) {
  const gen = (floor) => makeFloorData(specForFloor(floor));
  return createGame(seed, gen);
}

// rng stub with scripted outputs.
export function stubRng({ next = 0.5, int = (min) => min, chance = false, pick = (a) => a[0] } = {}) {
  return {
    seed: 0,
    next: typeof next === 'function' ? next : () => next,
    int: typeof int === 'function' ? int : () => int,
    chance: typeof chance === 'function' ? chance : () => chance,
    pick: typeof pick === 'function' ? pick : () => pick,
  };
}

// Convenience enemy literal (floor-1 goblin stats by default).
export function goblin(x, y, roomIndex = 1, overrides = {}) {
  return {
    name: 'Goblin',
    glyph: 'g',
    x,
    y,
    hp: 15,
    maxHp: 15,
    atk: 5,
    def: 1,
    roomIndex,
    activated: false,
    ...overrides,
  };
}

export function potion(x, y, value = 15) {
  return { kind: 'potion', name: 'Potion', glyph: '!', value, x, y };
}
export function weapon(x, y, value = 3) {
  return { kind: 'weapon', name: 'Weapon', glyph: '/', value, x, y };
}
export function armor(x, y, value = 2) {
  return { kind: 'armor', name: 'Armor', glyph: '[', value, x, y };
}

// Standard single-room arena: room (5,5) size 15x15, spawn center (12,12).
export function arenaSpec({ enemies = [], items = [], stairs, rooms, spawn, spawnRoom } = {}) {
  return {
    rooms: rooms || [{ x: 5, y: 5, w: 15, h: 15 }],
    spawn: spawn || { x: 12, y: 12 },
    spawnRoom: spawnRoom ?? 0,
    stairs: stairs || { x: 6, y: 6 },
    stairsRoom: 0,
    enemies,
    items,
  };
}
