// Fog-of-war (FR-002, FR-003, R100): pure Chebyshev radius-5 sight.
// Visibility per tile: LIT within radius, DIM if previously visited but out
// of radius, HIDDEN if never visited. Visited state is per-floor and resets
// on descent (FR-003).

import { GRID_W, GRID_H, SIGHT_RADIUS, VIS, chebyshev } from './constants.js';

export function makeVisited() {
  return new Uint8Array(GRID_W * GRID_H);
}

// Marks tiles within the sight radius of (px, py) as visited.
export function markVisible(visited, px, py) {
  const x0 = Math.max(0, px - SIGHT_RADIUS);
  const x1 = Math.min(GRID_W - 1, px + SIGHT_RADIUS);
  const y0 = Math.max(0, py - SIGHT_RADIUS);
  const y1 = Math.min(GRID_H - 1, py + SIGHT_RADIUS);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) visited[y * GRID_W + x] = 1;
  }
}

// Visibility state of tile (x, y) given player position and visited map.
export function visibilityAt(visited, px, py, x, y) {
  if (chebyshev(px, py, x, y) <= SIGHT_RADIUS) return VIS.LIT;
  return visited[y * GRID_W + x] ? VIS.DIM : VIS.HIDDEN;
}

export function isLit(px, py, x, y) {
  return chebyshev(px, py, x, y) <= SIGHT_RADIUS;
}
