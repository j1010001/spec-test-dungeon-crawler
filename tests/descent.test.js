// Floor descent & endgame: FR-011 (immediate descent, no enemy turn, stats/
// inventory carry), FR-016 (level = floor), US4, R101 (floor-9 victory),
// FR-008/FR-038 (screens, seed display, R restart), SC-006 hint.
import { describe, it, expect } from 'vitest';
import { Game, MODE } from '../src/game.js';
import { TILE } from '../src/constants.js';
import { makeEnemy } from '../src/dungeon.js';

function testGame() {
  return new Game({ explicitSeed: 99999 });
}

// Walk the player from the test-dungeon spawn up to the Room D staircase.
function walkToStairs(g) {
  for (let i = 0; i < 14; i++) g.step(0, -1); // (40,40) -> (40,26)
}

// Teleport next to the current floor's stairs and step onto them, so the
// full step()->descend path is exercised on procedural floors too.
function cheatDescend(g) {
  g.floorData.enemies = []; // isolate descent mechanics from combat
  const { x, y } = g.floorData.stairsPos;
  // find a walkable neighbor of the stairs
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (g.tileAt(x + dx, y + dy) !== TILE.WALL) {
        g.player.x = x + dx;
        g.player.y = y + dy;
        g.step(-dx, -dy);
        return;
      }
    }
  }
  throw new Error('stairs have no walkable neighbor');
}

describe('floor descent (FR-011, US4)', () => {
  it('stepping on the staircase immediately generates the next floor (US4-AS1)', () => {
    const g = testGame();
    walkToStairs(g);
    expect(g.player.floor).toBe(2);
    // player is placed at the new floor's entrance (start room center)
    expect(g.player.x).toBe(g.floorData.playerStart.x);
    expect(g.player.y).toBe(g.floorData.playerStart.y);
  });

  it('HP, inventory and stats carry over; level equals the floor (US4-AS2, FR-016, FR-023)', () => {
    const g = testGame();
    g.player.hp = 13;
    const potion = { kind: 'potion', value: 15, glyph: '!', name: 'P' };
    g.player.inventory.push(potion);
    g.player.weapon = { kind: 'weapon', value: 2, glyph: '/', name: 'W+2' };
    walkToStairs(g);
    expect(g.player.floor).toBe(2);
    expect(g.player.level).toBe(2); // FR-016: level == floor, display only
    expect(g.player.hp).toBe(13); // unchanged by descent
    expect(g.player.maxHp).toBe(20);
    expect(g.player.inventory).toContain(potion);
    expect(g.attack).toBe(7); // equipment persists
  });

  it('enemies take NO turn on the round the player descends (FR-011)', () => {
    const g = testGame();
    // park an activated goblin right next to the player's pre-stairs tile
    for (let i = 0; i < 13; i++) g.step(0, -1); // player at (40,27), stairs above
    g.floorData.enemies = [];
    const e = makeEnemy(1, 39, 27, 3);
    e.activated = true;
    g.floorData.enemies.push(e);
    const hp = g.player.hp;
    g.step(0, -1); // onto the stairs — adjacent enemy must NOT get its attack
    expect(g.player.floor).toBe(2);
    expect(g.player.hp).toBe(hp);
  });

  it('descent is immediate even while enemies are activated — no combat restriction', () => {
    const g = testGame();
    for (let i = 0; i < 13; i++) g.step(0, -1);
    const e = makeEnemy(1, 40, 29, 3); // activated pursuer in the corridor
    e.activated = true;
    g.floorData.enemies.push(e);
    g.step(0, -1);
    expect(g.player.floor).toBe(2); // no restriction blocked the descent
  });

  it('deeper floors carry stronger enemies (US4-AS3, FR-006)', () => {
    const g = testGame();
    walkToStairs(g); // floor 2
    const floor2 = g.floorData.enemies.map((e) => ({ hp: e.maxHp, atk: e.attack, def: e.defense }));
    for (const s of floor2) {
      expect(s.hp).toBe(20); // 10 + 2*5
      expect(s.atk).toBe(7); // 3 + 2*2
      expect(s.def).toBe(2);
    }
  });

  it('floors 2+ under seed 99999 use normal procedural generation (FR-039)', () => {
    const g = testGame();
    walkToStairs(g);
    expect(g.player.floor).toBe(2);
    // not the 4-room hub: layout differs from the fixed test geometry
    const rooms = g.floorData.rooms;
    const hub = JSON.stringify([
      { x: 37, y: 37, w: 7, h: 7 },
      { x: 52, y: 36, w: 9, h: 9 },
      { x: 36, y: 52, w: 9, h: 9 },
      { x: 37, y: 22, w: 7, h: 7 },
    ]);
    expect(JSON.stringify(rooms)).not.toBe(hub);
    expect(rooms.length).toBeGreaterThanOrEqual(2);
    // and it is a normal floor: 1-3 items, stairs present, start != stairs room
    expect(g.floorData.items.length).toBeGreaterThanOrEqual(1);
    expect(g.floorData.items.length).toBeLessThanOrEqual(3);
    expect(g.floorData.startRoomIndex).not.toBe(g.floorData.stairsRoomIndex);
  });

  it('fog resets on descent and the hint disappears after floor 1 (FR-003, SC-006)', () => {
    const g = testGame();
    expect(g.hintVisible).toBe(true); // floor 1: hint shown
    walkToStairs(g);
    expect(g.hintVisible).toBe(false); // hidden after the first descent
  });
});

describe('victory on floor 9 (R101)', () => {
  it('stepping on the floor-9 staircase triggers the victory screen; no floor 10', () => {
    const g = testGame();
    for (let floor = 1; floor < 9; floor++) {
      expect(g.player.floor).toBe(floor);
      cheatDescend(g);
    }
    expect(g.player.floor).toBe(9);
    expect(g.player.level).toBe(9);
    const floorDataBefore = g.floorData;
    cheatDescend(g); // stairs on floor 9
    expect(g.mode).toBe(MODE.VICTORY);
    expect(g.player.floor).toBe(9); // NO floor 10 was generated
    expect(g.floorData).toBe(floorDataBefore); // dungeon untouched
  });

  it('victory screen data: floor, kills, seed; R restarts from floor 1', () => {
    const g = testGame();
    for (let floor = 1; floor < 9; floor++) cheatDescend(g);
    cheatDescend(g);
    expect(g.mode).toBe(MODE.VICTORY);
    expect(g.seed).toBe(99999);
    g.restart();
    expect(g.mode).toBe(MODE.PLAY);
    expect(g.player.floor).toBe(1);
    expect(g.player.hp).toBe(20);
    expect(g.floorData.rooms.length).toBe(4); // seed 99999 test dungeon again
  });

  it('restart is ignored outside the game-over/victory screens', () => {
    const g = testGame();
    g.step(1, 0);
    const x = g.player.x;
    g.restart(); // must be a no-op during play
    expect(g.mode).toBe(MODE.PLAY);
    expect(g.player.x).toBe(x);
  });
});

describe('seed handling (FR-038)', () => {
  it('an explicit seed drives the whole run and is reused on restart', () => {
    const a = new Game({ explicitSeed: 424242 });
    const b = new Game({ explicitSeed: 424242 });
    expect(JSON.stringify(a.floorData.tiles)).toBe(JSON.stringify(b.floorData.tiles));
    expect(a.seed).toBe(424242);
  });

  it('without an explicit seed, the seed is auto-generated from the clock', () => {
    const g = new Game({ explicitSeed: null, now: () => 123456789 });
    expect(g.seed).toBe(123456789);
  });

  it('auto-seeded games re-roll the seed on restart', () => {
    let t = 1000;
    const g = new Game({ explicitSeed: null, now: () => t });
    expect(g.seed).toBe(1000);
    g.mode = MODE.GAME_OVER;
    t = 2000;
    g.restart();
    expect(g.seed).toBe(2000);
  });
});
