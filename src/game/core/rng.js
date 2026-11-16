// Small deterministic hashing helpers (no Phaser dependency, unit-testable).

export function hash32(n) {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = x ^ (x >>> 16);
  return x >>> 0;
}

/** Deterministic float in [0, 1) from two integers. */
export function hashFloat(a, b = 0) {
  return hash32(Math.imul(a | 0, 0x9e3779b1) ^ hash32((b | 0) + 0x7f4a7c15)) / 4294967296;
}

/** Seeded PRNG (mulberry32). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
