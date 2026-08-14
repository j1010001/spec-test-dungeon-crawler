// Shared constants: glyphs, colors, grid dimensions, and tunable formulas.
// Centralizing these keeps the spec's Key Entities / R10x rules in one place
// instead of scattered magic numbers.

export const GRID_SIZE = 80; // FR-020: fixed 80x80 grid per floor
export const SIGHT_RADIUS = 5; // R100: Chebyshev sight radius
export const MAX_FLOOR = 9; // R101: victory triggers on stepping off floor 9's stairs
export const INVENTORY_CAP = 10; // FR-009
export const HUD_LOG_MAX_LINES = 50; // FR-018 rolling buffer
export const TEST_SEED = 99999; // US5 / FR-039 deterministic test dungeon

export const TILE = Object.freeze({
  WALL: 'wall',
  FLOOR: 'floor',
  STAIRS: 'stairs',
  FOG: 'fog',
});

export const VISIBILITY = Object.freeze({
  HIDDEN: 'hidden',
  DIMMED: 'dimmed',
  LIT: 'lit',
});

export const GLYPH = Object.freeze({
  PLAYER: '@',
  WALL: '#',
  FLOOR: '.',
  STAIRS: '>',
  FOG: ' ',
  POTION: '!',
  WEAPON: '/',
  ARMOR: '[',
  GOBLIN: 'g',
  ORC: 'o',
  WRAITH: 'w',
});

// R102: limited entity-color palette on a black background.
export const COLOR = Object.freeze({
  WALL: '#8a8a8a',
  STAIRS: '#8a8a8a',
  FOG_DIM: '#3a3a3a',
  PLAYER: '#ffffff',
  ENEMY: '#a9895a',
  ITEM: '#7ec8e3',
  FLOOR: '#4a4a4a',
  BACKGROUND: '#000000',
});

export const ENEMY_TYPES_BY_FLOOR = [
  { min: 1, max: 3, type: 'Goblin', glyph: GLYPH.GOBLIN },
  { min: 4, max: 6, type: 'Orc', glyph: GLYPH.ORC },
  { min: 7, max: 9, type: 'Wraith', glyph: GLYPH.WRAITH },
];

/** Enemy stat formulas per floor (Key Entities: Enemy). */
export function enemyStatsForFloor(floor) {
  return {
    hp: 10 + floor * 5,
    maxHp: 10 + floor * 5,
    attack: 3 + floor * 2,
    defense: floor,
  };
}

export function enemyTypeForFloor(floor) {
  const entry = ENEMY_TYPES_BY_FLOOR.find((e) => floor >= e.min && floor <= e.max) ||
    ENEMY_TYPES_BY_FLOOR[ENEMY_TYPES_BY_FLOOR.length - 1];
  return entry;
}

/** Item bonus formulas (Key Entities: Item). rng is used for the random(0..2) term. */
export function potionRestoreForFloor(floor) {
  return 10 + floor * 5;
}

export function weaponBonusForFloor(floor, rng) {
  return floor + rng.int(0, 2);
}

export function armorBonusForFloor(floor, rng) {
  return floor + rng.int(0, 2);
}

/** Standard damage formula shared by player and enemy attacks (FR-021). */
export function computeDamage(attacker, defender) {
  return Math.max(1, attacker.attack - defender.defense);
}
