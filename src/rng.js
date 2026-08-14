// Seeded RNG (mulberry32) + seed parsing (FR-038).
// All game randomness flows through one Rng instance per run.

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

export function createRng(seed) {
  const next = mulberry32(seed);
  return {
    seed,
    // float in [0, 1)
    next,
    // integer in [min, max] inclusive
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    // random element of a non-empty array
    pick(arr) {
      return arr[Math.floor(next() * arr.length)];
    },
    // true with probability p
    chance(p) {
      return next() < p;
    },
  };
}

// Parse `?seed=N` from a query string. Returns the integer seed, or null
// when the parameter is absent or not an integer (FR-038: NaN falls back
// to auto-generated seed upstream; no error shown).
export function parseSeed(search) {
  const params = new URLSearchParams(search);
  if (!params.has('seed')) return null;
  const n = Number.parseInt(params.get('seed'), 10);
  return Number.isNaN(n) ? null : n;
}
