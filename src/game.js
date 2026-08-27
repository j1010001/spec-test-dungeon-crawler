// Core game state machine — pure logic, no DOM. Drives movement, combat,
// items/inventory, fog-of-war, floor descent, game-over/victory and the HUD
// log. Rendering subscribes to this state (src/render.js).

import {
  GRID_W,
  GRID_H,
  TILE,
  MAX_INVENTORY,
  LOG_LINES,
  MAX_FLOOR,
  damage,
  chebyshev,
} from './constants.js';
import { Rng } from './rng.js';
import { generateFloor, randomItem, tileInRoom } from './dungeon.js';
import { makeVisited, markVisible, visibilityAt, isLit } from './fov.js';
import { logEvent } from './logger.js';

export const MODE = {
  PLAY: 'play',
  INVENTORY: 'inventory',
  GAME_OVER: 'gameover',
  VICTORY: 'victory',
};

export class Game {
  // opts: { explicitSeed: number|null, now: () => number }
  constructor(opts = {}) {
    this.explicitSeed = opts.explicitSeed ?? null;
    this.now = opts.now ?? (() => Date.now());
    this._startRun();
  }

  _startRun() {
    // FR-038: explicit URL seed when present, otherwise auto-generated.
    this.seed = this.explicitSeed ?? Math.floor(this.now()) % 2147483647;
    this.rng = new Rng(this.seed);
    this.mode = MODE.PLAY;
    this.turn = 0;
    this.enemiesDefeated = 0;
    this.log = []; // FR-018 rolling 50-line buffer
    this.player = {
      x: 0,
      y: 0,
      hp: 20,
      maxHp: 20,
      baseAttack: 5,
      baseDefense: 1,
      weapon: null, // equipped weapon item or null
      armor: null, // equipped armor item or null
      level: 1, // FR-016: level == floor, display only
      floor: 1,
      inventory: [], // ordered, max 10 (FR-009)
    };
    this.invCursor = 0;
    this._enterFloor(1);
    logEvent('info', 'game', `run started (seed ${this.seed})`, { seed: this.seed });
    this.pushLog(`You enter the dungeon. (seed ${this.seed})`);
  }

  // ---------------------------------------------------------- derived ----

  get attack() {
    // FR-005: displayed/effective attack = base + equipped weapon bonus
    return this.player.baseAttack + (this.player.weapon ? this.player.weapon.value : 0);
  }

  get defense() {
    return this.player.baseDefense + (this.player.armor ? this.player.armor.value : 0);
  }

  // SC-006 / FR-033: control hint shown on floor 1, hidden after first descent.
  get hintVisible() {
    return this.player.floor === 1;
  }

  // ------------------------------------------------------------ floors ----

  _enterFloor(floor) {
    const t0 =
      typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    this.player.floor = floor;
    this.player.level = floor; // FR-016
    this.floorData = generateFloor(this.rng, floor, this.seed);
    this.visited = makeVisited(); // FR-003: fog resets per floor
    this.player.x = this.floorData.playerStart.x;
    this.player.y = this.floorData.playerStart.y;
    markVisible(this.visited, this.player.x, this.player.y);
    const t1 =
      typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    logEvent('info', 'dungeon', `floor ${floor} generated in ${(t1 - t0).toFixed(1)}ms`, {
      floor,
      rooms: this.floorData.rooms.length,
      enemies: this.floorData.enemies.length,
      items: this.floorData.items.length,
    });
  }

  // -------------------------------------------------------------- HUD ----

  pushLog(line) {
    this.log.push(line);
    if (this.log.length > LOG_LINES) this.log.splice(0, this.log.length - LOG_LINES); // FR-018
  }

  // ------------------------------------------------------------ lookup ----

  tileAt(x, y) {
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return TILE.WALL;
    return this.floorData.tiles[y][x];
  }

  enemyAt(x, y) {
    return this.floorData.enemies.find((e) => e.x === x && e.y === y) ?? null;
  }

  itemAt(x, y) {
    return this.floorData.items.find((it) => it.x === x && it.y === y) ?? null;
  }

  visibility(x, y) {
    return visibilityAt(this.visited, this.player.x, this.player.y, x, y);
  }

  // ------------------------------------------------------------- turns ----

  // Player turn: attempt to move/attack one tile in (dx, dy).
  // Blocked moves (walls/bounds) change nothing and consume no turn
  // (US1-AS4: movement is blocked, no position change).
  step(dx, dy) {
    if (this.mode !== MODE.PLAY) return;
    dx = Math.sign(dx);
    dy = Math.sign(dy);
    if (dx === 0 && dy === 0) return;
    this.turn++;
    const nx = this.player.x + dx;
    const ny = this.player.y + dy;
    if (this.tileAt(nx, ny) === TILE.WALL) return; // blocked, no enemy turn

    const enemy = this.enemyAt(nx, ny);
    if (enemy) {
      // FR-007: bump-attack; player stays in place.
      this._playerAttack(enemy);
    } else {
      this.player.x = nx;
      this.player.y = ny;
      const item = this.itemAt(nx, ny);
      if (item) this._pickup(item);
      if (this.tileAt(nx, ny) === TILE.STAIRS) {
        // FR-011: descent is immediate; enemies take no turn this round.
        this._descend();
        return;
      }
    }
    this._afterPlayerAction();
  }

  _playerAttack(enemy) {
    const dmg = damage(this.attack, enemy.defense);
    enemy.hp -= dmg;
    if (enemy.hp <= 0) {
      this.enemiesDefeated++;
      this.floorData.enemies = this.floorData.enemies.filter((e) => e !== enemy);
      this.pushLog(`You hit ${enemy.type} for ${dmg}. ${enemy.type} dies!`);
      logEvent('info', 'combat', `${enemy.type} defeated`, {
        floor: this.player.floor,
        defeated: this.enemiesDefeated,
      });
      // US2-AS5: 25% chance to drop a random item on the enemy's tile.
      if (this.rng.chance(0.25)) {
        if (!this.itemAt(enemy.x, enemy.y) && this.tileAt(enemy.x, enemy.y) === TILE.FLOOR) {
          const item = randomItem(this.player.floor, this.rng);
          item.x = enemy.x;
          item.y = enemy.y;
          this.floorData.items.push(item);
          this.pushLog(`${enemy.type} drops ${item.name}.`);
        }
      }
    } else {
      this.pushLog(`You hit ${enemy.type} for ${dmg}.`);
    }
  }

  _pickup(item) {
    if (this.player.inventory.length >= MAX_INVENTORY) {
      // Edge case: full inventory — item stays on the floor, HUD message.
      this.pushLog(`Inventory full! ${item.name} stays on the ground.`);
      return;
    }
    this.floorData.items = this.floorData.items.filter((it) => it !== item);
    delete item.x;
    delete item.y;
    this.player.inventory.push(item);
    this.pushLog(`You pick up ${item.name}.`);
    logEvent('info', 'items', `picked up ${item.name}`, {
      slots: this.player.inventory.length,
    });
  }

  _descend() {
    if (this.player.floor === MAX_FLOOR) {
      // R101: floor 9 staircase => victory, no floor 10.
      this.mode = MODE.VICTORY;
      logEvent('info', 'game', 'victory', {
        floor: this.player.floor,
        defeated: this.enemiesDefeated,
        seed: this.seed,
      });
      return;
    }
    const next = this.player.floor + 1;
    this.pushLog(`You descend to floor ${next}.`);
    this._enterFloor(next); // stats + inventory persist on this.player
  }

  _afterPlayerAction() {
    this._updateActivation();
    this._enemyTurns();
    markVisible(this.visited, this.player.x, this.player.y);
    if (this.player.hp <= 0) {
      this.mode = MODE.GAME_OVER;
      logEvent('info', 'game', 'game over', {
        floor: this.player.floor,
        defeated: this.enemiesDefeated,
        seed: this.seed,
      });
    }
  }

  // R103: room-wide aggro the moment the player's tile belongs to a room.
  _updateActivation() {
    const { rooms, enemies } = this.floorData;
    for (let r = 0; r < rooms.length; r++) {
      if (tileInRoom(rooms[r], this.player.x, this.player.y)) {
        for (const e of enemies) {
          if (e.roomIndex === r && !e.activated) {
            e.activated = true;
          }
        }
      }
    }
  }

  // Walkability for enemies: floor tiles only (stairs are non-walkable for
  // enemies per clarification 2026-06-26), one enemy per tile (FR-026),
  // never the player's tile. Items are ignored (enemies pass over them).
  _enemyCanMoveTo(x, y) {
    if (this.tileAt(x, y) !== TILE.FLOOR) return false;
    if (x === this.player.x && y === this.player.y) return false;
    if (this.enemyAt(x, y)) return false;
    return true;
  }

  _enemyTurns() {
    // Iterate over a snapshot in array order — FR-026 iteration-order
    // collision applies to pursuit AND patrol.
    const enemies = this.floorData.enemies.slice();
    for (const e of enemies) {
      if (this.player.hp <= 0) return;
      if (e.activated) {
        if (chebyshev(e.x, e.y, this.player.x, this.player.y) <= 1) {
          // FR-022: adjacent (8-dir) => attack, no movement this turn.
          const dmg = damage(e.attack, this.defense);
          this.player.hp -= dmg;
          this.pushLog(`${e.type} hits you for ${dmg}.`);
        } else {
          this._pursue(e);
        }
      } else if (e.patrols !== false) {
        this._patrol(e);
      }
    }
  }

  // FR-022 greedy step with wall-sliding: preferred step toward the player
  // (diagonal when both axes differ), else primary axis, else secondary
  // axis; when moving straight, slide diagonally around obstacles. No
  // pathfinding. Blocked everywhere => stay in place.
  _pursue(e) {
    const dx = Math.sign(this.player.x - e.x);
    const dy = Math.sign(this.player.y - e.y);
    const candidates = [];
    if (dx !== 0 && dy !== 0) {
      candidates.push([dx, dy]);
      if (Math.abs(this.player.x - e.x) >= Math.abs(this.player.y - e.y)) {
        candidates.push([dx, 0], [0, dy]);
      } else {
        candidates.push([0, dy], [dx, 0]);
      }
    } else if (dx !== 0) {
      candidates.push([dx, 0], [dx, -1], [dx, 1]);
    } else {
      candidates.push([0, dy], [-1, dy], [1, dy]);
    }
    for (const [cx, cy] of candidates) {
      if (this._enemyCanMoveTo(e.x + cx, e.y + cy)) {
        e.x += cx;
        e.y += cy;
        return;
      }
    }
    // no viable move — stay in place
  }

  // R103: unactivated enemies patrol randomly inside their spawning room —
  // one step to a random adjacent walkable tile within the room boundary.
  _patrol(e) {
    const room = this.floorData.rooms[e.roomIndex];
    if (!room) return;
    const options = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = e.x + dx;
        const ny = e.y + dy;
        if (!tileInRoom(room, nx, ny)) continue;
        if (!this._enemyCanMoveTo(nx, ny)) continue;
        options.push([nx, ny]);
      }
    }
    if (options.length === 0) return;
    const [nx, ny] = this.rng.pick(options);
    e.x = nx;
    e.y = ny;
  }

  // --------------------------------------------------------- inventory ----

  // FR-019: `I` toggles the inventory screen; the game loop pauses while
  // open (no enemy turns happen from inventory actions).
  openInventory() {
    if (this.mode !== MODE.PLAY) return;
    this.mode = MODE.INVENTORY;
    this.invCursor = 0;
  }

  closeInventory() {
    if (this.mode !== MODE.INVENTORY) return;
    this.mode = MODE.PLAY;
  }

  moveInventoryCursor(delta) {
    if (this.mode !== MODE.INVENTORY) return;
    const max = Math.max(0, MAX_INVENTORY - 1);
    this.invCursor = Math.min(max, Math.max(0, this.invCursor + delta));
  }

  // Use/equip the selected item (Enter). Potions are consumed; weapons and
  // armor swap with the currently equipped item (FR-019 swap semantics —
  // always succeeds regardless of inventory occupancy).
  useSelected() {
    if (this.mode !== MODE.INVENTORY) return;
    const idx = this.invCursor;
    const item = this.player.inventory[idx];
    if (!item) return;
    if (item.kind === 'potion') {
      // Edge case: potion at full HP is still consumed; HP capped at max.
      const before = this.player.hp;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + item.value);
      this.player.inventory.splice(idx, 1);
      this.pushLog(`You drink ${item.name}. (+${this.player.hp - before} HP)`);
    } else if (item.kind === 'weapon') {
      const prev = this.player.weapon;
      this.player.weapon = item;
      if (prev) this.player.inventory[idx] = prev;
      else this.player.inventory.splice(idx, 1);
      this.pushLog(`You equip ${item.name}.`);
    } else if (item.kind === 'armor') {
      const prev = this.player.armor;
      this.player.armor = item;
      if (prev) this.player.inventory[idx] = prev;
      else this.player.inventory.splice(idx, 1);
      this.pushLog(`You equip ${item.name}.`);
    }
    if (this.invCursor >= this.player.inventory.length && this.invCursor > 0) {
      this.invCursor = Math.max(0, this.player.inventory.length - 1);
    }
  }

  // ------------------------------------------------------------ restart ----

  // FR-008 / R101: `R` on the game-over or victory screen restarts from
  // floor 1 with fresh stats. An explicit URL seed is reused (reproducible);
  // auto-seeded runs get a fresh auto seed.
  restart() {
    if (this.mode !== MODE.GAME_OVER && this.mode !== MODE.VICTORY) return;
    this._startRun();
  }

  // Convenience for renderers/tests: is (x,y) lit right now?
  litAt(x, y) {
    return isLit(this.player.x, this.player.y, x, y);
  }
}
