// Game-wide constants. Values are mandated by the spec:
// grid (FR-020), sight radius (R100), inventory cap (FR-009),
// log buffer (FR-018), max floor (R101), hint text (SC-006).
export const GRID_W = 80;
export const GRID_H = 80;
export const SIGHT_RADIUS = 5;
export const MAX_FLOOR = 9;
export const INVENTORY_CAP = 10;
export const LOG_MAX = 50;
export const TEST_SEED = 99999;

export const TILE_WALL = 0;
export const TILE_FLOOR = 1;
export const TILE_STAIRS = 2;

export const PLAYER_BASE_HP = 20;
export const PLAYER_BASE_ATK = 5;
export const PLAYER_BASE_DEF = 1;

export const CONTROL_HINT = 'WASD/Arrows to move · I for inventory · Reach > to descend';
