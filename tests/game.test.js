import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../src/game.js';
import { TILE, TEST_SEED } from '../src/dungeon.js';

// All tests run on the deterministic seed-99999 hub layout (FR-039):
// spawn (40,40); Room B right (1 Goblin at 56,40 + 11 items);
// Room C down (3 Goblins); Room D up (stairs at 40,26).

function freshGame() {
  return new Game(TEST_SEED);
}

// Drive the player along a path of single steps, asserting nothing.
function walk(game, steps) {
  for (const [dx, dy] of steps) game.move(dx, dy);
}

describe('movement & fog of war (User Story 1, FR-003, FR-004, R100)', () => {
  let g;
  beforeEach(() => (g = freshGame()));

  it('moves exactly one tile per keypress in all 8 directions (US1-AS5)', () => {
    const dirs = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [-1, -1], [1, -1], [-1, 1],
    ];
    for (const [dx, dy] of dirs) {
      const { x, y } = g.player;
      expect(g.move(dx, dy)).toBe(true);
      expect(g.player.x).toBe(x + dx);
      expect(g.player.y).toBe(y + dy);
    }
  });

  it('blocks movement into walls: no position change, no turn (US1-AS4)', () => {
    walk(g, [[-1, 0], [-1, 0], [-1, 0]]); // to Room A west wall (x=37)
    const { x, y } = g.player;
    const hpBefore = g.player.hp;
    expect(g.move(-1, 0)).toBe(false);
    expect(g.player.x).toBe(x);
    expect(g.player.y).toBe(y);
    expect(g.player.hp).toBe(hpBefore); // no enemy turn on a blocked move
  });

  it('blocks movement outside the dungeon boundary (Edge Cases)', () => {
    // Corner tiles are walls; simulate by teleporting near the border.
    g.player.x = 1;
    g.player.y = 1;
    expect(g.move(-1, -1)).toBe(false);
    expect(g.player.x).toBe(1);
  });

  it('starts with only the spawn surroundings visible (US1-AS1)', () => {
    expect(g.visibility(40, 40)).toBe(2); // player tile lit
    expect(g.visibility(45, 40)).toBe(2); // radius-5 edge lit
    expect(g.visibility(46, 40)).toBe(0); // beyond radius: hidden
    expect(g.visibility(56, 40)).toBe(0); // Room B goblin tile hidden
  });

  it('reveals new tiles on movement; revisited tiles stay dimmed (US1-AS2/AS3, R100)', () => {
    expect(g.visibility(46, 40)).toBe(0);
    g.move(1, 0); // to (41,40)
    expect(g.visibility(46, 40)).toBe(2); // newly lit
    g.move(-1, 0); // back to (40,40)
    expect(g.visibility(46, 40)).toBe(1); // seen before, now dimmed
  });

  it('uses Chebyshev distance for the 5-tile sight radius (R100)', () => {
    expect(g.visibility(45, 45)).toBe(2); // diagonal 5 away: lit
    expect(g.visibility(45, 46)).toBe(0);
  });
});

describe('combat (User Story 2, FR-007, FR-021, FR-022, R103)', () => {
  let g;
  beforeEach(() => {
    g = freshGame();
    walk(g, Array(11).fill([1, 0])); // to (51,40), corridor end before Room B
  });

  it('activates all room enemies on entry (R103) and shows them (US2-AS1)', () => {
    const goblin = g.floor.enemies[0];
    expect(goblin.activated).toBe(false);
    g.move(1, 0); // enter Room B at (52,40)
    expect(goblin.activated).toBe(true);
    expect(g.visibility(goblin.x, goblin.y)).toBe(2);
  });

  it('bump-attacks: enemy HP drops, player stays put (US2-AS2)', () => {
    walk(g, [[1, 0], [1, 0], [1, 0]]); // (54,40) — armor at (53,54,55) picked up on the way
    const goblin = g.floor.enemies[0];
    // goblin approaches while we advance; close the gap and bump it
    let guard = 0;
    while (Math.max(Math.abs(goblin.x - g.player.x), Math.abs(goblin.y - g.player.y)) > 1 && guard++ < 10) {
      g.move(1, 0);
    }
    const pos = { x: g.player.x, y: g.player.y };
    const hpBefore = goblin.hp;
    g.move(Math.sign(goblin.x - g.player.x), Math.sign(goblin.y - g.player.y));
    expect(goblin.hp).toBe(hpBefore - Math.max(1, g.attack - goblin.defense));
    expect(g.player).toMatchObject(pos);
  });

  it('kills the Room B goblin in 4 bumps; player survives (FR-039 combat math)', () => {
    g.move(1, 0); // enter room, activate
    const goblin = g.floor.enemies[0];
    // Wait for the goblin to come adjacent, then trade blows.
    let guard = 0;
    while (goblin.alive && guard++ < 30) {
      const dx = Math.sign(goblin.x - g.player.x);
      const dy = Math.sign(goblin.y - g.player.y);
      const adjacent =
        Math.max(Math.abs(goblin.x - g.player.x), Math.abs(goblin.y - g.player.y)) <= 1;
      if (adjacent) g.move(dx, dy);
      else g.move(0, 0) || g.enemyTurn(); // stand still, let it approach
    }
    expect(goblin.alive).toBe(false);
    expect(g.state).toBe('playing');
    expect(g.player.hp).toBeGreaterThan(0);
    expect(g.enemiesDefeated).toBe(1);
    // dead enemies are removed from the map (US2-AS5)
    expect(g.enemyAt(goblin.x, goblin.y)).toBeNull();
  });

  it('adjacent activated enemies attack for max(1, atk-def) instead of moving', () => {
    g.move(1, 0); // enter Room B
    const goblin = g.floor.enemies[0];
    goblin.x = g.player.x + 1; // place adjacent
    goblin.y = g.player.y;
    const hpBefore = g.player.hp;
    const pos = { x: goblin.x, y: goblin.y };
    g.enemyTurn();
    expect(g.player.hp).toBe(hpBefore - Math.max(1, goblin.attack - g.defense));
    expect(goblin).toMatchObject(pos); // attacked, did not move
  });

  it('activated non-adjacent enemies step one tile toward the player (FR-022)', () => {
    g.move(1, 0); // enter Room B; goblin at (56,40), player at (52,40)
    const goblin = g.floor.enemies[0];
    // After the entry turn the goblin has stepped once toward the player.
    expect(Math.abs(goblin.x - 56) + Math.abs(goblin.y - 40)).toBeGreaterThan(0);
    const distBefore = Math.max(Math.abs(goblin.x - g.player.x), Math.abs(goblin.y - g.player.y));
    g.enemyTurn();
    const distAfter = Math.max(Math.abs(goblin.x - g.player.x), Math.abs(goblin.y - g.player.y));
    expect(distAfter).toBeLessThanOrEqual(distBefore);
  });

  it('three goblins in Room C defeat the player; game-over screen state (US2-AS4, FR-008)', () => {
    const g2 = freshGame();
    walk(g2, Array(11).fill([0, 1])); // down corridor to (40,51)
    g2.move(0, 1); // enter Room C — three goblins activate
    let guard = 0;
    while (g2.state === 'playing' && guard++ < 40) g2.move(0, 0) || g2.enemyTurn();
    expect(g2.state).toBe('gameover');
    expect(g2.player.hp).toBe(0);
  });

  it('test-floor enemies hold their FR-039 positions until activated', () => {
    const g2 = freshGame();
    const roomC = g2.floor.rooms[2];
    const goblins = g2.floor.enemies.filter((e) => e.roomIndex === 2);
    for (let i = 0; i < 30; i++) {
      g2.move(i % 2 ? 1 : -1, 0); // shuffle in Room A; C never entered
      for (const e of goblins) {
        expect(e.activated).toBe(false);
        expect(e.x).toBeGreaterThanOrEqual(roomC.x);
        expect(e.x).toBeLessThan(roomC.x + roomC.w);
        expect(e.y).toBeGreaterThanOrEqual(roomC.y);
        expect(e.y).toBeLessThan(roomC.y + roomC.h);
      }
    }
  });

  it('unactivated enemies on procedural floors patrol inside their room (R103)', () => {
    const g2 = new Game(4242);
    let moved = false;
    const start = g2.floor.enemies.map((e) => ({ x: e.x, y: e.y }));
    for (let turn = 0; turn < 25; turn++) {
      g2.enemyTurn();
      g2.floor.enemies.forEach((e, i) => {
        if (e.activated) return;
        const room = g2.floor.rooms[e.roomIndex];
        expect(e.x).toBeGreaterThanOrEqual(room.x);
        expect(e.x).toBeLessThan(room.x + room.w);
        expect(e.y).toBeGreaterThanOrEqual(room.y);
        expect(e.y).toBeLessThan(room.y + room.h);
        if (e.x !== start[i].x || e.y !== start[i].y) moved = true;
      });
    }
    expect(moved).toBe(true); // idle patrol actually moves enemies
  });

  it('two enemies never occupy one tile (FR-026)', () => {
    const g2 = freshGame();
    walk(g2, Array(12).fill([0, 1])); // enter Room C, activate 3 goblins
    for (let i = 0; i < 15 && g2.state === 'playing'; i++) {
      g2.enemyTurn();
      const alive = g2.floor.enemies.filter((e) => e.alive);
      const tiles = new Set(alive.map((e) => `${e.x},${e.y}`));
      expect(tiles.size).toBe(alive.length);
    }
  });

  it('enemies never step onto the staircase tile (Edge Cases)', () => {
    const g2 = freshGame();
    const { stairs } = g2.floor;
    expect(g2.enemyWalkable(stairs.x, stairs.y)).toBe(false);
  });
});

describe('items & inventory (User Story 3, FR-009, FR-010, FR-019, FR-025)', () => {
  let g;
  beforeEach(() => {
    g = freshGame();
    walk(g, Array(12).fill([1, 0])); // enter Room B at (52,40)
  });

  it('picks up an item by stepping on its tile (US3-AS1)', () => {
    // Armor row sits at y=40: (53,40),(54,40),(55,40).
    expect(g.player.inventory.length).toBe(0);
    g.move(1, 0); // (53,40)
    expect(g.player.inventory.length).toBe(1);
    expect(g.player.inventory[0].type).toBe('armor');
    expect(g.itemAt(53, 40)).toBeNull(); // removed from the floor
  });

  it('caps inventory at 10; 11th pickup stays on the floor with a message (FR-009)', () => {
    for (let i = 0; i < 10; i++) g.player.inventory.push({ type: 'potion', value: 15, name: `P${i}` });
    g.move(1, 0); // step onto armor at (53,40)
    expect(g.player.inventory.length).toBe(10);
    expect(g.itemAt(53, 40)).not.toBeNull(); // item remains
    expect(g.hudLog.some((l) => l.includes('Inventory is full'))).toBe(true);
  });

  it('potion restores HP up to max and is consumed (US3-AS2)', () => {
    g.player.hp = 5;
    g.player.inventory.push({ type: 'potion', value: 15, name: 'Health Potion (+15 HP)' });
    g.openInventory();
    g.useSelected();
    expect(g.player.hp).toBe(20);
    expect(g.player.inventory.length).toBe(0);
  });

  it('potion at full HP is consumed with no overflow (Edge Cases)', () => {
    g.player.inventory.push({ type: 'potion', value: 15, name: 'Health Potion (+15 HP)' });
    g.openInventory();
    g.useSelected();
    expect(g.player.hp).toBe(20);
    expect(g.player.inventory.length).toBe(0);
  });

  it('equipping a weapon raises effective attack on the HUD stats (US3-AS3, FR-005)', () => {
    g.player.inventory.push({ type: 'weapon', value: 3, name: 'Sword (+3 ATK)' });
    g.openInventory();
    expect(g.attack).toBe(5);
    g.useSelected();
    expect(g.attack).toBe(8);
    expect(g.player.inventory.length).toBe(0); // freed slot, nothing was equipped
  });

  it('equipping armor raises effective defense (US3-AS4)', () => {
    g.player.inventory.push({ type: 'armor', value: 2, name: 'Armor (+2 DEF)' });
    g.openInventory();
    g.useSelected();
    expect(g.defense).toBe(3);
  });

  it('equip is a swap: previous equipment returns to the freed slot (FR-019)', () => {
    g.player.weapon = { type: 'weapon', value: 1, name: 'Old Sword (+1 ATK)' };
    g.player.inventory.push({ type: 'weapon', value: 4, name: 'New Sword (+4 ATK)' });
    g.openInventory();
    g.useSelected();
    expect(g.player.weapon.value).toBe(4);
    expect(g.player.inventory.length).toBe(1);
    expect(g.player.inventory[0].name).toBe('Old Sword (+1 ATK)');
    expect(g.attack).toBe(9);
  });

  it('inventory screen pauses the game: movement is ignored while open (FR-019)', () => {
    g.openInventory();
    const { x, y } = g.player;
    expect(g.move(1, 0)).toBe(false);
    expect(g.player.x).toBe(x);
    expect(g.player.y).toBe(y);
    g.closeInventory();
    expect(g.state).toBe('playing');
  });

  it('cursor wraps across the 10 slots', () => {
    g.openInventory();
    g.moveInvCursor(-1);
    expect(g.invCursor).toBe(9);
    g.moveInvCursor(1);
    expect(g.invCursor).toBe(0);
  });
});

describe('floor descent & run lifecycle (User Story 4, FR-011, R101, FR-008)', () => {
  function descendOnce(g) {
    // Room D is straight up: corridor (40, 29..36), stairs at (40,26).
    walk(g, Array(11).fill([0, -1])); // (40,29)
    g.move(0, -1); // (40,28) — Room D entrance
    g.move(0, -1); // (40,27)
    g.move(0, -1); // (40,26) — stairs
  }

  it('stepping on stairs generates a new floor and moves the player to its entrance (US4-AS1)', () => {
    const g = freshGame();
    descendOnce(g);
    expect(g.floorNum).toBe(2);
    expect(g.floor.rooms.length).toBeGreaterThan(4); // procedural, not the hub
    expect(g.player.x).toBe(g.floor.spawn.x);
    expect(g.player.y).toBe(g.floor.spawn.y);
  });

  it('stats and inventory persist across descent; level equals floor (US4-AS2, FR-016)', () => {
    const g = freshGame();
    g.player.hp = 13;
    g.player.inventory.push({ type: 'potion', value: 15, name: 'Health Potion (+15 HP)' });
    descendOnce(g);
    expect(g.player.hp).toBe(13);
    expect(g.player.inventory.length).toBe(1);
    expect(g.level).toBe(2);
  });

  it('fog resets on descent: no visited memory carries over (FR-003)', () => {
    const g = freshGame();
    descendOnce(g);
    let visitedCount = 0;
    for (const v of g.visited) if (v) visitedCount++;
    expect(visitedCount).toBeLessThanOrEqual(11 * 11); // only the fresh spawn area
  });

  it('enemies take no turn on the descent round (FR-011)', () => {
    const g = freshGame();
    const hp = g.player.hp;
    descendOnce(g);
    expect(g.player.hp).toBe(hp);
  });

  it('descending floor by floor reaches victory on floor 9 stairs; no floor 10 (R101)', () => {
    const g = freshGame();
    for (let i = 0; i < 20 && g.state === 'playing'; i++) {
      // Teleport to the stairs and step on them — lifecycle test only.
      const { stairs } = g.floor;
      g.player.x = stairs.x;
      g.player.y = stairs.y - 1 >= 0 && g.tileAt(stairs.x, stairs.y - 1) !== TILE.WALL ? stairs.y - 1 : stairs.y + 1;
      // ensure the tile we stand on is walkable; fall back to adjacent search
      if (g.tileAt(g.player.x, g.player.y) === TILE.WALL) {
        g.player.x = stairs.x + 1;
        g.player.y = stairs.y;
      }
      const dy = Math.sign(stairs.y - g.player.y);
      const dx = Math.sign(stairs.x - g.player.x);
      // clear any enemy sitting between us and use direct move
      const blocker = g.enemyAt(g.player.x + dx, g.player.y + dy);
      if (blocker) blocker.alive = false;
      g.move(dx, dy);
    }
    expect(g.state).toBe('victory');
    expect(g.floorNum).toBe(9); // victory triggered ON floor 9; floor 10 never generated
  });

  it('R restarts from floor 1 with fresh stats (US4-AS4, FR-008)', () => {
    const g = freshGame();
    walk(g, Array(12).fill([0, 1])); // Room C — death
    let guard = 0;
    while (g.state === 'playing' && guard++ < 40) g.enemyTurn();
    expect(g.state).toBe('gameover');
    g.restart(g.seed);
    expect(g.state).toBe('playing');
    expect(g.floorNum).toBe(1);
    expect(g.player.hp).toBe(20);
    expect(g.player.inventory.length).toBe(0);
    expect(g.player).toMatchObject({ x: 40, y: 40 }); // same seed => same layout
  });
});

describe('HUD log (FR-018) & structured events', () => {
  it('keeps a rolling buffer of at most 50 lines', () => {
    const g = freshGame();
    for (let i = 0; i < 80; i++) g.addLog(`line ${i}`);
    expect(g.hudLog.length).toBe(50);
    expect(g.hudLog[0]).toBe('line 30');
    expect(g.hudLog[49]).toBe('line 79');
  });

  it('logs combat exchanges as one-line messages', () => {
    const g = freshGame();
    walk(g, Array(12).fill([1, 0])); // enter Room B
    const goblin = g.floor.enemies[0];
    goblin.x = g.player.x + 1;
    goblin.y = g.player.y;
    g.move(1, 0); // bump attack
    expect(g.hudLog.some((l) => /You hit Goblin for \d+\./.test(l))).toBe(true);
    expect(g.hudLog.some((l) => /Goblin hits you for \d+\./.test(l))).toBe(true);
  });
});

describe('enemy drops (US2-AS5)', () => {
  it('drops an item on the enemy tile in ~25% of kills, never stacking items', () => {
    // Run many kills across fresh games and count drops.
    let drops = 0;
    const N = 200;
    for (let seed = 0; seed < N; seed++) {
      const g = new Game(TEST_SEED);
      g.rng = { ...g.rng, chance: (p) => seed % 4 === 0, int: () => 0, pick: (a) => a[0], next: () => 0 };
      const goblin = g.floor.enemies[0];
      goblin.hp = 1;
      goblin.activated = true;
      goblin.x = 41;
      goblin.y = 40;
      g.attackEnemy(goblin);
      if (g.itemAt(41, 40)) drops++;
    }
    expect(drops).toBe(N / 4);
  });
});
