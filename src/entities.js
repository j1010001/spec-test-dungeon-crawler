// Player factory and inventory helpers (Key Entities: Player, Item; FR-023).

import { INVENTORY_CAP } from './constants.js';

export function createPlayer() {
  return {
    x: 0,
    y: 0,
    hp: 20,
    maxHp: 20,
    baseAttack: 5,
    baseDefense: 1,
    equippedWeapon: null,
    equippedArmor: null,
    floor: 1,
    inventory: [],
    enemiesDefeated: 0,
  };
}

/** Attack power = base + equipped weapon bonus (FR-005). */
export function playerAttack(player) {
  return player.baseAttack + (player.equippedWeapon ? player.equippedWeapon.value : 0);
}

/** Defense = base + equipped armor bonus (FR-005). */
export function playerDefense(player) {
  return player.baseDefense + (player.equippedArmor ? player.equippedArmor.value : 0);
}

/**
 * Attempt to add a ground item to the inventory. Returns true on success.
 * Full inventory silently refuses the pickup (item stays on the ground) —
 * caller is responsible for surfacing the HUD log message (edge case).
 */
export function addToInventory(player, item) {
  if (player.inventory.length >= INVENTORY_CAP) {
    return false;
  }
  const { x, y, ...carried } = item;
  player.inventory.push(carried);
  return true;
}

/**
 * Use/equip the inventory item at `index` (FR-019).
 * - potion: restores HP up to max, item is consumed.
 * - weapon/armor: swaps with the currently equipped item (swap always
 *   succeeds regardless of inventory occupancy — the freed item takes the
 *   used slot).
 * @returns {{ok: boolean, message: string}}
 */
export function useInventoryItem(player, index) {
  const item = player.inventory[index];
  if (!item) {
    return { ok: false, message: 'No item in that slot.' };
  }

  if (item.type === 'potion') {
    const before = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + item.value);
    player.inventory.splice(index, 1);
    const healed = player.hp - before;
    return { ok: true, message: `Used ${item.label}. Restored ${healed} HP.` };
  }

  if (item.type === 'weapon') {
    const previous = player.equippedWeapon;
    player.equippedWeapon = item;
    if (previous) {
      player.inventory.splice(index, 1, previous);
    } else {
      player.inventory.splice(index, 1);
    }
    return { ok: true, message: `Equipped ${item.label} (+${item.value} ATK).` };
  }

  if (item.type === 'armor') {
    const previous = player.equippedArmor;
    player.equippedArmor = item;
    if (previous) {
      player.inventory.splice(index, 1, previous);
    } else {
      player.inventory.splice(index, 1);
    }
    return { ok: true, message: `Equipped ${item.label} (+${item.value} DEF).` };
  }

  return { ok: false, message: 'Unknown item type.' };
}
