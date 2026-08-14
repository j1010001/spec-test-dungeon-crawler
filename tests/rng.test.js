import { describe, it, expect } from 'vitest';
import { mulberry32, createRng, parseSeed } from '../src/rng.js';

describe('seeded RNG (FR-038, Assumptions: seeded randomness)', () => {
  it('is deterministic for the same seed', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('differs across seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('int(min,max) stays within inclusive bounds', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const n = rng.int(1, 3);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(3);
    }
  });

  it('parses ?seed=12345 as integer', () => {
    expect(parseSeed('?seed=12345')).toBe(12345);
  });

  it('returns null for non-integer seed (fall back to auto-seed)', () => {
    expect(parseSeed('?seed=abc')).toBeNull();
  });

  it('returns null when seed param is absent', () => {
    expect(parseSeed('')).toBeNull();
    expect(parseSeed('?foo=1')).toBeNull();
  });
});
