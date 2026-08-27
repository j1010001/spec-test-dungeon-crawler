// Seeded RNG (FR-038): every random decision in a run flows through one
// mulberry32 stream, so a run is fully reproducible from its seed.
export function createRng(seed) {
  let a = seed >>> 0;
  function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    seed,
    next,
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    chance(p) {
      return next() < p;
    },
    pick(arr) {
      return arr[Math.floor(next() * arr.length)];
    },
  };
}

// Parses `?seed=N` from a query string (FR-038). Non-integer values are NaN
// and fall back to the auto seed (Session 2026-06-26); absent param likewise.
export function parseSeedParam(search, fallback) {
  const auto = fallback || Date.now;
  let raw = null;
  const query = (search || '').replace(/^\?/, '');
  for (const pair of query.split('&')) {
    const eq = pair.indexOf('=');
    if (eq > 0 && decodeURIComponent(pair.slice(0, eq)) === 'seed') {
      raw = decodeURIComponent(pair.slice(eq + 1));
    }
  }
  if (raw !== null) {
    const v = parseInt(raw, 10);
    if (!Number.isNaN(v)) return v;
  }
  return Math.floor(auto());
}
