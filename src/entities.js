// Entity factories: enemies (FR-006 formulas) and items (Item entity formulas).

const ENEMY_TYPES = [
  { name: 'Goblin', glyph: 'g', maxFloor: 3 },
  { name: 'Orc', glyph: 'o', maxFloor: 6 },
  { name: 'Wraith', glyph: 'w', maxFloor: 9 },
];

export function enemyTypeForFloor(floor) {
  for (const t of ENEMY_TYPES) {
    if (floor <= t.maxFloor) return t;
  }
  return ENEMY_TYPES[ENEMY_TYPES.length - 1];
}

// HP = 10 + floor*5, atk = 3 + floor*2, def = floor (Enemy entity definition).
export function makeEnemy(floor, x, y, roomIndex) {
  const type = enemyTypeForFloor(floor);
  const hp = 10 + floor * 5;
  return {
    name: type.name,
    glyph: type.glyph,
    x,
    y,
    hp,
    maxHp: hp,
    atk: 3 + floor * 2,
    def: floor,
    roomIndex,
    activated: false,
  };
}

export const ITEM_KINDS = ['potion', 'weapon', 'armor'];

// potion restore = 10 + floor*5; weapon/armor bonus = floor + random(0..2).
export function makeItem(kind, floor, rng) {
  if (kind === 'potion') {
    return { kind, name: 'Potion', glyph: '!', value: 10 + floor * 5 };
  }
  const value = floor + rng.int(0, 2);
  if (kind === 'weapon') return { kind, name: 'Weapon', glyph: '/', value };
  return { kind: 'armor', name: 'Armor', glyph: '[', value };
}

export function makeRandomItem(floor, rng) {
  return makeItem(rng.pick(ITEM_KINDS), floor, rng);
}

// Inventory display label with effect (US3-AS5).
export function itemLabel(item) {
  if (item.kind === 'potion') return `${item.name} (+${item.value} HP)`;
  if (item.kind === 'weapon') return `${item.name} (+${item.value} ATK)`;
  return `${item.name} (+${item.value} DEF)`;
}
