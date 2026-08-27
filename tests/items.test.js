// Items & inventory: FR-009 (pickup, 10-slot cap), FR-010 (three types),
// FR-019 (inventory screen, swap-equip), US3 scenarios, full-inventory and
// full-HP-potion edge cases.
import { describe, it, expect } from 'vitest';
import { Game, MODE } from '../src/game.js';
import { TEST_LAYOUT } from '../src/dungeon.js';
import { MAX_INVENTORY } from '../src/constants.js';

function testGame() {
  // Test dungeon, goblin removed so item behavior is isolated.
  const g = new Game({ explicitSeed: 99999 });
  g.floorData.enemies = [];
  return g;
}

// Teleport the player next to a ground item and step onto it.
function walkOnto(g, x, y) {
  g.player.x = x - 1;
  g.player.y = y;
  g.step(1, 0);
}

function groundItems(g) {
  return g.floorData.items;
}

describe('item pickup (FR-009, US3-AS1)', () => {
  it('moving onto an item tile adds it to the inventory and clears the tile', () => {
    const g = testGame();
    const item = groundItems(g)[0];
    const { x, y } = item;
    walkOnto(g, x, y);
    expect(g.player.inventory).toContain(item);
    expect(g.itemAt(x, y)).toBeNull();
    expect(item.x).toBeUndefined(); // in inventory => no position
    expect(g.log.some((l) => l.includes('You pick up'))).toBe(true);
  });

  it('the test dungeon lets the player fill all 10 slots and overflow on the 11th (FR-039)', () => {
    const g = testGame();
    const items = [...groundItems(g)];
    expect(items.length).toBe(11);
    for (let i = 0; i < 10; i++) walkOnto(g, items[i].x, items[i].y);
    expect(g.player.inventory.length).toBe(MAX_INVENTORY);
    // 11th pickup attempt: item stays on the floor, HUD message shown
    const eleventh = items[10];
    walkOnto(g, eleventh.x, eleventh.y);
    expect(g.player.inventory.length).toBe(MAX_INVENTORY);
    expect(g.itemAt(eleventh.x, eleventh.y)).toBe(eleventh); // remains on floor
    expect(g.log.some((l) => l.includes('Inventory full'))).toBe(true);
    // player still moved onto the tile (pickup refused, movement not blocked)
    expect(g.player.x).toBe(eleventh.x);
    expect(g.player.y).toBe(eleventh.y);
  });

  it('Room B items cover all three types (FR-010, FR-039)', () => {
    const g = testGame();
    const kinds = new Set(groundItems(g).map((it) => it.kind));
    expect(kinds).toEqual(new Set(['potion', 'weapon', 'armor']));
  });
});

describe('inventory screen (FR-019, US3)', () => {
  function gameWithInventory(items) {
    const g = testGame();
    g.player.inventory.push(...items);
    return g;
  }

  it('I opens, Esc closes; the game loop pauses while open', () => {
    const g = testGame();
    g.openInventory();
    expect(g.mode).toBe(MODE.INVENTORY);
    const { x, y } = g.player;
    g.step(1, 0); // movement is ignored while the inventory is open
    expect(g.player.x).toBe(x);
    expect(g.player.y).toBe(y);
    g.closeInventory();
    expect(g.mode).toBe(MODE.PLAY);
  });

  it('cursor moves across the 10 slots and clamps at the ends', () => {
    const g = testGame();
    g.openInventory();
    expect(g.invCursor).toBe(0);
    g.moveInventoryCursor(-1);
    expect(g.invCursor).toBe(0); // clamped
    for (let i = 0; i < 15; i++) g.moveInventoryCursor(1);
    expect(g.invCursor).toBe(MAX_INVENTORY - 1); // clamped at slot 10
  });

  it('using a potion restores HP up to max and consumes it (US3-AS2)', () => {
    const g = gameWithInventory([
      { kind: 'potion', value: 15, glyph: '!', name: 'Health Potion (+15 HP)' },
    ]);
    g.player.hp = 4;
    g.openInventory();
    g.useSelected();
    expect(g.player.hp).toBe(19); // 4 + 15
    expect(g.player.inventory.length).toBe(0);
  });

  it('potion healing never exceeds max HP', () => {
    const g = gameWithInventory([{ kind: 'potion', value: 15, glyph: '!', name: 'P' }]);
    g.player.hp = 12;
    g.openInventory();
    g.useSelected();
    expect(g.player.hp).toBe(20); // capped at max
  });

  it('a potion used at full HP is still consumed; HP stays at max (edge case)', () => {
    const g = gameWithInventory([{ kind: 'potion', value: 15, glyph: '!', name: 'P' }]);
    expect(g.player.hp).toBe(g.player.maxHp);
    g.openInventory();
    g.useSelected();
    expect(g.player.hp).toBe(g.player.maxHp); // no overflow
    expect(g.player.inventory.length).toBe(0); // no prevention of use
  });

  it('equipping a weapon raises displayed attack (US3-AS3, FR-005)', () => {
    const g = gameWithInventory([{ kind: 'weapon', value: 3, glyph: '/', name: 'W+3' }]);
    expect(g.attack).toBe(5);
    g.openInventory();
    g.useSelected();
    expect(g.player.weapon.value).toBe(3);
    expect(g.attack).toBe(8); // base 5 + 3
    expect(g.player.inventory.length).toBe(0); // nothing equipped before => slot freed
  });

  it('equipping armor raises displayed defense (US3-AS4, FR-005)', () => {
    const g = gameWithInventory([{ kind: 'armor', value: 2, glyph: ']', name: 'A+2' }]);
    expect(g.defense).toBe(1);
    g.openInventory();
    g.useSelected();
    expect(g.defense).toBe(3);
  });

  it('equip is a swap: the previous item returns to the freed slot (FR-019)', () => {
    const w1 = { kind: 'weapon', value: 1, glyph: '/', name: 'W+1' };
    const w2 = { kind: 'weapon', value: 4, glyph: '/', name: 'W+4' };
    const g = gameWithInventory([w1, w2]);
    g.openInventory();
    g.useSelected(); // equip w1 (slot 0); nothing equipped before
    expect(g.player.weapon).toBe(w1);
    expect(g.player.inventory).toEqual([w2]);
    g.invCursor = 0;
    g.useSelected(); // equip w2; w1 must return to w2's slot
    expect(g.player.weapon).toBe(w2);
    expect(g.player.inventory).toEqual([w1]);
    expect(g.attack).toBe(9);
  });

  it('swap-equip succeeds even with a completely full inventory (FR-019)', () => {
    const filler = Array.from({ length: 9 }, (_, i) => ({
      kind: 'potion',
      value: 15,
      glyph: '!',
      name: `P${i}`,
    }));
    const w1 = { kind: 'weapon', value: 1, glyph: '/', name: 'W+1' };
    const w2 = { kind: 'weapon', value: 4, glyph: '/', name: 'W+4' };
    const g = testGame();
    g.player.weapon = w1; // already equipped
    g.player.inventory.push(...filler, w2); // 10/10 slots used
    expect(g.player.inventory.length).toBe(MAX_INVENTORY);
    g.openInventory();
    g.invCursor = 9; // select w2
    g.useSelected();
    expect(g.player.weapon).toBe(w2);
    expect(g.player.inventory[9]).toBe(w1); // swapped into the freed slot
    expect(g.player.inventory.length).toBe(MAX_INVENTORY); // still exactly 10
  });

  it('using an empty slot does nothing', () => {
    const g = testGame();
    g.openInventory();
    g.invCursor = 5;
    const hp = g.player.hp;
    g.useSelected();
    expect(g.player.hp).toBe(hp);
    expect(g.mode).toBe(MODE.INVENTORY);
  });

  it('all held items list their effects (US3-AS5)', () => {
    const g = testGame();
    for (const it of [...groundItems(g)].slice(0, 5)) walkOnto(g, it.x, it.y);
    expect(g.player.inventory.length).toBe(5);
    for (const it of g.player.inventory) {
      expect(it.name).toMatch(/\+\d+ (HP|ATK|DEF)/); // effect visible in the label
    }
  });
});

describe('enemy drops use the death-floor formulas (Key Entities)', () => {
  it('drop bonus values are within floor + 0..2 for gear, exact for potions', () => {
    // covered behaviorally in combat.test.js; here verify formula helpers on
    // the actual generated Room B items (floor 1)
    const g = testGame();
    for (const it of groundItems(g)) {
      if (it.kind === 'potion') expect(it.value).toBe(15); // 10 + 1*5
      else {
        expect(it.value).toBeGreaterThanOrEqual(1);
        expect(it.value).toBeLessThanOrEqual(3); // 1 + 0..2
      }
    }
  });
});
