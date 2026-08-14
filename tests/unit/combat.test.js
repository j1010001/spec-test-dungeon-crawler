import { describe, it, expect } from 'vitest';
import { playerAttackEnemy, enemyAttackPlayer, rollEnemyDrop } from '../../src/combat.js';
import { createPlayer } from '../../src/entities.js';
import { Rng } from '../../src/rng.js';
import { computeDamage } from '../../src/constants.js';

describe('combat.js — damage formula (FR-021)', () => {
  it('max(1, attack - defense), deterministic, no variance', () => {
    expect(computeDamage({ attack: 5 }, { defense: 1 })).toBe(4);
    expect(computeDamage({ attack: 3 }, { defense: 10 })).toBe(1); // floor at 1
    expect(computeDamage({ attack: 5 }, { defense: 5 })).toBe(1);
  });

  it('player bump-attacking an enemy deals damage and does not move the player', () => {
    const player = createPlayer();
    const enemy = { hp: 15, maxHp: 15, defense: 1, type: 'Goblin', alive: true };
    const result = playerAttackEnemy(player, enemy);
    expect(result.damage).toBe(4); // 5 atk - 1 def
    expect(enemy.hp).toBe(11);
    expect(result.enemyDied).toBe(false);
  });

  it('enemy dies at 0 HP and is flagged not alive', () => {
    const player = createPlayer();
    player.baseAttack = 20;
    const enemy = { hp: 5, maxHp: 15, defense: 1, type: 'Goblin', alive: true };
    const result = playerAttackEnemy(player, enemy);
    expect(enemy.hp).toBe(0);
    expect(enemy.alive).toBe(false);
    expect(result.enemyDied).toBe(true);
  });

  it('enemy attacks reduce player HP using the same formula', () => {
    const player = createPlayer();
    const enemy = { attack: 5, type: 'Goblin' };
    const result = enemyAttackPlayer(player, enemy);
    expect(result.damage).toBe(4); // 5 atk - 1 def
    expect(player.hp).toBe(16);
  });

  it('player death is flagged when HP reaches zero', () => {
    const player = createPlayer();
    player.hp = 3;
    const enemy = { attack: 100, type: 'Wraith' };
    const result = enemyAttackPlayer(player, enemy);
    expect(player.hp).toBe(0);
    expect(result.playerDied).toBe(true);
  });

  it('rollEnemyDrop is a seeded 25% chance', () => {
    const rng = new Rng(1);
    let drops = 0;
    const trials = 5000;
    for (let i = 0; i < trials; i += 1) if (rollEnemyDrop(rng)) drops += 1;
    const rate = drops / trials;
    expect(rate).toBeGreaterThan(0.2);
    expect(rate).toBeLessThan(0.3);
  });
});
