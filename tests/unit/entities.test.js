import { describe, it, expect } from 'vitest';
import { createPlayer, addToInventory, useInventoryItem, playerAttack, playerDefense } from '../../src/entities.js';
import { INVENTORY_CAP } from '../../src/constants.js';

function potion(value) {
  return { id: 'p1', type: 'potion', value, label: 'Health Potion', glyph: '!' };
}
function weapon(value, label = 'Sword') {
  return { id: 'w1', type: 'weapon', value, label, glyph: '/' };
}
function armor(value, label = 'Shield') {
  return { id: 'a1', type: 'armor', value, label, glyph: '[' };
}

describe('entities.js — Player (FR-023, Key Entities: Player)', () => {
  it('starts with HP 20/20, ATK 5, DEF 1, floor 1', () => {
    const player = createPlayer();
    expect(player.hp).toBe(20);
    expect(player.maxHp).toBe(20);
    expect(playerAttack(player)).toBe(5);
    expect(playerDefense(player)).toBe(1);
    expect(player.floor).toBe(1);
    expect(player.inventory).toEqual([]);
  });
});

describe('entities.js — inventory cap (FR-009, edge case: full inventory)', () => {
  it('caps at 10 slots and refuses the 11th pickup, leaving the item on the ground conceptually', () => {
    const player = createPlayer();
    for (let i = 0; i < INVENTORY_CAP; i += 1) {
      expect(addToInventory(player, potion(10))).toBe(true);
    }
    expect(player.inventory.length).toBe(INVENTORY_CAP);
    expect(addToInventory(player, potion(10))).toBe(false);
    expect(player.inventory.length).toBe(INVENTORY_CAP);
  });
});

describe('entities.js — using/equipping items (FR-019, US3)', () => {
  it('a potion restores HP up to max and is consumed', () => {
    const player = createPlayer();
    player.hp = 10;
    addToInventory(player, potion(15));
    const result = useInventoryItem(player, 0);
    expect(result.ok).toBe(true);
    expect(player.hp).toBe(20); // capped at maxHp, not 25
    expect(player.inventory.length).toBe(0);
  });

  it('a potion used at full HP is still consumed with no overflow (edge case)', () => {
    const player = createPlayer();
    addToInventory(player, potion(15));
    useInventoryItem(player, 0);
    expect(player.hp).toBe(20);
    expect(player.inventory.length).toBe(0);
  });

  it('equipping a weapon increases attack power and swaps the previous weapon back into inventory', () => {
    const player = createPlayer();
    addToInventory(player, weapon(3, 'Dagger'));
    useInventoryItem(player, 0);
    expect(playerAttack(player)).toBe(8); // 5 base + 3
    expect(player.inventory.length).toBe(0);

    addToInventory(player, weapon(6, 'Longsword'));
    useInventoryItem(player, 0);
    expect(playerAttack(player)).toBe(11); // 5 base + 6
    expect(player.inventory).toContainEqual(expect.objectContaining({ label: 'Dagger' }));
  });

  it('equipping armor increases defense', () => {
    const player = createPlayer();
    addToInventory(player, armor(4, 'Leather'));
    useInventoryItem(player, 0);
    expect(playerDefense(player)).toBe(5); // 1 base + 4
  });

  it('equip always succeeds even when inventory is full (swap frees a slot)', () => {
    const player = createPlayer();
    for (let i = 0; i < INVENTORY_CAP - 1; i += 1) addToInventory(player, potion(1));
    addToInventory(player, weapon(2, 'Axe'));
    expect(player.inventory.length).toBe(INVENTORY_CAP);
    const result = useInventoryItem(player, INVENTORY_CAP - 1);
    expect(result.ok).toBe(true);
    expect(playerAttack(player)).toBe(7);
  });
});
