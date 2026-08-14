import { describe, it, expect } from 'vitest';
import {
  createPlayer,
  playerAttack,
  playerDefense,
  damage,
  enemyTypeForFloor,
  createEnemy,
  makePotion,
  makeWeapon,
  makeArmor,
} from '../src/entities.js';
import { createRng } from '../src/rng.js';

describe('player base stats (FR-023)', () => {
  it('starts with HP 20/20, ATK 5, DEF 1, empty 10-cap inventory', () => {
    const p = createPlayer();
    expect(p.hp).toBe(20);
    expect(p.maxHp).toBe(20);
    expect(p.baseAttack).toBe(5);
    expect(p.baseDefense).toBe(1);
    expect(p.inventory).toEqual([]);
    expect(p.weapon).toBeNull();
    expect(p.armor).toBeNull();
  });

  it('effective attack/defense include equipped bonuses (FR-005)', () => {
    const p = createPlayer();
    expect(playerAttack(p)).toBe(5);
    expect(playerDefense(p)).toBe(1);
    p.weapon = { type: 'weapon', value: 3 };
    p.armor = { type: 'armor', value: 2 };
    expect(playerAttack(p)).toBe(8);
    expect(playerDefense(p)).toBe(3);
  });
});

describe('damage formula (FR-021)', () => {
  it('is max(1, attack - defense), deterministic', () => {
    expect(damage(5, 1)).toBe(4);
    expect(damage(5, 5)).toBe(1);
    expect(damage(5, 99)).toBe(1);
    expect(damage(10, 3)).toBe(7);
  });
});

describe('enemy scaling (FR-006, Enemy entity)', () => {
  it('types by floor range: Goblin 1-3, Orc 4-6, Wraith 7-9', () => {
    expect(enemyTypeForFloor(1).glyph).toBe('g');
    expect(enemyTypeForFloor(3).type).toBe('Goblin');
    expect(enemyTypeForFloor(4).glyph).toBe('o');
    expect(enemyTypeForFloor(6).type).toBe('Orc');
    expect(enemyTypeForFloor(7).glyph).toBe('w');
    expect(enemyTypeForFloor(9).type).toBe('Wraith');
  });

  it('stats: HP = 10 + floor*5, ATK = 3 + floor*2, DEF = floor', () => {
    const g = createEnemy(1, 0, 0, 0);
    expect(g.hp).toBe(15);
    expect(g.attack).toBe(5);
    expect(g.defense).toBe(1);
    const w = createEnemy(7, 0, 0, 0);
    expect(w.hp).toBe(45);
    expect(w.attack).toBe(17);
    expect(w.defense).toBe(7);
  });

  it('floor N+1 enemies have higher base stats than floor N (US4-AS3)', () => {
    for (let f = 1; f < 9; f++) {
      const a = createEnemy(f, 0, 0, 0);
      const b = createEnemy(f + 1, 0, 0, 0);
      expect(b.hp).toBeGreaterThan(a.hp);
      expect(b.attack).toBeGreaterThan(a.attack);
      expect(b.defense).toBeGreaterThan(a.defense);
    }
  });
});

describe('item formulas (Item entity)', () => {
  it('potion restores 10 + floor*5', () => {
    expect(makePotion(1).value).toBe(15);
    expect(makePotion(4).value).toBe(30);
  });

  it('weapon/armor bonus = floor + random(0..2)', () => {
    const rng = createRng(42);
    for (let i = 0; i < 50; i++) {
      const w = makeWeapon(3, rng);
      expect(w.value).toBeGreaterThanOrEqual(3);
      expect(w.value).toBeLessThanOrEqual(5);
      const a = makeArmor(5, rng);
      expect(a.value).toBeGreaterThanOrEqual(5);
      expect(a.value).toBeLessThanOrEqual(7);
    }
  });
});
