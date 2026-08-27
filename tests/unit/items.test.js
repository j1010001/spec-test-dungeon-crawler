import { describe, it, expect } from 'vitest';
import { INVENTORY_CAP } from '../../src/constants.js';
import { movePlayer, useInventoryItem, playerAtk, playerDef } from '../../src/game.js';
import { itemLabel } from '../../src/entities.js';
import { makeGame, arenaSpec, potion, weapon, armor } from './helpers.js';

describe('item pickup (FR-009, US3-AS1)', () => {
  it('moving onto an item tile adds it to inventory and clears the floor', () => {
    const g = makeGame(() => arenaSpec({ items: [potion(13, 12)] }));
    movePlayer(g, 1, 0);
    expect(g.items).toHaveLength(0);
    expect(g.player.inventory).toHaveLength(1);
    expect(g.player.inventory[0].kind).toBe('potion');
    expect(g.log.some((l) => l.includes('You pick up Potion'))).toBe(true);
  });

  it('inventory caps at 10 slots; overflow pickup leaves the item and warns (Edge Case)', () => {
    const g = makeGame(() => arenaSpec({ items: [potion(13, 12)] }));
    g.player.inventory = Array.from({ length: INVENTORY_CAP }, () => ({
      kind: 'potion', name: 'Potion', glyph: '!', value: 15,
    }));
    movePlayer(g, 1, 0);
    expect(g.player.x).toBe(13); // move still happens
    expect(g.player.inventory).toHaveLength(10);
    expect(g.items).toHaveLength(1); // item stays on the floor
    expect(g.log.some((l) => l.toLowerCase().includes('inventory full'))).toBe(true);
  });

  it('inventory cap is exactly 10', () => {
    expect(INVENTORY_CAP).toBe(10);
  });
});

describe('potions (US3-AS2, Edge Cases)', () => {
  it('drinking a potion restores HP up to max and consumes it', () => {
    const g = makeGame(() => arenaSpec({}));
    g.player.hp = 5;
    g.player.inventory = [{ kind: 'potion', name: 'Potion', glyph: '!', value: 15 }];
    useInventoryItem(g, 0);
    expect(g.player.hp).toBe(20);
    expect(g.player.inventory).toHaveLength(0);
  });

  it('healing never exceeds max HP', () => {
    const g = makeGame(() => arenaSpec({}));
    g.player.hp = 18;
    g.player.inventory = [{ kind: 'potion', name: 'Potion', glyph: '!', value: 15 }];
    useInventoryItem(g, 0);
    expect(g.player.hp).toBe(20);
  });

  it('a potion used at full HP is still consumed (Edge Case)', () => {
    const g = makeGame(() => arenaSpec({}));
    g.player.inventory = [{ kind: 'potion', name: 'Potion', glyph: '!', value: 15 }];
    useInventoryItem(g, 0);
    expect(g.player.hp).toBe(20);
    expect(g.player.inventory).toHaveLength(0);
  });
});

describe('equipping weapons and armor (FR-019, US3-AS3/AS4, FR-005)', () => {
  it('equipping a weapon raises displayed attack by its bonus', () => {
    const g = makeGame(() => arenaSpec({}));
    g.player.inventory = [{ kind: 'weapon', name: 'Weapon', glyph: '/', value: 3 }];
    useInventoryItem(g, 0);
    expect(playerAtk(g)).toBe(8); // 5 base + 3
    expect(g.player.weapon.value).toBe(3);
    expect(g.player.inventory).toHaveLength(0); // nothing previously equipped: slot freed
  });

  it('equipping armor raises displayed defense by its bonus', () => {
    const g = makeGame(() => arenaSpec({}));
    g.player.inventory = [{ kind: 'armor', name: 'Armor', glyph: '[', value: 2 }];
    useInventoryItem(g, 0);
    expect(playerDef(g)).toBe(3); // 1 base + 2
  });

  it('equip is a swap: the previous weapon returns to the freed inventory slot', () => {
    const g = makeGame(() => arenaSpec({}));
    const oldW = { kind: 'weapon', name: 'Weapon', glyph: '/', value: 2 };
    const newW = { kind: 'weapon', name: 'Weapon', glyph: '/', value: 5 };
    g.player.weapon = oldW;
    g.player.inventory = [{ kind: 'potion', name: 'Potion', glyph: '!', value: 15 }, newW];
    useInventoryItem(g, 1);
    expect(g.player.weapon).toBe(newW);
    expect(g.player.inventory[1]).toBe(oldW); // same slot index
    expect(g.player.inventory).toHaveLength(2);
    expect(playerAtk(g)).toBe(10);
  });

  it('equip always succeeds even with a full inventory (swap needs no free slot)', () => {
    const g = makeGame(() => arenaSpec({}));
    g.player.weapon = { kind: 'weapon', name: 'Weapon', glyph: '/', value: 1 };
    g.player.inventory = Array.from({ length: 10 }, (_, i) => ({
      kind: 'weapon', name: 'Weapon', glyph: '/', value: i + 2,
    }));
    useInventoryItem(g, 9);
    expect(g.player.weapon.value).toBe(11);
    expect(g.player.inventory).toHaveLength(10);
    expect(g.player.inventory[9].value).toBe(1); // old weapon swapped into slot 9
  });

  it('using an empty slot is a harmless no-op', () => {
    const g = makeGame(() => arenaSpec({}));
    expect(useInventoryItem(g, 0)).toBe(false);
    expect(useInventoryItem(g, 9)).toBe(false);
  });

  it('item labels list effects for the inventory screen (US3-AS5)', () => {
    expect(itemLabel({ kind: 'potion', name: 'Potion', value: 20 })).toBe('Potion (+20 HP)');
    expect(itemLabel({ kind: 'weapon', name: 'Weapon', value: 4 })).toBe('Weapon (+4 ATK)');
    expect(itemLabel({ kind: 'armor', name: 'Armor', value: 2 })).toBe('Armor (+2 DEF)');
  });

  it('combat uses equipped bonuses: weapon boosts damage dealt, armor cuts damage taken', () => {
    const g = makeGame(() =>
      arenaSpec({ enemies: [{ name: 'Goblin', glyph: 'g', x: 13, y: 12, hp: 100, maxHp: 100, atk: 5, def: 1, roomIndex: 0, activated: true }] })
    );
    g.player.weapon = { kind: 'weapon', name: 'Weapon', glyph: '/', value: 3 };
    g.player.armor = { kind: 'armor', name: 'Armor', glyph: '[', value: 2 };
    const enemy = g.enemies[0];
    movePlayer(g, 1, 0);
    expect(enemy.hp).toBe(100 - 7); // max(1, (5+3) - 1)
    expect(g.player.hp).toBe(20 - 2); // max(1, 5 - (1+2))
  });
});
