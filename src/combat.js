// Combat resolution shared by player attacks and enemy attacks (FR-007,
// FR-021, FR-022).

import { computeDamage } from './constants.js';
import { playerAttack, playerDefense } from './entities.js';

/**
 * Player attempts to move into an enemy's tile: this IS the attack (no
 * separate attack command). Player deals damage and does not move.
 * @returns {{damage: number, enemyDied: boolean, message: string}}
 */
export function playerAttackEnemy(player, enemy) {
  const attacker = { attack: playerAttack(player) };
  const damage = computeDamage(attacker, enemy);
  enemy.hp = Math.max(0, enemy.hp - damage);
  const enemyDied = enemy.hp === 0;
  if (enemyDied) {
    enemy.alive = false;
  }
  return {
    damage,
    enemyDied,
    message: `You hit ${enemy.type} for ${damage}.${enemyDied ? ` ${enemy.type} dies!` : ''}`,
  };
}

/**
 * Enemy attacks the player (used when the enemy is already adjacent at the
 * start of its turn — FR-022).
 * @returns {{damage: number, playerDied: boolean, message: string}}
 */
export function enemyAttackPlayer(player, enemy) {
  const defender = { defense: playerDefense(player) };
  const damage = computeDamage(enemy, defender);
  player.hp = Math.max(0, player.hp - damage);
  const playerDied = player.hp === 0;
  return {
    damage,
    playerDied,
    message: `${enemy.type} hits you for ${damage}.`,
  };
}

/** 25% drop chance for a defeated enemy (US2-AS5). */
export function rollEnemyDrop(rng) {
  return rng.chance(0.25);
}
