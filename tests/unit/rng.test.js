import { describe, it, expect } from 'vitest';
import { mulberry32, Rng, resolveSeed } from '../../src/rng.js';

describe('rng.js — seeded determinism (Assumption: all randomness is seeded per run)', () => {
  it('produces an identical sequence for the same seed', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toEqual(b());
  });

  it('Rng.int is inclusive of both bounds', () => {
    const rng = new Rng(42);
    const values = new Set();
    for (let i = 0; i < 500; i += 1) values.add(rng.int(1, 3));
    expect([...values].sort()).toEqual([1, 2, 3]);
  });

  describe('resolveSeed (FR-038)', () => {
    it('parses a valid integer seed from the URL param', () => {
      expect(resolveSeed('99999')).toBe(99999);
    });

    it('falls back to an auto-generated seed on non-integer input (Q&A 2026-06-26)', () => {
      const seed = resolveSeed('abc');
      expect(typeof seed).toBe('number');
      expect(Number.isNaN(seed)).toBe(false);
    });

    it('falls back to an auto-generated seed when absent', () => {
      const seed = resolveSeed(null);
      expect(Number.isNaN(seed)).toBe(false);
    });
  });
});
