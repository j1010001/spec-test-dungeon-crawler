// Core game state machine: movement, combat resolution, enemy AI, fog of
// war, inventory, floor descent, win/lose conditions. Framework-agnostic —
// no DOM access here so it can be unit tested directly under vitest and
// reused unchanged inside the shipped inlined artifact.

import { generateFloor, makeItem } from './dungeon.js';
import { createPlayer, addToInventory, useInventoryItem, playerAttack, playerDefense } from './entities.js';
import { playerAttackEnemy, enemyAttackPlayer, rollEnemyDrop } from './combat.js';
import { Rng, resolveSeed } from './rng.js';
import { GRID_SIZE, SIGHT_RADIUS, MAX_FLOOR, TILE, VISIBILITY, HUD_LOG_MAX_LINES } from './constants.js';
import { logger } from './logger.js';

const DIAGONAL_KEYS = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

export const STATUS = Object.freeze({
  PLAYING: 'playing',
  INVENTORY: 'inventory',
  GAME_OVER: 'gameover',
  VICTORY: 'victory',
});

export class Game {
  constructor(seedInput) {
    this.seed = typeof seedInput === 'number' ? seedInput >>> 0 : resolveSeed(seedInput);
    this.rng = new Rng(this.seed);
    this.player = createPlayer();
    this.status = STATUS.PLAYING;
    this.log = [];
    this.showControlHint = true;
    this.inventoryCursor = 0;
    this.gameOverInfo = null;
    this._loadFloor(1);
    logger.info('Game', 'session started', { seed: this.seed });
  }

  pushLog(message) {
    this.log.push(message);
    if (this.log.length > HUD_LOG_MAX_LINES) {
      this.log.splice(0, this.log.length - HUD_LOG_MAX_LINES);
    }
  }

  _loadFloor(floor) {
    const dungeon = generateFloor(floor, this.seed);
    this.floor = floor;
    this.player.floor = floor;
    this.dungeon = dungeon;
    this.player.x = dungeon.playerStart.x;
    this.player.y = dungeon.playerStart.y;
    this.visited = new Set(); // FR-003: fog memory resets on floor change
    this._updateVisited();
    logger.info('Game', 'floor generated', { floor, rooms: dungeon.rooms.length, enemies: dungeon.enemies.length });
  }

  _updateVisited() {
    for (let dy = -SIGHT_RADIUS; dy <= SIGHT_RADIUS; dy += 1) {
      for (let dx = -SIGHT_RADIUS; dx <= SIGHT_RADIUS; dx += 1) {
        const x = this.player.x + dx;
        const y = this.player.y + dy;
        if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) continue;
        this.visited.add(`${x},${y}`);
      }
    }
  }

  isInSight(x, y) {
    return Math.max(Math.abs(x - this.player.x), Math.abs(y - this.player.y)) <= SIGHT_RADIUS;
  }

  _findRoomAt(x, y) {
    return this.dungeon.rooms.find(
      (r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h
    );
  }

  _activateRoomEnemies(room) {
    if (!room) return;
    const idx = this.dungeon.rooms.indexOf(room);
    for (const enemy of this.dungeon.enemies) {
      if (enemy.alive && enemy.roomIndex === idx) {
        enemy.activated = true;
      }
    }
  }

  _tileWalkableForEnemy(x, y) {
    if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) return false;
    const tile = this.dungeon.grid[y][x];
    return tile === TILE.FLOOR; // staircase is non-walkable for enemies
  }

  _enemyAt(x, y, excludeId) {
    return this.dungeon.enemies.find(
      (e) => e.alive && e.x === x && e.y === y && e.id !== excludeId
    );
  }

  /**
   * Resolve one player action: move, attack (bump), pick up item, or step
   * on the staircase. Returns a summary of what happened for callers that
   * want to react (tests, UI).
   */
  move(direction) {
    if (this.status !== STATUS.PLAYING) {
      return { moved: false, reason: 'not-playing' };
    }
    const delta = typeof direction === 'string' ? DIAGONAL_KEYS[direction] : direction;
    if (!delta) return { moved: false, reason: 'invalid-direction' };

    const targetX = this.player.x + delta.dx;
    const targetY = this.player.y + delta.dy;

    if (targetX < 0 || targetY < 0 || targetX >= GRID_SIZE || targetY >= GRID_SIZE) {
      return { moved: false, reason: 'out-of-bounds' };
    }

    const tile = this.dungeon.grid[targetY][targetX];
    if (tile === TILE.WALL) {
      return { moved: false, reason: 'blocked' };
    }

    // Bump-attack: moving into an enemy tile is the attack (FR-007).
    const enemy = this._enemyAt(targetX, targetY);
    if (enemy) {
      const result = playerAttackEnemy(this.player, enemy);
      this.pushLog(result.message);
      if (result.enemyDied) {
        this._onEnemyDefeated(enemy);
      }
      this._runEnemyTurn();
      this._checkGameOver();
      return { moved: false, attacked: true, result };
    }

    // Normal move onto floor/stairs.
    this.player.x = targetX;
    this.player.y = targetY;
    this._updateVisited();

    // Item pickup.
    const itemIndex = this.dungeon.items.findIndex((it) => it.x === targetX && it.y === targetY);
    let pickup = null;
    if (itemIndex >= 0) {
      const item = this.dungeon.items[itemIndex];
      const added = addToInventory(this.player, item);
      if (added) {
        this.dungeon.items.splice(itemIndex, 1);
        this.pushLog(`Picked up ${item.label}.`);
        pickup = { item, added: true };
      } else {
        this.pushLog('Inventory full — cannot pick up item.');
        pickup = { item, added: false };
      }
    }

    // Room-wide aggro activation on entry.
    const room = this._findRoomAt(targetX, targetY);
    if (room) this._activateRoomEnemies(room);

    // Staircase: immediate descent, no enemy turn this round (FR-011).
    if (tile === TILE.STAIRS) {
      this._descend();
      return { moved: true, descended: true, pickup };
    }

    this._runEnemyTurn();
    this._checkGameOver();
    return { moved: true, pickup };
  }

  _onEnemyDefeated(enemy) {
    enemy.alive = false;
    this.player.enemiesDefeated += 1;
    if (rollEnemyDrop(this.rng)) {
      const types = ['potion', 'weapon', 'armor'];
      const type = this.rng.pick(types);
      const item = makeItem(type, this.floor, this.rng, { x: enemy.x, y: enemy.y });
      this.dungeon.items.push(item);
      this.pushLog(`${enemy.type} dropped ${item.label}.`);
    }
    logger.info('Game', 'enemy defeated', { enemyId: enemy.id, floor: this.floor });
  }

  _descend() {
    if (this.floor >= MAX_FLOOR) {
      this.status = STATUS.VICTORY;
      this.gameOverInfo = {
        floor: this.floor,
        enemiesDefeated: this.player.enemiesDefeated,
        seed: this.seed,
      };
      logger.info('Game', 'victory', this.gameOverInfo);
      return;
    }
    this.showControlHint = false;
    this._loadFloor(this.floor + 1);
    this.pushLog(`Descended to floor ${this.floor}.`);
  }

  _runEnemyTurn() {
    if (this.status !== STATUS.PLAYING) return;
    const claimed = new Set();
    for (const enemy of this.dungeon.enemies) {
      if (!enemy.alive) continue;
      if (enemy.x === this.player.x && enemy.y === this.player.y) continue;
      claimed.add(`${enemy.x},${enemy.y}`);
    }

    for (const enemy of this.dungeon.enemies) {
      if (!enemy.alive) continue;
      claimed.delete(`${enemy.x},${enemy.y}`);

      const chebyshev = Math.max(Math.abs(enemy.x - this.player.x), Math.abs(enemy.y - this.player.y));

      if (enemy.activated) {
        if (chebyshev <= 1) {
          const result = enemyAttackPlayer(this.player, enemy);
          this.pushLog(result.message);
          claimed.add(`${enemy.x},${enemy.y}`);
          if (result.playerDied) break;
          continue;
        }
        this._moveEnemyToward(enemy, this.player.x, this.player.y, claimed);
      } else {
        this._patrolEnemy(enemy, claimed);
      }
      claimed.add(`${enemy.x},${enemy.y}`);
    }
  }

  _tryEnemyStep(enemy, x, y, claimed) {
    if (!this._tileWalkableForEnemy(x, y)) return false;
    if (x === this.player.x && y === this.player.y) return false;
    if (claimed.has(`${x},${y}`)) return false;
    enemy.x = x;
    enemy.y = y;
    return true;
  }

  _moveEnemyToward(enemy, px, py, claimed) {
    const ddx = Math.sign(px - enemy.x);
    const ddy = Math.sign(py - enemy.y);
    if (ddx !== 0 && ddy !== 0) {
      if (this._tryEnemyStep(enemy, enemy.x + ddx, enemy.y + ddy, claimed)) return;
      if (this._tryEnemyStep(enemy, enemy.x + ddx, enemy.y, claimed)) return;
      if (this._tryEnemyStep(enemy, enemy.x, enemy.y + ddy, claimed)) return;
      return; // stays in place
    }
    if (ddx !== 0) {
      this._tryEnemyStep(enemy, enemy.x + ddx, enemy.y, claimed);
      return;
    }
    if (ddy !== 0) {
      this._tryEnemyStep(enemy, enemy.x, enemy.y + ddy, claimed);
    }
  }

  _patrolEnemy(enemy, claimed) {
    const room = this.dungeon.rooms[enemy.roomIndex];
    if (!room) return;
    const offsets = [
      [-1, -1], [0, -1], [1, -1],
      [-1, 0], [1, 0],
      [-1, 1], [0, 1], [1, 1],
    ];
    // Shuffle-ish deterministic pick via rng
    const order = [...offsets];
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = this.rng.int(0, i);
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (const [dx, dy] of order) {
      const x = enemy.x + dx;
      const y = enemy.y + dy;
      if (x < room.x || x >= room.x + room.w || y < room.y || y >= room.y + room.h) continue;
      if (this._tryEnemyStep(enemy, x, y, claimed)) return;
    }
  }

  _checkGameOver() {
    if (this.player.hp <= 0 && this.status === STATUS.PLAYING) {
      this.status = STATUS.GAME_OVER;
      this.gameOverInfo = {
        floor: this.floor,
        enemiesDefeated: this.player.enemiesDefeated,
        seed: this.seed,
      };
      logger.warn('Game', 'game over', this.gameOverInfo);
    }
  }

  openInventory() {
    if (this.status === STATUS.PLAYING) {
      this.status = STATUS.INVENTORY;
      this.inventoryCursor = 0;
    }
  }

  closeInventory() {
    if (this.status === STATUS.INVENTORY) {
      this.status = STATUS.PLAYING;
    }
  }

  moveInventoryCursor(delta) {
    if (this.status !== STATUS.INVENTORY) return;
    const len = Math.max(1, this.player.inventory.length);
    this.inventoryCursor = (this.inventoryCursor + delta + len) % len;
  }

  useSelectedInventoryItem() {
    if (this.status !== STATUS.INVENTORY) return null;
    const result = useInventoryItem(this.player, this.inventoryCursor);
    if (result.ok) {
      this.pushLog(result.message);
      if (this.inventoryCursor >= this.player.inventory.length) {
        this.inventoryCursor = Math.max(0, this.player.inventory.length - 1);
      }
    }
    return result;
  }

  restart() {
    if (this.status !== STATUS.GAME_OVER && this.status !== STATUS.VICTORY) return;
    this.player = createPlayer();
    this.status = STATUS.PLAYING;
    this.log = [];
    this.showControlHint = true;
    this.gameOverInfo = null;
    this._loadFloor(1);
    logger.info('Game', 'restarted', { seed: this.seed });
  }

  /** Player's current effective stats, for HUD display (FR-005). */
  getStats() {
    return {
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      attack: playerAttack(this.player),
      defense: playerDefense(this.player),
      level: this.floor,
      floor: this.floor,
      seed: this.seed,
    };
  }

  /** Tile visibility classification for rendering (R100). */
  getVisibility(x, y) {
    const key = `${x},${y}`;
    if (this.isInSight(x, y)) return VISIBILITY.LIT;
    if (this.visited.has(key)) return VISIBILITY.DIMMED;
    return VISIBILITY.HIDDEN;
  }
}
