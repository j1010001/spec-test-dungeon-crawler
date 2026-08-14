// Core game engine: turn resolution, movement, combat, fog-of-war,
// inventory, floor descent, run lifecycle. DOM-free — the renderer and
// input layers sit on top; the unit suite imports this module directly.

import { createRng } from './rng.js';
import { createLogger } from './logger.js';
import {
  GRID_SIZE,
  SIGHT_RADIUS,
  INVENTORY_CAP,
  MAX_FLOOR,
  createPlayer,
  playerAttack,
  playerDefense,
  damage,
  makeRandomItem,
} from './entities.js';
import { generateFloor, TILE } from './dungeon.js';

const LOG_CAP = 50; // FR-018 rolling buffer
const DROP_CHANCE = 0.25; // US2-AS5

const log = createLogger('game');

export class Game {
  // seed: integer run seed (FR-038).
  constructor(seed) {
    this.seed = seed;
    this.startRun();
  }

  startRun() {
    this.rng = createRng(this.seed);
    this.player = createPlayer();
    this.floorNum = 1;
    this.enemiesDefeated = 0;
    this.state = 'playing'; // playing | inventory | gameover | victory
    this.hudLog = [];
    this.hasDescended = false; // SC-006: controls-hint visibility
    this.invCursor = 0;
    this.enterFloor(1);
    this.addLog('You enter the dungeon. Reach > to descend.');
    log.info('run started', { seed: this.seed });
  }

  // Restart after game-over/victory (FR-008, R101). A new seed may be
  // supplied (auto-seeded runs re-roll; ?seed= runs reproduce).
  restart(seed) {
    if (seed !== undefined) this.seed = seed;
    this.startRun();
  }

  enterFloor(floorNum) {
    const t0 = Date.now();
    this.floorNum = floorNum;
    this.floor = generateFloor(floorNum, this.rng, this.seed);
    this.player.x = this.floor.spawn.x;
    this.player.y = this.floor.spawn.y;
    // FR-003: fog state resets fully on every floor.
    this.visited = new Uint8Array(GRID_SIZE * GRID_SIZE);
    this.markSeen();
    this.activateRoomAt(this.player.x, this.player.y);
    log.info('floor generated', { floor: floorNum, ms: Date.now() - t0, rooms: this.floor.rooms.length });
  }

  get level() {
    return this.floorNum; // FR-016: level == floor, display-only
  }

  get attack() {
    return playerAttack(this.player);
  }

  get defense() {
    return playerDefense(this.player);
  }

  addLog(message) {
    this.hudLog.push(message);
    if (this.hudLog.length > LOG_CAP) this.hudLog.shift();
  }

  tileAt(x, y) {
    if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) return TILE.WALL;
    return this.floor.grid[y][x];
  }

  enemyAt(x, y) {
    return this.floor.enemies.find((e) => e.alive && e.x === x && e.y === y) || null;
  }

  itemAt(x, y) {
    return this.floor.items.find((it) => it.x === x && it.y === y) || null;
  }

  roomIndexAt(x, y) {
    return this.floor.rooms.findIndex(
      (r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h
    );
  }

  // --- Fog of war (FR-003, R100) --------------------------------------

  markSeen() {
    const { x, y } = this.player;
    for (let dy = -SIGHT_RADIUS; dy <= SIGHT_RADIUS; dy++) {
      for (let dx = -SIGHT_RADIUS; dx <= SIGHT_RADIUS; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        if (tx >= 0 && ty >= 0 && tx < GRID_SIZE && ty < GRID_SIZE) {
          this.visited[ty * GRID_SIZE + tx] = 1;
        }
      }
    }
  }

  // 2 = lit (within sight radius), 1 = dimmed (visited), 0 = hidden.
  visibility(x, y) {
    const d = Math.max(Math.abs(x - this.player.x), Math.abs(y - this.player.y));
    if (d <= SIGHT_RADIUS) return 2;
    return this.visited[y * GRID_SIZE + x] ? 1 : 0;
  }

  // --- Player turn ------------------------------------------------------

  // dx/dy in {-1,0,1}; 8-directional (FR-004). Returns true if a turn
  // was consumed.
  move(dx, dy) {
    if (this.state !== 'playing') return false;
    if (dx === 0 && dy === 0) return false;
    const nx = this.player.x + dx;
    const ny = this.player.y + dy;
    const tile = this.tileAt(nx, ny);
    if (tile === TILE.WALL) return false; // blocked: no turn, no change

    const enemy = this.enemyAt(nx, ny);
    if (enemy) {
      // FR-007: moving into an enemy attacks it; the player stays put.
      this.attackEnemy(enemy);
      this.enemyTurn();
      return true;
    }

    this.player.x = nx;
    this.player.y = ny;
    this.markSeen();

    if (tile === TILE.STAIRS) {
      // FR-011: immediate descent; enemies do not take a turn.
      this.descend();
      return true;
    }

    const item = this.itemAt(nx, ny);
    if (item) this.pickUp(item);
    this.activateRoomAt(nx, ny);
    this.enemyTurn();
    return true;
  }

  attackEnemy(enemy) {
    const dmg = damage(this.attack, enemy.defense);
    enemy.hp -= dmg;
    this.addLog(`You hit ${enemy.type} for ${dmg}.`);
    if (enemy.hp <= 0) {
      enemy.alive = false;
      this.enemiesDefeated++;
      this.addLog(`${enemy.type} dies.`);
      // 25% chance to drop a random item on its tile (US2-AS5), unless
      // the tile already holds an item (FR-025: one item per tile).
      if (this.rng.chance(DROP_CHANCE) && !this.itemAt(enemy.x, enemy.y)) {
        const drop = makeRandomItem(this.floorNum, this.rng);
        drop.x = enemy.x;
        drop.y = enemy.y;
        this.floor.items.push(drop);
        this.addLog(`${enemy.type} drops ${drop.name}.`);
      }
      log.info('enemy defeated', { type: enemy.type, total: this.enemiesDefeated });
    }
  }

  pickUp(item) {
    if (this.player.inventory.length >= INVENTORY_CAP) {
      this.addLog(`Inventory is full — the ${item.name} stays on the floor.`);
      return false;
    }
    this.floor.items.splice(this.floor.items.indexOf(item), 1);
    delete item.x;
    delete item.y;
    this.player.inventory.push(item);
    this.addLog(`You picked up ${item.name}.`);
    return true;
  }

  descend() {
    if (this.floorNum === MAX_FLOOR) {
      // R101: stairs on floor 9 trigger victory; no floor 10 generated.
      this.state = 'victory';
      log.info('victory', { seed: this.seed, enemiesDefeated: this.enemiesDefeated });
      return;
    }
    this.hasDescended = true;
    this.enterFloor(this.floorNum + 1);
    this.addLog(`You descend to floor ${this.floorNum}.`);
  }

  // R103: room-wide aggro — every enemy in the room the player stands in
  // activates; activation is permanent.
  activateRoomAt(x, y) {
    const idx = this.roomIndexAt(x, y);
    if (idx === -1) return;
    for (const e of this.floor.enemies) {
      if (e.alive && e.roomIndex === idx && !e.activated) e.activated = true;
    }
  }

  // --- Enemy turn (FR-022, FR-026, R103) --------------------------------

  enemyTurn() {
    if (this.state !== 'playing') return;
    for (const e of this.floor.enemies) {
      if (!e.alive) continue;
      if (e.activated) {
        const dist = Math.max(Math.abs(e.x - this.player.x), Math.abs(e.y - this.player.y));
        if (dist <= 1) {
          // Adjacent (8-dir): attack instead of moving.
          const dmg = damage(e.attack, this.defense);
          this.player.hp -= dmg;
          this.addLog(`${e.type} hits you for ${dmg}.`);
        } else {
          this.pursue(e);
        }
      } else {
        this.patrol(e);
      }
    }
    if (this.player.hp <= 0) {
      this.player.hp = 0;
      this.state = 'gameover';
      log.info('game over', {
        seed: this.seed,
        floor: this.floorNum,
        enemiesDefeated: this.enemiesDefeated,
      });
    }
  }

  // A tile an enemy may move onto: in-bounds floor (stairs are
  // non-walkable for enemies), no other living enemy (iteration-order
  // collision, FR-026), never the player's tile.
  enemyWalkable(x, y) {
    if (this.tileAt(x, y) !== TILE.FLOOR) return false;
    if (x === this.player.x && y === this.player.y) return false;
    if (this.enemyAt(x, y)) return false;
    return true;
  }

  // Greedy step with wall-sliding: preferred diagonal/cardinal step
  // toward the player, then primary axis, then secondary axis.
  pursue(e) {
    const dx = Math.sign(this.player.x - e.x);
    const dy = Math.sign(this.player.y - e.y);
    const xPrimary = Math.abs(this.player.x - e.x) >= Math.abs(this.player.y - e.y);
    const candidates = [[dx, dy]];
    if (xPrimary) {
      candidates.push([dx, 0], [0, dy]);
    } else {
      candidates.push([0, dy], [dx, 0]);
    }
    for (const [cx, cy] of candidates) {
      if (cx === 0 && cy === 0) continue;
      if (this.enemyWalkable(e.x + cx, e.y + cy)) {
        e.x += cx;
        e.y += cy;
        return;
      }
    }
    // No viable move: stay in place.
  }

  // Idle patrol: one random step to an adjacent walkable tile inside the
  // spawning room; enemies never leave the room before activation.
  // Test-dungeon enemies have patrol disabled to preserve FR-039's
  // deterministic positions.
  patrol(e) {
    if (e.patrol === false) return;
    const room = this.floor.rooms[e.roomIndex];
    if (!room) return;
    const options = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = e.x + dx;
        const ny = e.y + dy;
        if (nx < room.x || nx >= room.x + room.w || ny < room.y || ny >= room.y + room.h) continue;
        if (!this.enemyWalkable(nx, ny)) continue;
        options.push([nx, ny]);
      }
    }
    if (options.length === 0) return;
    const [nx, ny] = this.rng.pick(options);
    e.x = nx;
    e.y = ny;
  }

  // --- Inventory (FR-019) ----------------------------------------------

  openInventory() {
    if (this.state !== 'playing') return;
    this.state = 'inventory';
    this.invCursor = 0;
  }

  closeInventory() {
    if (this.state !== 'inventory') return;
    this.state = 'playing';
  }

  moveInvCursor(delta) {
    if (this.state !== 'inventory') return;
    this.invCursor = (this.invCursor + delta + INVENTORY_CAP) % INVENTORY_CAP;
  }

  // Enter on the selected slot: consume potion / equip weapon or armor.
  // Equipping is a swap: the previously equipped item (if any) takes the
  // freed slot, so equipping always succeeds (FR-019).
  useSelected() {
    if (this.state !== 'inventory') return;
    const idx = this.invCursor;
    const item = this.player.inventory[idx];
    if (!item) return;
    if (item.type === 'potion') {
      const before = this.player.hp;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + item.value);
      this.player.inventory.splice(idx, 1);
      this.addLog(`You drink ${item.name} and recover ${this.player.hp - before} HP.`);
    } else if (item.type === 'weapon') {
      const prev = this.player.weapon;
      this.player.weapon = item;
      if (prev) this.player.inventory.splice(idx, 1, prev);
      else this.player.inventory.splice(idx, 1);
      this.addLog(`You equip ${item.name}.`);
    } else if (item.type === 'armor') {
      const prev = this.player.armor;
      this.player.armor = item;
      if (prev) this.player.inventory.splice(idx, 1, prev);
      else this.player.inventory.splice(idx, 1);
      this.addLog(`You equip ${item.name}.`);
    }
  }
}
