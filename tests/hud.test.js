// HUD log (FR-018 rolling 50-line buffer) and structured developer logging
// (FR-037) — plus SC-004 state-consistency spot checks.
import { describe, it, expect, afterEach } from 'vitest';
import { Game } from '../src/game.js';
import { logEvent, setLogSink } from '../src/logger.js';
import { LOG_LINES } from '../src/constants.js';

afterEach(() => setLogSink(null));

describe('HUD combat log (FR-018)', () => {
  it('retains at most the last 50 lines in a rolling buffer', () => {
    const g = new Game({ explicitSeed: 99999 });
    for (let i = 1; i <= 120; i++) g.pushLog(`line ${i}`);
    expect(g.log.length).toBe(LOG_LINES);
    expect(g.log[0]).toBe('line 71'); // oldest surviving line
    expect(g.log[g.log.length - 1]).toBe('line 120'); // newest kept
  });

  it('each combat event appends a one-line message', () => {
    const g = new Game({ explicitSeed: 99999 });
    const before = g.log.length;
    g.pushLog('You hit Goblin for 4.');
    expect(g.log.length).toBe(before + 1);
    expect(g.log[g.log.length - 1]).not.toContain('\n');
  });
});

describe('structured developer logging (FR-037)', () => {
  it('emits events with timestamp, level, component and message', () => {
    const events = [];
    setLogSink((e) => events.push(e));
    logEvent('info', 'combat', 'Goblin defeated', { floor: 3 });
    expect(events.length).toBe(1);
    const e = events[0];
    expect(typeof e.timestamp).toBe('string');
    expect(new Date(e.timestamp).toString()).not.toBe('Invalid Date');
    expect(e.level).toBe('info');
    expect(e.component).toBe('combat');
    expect(e.message).toBe('Goblin defeated');
    expect(e.data).toEqual({ floor: 3 });
  });

  it('game lifecycle emits structured events distinct from the HUD log', () => {
    const events = [];
    setLogSink((e) => events.push(e));
    const g = new Game({ explicitSeed: 99999 });
    expect(events.some((e) => e.component === 'dungeon')).toBe(true); // floor gen
    expect(events.some((e) => e.component === 'game')).toBe(true); // run start
    for (const e of events) {
      expect(['info', 'warn', 'error']).toContain(e.level);
      expect(typeof e.message).toBe('string');
    }
    // HUD log is separate and player-facing
    expect(g.log.every((line) => typeof line === 'string')).toBe(true);
  });
});

describe('state consistency (SC-004)', () => {
  it('HUD-facing state stays coherent across a scripted run segment', () => {
    const g = new Game({ explicitSeed: 99999 });
    const dirs = [
      [1, 0], [1, 0], [1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, 0],
      [1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0],
    ];
    for (const [dx, dy] of dirs) {
      g.step(dx, dy);
      expect(g.player.hp).toBeLessThanOrEqual(g.player.maxHp);
      expect(g.player.level).toBe(g.player.floor);
      expect(g.player.inventory.length).toBeLessThanOrEqual(10);
      // every enemy is inside the grid and on a walkable tile
      for (const e of g.floorData.enemies) {
        expect(e.hp).toBeGreaterThan(0); // dead enemies are removed
        expect(g.tileAt(e.x, e.y)).not.toBe(0 /* TILE.WALL */);
      }
      if (g.mode !== 'play') break;
    }
  });
});
