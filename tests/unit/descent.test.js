import { describe, it, expect } from 'vitest';
import { MAX_FLOOR } from '../../src/constants.js';
import { createGame, movePlayer } from '../../src/game.js';
import { makeGame, arenaSpec, goblin, potion } from './helpers.js';

// Every floor: stairs immediately right of spawn, one enemy adjacent to spawn
// on the left (to prove enemies get no turn on descent).
const stairsSpec = () =>
  arenaSpec({
    spawn: { x: 12, y: 12 },
    stairs: { x: 13, y: 12 },
    enemies: [goblin(11, 12, 0, { activated: true, hp: 999 })],
  });

describe('floor descent (FR-011, US4)', () => {
  it('stepping on the staircase immediately generates the next floor', () => {
    const g = makeGame(stairsSpec);
    movePlayer(g, 1, 0);
    expect(g.floor).toBe(2);
    expect([g.player.x, g.player.y]).toEqual([12, 12]); // new spawn
  });

  it('enemies take no turn on the descent round (FR-011)', () => {
    const g = makeGame(stairsSpec);
    expect(g.player.hp).toBe(20);
    movePlayer(g, 1, 0); // adjacent goblin would hit for 4 if it got a turn
    expect(g.player.hp).toBe(20);
  });

  it('HP, stats and inventory persist across floors (US4-AS2)', () => {
    const g = makeGame(stairsSpec);
    g.player.hp = 13;
    g.player.inventory = [potion(0, 0)];
    g.player.weapon = { kind: 'weapon', name: 'Weapon', glyph: '/', value: 3 };
    movePlayer(g, 1, 0);
    expect(g.floor).toBe(2);
    expect(g.player.hp).toBe(13);
    expect(g.player.inventory).toHaveLength(1);
    expect(g.player.weapon.value).toBe(3);
  });

  it('level equals floor number, display only (FR-016)', () => {
    const g = makeGame(stairsSpec);
    expect(g.floor).toBe(1);
    movePlayer(g, 1, 0);
    expect(g.floor).toBe(2); // HUD renders Level = state.floor
  });

  it('kill count accumulates across the whole run', () => {
    const g = makeGame((floor) =>
      floor === 1
        ? arenaSpec({
            spawn: { x: 12, y: 12 },
            stairs: { x: 13, y: 12 },
            enemies: [goblin(11, 12, 0, { activated: true, hp: 1 })],
          })
        : stairsSpec()
    );
    movePlayer(g, -1, 0); // kill the 1-HP goblin
    expect(g.enemiesDefeated).toBe(1);
    movePlayer(g, 1, 0); // step on stairs
    expect(g.floor).toBe(2);
    expect(g.enemiesDefeated).toBe(1);
  });

  it('stepping on the floor-9 staircase triggers victory; floor 10 is never generated (R101)', () => {
    let deepestRequested = 0;
    const g = makeGame((floor) => {
      deepestRequested = Math.max(deepestRequested, floor);
      const spec = stairsSpec();
      spec.enemies = [];
      return spec;
    });
    for (let f = 1; f <= 9; f++) {
      expect(g.status).toBe('playing');
      movePlayer(g, 1, 0); // onto stairs
    }
    expect(g.status).toBe('victory');
    expect(g.floor).toBe(9); // still on floor 9 — no floor 10
    expect(deepestRequested).toBe(9);
    expect(MAX_FLOOR).toBe(9);
  });

  it('after game over or victory, movement input is ignored', () => {
    const g = makeGame((floor) => {
      const spec = stairsSpec();
      spec.enemies = [];
      return spec;
    });
    for (let f = 1; f <= 9; f++) movePlayer(g, 1, 0);
    expect(g.status).toBe('victory');
    const [x, y] = [g.player.x, g.player.y];
    movePlayer(g, 0, 1);
    expect([g.player.x, g.player.y]).toEqual([x, y]);
  });
});

describe('run restart (FR-008, R101, US4-AS4)', () => {
  it('a fresh game with the same seed reproduces the identical floor 1 (page refresh = new run)', () => {
    const a = createGame(4242);
    const b = createGame(4242);
    expect(Array.from(a.tiles)).toEqual(Array.from(b.tiles));
    expect(a.spawn).toEqual(b.spawn);
    expect(b.floor).toBe(1);
    expect(b.player.hp).toBe(20);
    expect(b.player.inventory).toHaveLength(0);
    expect(b.enemiesDefeated).toBe(0);
    expect(b.status).toBe('playing');
  });

  it('the game state exposes the active seed for the end screens (FR-038)', () => {
    const g = createGame(31337);
    expect(g.seed).toBe(31337);
  });
});
