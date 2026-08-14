// Entities and combat math: player, enemies, items (Key Entities section,
// FR-006, FR-010, FR-021, FR-023).

export const GRID_SIZE = 80;
export const SIGHT_RADIUS = 5; // R100, Chebyshev
export const INVENTORY_CAP = 10; // FR-009
export const MAX_FLOOR = 9; // R101: stairs on floor 9 => victory, no floor 10

// FR-023: base stats.
export function createPlayer() {
  return {
    x: 0,
    y: 0,
    hp: 20,
    maxHp: 20,
    baseAttack: 5,
    baseDefense: 1,
    inventory: [], // ordered, max INVENTORY_CAP
    weapon: null, // equipped weapon item or null
    armor: null, // equipped armor item or null
  };
}

export function playerAttack(player) {
  return player.baseAttack + (player.weapon ? player.weapon.value : 0);
}

export function playerDefense(player) {
  return player.baseDefense + (player.armor ? player.armor.value : 0);
}

// FR-021: deterministic damage, minimum 1.
export function damage(attackValue, defenseValue) {
  return Math.max(1, attackValue - defenseValue);
}

// FR-006: enemy type by floor range.
export function enemyTypeForFloor(floor) {
  if (floor <= 3) return { type: 'Goblin', glyph: 'g' };
  if (floor <= 6) return { type: 'Orc', glyph: 'o' };
  return { type: 'Wraith', glyph: 'w' };
}

// Enemy entity: HP = 10 + floor*5, attack = 3 + floor*2, defense = floor.
export function createEnemy(floor, x, y, roomIndex) {
  const { type, glyph } = enemyTypeForFloor(floor);
  const hp = 10 + floor * 5;
  return {
    x,
    y,
    hp,
    maxHp: hp,
    attack: 3 + floor * 2,
    defense: floor,
    type,
    glyph,
    roomIndex,
    activated: false, // R103: room-wide aggro on player entry
    alive: true,
  };
}

// Item glyphs (FR-012, retro ASCII).
export const ITEM_GLYPHS = { potion: '!', weapon: '/', armor: ']' };

// Item entity: values scale with floor.
export function makePotion(floor) {
  const value = 10 + floor * 5;
  return { type: 'potion', value, glyph: ITEM_GLYPHS.potion, name: `Health Potion (+${value} HP)` };
}

export function makeWeapon(floor, rng) {
  const value = floor + rng.int(0, 2);
  return { type: 'weapon', value, glyph: ITEM_GLYPHS.weapon, name: `Sword (+${value} ATK)` };
}

export function makeArmor(floor, rng) {
  const value = floor + rng.int(0, 2);
  return { type: 'armor', value, glyph: ITEM_GLYPHS.armor, name: `Armor (+${value} DEF)` };
}

export function makeRandomItem(floor, rng) {
  const roll = rng.int(0, 2);
  if (roll === 0) return makePotion(floor);
  if (roll === 1) return makeWeapon(floor, rng);
  return makeArmor(floor, rng);
}
