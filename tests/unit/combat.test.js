import { describe, it, expect } from 'vitest';
import { movePlayer, enemyTurn, playerAtk, playerDef } from '../../src/game.js';
import { makeGame, arenaSpec, goblin, potion, stubRng } from './helpers.js';

describe('bump-to-attack combat (FR-007, FR-021, US2)', () => {
  it('moving into an enemy tile attacks: enemy HP drops, player stays put', () => {
    const g = makeGame(() => arenaSpec({ enemies: [goblin(13, 12, 0, { activated: true })] }));
    const enemy = g.enemies[0];
    const before = enemy.hp;
    movePlayer(g, 1, 0);
    expect(enemy.hp).toBe(before - 4); // max(1, 5 atk - 1 def) = 4
    expect(g.player.x).toBe(12);
    expect(g.player.y).toBe(12);
  });

  it('damage is deterministic max(1, atk - def) with no random variance', () => {
    const g = makeGame(() => arenaSpec({ enemies: [goblin(13, 12, 0, { activated: true, hp: 100, maxHp: 100 })] }));
    const enemy = g.enemies[0];
    const deltas = [];
    for (let i = 0; i < 5; i++) {
      const before = enemy.hp;
      movePlayer(g, 1, 0);
      deltas.push(before - enemy.hp);
    }
    // enemy also strikes back but its damage never varies either
    expect(deltas).toEqual([4, 4, 4, 4, 4]);
  });

  it('minimum damage is 1 even against towering defense', () => {
    const g = makeGame(() => arenaSpec({ enemies: [goblin(13, 12, 0, { activated: true, def: 99 })] }));
    const before = g.enemies[0].hp;
    movePlayer(g, 1, 0);
    expect(g.enemies[0].hp).toBe(before - 1);
  });

  it('diagonal bump also attacks (8-directional adjacency)', () => {
    const g = makeGame(() => arenaSpec({ enemies: [goblin(13, 13, 0, { activated: true })] }));
    const before = g.enemies[0].hp;
    movePlayer(g, 1, 1);
    expect(g.enemies[0].hp).toBe(before - 4);
    expect([g.player.x, g.player.y]).toEqual([12, 12]);
  });

  it('a slain enemy is removed from the map and counted (US2-AS5)', () => {
    const g = makeGame(() => arenaSpec({ enemies: [goblin(13, 12, 0, { activated: true, hp: 4, maxHp: 15 })] }));
    g.rng = stubRng({ chance: false }); // no drop
    movePlayer(g, 1, 0);
    expect(g.enemies).toHaveLength(0);
    expect(g.enemiesDefeated).toBe(1);
    expect(g.log.some((l) => l.includes('Goblin dies'))).toBe(true);
  });

  it('a slain enemy drops an item on its tile when the 25% roll succeeds', () => {
    const g = makeGame(() => arenaSpec({ enemies: [goblin(13, 12, 0, { activated: true, hp: 4 })] }));
    g.rng = stubRng({ chance: true, int: (min) => min, pick: (a) => a[0] });
    movePlayer(g, 1, 0);
    expect(g.items).toHaveLength(1);
    expect(g.items[0].x).toBe(13);
    expect(g.items[0].y).toBe(12);
  });

  it('no drop when the 25% roll fails', () => {
    const g = makeGame(() => arenaSpec({ enemies: [goblin(13, 12, 0, { activated: true, hp: 4 })] }));
    g.rng = stubRng({ chance: false });
    movePlayer(g, 1, 0);
    expect(g.items).toHaveLength(0);
  });

  it('drop is skipped if the tile already holds an item (one item per tile, FR-025)', () => {
    const g = makeGame(() =>
      arenaSpec({
        enemies: [goblin(13, 12, 0, { activated: true, hp: 4 })],
        items: [potion(13, 12)],
      })
    );
    g.rng = stubRng({ chance: true });
    movePlayer(g, 1, 0);
    expect(g.items).toHaveLength(1); // still just the original potion
  });

  it('adjacent activated enemy strikes back after the player turn (US2-AS3)', () => {
    const g = makeGame(() => arenaSpec({ enemies: [goblin(13, 12, 0, { activated: true, hp: 100 })] }));
    movePlayer(g, 1, 0); // attack; goblin retaliates: max(1, 5 - 1 def) = 4
    expect(g.player.hp).toBe(16);
    expect(g.log.some((l) => l.includes('Goblin hits you for 4'))).toBe(true);
  });

  it('player death at 0 HP triggers game over with floor + kill count (FR-008, US2-AS4)', () => {
    const g = makeGame(() => arenaSpec({ enemies: [goblin(13, 12, 0, { activated: true, hp: 100 })] }));
    g.player.hp = 4;
    movePlayer(g, 1, 0);
    expect(g.player.hp).toBe(0);
    expect(g.status).toBe('gameover');
    expect(g.floor).toBe(1);
  });

  it('HP never renders below zero', () => {
    const g = makeGame(() => arenaSpec({ enemies: [goblin(13, 12, 0, { activated: true, hp: 100, atk: 50 })] }));
    movePlayer(g, 1, 0);
    expect(g.player.hp).toBe(0);
  });

  it('combat log lines follow the one-line HUD format (FR-018)', () => {
    const g = makeGame(() => arenaSpec({ enemies: [goblin(13, 12, 0, { activated: true, hp: 100 })] }));
    movePlayer(g, 1, 0);
    expect(g.log).toContain('You hit Goblin for 4.');
    expect(g.log).toContain('Goblin hits you for 4.');
  });

  it('a single-enemy encounter resolves within 20 turns (SC-003)', () => {
    const g = makeGame(() => arenaSpec({ enemies: [goblin(13, 12, 0, { activated: true })] }));
    g.rng = stubRng({ chance: false });
    let turns = 0;
    while (g.enemies.length > 0 && g.status === 'playing' && turns < 20) {
      movePlayer(g, 1, 0);
      turns++;
    }
    expect(turns).toBeLessThanOrEqual(20);
    expect(g.enemies).toHaveLength(0); // player ATK5 vs HP15/DEF1: 4 turns
    expect(g.status).toBe('playing');
  });

  it('player base stats are HP 20/20, ATK 5, DEF 1 (FR-023)', () => {
    const g = makeGame(() => arenaSpec({}));
    expect(g.player.hp).toBe(20);
    expect(g.player.maxHp).toBe(20);
    expect(playerAtk(g)).toBe(5);
    expect(playerDef(g)).toBe(1);
  });

  it('wall bump does not consume a turn: enemies do not act (US1-AS4)', () => {
    // player at room edge (5,5..) — move into the wall on the left
    const g = makeGame(() => arenaSpec({ enemies: [goblin(15, 12, 0, { activated: true })] }));
    g.player.x = 5;
    g.player.y = 12;
    const [ex, ey] = [g.enemies[0].x, g.enemies[0].y];
    const res = movePlayer(g, -1, 0);
    expect(res).toBe('blocked');
    expect([g.player.x, g.player.y]).toEqual([5, 12]);
    expect([g.enemies[0].x, g.enemies[0].y]).toEqual([ex, ey]);
  });

  it('moving out of bounds is blocked with no state change', () => {
    const g = makeGame(() => arenaSpec({ rooms: [{ x: 0, y: 0, w: 5, h: 5 }], spawn: { x: 0, y: 0 }, stairs: { x: 4, y: 4 } }));
    expect(movePlayer(g, -1, 0)).toBe('blocked');
    expect(movePlayer(g, 0, -1)).toBe('blocked');
    expect([g.player.x, g.player.y]).toEqual([0, 0]);
  });
});

describe('enemy retaliation only after a real player action', () => {
  it('enemies act after a successful move', () => {
    const g = makeGame(() => arenaSpec({ enemies: [goblin(16, 12, 0, { activated: true })] }));
    movePlayer(g, 0, -1);
    // goblin pursues: moved one tile closer
    const e = g.enemies[0];
    expect(Math.abs(e.x - 16) + Math.abs(e.y - 12)).toBeGreaterThan(0);
  });
});
