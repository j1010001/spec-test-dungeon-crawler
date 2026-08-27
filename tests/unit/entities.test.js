import { describe, it, expect } from 'vitest';
import { createRng } from '../../src/rng.js';
import {
  enemyTypeForFloor,
  makeEnemy,
  makeItem,
  makeRandomItem,
  itemLabel,
} from '../../src/entities.js';

describe('enemy types by floor range (FR-006)', () => {
  it('Goblin g on floors 1-3', () => {
    for (const f of [1, 2, 3]) {
      expect(enemyTypeForFloor(f)).toMatchObject({ name: 'Goblin', glyph: 'g' });
    }
  });
  it('Orc o on floors 4-6', () => {
    for (const f of [4, 5, 6]) {
      expect(enemyTypeForFloor(f)).toMatchObject({ name: 'Orc', glyph: 'o' });
    }
  });
  it('Wraith w on floors 7-9', () => {
    for (const f of [7, 8, 9]) {
      expect(enemyTypeForFloor(f)).toMatchObject({ name: 'Wraith', glyph: 'w' });
    }
  });
});

describe('enemy stat formulas (Enemy entity: HP=10+5*floor, atk=3+2*floor, def=floor)', () => {
  it('floor 1 Goblin: HP 15, atk 5, def 1', () => {
    const e = makeEnemy(1, 10, 10, 0);
    expect(e).toMatchObject({ hp: 15, maxHp: 15, atk: 5, def: 1, glyph: 'g', name: 'Goblin' });
  });
  it('floor 4 Orc: HP 30, atk 11, def 4', () => {
    const e = makeEnemy(4, 1, 1, 0);
    expect(e).toMatchObject({ hp: 30, atk: 11, def: 4, glyph: 'o' });
  });
  it('floor 9 Wraith: HP 55, atk 21, def 9', () => {
    const e = makeEnemy(9, 1, 1, 0);
    expect(e).toMatchObject({ hp: 55, atk: 21, def: 9, glyph: 'w' });
  });
  it('stats scale strictly upward with floor (US4-AS3)', () => {
    const a = makeEnemy(1, 0, 0, 0);
    const b = makeEnemy(2, 0, 0, 0);
    expect(b.hp).toBeGreaterThan(a.hp);
    expect(b.atk).toBeGreaterThan(a.atk);
    expect(b.def).toBeGreaterThan(a.def);
  });
});

describe('item formulas (Item entity)', () => {
  it('potion restores 10 + floor*5', () => {
    expect(makeItem('potion', 1, createRng(1)).value).toBe(15);
    expect(makeItem('potion', 3, createRng(1)).value).toBe(25);
    expect(makeItem('potion', 9, createRng(1)).value).toBe(55);
  });
  it('weapon bonus = floor + random(0..2)', () => {
    const r = createRng(5);
    for (let i = 0; i < 50; i++) {
      const it = makeItem('weapon', 2, r);
      expect(it.value).toBeGreaterThanOrEqual(2);
      expect(it.value).toBeLessThanOrEqual(4);
    }
  });
  it('armor bonus = floor + random(0..2)', () => {
    const r = createRng(6);
    for (let i = 0; i < 50; i++) {
      const it = makeItem('armor', 4, r);
      expect(it.value).toBeGreaterThanOrEqual(4);
      expect(it.value).toBeLessThanOrEqual(6);
    }
  });
  it('makeRandomItem returns one of the three kinds', () => {
    const r = createRng(7);
    const kinds = new Set();
    for (let i = 0; i < 200; i++) kinds.add(makeRandomItem(1, r).kind);
    expect([...kinds].sort()).toEqual(['armor', 'potion', 'weapon']);
  });
  it('itemLabel lists the effect (US3-AS5)', () => {
    expect(itemLabel(makeItem('potion', 1, createRng(1)))).toBe('Potion (+15 HP)');
    const w = makeItem('weapon', 1, createRng(1));
    expect(itemLabel(w)).toBe(`Weapon (+${w.value} ATK)`);
    const a = makeItem('armor', 1, createRng(1));
    expect(itemLabel(a)).toBe(`Armor (+${a.value} DEF)`);
  });
});
