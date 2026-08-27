// Combat: FR-007 (bump attack), FR-021 (damage formula), FR-022 (greedy
// step + wall-sliding + adjacent attack), FR-026 (iteration-order collision,
// pursuit AND patrol), R103 (aggro/patrol), US2 scenarios, SC-003.
import { describe, it, expect } from 'vitest';
import { Game } from '../src/game.js';
import { GRID_W, GRID_H, TILE, damage } from '../src/constants.js';
import { makeEnemy } from '../src/dungeon.js';
import { makeVisited } from '../src/fov.js';

function testGame() {
  return new Game({ explicitSeed: 99999 });
}

// Replace the current floor with a handcrafted micro-arena. `floorCells` is
// a list of [x, y]; everything else is wall. Rooms optional (for patrol).
function customArena(g, floorCells, { rooms = [], playerAt, stairsAt = null } = {}) {
  const tiles = [];
  for (let y = 0; y < GRID_H; y++) tiles.push(new Array(GRID_W).fill(TILE.WALL));
  for (const [x, y] of floorCells) tiles[y][x] = TILE.FLOOR;
  if (stairsAt) tiles[stairsAt[1]][stairsAt[0]] = TILE.STAIRS;
  g.floorData = {
    tiles,
    rooms,
    startRoomIndex: 0,
    stairsRoomIndex: 0,
    playerStart: { x: playerAt[0], y: playerAt[1] },
    stairsPos: stairsAt ? { x: stairsAt[0], y: stairsAt[1] } : { x: 0, y: 0 },
    items: [],
    enemies: [],
  };
  g.visited = makeVisited();
  g.player.x = playerAt[0];
  g.player.y = playerAt[1];
}

function addEnemy(g, x, y, { activated = true, roomIndex = 0 } = {}) {
  const e = makeEnemy(g.player.floor, x, y, roomIndex);
  e.activated = activated;
  g.floorData.enemies.push(e);
  return e;
}

// Drives the player one greedy step toward the nearest living enemy
// (bumping when adjacent). Returns after the step.
function stepTowardNearestEnemy(g) {
  const p = g.player;
  let best = null;
  let bestD = Infinity;
  for (const e of g.floorData.enemies) {
    const d = Math.max(Math.abs(e.x - p.x), Math.abs(e.y - p.y));
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  if (!best) return;
  g.step(Math.sign(best.x - p.x), Math.sign(best.y - p.y));
}

describe('damage formula (FR-021)', () => {
  it('is max(1, attack - defense), deterministic, minimum 1', () => {
    expect(damage(5, 1)).toBe(4);
    expect(damage(5, 5)).toBe(1);
    expect(damage(1, 100)).toBe(1);
    expect(damage(10, 3)).toBe(7);
  });
});

describe('player bump-attack (FR-007, US2-AS2)', () => {
  it('moving into an enemy damages it and the player stays in place', () => {
    const g = testGame();
    const row = Array.from({ length: 7 }, (_, i) => [8 + i, 10]);
    customArena(g, row, { playerAt: [10, 10] });
    const e = addEnemy(g, 11, 10);
    const hpBefore = e.hp;
    g.step(1, 0);
    expect(e.hp).toBe(hpBefore - 4); // 5 ATK - 1 DEF
    expect(g.player.x).toBe(10); // did not move onto the tile
    expect(g.player.y).toBe(10);
    expect(g.log.some((l) => l.includes('You hit Goblin for 4'))).toBe(true);
  });

  it('a killed enemy is removed from the map and counted (US2-AS5)', () => {
    const g = testGame();
    customArena(g, [[10, 10], [11, 10]], { playerAt: [10, 10] });
    const e = addEnemy(g, 11, 10);
    e.hp = 4; // one hit kills
    g.rng.chance = () => false; // suppress the drop roll for this test
    g.step(1, 0);
    expect(g.floorData.enemies.length).toBe(0);
    expect(g.enemiesDefeated).toBe(1);
  });

  it('a dead enemy drops a random item on its tile when the 25% roll succeeds', () => {
    const g = testGame();
    customArena(g, [[10, 10], [11, 10]], { playerAt: [10, 10] });
    const e = addEnemy(g, 11, 10);
    e.hp = 1;
    g.rng.chance = () => true; // force the 25% roll
    g.step(1, 0);
    expect(g.floorData.items.length).toBe(1);
    const item = g.floorData.items[0];
    expect(item.x).toBe(11);
    expect(item.y).toBe(10);
    // drop uses the floor formulas (Key Entities)
    const floor = g.player.floor;
    if (item.kind === 'potion') expect(item.value).toBe(10 + floor * 5);
    else {
      expect(item.value).toBeGreaterThanOrEqual(floor);
      expect(item.value).toBeLessThanOrEqual(floor + 2);
    }
  });

  it('no drop happens when the 25% roll fails', () => {
    const g = testGame();
    customArena(g, [[10, 10], [11, 10]], { playerAt: [10, 10] });
    const e = addEnemy(g, 11, 10);
    e.hp = 1;
    g.rng.chance = () => false;
    g.step(1, 0);
    expect(g.floorData.items.length).toBe(0);
  });

  it('no drop lands on a tile that already holds an item (FR-025)', () => {
    const g = testGame();
    customArena(g, [[10, 10], [11, 10]], { playerAt: [10, 10] });
    const e = addEnemy(g, 11, 10);
    e.hp = 1;
    g.floorData.items.push({ kind: 'potion', value: 15, glyph: '!', name: 'P', x: 11, y: 10 });
    g.rng.chance = () => true;
    g.step(1, 0);
    expect(g.floorData.items.length).toBe(1); // still just the original item
  });
});

describe('enemy turn: adjacent attack (FR-022, US2-AS3)', () => {
  it('an activated enemy adjacent at the start of its turn attacks and does not move', () => {
    const g = testGame();
    const row = Array.from({ length: 5 }, (_, i) => [9 + i, 10]);
    customArena(g, row, { playerAt: [10, 10] });
    const e = addEnemy(g, 12, 10);
    const hpBefore = g.player.hp;
    g.step(1, 0); // player -> (11,10): now adjacent to the enemy
    expect(g.player.hp).toBe(hpBefore - 4); // goblin atk 5 - def 1 = 4
    expect([e.x, e.y]).toEqual([12, 10]); // attacked instead of moving
    expect(g.log.some((l) => l.includes('Goblin hits you for 4'))).toBe(true);
  });

  it('enemy damage respects equipped armor (FR-005 effective defense)', () => {
    const g = testGame();
    customArena(g, [[9, 10], [10, 10], [11, 10]], { playerAt: [10, 10] });
    addEnemy(g, 11, 10);
    g.player.armor = { kind: 'armor', value: 2, glyph: ']', name: 'Armor (+2 DEF)' };
    const hpBefore = g.player.hp;
    g.step(1, 0); // bump the enemy; it responds
    expect(g.player.hp).toBe(hpBefore - Math.max(1, 5 - 3)); // 5 atk vs 3 def
  });

  it('player attack respects equipped weapon (FR-005 effective attack)', () => {
    const g = testGame();
    customArena(g, [[9, 10], [10, 10], [11, 10]], { playerAt: [10, 10] });
    const e = addEnemy(g, 11, 10);
    g.player.weapon = { kind: 'weapon', value: 3, glyph: '/', name: 'Weapon (+3 ATK)' };
    g.step(1, 0);
    expect(e.hp).toBe(e.maxHp - Math.max(1, 8 - 1)); // (5+3) atk vs 1 def
  });
});

describe('enemy pursuit: greedy step with wall-sliding (FR-022)', () => {
  function openArena(g, playerAt) {
    const cells = [];
    for (let x = 8; x <= 16; x++) for (let y = 8; y <= 16; y++) cells.push([x, y]);
    customArena(g, cells, { playerAt });
  }

  it('prefers the diagonal step toward the player when both axes differ', () => {
    const g = testGame();
    openArena(g, [14, 12]);
    const e = addEnemy(g, 10, 10);
    g.step(0, 1); // player -> (14,13); enemy turn follows
    expect([e.x, e.y]).toEqual([11, 11]);
  });

  it('slides along the primary axis when the diagonal is blocked', () => {
    const g = testGame();
    openArena(g, [14, 12]);
    g.floorData.tiles[11][11] = TILE.WALL; // block (11,11)
    const e = addEnemy(g, 10, 10);
    g.step(0, 1); // player -> (14,13): |dx|=4 > |dy|=3 => primary axis x
    expect([e.x, e.y]).toEqual([11, 10]);
  });

  it('falls back to the secondary axis when diagonal and primary are blocked', () => {
    const g = testGame();
    openArena(g, [14, 12]);
    g.floorData.tiles[11][11] = TILE.WALL; // block (11,11)
    g.floorData.tiles[10][11] = TILE.WALL; // block (11,10)
    const e = addEnemy(g, 10, 10);
    g.step(0, 1);
    expect([e.x, e.y]).toEqual([10, 11]); // secondary axis (y)
  });

  it('slides diagonally around a wall when the straight step is blocked', () => {
    const g = testGame();
    // row y=10 with a wall gap at (11,10); slide tile above at (11,9)
    customArena(g, [[10, 10], [12, 10], [13, 10], [14, 10], [15, 10], [11, 9]], {
      playerAt: [14, 10],
    });
    const e = addEnemy(g, 10, 10);
    g.step(1, 0); // player -> (15,10), same row (dy stays 0)
    expect([e.x, e.y]).toEqual([11, 9]); // slid around the wall
  });

  it('stays in place when no viable move exists', () => {
    const g = testGame();
    customArena(g, [[10, 10], [14, 10]], { playerAt: [14, 10] });
    const e = addEnemy(g, 10, 10); // fully walled in
    g._enemyTurns();
    expect([e.x, e.y]).toEqual([10, 10]);
  });

  it('never steps onto the staircase tile (clarification 2026-06-26)', () => {
    const g = testGame();
    // straight corridor: the only path to the player crosses the stairs
    customArena(g, [[10, 10], [12, 10], [13, 10]], {
      playerAt: [13, 10],
      stairsAt: [11, 10],
    });
    const e = addEnemy(g, 10, 10);
    g._enemyTurns();
    expect([e.x, e.y]).toEqual([10, 10]); // stairs are non-walkable for enemies
  });
});

describe('iteration-order collision (FR-026)', () => {
  it('pursuit: first enemy claims the contested tile, second stays in place', () => {
    const g = testGame();
    // Both enemies' preferred (and only viable) step is (11,10).
    customArena(g, [[10, 9], [10, 11], [11, 10], [12, 10], [13, 10]], { playerAt: [12, 10] });
    const first = addEnemy(g, 10, 9);
    const second = addEnemy(g, 10, 11);
    g.step(1, 0); // player -> (13,10), still out of reach
    expect([first.x, first.y]).toEqual([11, 10]); // first in iteration order wins
    // second: diagonal (11,10) claimed; primary (11,11) wall; secondary
    // (10,10) wall => blocked everywhere => stays
    expect([second.x, second.y]).toEqual([10, 11]);
  });

  it('patrol: collision resolution applies to idle patrol too (FR-026)', () => {
    const g = testGame();
    const strip = { x: 10, y: 10, w: 3, h: 1 }; // 3-tile room, 1 free tile
    customArena(g, [[10, 10], [11, 10], [12, 10], [20, 20]], {
      rooms: [strip, { x: 20, y: 20, w: 1, h: 1 }],
      playerAt: [20, 20],
    });
    const a = addEnemy(g, 10, 10, { activated: false, roomIndex: 0 });
    const b = addEnemy(g, 12, 10, { activated: false, roomIndex: 0 });
    g._enemyTurns();
    // a (first in iteration order) takes the only free tile (11,10);
    // b then has no options and MUST stay — tile stacking never permitted
    expect([a.x, a.y]).toEqual([11, 10]);
    expect([b.x, b.y]).toEqual([12, 10]);
  });

  it('one enemy per tile is enforced across many mixed pursuit turns', () => {
    const g = testGame();
    const cells = [];
    for (let x = 8; x <= 20; x++) for (let y = 8; y <= 20; y++) cells.push([x, y]);
    customArena(g, cells, { playerAt: [14, 14] });
    for (const [x, y] of [[8, 8], [9, 8], [8, 9], [20, 20], [19, 20], [20, 19]]) addEnemy(g, x, y);
    for (let i = 0; i < 15 && g.mode === 'play'; i++) {
      g.step(i % 2 === 0 ? 1 : -1, 0);
      const keys = new Set(g.floorData.enemies.map((e) => `${e.x},${e.y}`));
      expect(keys.size).toBe(g.floorData.enemies.length);
    }
  });
});

describe('patrol & aggro (R103)', () => {
  it('unactivated enemies wander only inside their spawn room and never attack', () => {
    const g = testGame();
    const room = { x: 10, y: 10, w: 4, h: 4 };
    const cells = [[20, 20]];
    for (let x = 10; x <= 13; x++) for (let y = 10; y <= 13; y++) cells.push([x, y]);
    // extra floor outside the room — patrol must never use it
    for (let x = 14; x <= 16; x++) cells.push([x, 11]);
    customArena(g, cells, {
      rooms: [room, { x: 20, y: 20, w: 1, h: 1 }],
      playerAt: [20, 20],
    });
    const e = addEnemy(g, 11, 11, { activated: false, roomIndex: 0 });
    const hpStart = g.player.hp;
    let moved = false;
    let prev = [e.x, e.y];
    for (let i = 0; i < 20; i++) {
      g._enemyTurns();
      if (e.x !== prev[0] || e.y !== prev[1]) moved = true;
      prev = [e.x, e.y];
      expect(e.activated).toBe(false);
      expect(e.x).toBeGreaterThanOrEqual(room.x);
      expect(e.x).toBeLessThan(room.x + room.w);
      expect(e.y).toBeGreaterThanOrEqual(room.y);
      expect(e.y).toBeLessThan(room.y + room.h);
    }
    expect(moved).toBe(true); // idle patrol really moves (one tile per turn)
    expect(g.player.hp).toBe(hpStart); // and never attacks before activation
  });

  it('seed-99999 test-dungeon enemies hold position until activated (FR-039 determinism)', () => {
    const g = testGame(); // Room B goblin must stay in sight of the entrance
    const goblin = g.floorData.enemies.find((e) => e.roomIndex === 1);
    const spawn = [goblin.x, goblin.y];
    for (let i = 0; i < 12; i++) g.step(i % 2 === 0 ? 1 : -1, 0); // turns pass
    expect([goblin.x, goblin.y]).toEqual(spawn);
    expect(goblin.activated).toBe(false);
  });

  it('patrolling enemies pass over floor items without consuming them', () => {
    const g = testGame();
    const strip = { x: 10, y: 10, w: 2, h: 1 };
    customArena(g, [[10, 10], [11, 10], [20, 20]], {
      rooms: [strip, { x: 20, y: 20, w: 1, h: 1 }],
      playerAt: [20, 20],
    });
    const item = { kind: 'potion', value: 15, glyph: '!', name: 'P', x: 11, y: 10 };
    g.floorData.items.push(item);
    addEnemy(g, 10, 10, { activated: false, roomIndex: 0 });
    for (let i = 0; i < 8; i++) g._enemyTurns();
    expect(g.floorData.items).toContain(item); // item untouched (clarification)
  });

  it('room-wide aggro: ALL enemies in a room activate the moment the player enters', () => {
    const g = testGame();
    for (let i = 0; i < 12; i++) g.step(0, 1); // walk down; Room C entered at y=52
    expect(g.player.y).toBe(52);
    const roomCEnemies = g.floorData.enemies.filter((e) => e.roomIndex === 2);
    expect(roomCEnemies.length).toBe(3);
    for (const e of roomCEnemies) expect(e.activated).toBe(true);
    // Room B goblin (room never entered) is still dormant
    expect(g.floorData.enemies.find((e) => e.roomIndex === 1).activated).toBe(false);
  });

  it('activated enemies pursue indefinitely — they follow the player out of the room', () => {
    const g = testGame();
    for (let i = 0; i < 12; i++) g.step(0, 1); // enter Room C
    const chasers = g.floorData.enemies.filter((e) => e.roomIndex === 2);
    for (let i = 0; i < 10 && g.mode === 'play'; i++) g.step(0, -1); // retreat
    for (const e of chasers) expect(e.activated).toBe(true);
    expect(chasers.some((e) => e.y < 52)).toBe(true); // left Room C's bounds
  });
});

describe('full combat loops (US2, SC-003, FR-039 balance)', () => {
  it('the Room B goblin is killable — the player wins with HP remaining (FR-039)', () => {
    const g = testGame();
    for (let i = 0; i < 12; i++) g.step(1, 0); // walk right into Room B
    let guard = 0;
    while (g.floorData.enemies.some((e) => e.roomIndex === 1) && g.mode === 'play' && guard++ < 40) {
      stepTowardNearestEnemy(g);
    }
    expect(g.mode).toBe('play');
    expect(g.player.hp).toBeGreaterThan(0);
    expect(g.enemiesDefeated).toBe(1);
    expect(g.floorData.enemies.filter((e) => e.roomIndex === 1).length).toBe(0);
  });

  it('single-enemy combat resolves within 20 turns (SC-003)', () => {
    const g = testGame();
    const goblin = g.floorData.enemies.find((e) => e.roomIndex === 1);
    // fast-forward the approach: park the player adjacent to the goblin
    g.player.x = goblin.x - 1;
    g.player.y = goblin.y;
    let turns = 0;
    while (g.floorData.enemies.includes(goblin) && g.mode === 'play' && turns < 25) {
      stepTowardNearestEnemy(g);
      turns++;
    }
    expect(turns).toBeLessThanOrEqual(20);
    expect(g.floorData.enemies.includes(goblin)).toBe(false);
    expect(g.mode).toBe('play'); // no state inconsistency; player alive
  });

  it('the three Room C goblins defeat the player — game over with stats (US2-AS4, FR-008)', () => {
    const g = testGame();
    for (let i = 0; i < 12; i++) g.step(0, 1); // enter Room C
    let guard = 0;
    while (g.mode === 'play' && guard++ < 40) stepTowardNearestEnemy(g);
    expect(g.mode).toBe('gameover');
    expect(g.player.hp).toBeLessThanOrEqual(0);
    expect(g.player.floor).toBe(1); // floor reached — shown on the screen
    expect(g.seed).toBe(99999); // seed — shown on the screen (FR-038)
  });

  it('restart (R) starts a fresh run from floor 1 with base stats (FR-008)', () => {
    const g = testGame();
    for (let i = 0; i < 12; i++) g.step(0, 1);
    let guard = 0;
    while (g.mode === 'play' && guard++ < 40) stepTowardNearestEnemy(g);
    expect(g.mode).toBe('gameover');
    g.restart();
    expect(g.mode).toBe('play');
    expect(g.player.floor).toBe(1);
    expect(g.player.hp).toBe(20);
    expect(g.player.maxHp).toBe(20);
    expect(g.attack).toBe(5);
    expect(g.defense).toBe(1);
    expect(g.player.inventory.length).toBe(0);
    expect(g.enemiesDefeated).toBe(0);
    expect(g.seed).toBe(99999); // explicit URL seed is reused on restart
    expect(g.floorData.rooms.length).toBe(4); // test dungeon regenerated
  });
});
