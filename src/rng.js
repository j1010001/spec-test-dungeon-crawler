// Seeded RNG (mulberry32) + seed parsing per FR-038.
// All randomness in a run flows through one Rng instance, making runs fully
// reproducible given the same seed.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed) {
    this.seed = seed;
    this._next = mulberry32(seed);
  }

  // float in [0, 1)
  next() {
    return this._next();
  }

  // integer in [min, max] inclusive
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  // pick a random element of a non-empty array
  pick(arr) {
    return arr[this.int(0, arr.length - 1)];
  }

  // true with probability p (0..1)
  chance(p) {
    return this.next() < p;
  }
}

// FR-038: parse `?seed=N`. Returns an integer seed, or null when the
// parameter is absent or does not parse to an integer (NaN => auto-seed
// fallback, no error shown).
export function parseSeedParam(search) {
  if (!search) return null;
  const q = search.startsWith('?') ? search.slice(1) : search;
  for (const pair of q.split('&')) {
    const [k, v] = pair.split('=');
    if (k === 'seed') {
      const n = parseInt(decodeURIComponent(v ?? ''), 10);
      return Number.isNaN(n) ? null : n;
    }
  }
  return null;
}
