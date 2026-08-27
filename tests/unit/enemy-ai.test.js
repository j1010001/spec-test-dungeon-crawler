import { describe, it, expect } from 'vitest';
import { TILE_STAIRS } from '../../src/constants.js';
import { tileIndex, chebyshev } from '../../src/dungeon.js';
import { movePlayer, enemyTurn } from '../../src/game.js';
import { makeGame, arenaSpec, goblin, stubRng } from './helpers.js';

describe('activated pursuit: greedy step with wall-sliding (FR-022, Session 2026-06-23)', () => {
  it('steps diagonally toward the player when the diagonal is free', () => {
    const g = makeGame(() => arenaSpec({ enemies: [goblin(16, 16, 0, { activated: true })] }));
    enemyTurn(g); // player at (12,12)
    expect([g.enemies[0].x, g.enemies[0].y]).toEqual([15, 15]);
  });

  it('steps cardinally when aligned with the player', () => {
    const g = makeGame(() => arenaSpec({ enemies: [goblin(16, 12, 0, { activated: true })] }));
    enemyTurn(g);
    expect([g.enemies[0].x, g.enemies[0].y]).toEqual([15, 12]);
  });

  it('slides around a non-walkable tile when the preferred step is blocked', () => {
    // Two-row room; the staircase (non-walkable for enemies) blocks the
    // preferred straight step, so the enemy slides to the adjacent open tile.
    const g = makeGame(() =>
      arenaSpec({
        rooms: [{ x: 5, y: 5, w: 15, h: 2 }], // rows y=5,6
        spawn: { x: 6, y: 5 },
        stairs: { x: 11, y: 5 },
        enemies: [goblin(12, 5, 0, { activated: true })],
      })
    );
    // player (6,5), enemy (12,5): preferred (11,5) is the staircase → blocked;
    // wall-slide takes the diagonal (11,6) instead.
    enemyTurn(g);
    expect([g.enemies[0].x, g.enemies[0].y]).toEqual([11, 6]);
  });

  it('when adjacent (including diagonally) it attacks and does not move', () => {
    const g = makeGame(() => arenaSpec({ enemies: [goblin(13, 13, 0, { activated: true })] }));
    const hp = g.player.hp;
    enemyTurn(g);
    expect([g.enemies[0].x, g.enemies[0].y]).toEqual([13, 13]);
    expect(g.player.hp).toBe(hp - 4);
  });

  it('never steps onto the staircase tile (Session 2026-06-26)', () => {
    // 1-wide corridor room with stairs between enemy and player
    const g = makeGame(() =>
      arenaSpec({
        rooms: [{ x: 5, y: 12, w: 15, h: 1 }],
        spawn: { x: 6, y: 12 },
        stairs: { x: 10, y: 12 },
        enemies: [goblin(14, 12, 0, { activated: true })],
      })
    );
    for (let i = 0; i < 5; i++) {
      enemyTurn(g);
      const e = g.enemies[0];
      expect(g.tiles[tileIndex(e.x, e.y)]).not.toBe(TILE_STAIRS);
    }
    // enemy is stuck behind the stairs (walls block sliding in a 1-wide corridor)
    expect(g.enemies[0].x).toBeGreaterThan(10);
  });

  it('pursues indefinitely, leaving its spawn room (Session 2026-06-26)', () => {
    const spec = {
      rooms: [
        { x: 5, y: 5, w: 5, h: 5 },   // room 0: player spawn
        { x: 20, y: 5, w: 5, h: 5 },  // room 1: enemy home
      ],
      corridorTiles: Array.from({ length: 10 }, (_, i) => [10 + i, 7]),
      spawn: { x: 7, y: 7 },
      spawnRoom: 0,
      stairs: { x: 5, y: 5 },
      stairsRoom: 0,
      enemies: [goblin(22, 7, 1, { activated: true })],
    };
    const g = makeGame(() => spec);
    for (let i = 0; i < 15; i++) enemyTurn(g);
    const e = g.enemies[0];
    // enemy has crossed the corridor out of room 1 and reached the player's side
    expect(e.x).toBeLessThan(20);
    expect(chebyshev(e.x, e.y, g.player.x, g.player.y)).toBeLessThanOrEqual(1);
  });

  it('ignores floor items while moving (Edge Case)', () => {
    const g = makeGame(() =>
      arenaSpec({
        enemies: [goblin(16, 12, 0, { activated: true })],
        items: [{ kind: 'potion', name: 'Potion', glyph: '!', value: 15, x: 15, y: 12 }],
      })
    );
    enemyTurn(g);
    expect([g.enemies[0].x, g.enemies[0].y]).toEqual([15, 12]); // walked onto the item tile
    expect(g.items).toHaveLength(1); // item untouched
    enemyTurn(g);
    expect(g.items).toHaveLength(1);
  });
});

describe('collision: iteration order, one enemy per tile (FR-026, Edge Case)', () => {
  it('when two enemies target the same tile, the first moves and the second stays', () => {
    // player at (12,12); enemies at (14,11) and (14,13) both want (13,12)
    const g = makeGame(() =>
      arenaSpec({
        enemies: [
          goblin(14, 11, 0, { activated: true }),
          goblin(14, 13, 0, { activated: true }),
        ],
      })
    );
    enemyTurn(g);
    const a = g.enemies[0];
    const b = g.enemies[1];
    expect(`${a.x},${a.y}`).not.toBe(`${b.x},${b.y}`);
    expect([a.x, a.y]).toEqual([13, 12]); // first in iteration order wins the tile
  });

  it('one enemy per tile holds across many turns', () => {
    const g = makeGame(() =>
      arenaSpec({
        enemies: [
          goblin(15, 10, 0, { activated: true, hp: 500 }),
          goblin(15, 12, 0, { activated: true, hp: 500 }),
          goblin(15, 14, 0, { activated: true, hp: 500 }),
          goblin(17, 12, 0, { activated: true, hp: 500 }),
        ],
      })
    );
    g.player.hp = 10000;
    g.player.maxHp = 10000;
    for (let t = 0; t < 25; t++) {
      enemyTurn(g);
      const tilesUsed = new Set(g.enemies.map((e) => `${e.x},${e.y}`));
      expect(tilesUsed.size).toBe(g.enemies.length);
    }
  });
});

describe('idle patrol before activation (R103, Session 2026-06-26)', () => {
  function patrolSpec() {
    return {
      rooms: [
        { x: 5, y: 5, w: 5, h: 5 },    // room 0: player spawn
        { x: 30, y: 30, w: 6, h: 6 },  // room 1: patrol room
      ],
      corridorTiles: [],
      spawn: { x: 7, y: 7 },
      spawnRoom: 0,
      stairs: { x: 32, y: 32 },
      stairsRoom: 1,
      enemies: [goblin(31, 31, 1, { activated: false })],
    };
  }

  it('unactivated enemy wanders only inside its spawn room, never on stairs', () => {
    const g = makeGame(patrolSpec, 77);
    const room = g.rooms[1];
    for (let t = 0; t < 60; t++) {
      enemyTurn(g);
      const e = g.enemies[0];
      expect(e.x).toBeGreaterThanOrEqual(room.x);
      expect(e.x).toBeLessThan(room.x + room.w);
      expect(e.y).toBeGreaterThanOrEqual(room.y);
      expect(e.y).toBeLessThan(room.y + room.h);
      expect(g.tiles[tileIndex(e.x, e.y)]).not.toBe(TILE_STAIRS);
    }
  });

  it('unactivated enemy moves at most one tile per turn', () => {
    const g = makeGame(patrolSpec, 78);
    let [px, py] = [g.enemies[0].x, g.enemies[0].y];
    for (let t = 0; t < 30; t++) {
      enemyTurn(g);
      const e = g.enemies[0];
      expect(chebyshev(e.x, e.y, px, py)).toBeLessThanOrEqual(1);
      [px, py] = [e.x, e.y];
    }
  });

  it('unactivated enemy neither pursues nor attacks the player', () => {
    const spec = patrolSpec();
    spec.enemies = [goblin(31, 31, 1, { activated: false })];
    spec.spawn = { x: 29, y: 31 }; // adjacent to the room but OUTSIDE it (wall between? x=29 < room.x=30)
    const g = makeGame(() => spec, 79);
    const hp = g.player.hp;
    for (let t = 0; t < 10; t++) enemyTurn(g);
    expect(g.player.hp).toBe(hp);
  });
});

describe('room-wide aggro on entry (R103)', () => {
  function aggroSpec() {
    return {
      rooms: [
        { x: 5, y: 10, w: 5, h: 5 },   // room 0: spawn
        { x: 15, y: 10, w: 7, h: 7 },  // room 1: enemy room, entered from the left
        { x: 40, y: 40, w: 5, h: 5 },  // room 2: far room, stays dormant
      ],
      corridorTiles: [
        [10, 12], [11, 12], [12, 12], [13, 12], [14, 12],
      ],
      spawn: { x: 7, y: 12 },
      spawnRoom: 0,
      stairs: { x: 41, y: 41 },
      stairsRoom: 2,
      enemies: [
        goblin(18, 12, 1, { activated: false }),
        goblin(20, 14, 1, { activated: false }),
        goblin(42, 42, 2, { activated: false }),
      ],
    };
  }

  it('every enemy in the room activates the moment the player steps into the room', () => {
    const g = makeGame(aggroSpec, 5);
    // walk right along y=12 from (7,12) until entering room 1 at x=15
    for (let i = 0; i < 8; i++) movePlayer(g, 1, 0);
    expect(g.player.x).toBe(15);
    expect(g.enemies[0].activated).toBe(true);
    expect(g.enemies[1].activated).toBe(true); // activation is room-wide, not adjacency-based
    expect(g.enemies[2].activated).toBe(false); // other rooms remain dormant
  });

  it('enemies do not activate while the player is still in the corridor', () => {
    const g = makeGame(aggroSpec, 5);
    for (let i = 0; i < 7; i++) movePlayer(g, 1, 0); // (14,12): corridor mouth
    expect(g.player.x).toBe(14);
    expect(g.enemies[0].activated).toBe(false);
    expect(g.enemies[1].activated).toBe(false);
  });
});
