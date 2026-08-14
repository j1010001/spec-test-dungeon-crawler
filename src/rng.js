// Seeded pseudo-random number generator (mulberry32).
// Deterministic given the same seed: same run seed => same sequence of
// floor generation, enemy placement, item generation and item drops.

/**
 * Create a mulberry32 PRNG instance.
 * @param {number} seed - 32-bit integer seed.
 * @returns {() => number} function returning floats in [0, 1)
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A small wrapper exposing the convenience helpers game code needs while
 * keeping every draw routed through a single deterministic stream.
 */
export class Rng {
  constructor(seed) {
    this.seed = seed >>> 0;
    this._next = mulberry32(this.seed);
  }

  /** Float in [0, 1) */
  random() {
    return this._next();
  }

  /** Integer in [min, max] inclusive */
  int(min, max) {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }

  /** Pick a random element from an array */
  pick(arr) {
    return arr[this.int(0, arr.length - 1)];
  }

  /** True with the given probability (0..1) */
  chance(probability) {
    return this.random() < probability;
  }
}

/**
 * Parse the `seed` URL query parameter per FR-038: integers are used
 * verbatim; anything that parses to NaN falls back to an auto-generated
 * seed (Date.now()) rather than erroring.
 * @param {string|null} rawValue
 * @returns {number}
 */
export function resolveSeed(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return Date.now() >>> 0;
  }
  const parsed = Number.parseInt(rawValue, 10);
  if (Number.isNaN(parsed)) {
    return Date.now() >>> 0;
  }
  return parsed >>> 0;
}
