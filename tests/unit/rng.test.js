import { describe, it, expect } from 'vitest';
import { createRng, parseSeedParam } from '../../src/rng.js';

describe('seeded RNG (FR-038, Assumptions: all randomness seeded)', () => {
  it('produces an identical sequence for the same seed', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('next() stays within [0, 1)', () => {
    const r = createRng(777);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int(min, max) is inclusive on both ends and covers the range', () => {
    const r = createRng(42);
    const seen = new Set();
    for (let i = 0; i < 500; i++) {
      const v = r.int(1, 3);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(3);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it('pick(arr) returns a member of the array', () => {
    const r = createRng(9);
    const arr = ['x', 'y', 'z'];
    for (let i = 0; i < 100; i++) expect(arr).toContain(r.pick(arr));
  });
});

describe('seed URL parameter (FR-038, Session 2026-06-26 NaN clarification)', () => {
  const fixed = () => 424242;

  it('parses ?seed=12345 as integer 12345', () => {
    expect(parseSeedParam('?seed=12345', fixed)).toBe(12345);
  });

  it('parses the test seed ?seed=99999', () => {
    expect(parseSeedParam('?seed=99999', fixed)).toBe(99999);
  });

  it('falls back to auto seed when seed is non-integer (?seed=abc)', () => {
    expect(parseSeedParam('?seed=abc', fixed)).toBe(424242);
  });

  it('falls back to auto seed when seed param is absent', () => {
    expect(parseSeedParam('', fixed)).toBe(424242);
    expect(parseSeedParam('?foo=1', fixed)).toBe(424242);
  });

  it('accepts negative integers', () => {
    expect(parseSeedParam('?seed=-5', fixed)).toBe(-5);
  });

  it('parseInt semantics: ?seed=12.9 parses to 12 (integer parse, not NaN)', () => {
    expect(parseSeedParam('?seed=12.9', fixed)).toBe(12);
  });
});
