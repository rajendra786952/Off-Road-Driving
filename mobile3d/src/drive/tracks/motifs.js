// Reusable trail-building motifs. Each takes the TrackBuilder and uses its
// seeded RNG, so a track is fully deterministic but never laid out by hand
// metre by metre. Signature challenges are still placed explicitly per track.

const rnd = (t, a, b) => a + t.rand() * (b - a);

/**
 * Meandering trail for `len` metres, pulled back towards t.base so it never
 * loops over itself. o: { seg:[min,max], turn:maxDeg, grade:number, amp:number, pull }
 */
export function wander(t, len, o = {}) {
  const seg = o.seg || [28, 48];
  const T = o.turn ?? 50;
  const g0 = o.grade ?? 0;
  const amp = o.amp ?? 3;
  const pull = o.pull ?? 0.55;
  let left = len;
  while (left > 1) {
    const L = Math.min(left, rnd(t, seg[0], seg[1]));
    const dev = t.hd - t.base;
    let turn = rnd(t, -T, T) - dev * pull;
    turn = Math.max(-T * 1.25, Math.min(T * 1.25, turn));
    // keep the curve radius sane for the segment length
    const maxTurn = (L / (o.minR ?? 14)) * 57.3;
    turn = Math.max(-maxTurn, Math.min(maxTurn, turn));
    t.go(L, turn, g0 + rnd(t, -amp, amp), o.extra);
    left -= L;
  }
  return t;
}

/**
 * Stack of hairpins climbing (or descending) across the slope.
 * n legs of `leg` metres at `grade` percent. o: { r, first: 1|-1, wig }
 */
export function switchbacks(t, n, leg, grade, o = {}) {
  const r = o.r ?? 13;
  let dir = o.first ?? 1;
  // square up to the base heading first
  const off = t.base - t.hd;
  if (Math.abs(off) > 2) t.go(Math.max(16, Math.abs(off) * 0.5), off, grade * 0.5);
  t.go(r * 1.57, 90 * dir, grade * 0.6);
  for (let i = 0; i < n; i++) {
    const w = o.wig ?? 8;
    t.go(leg / 2, rnd(t, -w, w), grade);
    t.go(leg / 2, -(t.hd - (t.base + 90 * dir)), grade);
    if (o.onLeg) o.onLeg(i);
    if (i < n - 1) { t.go(r * 3.14, -180 * dir, grade * 0.35); dir = -dir; }
  }
  t.go(r * 1.57, -90 * dir, grade * 0.6);
  return t;
}

/** Alternating bends. */
export function esses(t, n, len, turn, grade = 0, o) {
  let d = t.rand() < 0.5 ? 1 : -1;
  const off = t.base - t.hd;
  t.go(len * 0.6, off - d * turn * 0.5, grade, o);
  for (let i = 0; i < n; i++) { t.go(len, d * turn, grade, o); d = -d; }
  t.go(len * 0.6, t.base - t.hd, grade, o);
  return t;
}

/** Straight-ish section (small wiggle) - for climbs, descents, bridges approaches. */
export function run(t, len, grade = 0, o) {
  const n = Math.max(1, Math.round(len / 45));
  for (let i = 0; i < n; i++) t.go(len / n, (t.base - t.hd) * 0.5 + rnd(t, -9, 9), grade, o);
  return t;
}

/** Turn to face the base heading exactly (use before bridges). */
export function square(t, len = 24, grade = 0) {
  t.go(len, t.base - t.hd, grade);
  return t;
}
