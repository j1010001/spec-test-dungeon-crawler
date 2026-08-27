// Shared constants: grid dimensions, sight radius, glyphs, palette (R102),
// enemy type table (FR-006) and stat/item formulas (Key Entities).

export const GRID_W = 80;
export const GRID_H = 80;
export const SIGHT_RADIUS = 5; // R100 — Chebyshev
export const MAX_INVENTORY = 10; // FR-009
export const LOG_LINES = 50; // FR-018 rolling buffer
export const MAX_FLOOR = 9; // R101 — stairs on floor 9 => victory, no floor 10
export const TEST_SEED = 99999; // FR-039

// Tile types
export const TILE = {
  WALL: 0,
  FLOOR: 1,
  STAIRS: 2,
};

// Visibility states (FR-003 / R100)
export const VIS = {
  HIDDEN: 0,
  DIM: 1,
  LIT: 2,
};

export const GLYPHS = {
  player: '@',
  wall: '#',
  floor: '.',
  stairs: '>',
  goblin: 'g',
  orc: 'o',
  wraith: 'w',
  potion: '!',
  weapon: '/',
  armor: ']',
};

// R102 limited palette — black background; walls+staircase grey, fog (dimmed)
// dark grey, player white, enemies light brown, items light blue. No other
// foreground colors are permitted.
export const COLORS = {
  background: '#000000',
  grey: '#9e9e9e', // walls, staircase, lit terrain
  darkGrey: '#4d4d4d', // dimmed (fog-of-war) terrain
  white: '#ffffff', // player
  lightBrown: '#c49a6c', // enemies
  lightBlue: '#8fd0ff', // items
};

// Enemy type by floor range (FR-006)
export function enemyTypeForFloor(floor) {
  if (floor <= 3) return { type: 'Goblin', glyph: GLYPHS.goblin };
  if (floor <= 6) return { type: 'Orc', glyph: GLYPHS.orc };
  return { type: 'Wraith', glyph: GLYPHS.wraith };
}

// Enemy stat formulas (Key Entities): HP = 10 + floor*5, atk = 3 + floor*2, def = floor
export function enemyStatsForFloor(floor) {
  return {
    hp: 10 + floor * 5,
    attack: 3 + floor * 2,
    defense: floor,
  };
}

// Combat damage (FR-021): max(1, attacker.attack - defender.defense)
export function damage(attack, defense) {
  return Math.max(1, attack - defense);
}

// Item effect formulas (Key Entities). `rand02` is an integer in 0..2 supplied
// by the seeded RNG (weapon/armor bonus = floor + random(0..2)).
export function potionValue(floor) {
  return 10 + floor * 5;
}
export function weaponValue(floor, rand02) {
  return floor + rand02;
}
export function armorValue(floor, rand02) {
  return floor + rand02;
}

// Chebyshev distance — the metric for adjacency, fog-of-war and movement
// (clarification 2026-06-26: 8-directional everything).
export function chebyshev(x1, y1, x2, y2) {
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
}
