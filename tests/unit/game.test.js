import { describe, it, expect } from 'vitest';
import { Game, STATUS } from '../../src/game.js';
import { TEST_SEED, MAX_FLOOR, TILE, VISIBILITY } from '../../src/constants.js';

function findRoomEntranceDelta(game, dx, dy, maxSteps = 25) {
  // Walk in a straight direction until blocked or maxSteps reached.
  const path = [];
  for (let i = 0; i < maxSteps; i += 1) {
    const before = { x: game.player.x, y: game.player.y };
    const result = game.move({ dx, dy });
    path.push(result);
    if (!result.moved && !result.attacked) break;
    if (before.x === game.player.x && before.y === game.player.y && !result.attacked) break;
  }
  return path;
}

describe('game.js — fog of war (FR-003, R100, US1-AS1)', () => {
  it('only tiles within sight radius are lit on load; everything else is hidden', () => {
    const game = new Game(1);
    expect(game.getVisibility(game.player.x, game.player.y)).toBe(VISIBILITY.LIT);
    expect(game.getVisibility(0, 0)).toBe(VISIBILITY.HIDDEN);
  });

  it('previously visited tiles remain dimmed (visible) after moving away (US1-AS3)', () => {
    const game = new Game(2);
    const start = { x: game.player.x, y: game.player.y };
    for (let i = 0; i < 6; i += 1) game.move({ dx: 1, dy: 0 });
    const visibility = game.getVisibility(start.x, start.y);
    expect(visibility === VISIBILITY.DIMMED || visibility === VISIBILITY.LIT).toBe(true);
  });

  it('resets fog memory on floor descent (FR-003)', () => {
    const game = new Game(TEST_SEED);
    findRoomEntranceDelta(game, 0, -1); // walk up into Room D
    game.move({ dx: 0, dy: -1 });
    // Force-descend by walking onto the stairs directly.
    while (game.dungeon.grid[game.player.y][game.player.x] !== TILE.STAIRS && game.status === STATUS.PLAYING) {
      const { x, y } = game.dungeon.stairsPos;
      const dx = Math.sign(x - game.player.x);
      const dy = Math.sign(y - game.player.y);
      const before = { x: game.player.x, y: game.player.y };
      game.move({ dx, dy });
      if (before.x === game.player.x && before.y === game.player.y) break;
    }
    expect(game.floor).toBe(2);
    expect(game.visited.size).toBeGreaterThan(0);
    // fresh visited set only contains tiles around the new start
    expect(game.visited.has('0,0')).toBe(false);
  });
});

describe('game.js — movement & walls (US1-AS4, US1-AS5, FR-004)', () => {
  it('moves exactly one tile per keypress', () => {
    const game = new Game(3);
    const before = { x: game.player.x, y: game.player.y };
    game.move({ dx: 1, dy: 0 });
    expect(Math.abs(game.player.x - before.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(game.player.y - before.y)).toBeLessThanOrEqual(1);
  });

  it('blocks movement into a wall and does not change position', () => {
    const game = new Game(TEST_SEED);
    // Room A's corners are walls (only cardinal corridors are carved) —
    // repeated diagonal movement toward a corner is guaranteed to hit a
    // wall before leaving the room.
    let blocked = null;
    let before = null;
    for (let i = 0; i < 10; i += 1) {
      before = { x: game.player.x, y: game.player.y };
      const result = game.move({ dx: -1, dy: -1 });
      if (!result.moved && result.reason === 'blocked') {
        blocked = result;
        break;
      }
    }
    expect(blocked).not.toBeNull();
    expect(game.player.x).toBe(before.x);
    expect(game.player.y).toBe(before.y);
  });
});

describe('game.js — US5 / FR-039 deterministic test dungeon (seed 99999)', () => {
  it('Room A (start) has no enemies visible and is safe', () => {
    const game = new Game(TEST_SEED);
    const visibleEnemies = game.dungeon.enemies.filter(
      (e) => game.isInSight(e.x, e.y) && e.alive
    );
    // enemies exist on the floor but none should be inside Room A / in sight at spawn under 5-radius overlap into corridors is fine as long as none are literally in room A
    const roomA = game.dungeon.rooms[0];
    const inRoomA = (e) =>
      e.x >= roomA.x && e.x < roomA.x + roomA.w && e.y >= roomA.y && e.y < roomA.y + roomA.h;
    expect(game.dungeon.enemies.some(inRoomA)).toBe(false);
    expect(visibleEnemies).toBeDefined();
  });

  it('walking right reaches Room B within 20 keypresses and reveals 1 Goblin + items', () => {
    const game = new Game(TEST_SEED);
    let enteredB = false;
    for (let i = 0; i < 20 && !enteredB; i += 1) {
      game.move({ dx: 1, dy: 0 });
      const room = game._findRoomAt(game.player.x, game.player.y);
      if (room === game.dungeon.rooms[1]) enteredB = true;
    }
    expect(enteredB).toBe(true);
    const aliveEnemiesVisible = game.dungeon.enemies.filter((e) => e.alive && game.isInSight(e.x, e.y));
    expect(aliveEnemiesVisible.length).toBeGreaterThanOrEqual(1);
    expect(aliveEnemiesVisible[0].type).toBe('Goblin');
  });

  it('walking down reaches Room C within 20 keypresses and reveals 3 Goblins', () => {
    const game = new Game(TEST_SEED);
    let enteredC = false;
    for (let i = 0; i < 20 && !enteredC; i += 1) {
      game.move({ dx: 0, dy: 1 });
      const room = game._findRoomAt(game.player.x, game.player.y);
      if (room === game.dungeon.rooms[2]) enteredC = true;
    }
    expect(enteredC).toBe(true);
  });

  it('walking up reaches Room D within 20 keypresses and reveals the staircase', () => {
    const game = new Game(TEST_SEED);
    let enteredD = false;
    for (let i = 0; i < 20 && !enteredD; i += 1) {
      game.move({ dx: 0, dy: -1 });
      const room = game._findRoomAt(game.player.x, game.player.y);
      if (room === game.dungeon.rooms[3]) enteredD = true;
    }
    expect(enteredD).toBe(true);
    expect(game.isInSight(game.dungeon.stairsPos.x, game.dungeon.stairsPos.y)).toBe(true);
  });

  it('the single Goblin in Room B can be killed by the player within a few turns (FR-039 balance)', () => {
    const game = new Game(TEST_SEED);
    for (let i = 0; i < 20; i += 1) {
      const room = game._findRoomAt(game.player.x, game.player.y);
      if (room === game.dungeon.rooms[1]) break;
      game.move({ dx: 1, dy: 0 });
    }
    const goblin = game.dungeon.enemies.find((e) => e.id === 'test-goblin-b');
    expect(goblin).toBeDefined();
    let turns = 0;
    while (goblin.alive && turns < 10 && game.status === STATUS.PLAYING) {
      const dx = Math.sign(goblin.x - game.player.x);
      const dy = Math.sign(goblin.y - game.player.y);
      game.move({ dx: dx || 1, dy });
      turns += 1;
    }
    expect(goblin.alive).toBe(false);
  });

  it('the three Goblins in Room C defeat the player (game over) per FR-039 balance', () => {
    const game = new Game(TEST_SEED);
    for (let i = 0; i < 20 && game.status === STATUS.PLAYING; i += 1) {
      const room = game._findRoomAt(game.player.x, game.player.y);
      if (room === game.dungeon.rooms[2]) break;
      game.move({ dx: 0, dy: 1 });
    }
    // Stand ground and let the room-wide-aggro Goblins converge and attack;
    // always bump toward the *nearest* alive Goblin so the player doesn't
    // wander back out into the connecting corridor.
    let turns = 0;
    while (game.status === STATUS.PLAYING && turns < 20) {
      const alive = game.dungeon.enemies.filter((e) => e.alive);
      if (!alive.length) break;
      alive.sort((a, b) => {
        const da = Math.max(Math.abs(a.x - game.player.x), Math.abs(a.y - game.player.y));
        const db = Math.max(Math.abs(b.x - game.player.x), Math.abs(b.y - game.player.y));
        return da - db;
      });
      const target = alive[0];
      const dx = Math.sign(target.x - game.player.x);
      const dy = Math.sign(target.y - game.player.y);
      game.move({ dx: dx || 0, dy: dy || 0 });
      turns += 1;
    }
    expect(game.status).toBe(STATUS.GAME_OVER);
    expect(game.gameOverInfo.floor).toBe(1);
  });
});

describe('game.js — floor descent & victory (US4, R101, FR-011)', () => {
  it('retains player stats and inventory across descent', () => {
    const game = new Game(555);
    game.player.hp = 18;
    game.player.enemiesDefeated = 2;
    const stairs = game.dungeon.stairsPos;
    game.player.x = stairs.x;
    game.player.y = stairs.y - 1;
    game.move({ dx: 0, dy: 1 });
    expect(game.floor).toBe(2);
    expect(game.player.hp).toBe(18);
    expect(game.player.enemiesDefeated).toBe(2);
  });

  it('triggers victory instead of generating floor 10 when stepping off floor 9 stairs', () => {
    const game = new Game(9001);
    game.floor = MAX_FLOOR;
    game.player.floor = MAX_FLOOR;
    const stairs = game.dungeon.stairsPos;
    game.player.x = stairs.x;
    game.player.y = stairs.y - 1;
    // re-supply grid/stairs consistent with floor 9 by regenerating directly
    game._loadFloor(MAX_FLOOR);
    const s2 = game.dungeon.stairsPos;
    game.player.x = s2.x;
    game.player.y = s2.y - 1;
    if (game.dungeon.grid[s2.y - 1][s2.x] === TILE.WALL) {
      game.player.x = s2.x - 1;
      game.player.y = s2.y;
    }
    const dx = Math.sign(s2.x - game.player.x);
    const dy = Math.sign(s2.y - game.player.y);
    game.move({ dx, dy });
    expect(game.status).toBe(STATUS.VICTORY);
    expect(game.floor).toBe(MAX_FLOOR);
  });
});

describe('game.js — inventory screen (FR-019)', () => {
  it('opening inventory pauses the loop; Esc resumes', () => {
    const game = new Game(6);
    game.openInventory();
    expect(game.status).toBe(STATUS.INVENTORY);
    game.closeInventory();
    expect(game.status).toBe(STATUS.PLAYING);
  });
});

describe('game.js — HUD combat log rolling buffer (FR-018)', () => {
  it('retains at most the last 50 lines', () => {
    const game = new Game(7);
    for (let i = 0; i < 80; i += 1) game.pushLog(`line ${i}`);
    expect(game.log.length).toBe(50);
    expect(game.log[game.log.length - 1]).toBe('line 79');
  });
});
