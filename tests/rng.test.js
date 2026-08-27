// Seeded RNG determinism + FR-038 seed parsing.
import { describe, it, expect } from 'vitest';
import { Rng, mulberry32, parseSeedParam } from '../src/rng.js';

describe('seeded RNG (FR-038 / Assumptions: all randomness seeded)', () => {
  it('produces an identical sequence for the same seed', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const seqA = Array.from({ length: 200 }, () => a.next());
    const seqB = Array.from({ length: 200 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('int(min, max) stays within inclusive bounds and hits both ends', () => {
    const rng = new Rng(42);
    const seen = new Set();
    for (let i = 0; i < 2000; i++) {
      const v = rng.int(1, 3);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(3);
      seen.add(v);
    }
    expect(seen).toEqual(new Set([1, 2, 3]));
  });

  it('mulberry32 emits floats in [0,1)', () => {
    const f = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = f();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('seed URL parameter (FR-038)', () => {
  it('parses ?seed=12345 as integer 12345', () => {
    expect(parseSeedParam('?seed=12345')).toBe(12345);
  });

  it('parses seed among other params', () => {
    expect(parseSeedParam('?foo=bar&seed=99999&x=1')).toBe(99999);
  });

  it('returns null (auto-seed fallback) for non-integer input — no error', () => {
    expect(parseSeedParam('?seed=abc')).toBeNull();
  });

  it('returns null when the parameter is absent', () => {
    expect(parseSeedParam('')).toBeNull();
    expect(parseSeedParam('?foo=1')).toBeNull();
  });

  it('parses negative and truncates non-integer-prefix values per parseInt', () => {
    expect(parseSeedParam('?seed=-5')).toBe(-5);
    expect(parseSeedParam('?seed=12.9')).toBe(12);
  });
});
