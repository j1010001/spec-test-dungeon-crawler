// Core turn-based game state and rules.
// Combat (FR-007/FR-021), enemy AI (FR-022/FR-026/R103), items (FR-009/FR-010/
// FR-019/FR-025), fog of war (FR-003/R100), descent & victory (FR-011/R101),
// game over (FR-008), HUD log (FR-018).
import {
  GRID_W,
  GRID_H,
  TILE_WALL,
  TILE_FLOOR,
  TILE_STAIRS,
  SIGHT_RADIUS,
  MAX_FLOOR,
  INVENTORY_CAP,
  LOG_MAX,
  PLAYER_BASE_HP,
  PLAYER_BASE_ATK,
  PLAYER_BASE_DEF,
} from './constants.js';
import { createRng } from './rng.js';
import { createLogger } from './logger.js';
import { generateFloor, tileIndex, inBounds, chebyshev, roomAt, roomContains } from './dungeon.js';
import { makeRandomItem, itemLabel } from './entities.js';

export function pushLog(state, line) {
  state.log.push(line);
  while (state.log.length > LOG_MAX) state.log.shift();
}

export function playerAtk(state) {
  return state.player.baseAtk + (state.player.weapon ? state.player.weapon.value : 0);
}

export function playerDef(state) {
  return state.player.baseDef + (state.player.armor ? state.player.armor.value : 0);
}

export function enemyAt(state, x, y) {
  return state.enemies.find((e) => e.x === x && e.y === y) || null;
}

export function itemAt(state, x, y) {
  return state.items.find((it) => it.x === x && it.y === y) || null;
}

function damage(atk, def) {
  return Math.max(1, atk - def); // FR-021: deterministic, minimum 1
}

// Fog of war (FR-003, R100): lit = within Chebyshev radius 5 of the player;
// dimmed = previously seen; hidden = never seen.
export function updateVisibility(state) {
  const { x, y } = state.player;
  for (let ty = Math.max(0, y - SIGHT_RADIUS); ty <= Math.min(GRID_H - 1, y + SIGHT_RADIUS); ty++) {
    for (let tx = Math.max(0, x - SIGHT_RADIUS); tx <= Math.min(GRID_W - 1, x + SIGHT_RADIUS); tx++) {
      state.seen[tileIndex(tx, ty)] = 1;
    }
  }
}

export function visibilityAt(state, x, y) {
  if (chebyshev(x, y, state.player.x, state.player.y) <= SIGHT_RADIUS) return 'lit';
  return state.seen[tileIndex(x, y)] ? 'dimmed' : 'hidden';
}

function enterFloor(state, floor) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const data = state.floorGen(floor, state.seed, state.rng);
  const t1 = typeof performance !== 'undefined' ? performance.now() : 0;
  state.floor = floor;
  state.tiles = data.tiles;
  state.rooms = data.rooms;
  state.corridors = data.corridors || [];
  state.spawn = data.spawn;
  state.spawnRoom = data.spawnRoom;
  state.stairs = data.stairs;
  state.enemies = data.enemies;
  state.items = data.items;
  state.player.x = data.spawn.x;
  state.player.y = data.spawn.y;
  state.seen = new Uint8Array(GRID_W * GRID_H); // fresh fog per floor (FR-003)
  updateVisibility(state);
  state.logger.info('dungeon', `floor ${floor} generated in ${(t1 - t0).toFixed(1)}ms: ${data.rooms.length} rooms, ${data.enemies.length} enemies, ${data.items.length} items`);
}

export function createGame(seed, floorGen, logger) {
  const state = {
    seed,
    rng: createRng(seed),
    floorGen: floorGen || generateFloor,
    logger: logger || createLogger(),
    status: 'playing', // 'playing' | 'gameover' | 'victory'
    floor: 1,
    enemiesDefeated: 0,
    player: {
      x: 0,
      y: 0,
      hp: PLAYER_BASE_HP,
      maxHp: PLAYER_BASE_HP,
      baseAtk: PLAYER_BASE_ATK,
      baseDef: PLAYER_BASE_DEF,
      weapon: null,
      armor: null,
      inventory: [],
    },
    log: [],
    tiles: null,
    rooms: [],
    corridors: [],
    spawn: { x: 0, y: 0 },
    spawnRoom: 0,
    stairs: { x: 0, y: 0 },
    enemies: [],
    items: [],
    seen: null,
  };
  enterFloor(state, 1);
  pushLog(state, 'You descend into the dungeon. Reach the stairs (>) to go deeper.');
  state.logger.info('game', `run started, seed ${seed}`);
  return state;
}

function killEnemy(state, enemy) {
  const i = state.enemies.indexOf(enemy);
  if (i >= 0) state.enemies.splice(i, 1);
  state.enemiesDefeated++;
  pushLog(state, `${enemy.name} dies.`);
  // 25% drop on the enemy's tile (US2-AS5) — skipped if the tile already
  // holds an item (one item per tile, FR-025).
  if (state.rng.chance(0.25) && !itemAt(state, enemy.x, enemy.y)) {
    const drop = { ...makeRandomItem(state.floor, state.rng), x: enemy.x, y: enemy.y };
    state.items.push(drop);
    pushLog(state, `${enemy.name} drops ${itemLabel(drop)}.`);
  }
}

function activateRoomEnemies(state) {
  // R103: room-wide aggro the moment the player's tile belongs to a room.
  const room = roomAt(state.rooms, state.player.x, state.player.y);
  if (room < 0) return;
  for (const e of state.enemies) {
    if (!e.activated && e.roomIndex === room) e.activated = true;
  }
}

function pickUpItem(state) {
  const item = itemAt(state, state.player.x, state.player.y);
  if (!item) return;
  if (state.player.inventory.length >= INVENTORY_CAP) {
    pushLog(state, `Inventory full — ${itemLabel(item)} stays on the ground.`);
    return;
  }
  state.items.splice(state.items.indexOf(item), 1);
  const { x, y, ...carried } = item;
  state.player.inventory.push(carried);
  pushLog(state, `You pick up ${itemLabel(item)}.`);
}

function playerDies(state) {
  state.player.hp = 0;
  state.status = 'gameover';
  pushLog(state, `You die on floor ${state.floor}.`);
  state.logger.info('game', `game over on floor ${state.floor}, ${state.enemiesDefeated} enemies defeated, seed ${state.seed}`);
}

// One enemy phase (after every real player action). FR-022, FR-026, R103.
export function enemyTurn(state) {
  if (state.status !== 'playing') return;
  const occupied = new Set(state.enemies.map((e) => `${e.x},${e.y}`));

  const walkable = (x, y) =>
    inBounds(x, y) &&
    state.tiles[tileIndex(x, y)] === TILE_FLOOR && // walls & stairs excluded
    !(x === state.player.x && y === state.player.y);

  for (const enemy of state.enemies) {
    if (enemy.activated) {
      if (chebyshev(enemy.x, enemy.y, state.player.x, state.player.y) <= 1) {
        // Adjacent (8-directional): attack instead of moving (FR-022).
        const dmg = damage(enemy.atk, playerDef(state));
        state.player.hp -= dmg;
        pushLog(state, `${enemy.name} hits you for ${dmg}.`);
        if (state.player.hp <= 0) {
          playerDies(state);
          return;
        }
        continue;
      }
      // Greedy step with wall-sliding: preferred step, then axis fallbacks.
      const dx = Math.sign(state.player.x - enemy.x);
      const dy = Math.sign(state.player.y - enemy.y);
      const candidates = [[dx, dy]];
      if (dx !== 0 && dy !== 0) {
        if (Math.abs(state.player.x - enemy.x) >= Math.abs(state.player.y - enemy.y)) {
          candidates.push([dx, 0], [0, dy]);
        } else {
          candidates.push([0, dy], [dx, 0]);
        }
      } else if (dx !== 0) {
        candidates.push([dx, -1], [dx, 1]);
      } else {
        candidates.push([-1, dy], [1, dy]);
      }
      for (const [cx, cy] of candidates) {
        const nx = enemy.x + cx;
        const ny = enemy.y + cy;
        if (!walkable(nx, ny)) continue; // terrain block: try the next slide
        if (occupied.has(`${nx},${ny}`)) break; // enemy claim: blocked, stay (FR-026)
        occupied.delete(`${enemy.x},${enemy.y}`);
        occupied.add(`${nx},${ny}`);
        enemy.x = nx;
        enemy.y = ny;
        break;
      }
    } else {
      // Idle patrol inside the spawn room (R103, Session 2026-06-26).
      const room = state.rooms[enemy.roomIndex];
      if (!room) continue;
      const options = [];
      for (let cy = -1; cy <= 1; cy++) {
        for (let cx = -1; cx <= 1; cx++) {
          if (!cx && !cy) continue;
          const nx = enemy.x + cx;
          const ny = enemy.y + cy;
          if (!roomContains(room, nx, ny)) continue;
          if (!walkable(nx, ny)) continue;
          if (occupied.has(`${nx},${ny}`)) continue; // iteration-order collision (FR-026)
          options.push([nx, ny]);
        }
      }
      if (options.length > 0) {
        const [nx, ny] = state.rng.pick(options);
        occupied.delete(`${enemy.x},${enemy.y}`);
        occupied.add(`${nx},${ny}`);
        enemy.x = nx;
        enemy.y = ny;
      }
    }
  }
}

// Player action: move / bump-attack / descend. Returns the action taken:
// 'blocked' | 'attack' | 'move' | 'descend' | 'victory' | 'none'.
export function movePlayer(state, dx, dy) {
  if (state.status !== 'playing') return 'none';
  dx = Math.sign(dx);
  dy = Math.sign(dy);
  if (dx === 0 && dy === 0) return 'none';
  const tx = state.player.x + dx;
  const ty = state.player.y + dy;

  // Wall / boundary: blocked, no position change, no turn consumed (US1-AS4).
  if (!inBounds(tx, ty) || state.tiles[tileIndex(tx, ty)] === TILE_WALL) {
    return 'blocked';
  }

  const target = enemyAt(state, tx, ty);
  if (target) {
    // Bump-to-attack (FR-007): damage the enemy, stay in place.
    const dmg = damage(playerAtk(state), target.def);
    target.hp -= dmg;
    pushLog(state, `You hit ${target.name} for ${dmg}.`);
    if (target.hp <= 0) killEnemy(state, target);
    enemyTurn(state);
    return 'attack';
  }

  state.player.x = tx;
  state.player.y = ty;

  if (state.tiles[tileIndex(tx, ty)] === TILE_STAIRS) {
    // Immediate descent; enemies get no turn this round (FR-011).
    if (state.floor >= MAX_FLOOR) {
      state.status = 'victory';
      pushLog(state, 'You step onto the staircase... and emerge victorious!');
      state.logger.info('game', `victory! floor ${state.floor}, ${state.enemiesDefeated} enemies defeated, seed ${state.seed}`);
      return 'victory';
    }
    enterFloor(state, state.floor + 1);
    pushLog(state, `You descend to floor ${state.floor}.`);
    return 'descend';
  }

  pickUpItem(state);
  activateRoomEnemies(state);
  updateVisibility(state);
  enemyTurn(state);
  updateVisibility(state);
  return 'move';
}

// Inventory use/equip (FR-019, US3): potions consume; weapons/armor swap with
// the equipped slot — the swap always succeeds regardless of occupancy.
export function useInventoryItem(state, index) {
  const item = state.player.inventory[index];
  if (!item) return false;
  if (item.kind === 'potion') {
    const before = state.player.hp;
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + item.value);
    state.player.inventory.splice(index, 1);
    pushLog(state, `You drink ${itemLabel(item)} and restore ${state.player.hp - before} HP.`);
    return true;
  }
  const slot = item.kind === 'weapon' ? 'weapon' : 'armor';
  const previous = state.player[slot];
  state.player[slot] = item;
  if (previous) {
    state.player.inventory[index] = previous;
  } else {
    state.player.inventory.splice(index, 1);
  }
  pushLog(state, `You equip ${itemLabel(item)}.`);
  return true;
}
