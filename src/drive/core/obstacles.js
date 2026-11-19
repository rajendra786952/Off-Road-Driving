// Obstacle + challenge generator (pure JS, no rendering).
//
// The authored tracks already carry their signature features (fords, bridges, mud, logs).
// This module lays a second, generated LAYER of challenges over a compiled track:
//   - it walks the route, finds stretches no authored feature uses, and fills them with
//     challenges picked for the terrain (region, road width, gradient, bends, banks)
//   - every challenge that blocks part of the road keeps a corridor wide enough for the
//     truck and records where it is (`hints`), so there is always a playable line
//   - the layer depends on the obstacle difficulty (easy / medium / hard / extreme), so the
//     same track plays differently on each one, and it is fully deterministic per track
// Static pieces (rocks, logs, slabs, potholes, surface patches, solid blocks) go into the
// track's own collision structures. Moving pieces (cones, crates, rockfalls, rolling
// boulders, falling trees, animals, gusts) are described here and simulated by hazards.js.
import { SURFACES, WEATHER } from './surfaces.js';

export const OBSTACLE_TIERS = ['easy', 'medium', 'hard', 'extreme'];
/** Which obstacle tier each game difficulty uses. */
export const TIER_FOR_DIFFICULTY = { casual: 'easy', standard: 'medium', hardcore: 'hard', extreme: 'extreme' };

/** Defaults. Pass overrides to obstacleConfig() (or as DriveSession opts.obstacles). */
export const OBSTACLE_CONFIG = {
  difficulty: 'medium',
  categories: {
    rocks: true,      // rock gardens, boulder slaloms, stone steps
    water: true,      // water-filled potholes
    mud: true,        // mud pits, sand traps, ice, loose scree
    forest: true,     // fallen trees, log steps, branches
    bridges: true,    // missing planks on wooden bridges
    urban: true,      // roadworks, cement blocks, cones, wrecks, speed bumps
    dynamic: true,    // rockfalls, landslides, rolling boulders, falling trees, gusts, squalls
    wildlife: true    // herds crossing, birds
  },
  density: { easy: 0.25, medium: 0.45, hard: 0.70, extreme: 0.90 },
  dynamicEvents: true,
  alternateRoutes: true,   // pay the hard-line bonus where an authored bypass exists
  checkpoints: true        // recovering inside a challenge puts the truck at its entrance
};

export function obstacleConfig(over = {}) {
  const c = { ...OBSTACLE_CONFIG, ...over };
  c.categories = { ...OBSTACLE_CONFIG.categories, ...(over.categories || {}) };
  c.density = { ...OBSTACLE_CONFIG.density, ...(over.density || {}) };
  if (!OBSTACLE_TIERS.includes(c.difficulty)) c.difficulty = 'medium';
  return c;
}

/** What each challenge type is, which switch turns it off and what the HUD says. */
export const CHALLENGES = {
  rockGarden:     { cat: 'rocks',  name: 'Rock garden',      tip: 'Pick a line between the big ones.' },
  boulderSlalom:  { cat: 'rocks',  name: 'Boulder slalom',   tip: 'Boulders block half the trail. Weave through.' },
  stoneSteps:     { cat: 'rocks',  name: 'Stone steps',      tip: 'Square on, low range, steady throttle.' },
  logSteps:       { cat: 'forest', name: 'Log crossing',     tip: 'Take each log square-on.' },
  fallenTree:     { cat: 'forest', name: 'Fallen tree',      tip: 'Too big to climb. Squeeze past the crown.' },
  mudPit:         { cat: 'mud',    name: 'Mud pit',          tip: 'Carry momentum. Spinning wheels dig in.' },
  softPatch:      { cat: 'mud',    name: 'Soft ground',      tip: 'Keep moving and stay smooth.' },
  potholes:       { cat: 'water',  name: 'Pothole field',    tip: 'Slow down or the suspension pays.' },
  roadworks:      { cat: 'urban',  name: 'Roadworks',        tip: 'One lane is closed. Keep to the open one.' },
  wreck:          { cat: 'urban',  name: 'Abandoned wreck',  tip: 'Pass on the clear side.' },
  rockfall:       { cat: 'dynamic', dyn: true, name: 'Rockfall zone',   tip: 'Rocks coming down the bank!' },
  rollingBoulder: { cat: 'dynamic', dyn: true, name: 'Rolling boulder', tip: 'Boulder coming down the trail. Get out of its lane!' },
  treefall:       { cat: 'dynamic', dyn: true, name: 'Falling tree',    tip: 'A tree is coming down ahead!' },
  gust:           { cat: 'dynamic', dyn: true, name: 'Crosswind',       tip: 'Strong gusts. Hold your line.' },
  squall:         { cat: 'dynamic', dyn: true, name: 'Sudden squall',   tip: 'Visibility and grip are dropping.' },
  herd:           { cat: 'wildlife', name: 'Animal crossing', tip: 'Slow down and let them cross.' },
  bridgeGaps:     { cat: 'bridges', name: 'Broken bridge',   tip: 'Planks are missing. Keep your wheels on solid deck.' }
};

/** Relative weights per region environment. */
const POOL = {
  forest:  { rockGarden: 2, logSteps: 3, fallenTree: 3, mudPit: 3, potholes: 2, boulderSlalom: 1, roadworks: 1, wreck: 1, herd: 2, treefall: 2, squall: 1 },
  mud:     { mudPit: 4, potholes: 3, logSteps: 2, fallenTree: 1, rockGarden: 1, roadworks: 1, wreck: 1, herd: 2, squall: 1 },
  rocky:   { rockGarden: 3, boulderSlalom: 3, stoneSteps: 3, softPatch: 2, rockfall: 3, rollingBoulder: 2, herd: 1, gust: 1, wreck: 1 },
  ridge:   { rockGarden: 2, boulderSlalom: 2, stoneSteps: 3, softPatch: 2, rockfall: 3, rollingBoulder: 2, gust: 2, herd: 1 },
  snow:    { softPatch: 3, rockGarden: 2, stoneSteps: 1, boulderSlalom: 1, fallenTree: 1, rockfall: 2, herd: 1, gust: 2, squall: 1 },
  desert:  { softPatch: 4, rockGarden: 2, boulderSlalom: 2, stoneSteps: 1, wreck: 2, roadworks: 1, rockfall: 1, rollingBoulder: 1, herd: 1, squall: 2, gust: 1 },
  jungle:  { mudPit: 3, fallenTree: 3, logSteps: 2, potholes: 2, rockGarden: 1, herd: 3, treefall: 2, squall: 1 },
  volcano: { rockGarden: 3, boulderSlalom: 2, stoneSteps: 2, softPatch: 2, rockfall: 3, rollingBoulder: 2, wreck: 1, gust: 1 },
  city:    { roadworks: 4, wreck: 2, potholes: 3 }      // open world: streets and docks
};
const SOFT = { desert: ['deepsand', 'Sand trap'], snow: ['ice', 'Sheet ice'], rocky: ['scree', 'Loose scree'], ridge: ['scree', 'Loose scree'], volcano: ['ash', 'Ash drift'] };
const HERDS = {
  forest: ['deer', 'boar'], mud: ['cow', 'horse', 'goat'], rocky: ['goat'], ridge: ['goat'], snow: ['deer'],
  desert: ['goat', 'horse'], jungle: ['elephant', 'monkey', 'boar'], volcano: []
};
const HERD_SIZE = { deer: [2, 4], boar: [2, 3], cow: [2, 4], goat: [3, 5], horse: [2, 3], elephant: [1, 2], monkey: [3, 5] };
const SQUALL = { desert: 'sandstorm', snow: 'blizzard', jungle: 'heavyrain', forest: 'heavyrain', mud: 'heavyrain' };
/** Tiers below this never get the type (0 = easy). */
const MIN_TIER = { rollingBoulder: 2, rockfall: 1, treefall: 1, gust: 1, squall: 1, boulderSlalom: 0, wreck: 0 };
/** Free corridor (m) kept beside anything that blocks the road, per tier. */
export const CORRIDOR = [3.9, 3.5, 3.2, 3.0];

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build the obstacle layer for a compiled track. Does not modify the track: hand the
 * result to track.setLayer().
 */
export function generateObstacles(track, config) {
  const cfg = obstacleConfig(config);
  const tier = OBSTACLE_TIERS.indexOf(cfg.difficulty);
  const dens = cfg.density[cfg.difficulty];
  const rng = mulberry((track.seed | 0) * 40503 + tier * 977 + 5);
  const R = (a, b) => a + rng() * (b - a);
  const RI = (a, b) => Math.floor(R(a, b + 1));
  // a region track has one environment; the open world asks the biome under each stretch of road
  let envId = track.meta.env;
  const envOf = (sv) => (track.biomes ? track.biomes[track.BIO[track._idxS(Math.min(track.length, sv + 20))]].ob : track.meta.env);
  const { PX, PZ, TX, TZ, HW, S, SL, SR, SURF, nMain } = track;
  const cw = CORRIDOR[tier];
  const surfList = Object.values(SURFACES);

  const layer = {
    cfg, tier, challenges: [], hints: [], triggers: [], bodies: [], solids: [],
    obstacles: [], patches: [], anchors: [], gaps: [], birds: [], hardLines: []
  };

  // ---- route helpers ------------------------------------------------------
  const idx = (s) => track._idxS(Math.max(0, Math.min(track.length, s)));
  const at = (s, d) => {
    const i = idx(s), ds = s - S[i];
    return { x: PX[i] + TX[i] * ds + TZ[i] * d, z: PZ[i] + TZ[i] * ds - TX[i] * d, i };
  };
  const span = (s0, s1) => {
    const i0 = idx(s0), i1 = Math.max(idx(s1), i0 + 1);
    let hw = 1e9, grade = 0, curv = 0, bl = 0, br = 0, n = 0, soft = false;
    for (let i = i0; i <= i1; i++) {
      hw = Math.min(hw, HW[i]);
      const sh = track.roadShape(i, 3);
      grade = Math.max(grade, Math.abs(sh.grade)); curv = Math.max(curv, Math.abs(sh.curv));
      bl += SL[i]; br += SR[i]; n++;
      if (surfList[SURF[i]].sink > 0.05 || surfList[SURF[i]].grip < 0.3) soft = true;
    }
    const mean = (track.PY[i1] - track.PY[i0]) / Math.max(1, S[i1] - S[i0]);
    return { hw, grade, curv, bl: bl / n, br: br / n, soft, mean, mid: Math.round((i0 + i1) / 2) };
  };

  // ---- what the authored track already uses --------------------------------
  const busy = new Uint8Array(nMain);
  const mark = (s0, s1) => { for (let i = idx(s0), e = idx(s1); i <= e; i++) busy[i] = 1; };
  const free = (s0, s1) => { for (let i = idx(s0), e = idx(s1); i <= e; i++) if (busy[i]) return false; return true; };
  mark(0, track.startS + 60);
  mark(track.finishS - 55, track.length);
  for (const w of track.water) mark(w.s0 - 24, w.s1 + 24);
  for (const b of track.bridges) mark(b.s0 - 26, b.s1 + 26);
  for (const p of track.patches) if (!p.gen) mark(p.s0 - 8, p.s1 + 8);
  for (const c of track.checkpoints) mark(c.s - 16, c.s + 24);
  for (const c of track.caches) mark(c.s - 16, c.s + 16);
  for (const b of track.bypasses) mark(b.s0 - 10, b.s1 + 10);
  for (const j of track.junctions || []) mark(j - 22, j + 22);
  for (const tn of track.tunnels || []) mark(tn.s0 - 20, tn.s1 + 20);
  for (const l of track.landmarks || []) if (l.kind === 'fuel') mark(l.s - 24, l.s + 24);
  for (const o of track.obstacles) {
    if (o.gen) continue;
    const i = track.locateMain(o.x, o.z, 0);
    mark(S[i] - 9, S[i] + 9);
  }

  // ---- emitters --------------------------------------------------------------
  const hint = (s0, s1, d) => layer.hints.push({ s0, s1, d });
  const rock = (s, d, r, big) => {
    const p = at(s, d);
    layer.obstacles.push({ type: 'rock', x: p.x, z: p.z, r, h: big ? r * 1.1 : r * 0.7 * R(0.8, 1.2), rot: R(0, 6.28), tint: rng(), big: !!big, gen: true });
  };
  const log = (s, d0, d1, r, skew = 0, tree = false) => {
    const a = at(s - skew, d0), c = at(s + skew, d1);
    const len = Math.hypot(c.x - a.x, c.z - a.z);
    const o = { type: 'log', x: (a.x + c.x) / 2, z: (a.z + c.z) / 2, r, len, ax: (c.x - a.x) / len, az: (c.z - a.z) / len, gen: true, tree };
    return o;
  };
  const slab = (s, h, depth, o = {}) => {
    const i = idx(s), hw = HW[i], p = at(s, o.d || 0);
    const a = o.skew || 0;
    // across-road axis, turned by `skew` radians
    const lx = TZ[i], lz = -TX[i];
    const ax = lx * Math.cos(a) + TX[i] * Math.sin(a), az = lz * Math.cos(a) + TZ[i] * Math.sin(a);
    layer.obstacles.push({ type: 'slab', x: p.x, z: p.z, ax, az, len: o.len ?? hw * 2 + 1.6, depth, h, ramp: o.ramp ?? 0.28, look: o.look || 'stone', gen: true });
  };
  const hole = (s, d, r, depth) => { const p = at(s, d); layer.obstacles.push({ type: 'hole', x: p.x, z: p.z, r, h: depth, gen: true }); };
  const patch = (s0, s1, surf, f0 = -1.3, f1 = 1.3, off = false) => {
    const p = { s0, s1, f0, f1, surface: SURFACES[surf], gen: true, dyn0: off, off };   // dyn0: starts switched off (a landslide turns it on)
    layer.patches.push(p);
    return p;
  };
  const solid = (s, d, r, h, look) => { const p = at(s, d); const o = { type: 'solid', x: p.x, z: p.z, r, h, look, rot: Math.atan2(TX[p.i], TZ[p.i]) }; layer.solids.push(o); return o; };
  const body = (kind, s, d, o = {}) => {
    const p = at(s, d);
    const b = { kind, x: p.x, z: p.z, s, d, rot: R(0, 6.28), ...o };
    layer.bodies.push(b);
    return b;
  };

  // ---- challenge builders: (s) -> { s0, s1, w } or null when the road does not suit ----
  const build = {
    rockGarden(s) {
      const L = R(28, 46), q = span(s, s + L);
      const c = R(-0.4, 0.4) * q.hw;
      const n = Math.round(L * (0.32 + 0.12 * tier));
      const r0 = 0.16 + 0.03 * tier, r1 = 0.26 + 0.07 * tier;
      for (let k = 0; k < n; k++) {
        const r = R(r0, r1);
        let d = R(-1, 1) * (q.hw + 0.3);
        // anything tall enough to stop the truck stays out of the clear line
        if (r > 0.22 && Math.abs(d - c) < 1.35) d = c + (d >= c ? 1.4 : -1.4) + R(0, 0.5) * (d >= c ? 1 : -1);
        rock(s + 3 + rng() * (L - 6), d, r);
      }
      hint(s + 2, s + L - 2, c);
      return { s0: s, s1: s + L, w: 1 };
    },
    boulderSlalom(s) {
      const n = 2 + (tier >= 2 ? 1 : 0) + (rng() < 0.5 ? 1 : 0), gap = R(17, 21);
      const L = 10 + n * gap, q = span(s, s + L);
      const r = Math.min(1.5, (2 * q.hw - cw) / 1.5);
      if (r < 0.85 || q.curv > 0.03) return null;
      let side = rng() < 0.5 ? 1 : -1;
      for (let k = 0; k < n; k++) {
        const sb = s + 10 + k * gap;
        const hw = HW[idx(sb)];
        rock(sb, side * (hw - r * 0.5), r, true);
        // rubble against the boulder, outside the corridor
        for (let j = 0; j < 2; j++) rock(sb + R(-2.2, 2.2), side * (hw - R(0, 0.5)), R(0.15, 0.24));
        hint(sb - 6, sb + 6, -side * 0.75 * r);      // middle of what is left of the road
        side = -side;
      }
      return { s0: s, s1: s + L, w: 1.4 };
    },
    stoneSteps(s) {
      const n = 2 + Math.min(2, tier), gap = R(5.5, 8);
      const L = 8 + n * gap, q = span(s, s + L);
      if (q.grade > 0.16) return null;
      // a step needs grip to climb: keep them low where the road itself is mud, sand or snow
      const h = q.soft ? Math.min(0.11, [0.10, 0.14, 0.19, 0.24][tier]) : [0.10, 0.14, 0.19, 0.24][tier];
      const look = ['forest', 'mud', 'jungle'].includes(envId) ? 'root' : 'stone';
      for (let k = 0; k < n; k++) slab(s + 5 + k * gap, h * R(0.85, 1.15), R(1.4, 2.2), { skew: R(-0.16, 0.16), look });
      return { s0: s, s1: s + L, w: 1.1 };
    },
    logSteps(s) {
      const n = RI(2, 3 + (tier >= 2 ? 1 : 0)), gap = R(6.5, 10);
      const L = 8 + n * gap, q = span(s, s + L);
      if (q.grade > 0.14) return null;
      const r = q.soft ? Math.min(0.14, [0.13, 0.16, 0.19, 0.22][tier]) : [0.13, 0.16, 0.19, 0.22][tier];   // same rule as steps
      for (let k = 0; k < n; k++) {
        const sl = s + 6 + k * gap, hw = HW[idx(sl)];
        layer.obstacles.push(log(sl, -hw - 0.8, hw + 0.8, r * R(0.9, 1.1), R(-1.2, 1.2)));
      }
      return { s0: s, s1: s + L, w: 1 };
    },
    fallenTree(s, falling) {
      const L = falling ? 64 : 26, st = s + (falling ? 50 : 13), q = span(st - 8, st + 8);
      if (2 * q.hw < cw + 1.0 || q.curv > 0.035) return null;
      const side = rng() < 0.5 ? 1 : -1;
      // the bank on the tree's side must not be a cliff face or a drop
      if (Math.abs(side > 0 ? q.bl : q.br) > 5) return null;
      const hw = HW[idx(st)];
      const r = [0.4, 0.45, 0.5, 0.55][tier];
      const o = log(st, side * (hw + (falling ? 2.4 : 3.6)), -side * (hw - cw), r, falling ? 0 : R(-1.4, 1.4), true);
      const dc = -side * (hw - cw / 2);
      if (falling) {
        const base = at(st, side * (hw + 2.4));
        layer.triggers.push({ type: 'treefall', s: st, arm: st - 95, log: o, base: { x: base.x, z: base.z }, side, len: o.len });
        hint(st - 8, st + 8, dc);
      } else {
        layer.obstacles.push(o);
        // snapped branches lying in the gap: they break when driven over
        for (let k = 0; k < 2 + tier; k++) body('branch', st + R(-2.5, 2.5), dc + R(-1.2, 1.2));
        hint(st - 8, st + 8, dc);
      }
      return { s0: s, s1: s + L, w: falling ? 1.5 : 1.3 };
    },
    treefall(s) { return build.fallenTree(s, true); },
    mudPit(s) {
      const len = [14, 18, 22, 26][tier] * R(0.8, 1.15), L = len + 14, q = span(s, s + L);
      if (q.soft || q.grade > 0.08) return null;
      const a = s + 7;
      if (tier === 0) {
        const side = rng() < 0.5 ? 1 : -1;      // easy: only half the road, there is a dry line
        patch(a, a + len, 'mud', side > 0 ? -0.15 : -1.3, side > 0 ? 1.3 : 0.15);
        hint(a, a + len, -side * q.hw * 0.55);
      } else if (tier === 1) patch(a, a + len, 'mud');
      else if (tier === 2 || q.hw < 3.0) patch(a, a + len, 'deepmud');
      else {
        // extreme: a bog in the middle of the pit. It never spans the whole road, so a truck
        // without a winch still has a (deep mud) way round it.
        const core = Math.min(8, len * 0.3), m = a + len / 2, side = rng() < 0.5 ? 1 : -1;
        patch(a, m - core / 2, 'deepmud');
        patch(m - core / 2, m + core / 2, 'bog', side > 0 ? 0.1 : -1.3, side > 0 ? 1.3 : -0.1);
        patch(m - core / 2, m + core / 2, 'deepmud');
        patch(m + core / 2, a + len, 'deepmud');
        hint(m - core / 2 - 2, m + core / 2 + 2, -side * q.hw * 0.62);
      }
      if (tier >= 2) {                          // a winch post on the far bank
        const p = at(a + len + 5, (rng() < 0.5 ? 1 : -1) * (HW[idx(a + len + 5)] + 1.6));
        layer.anchors.push({ x: p.x, z: p.z, post: true, gen: true });
      }
      return { s0: s, s1: s + L, w: 1.2 };
    },
    softPatch(s) {
      const kind = SOFT[envId];
      if (!kind) return null;
      const ice = kind[0] === 'ice';
      const len = (ice ? [8, 11, 14, 17] : [14, 18, 24, 30])[tier] * R(0.85, 1.15), L = len + 14, q = span(s, s + L);
      if (q.soft || (ice && (q.grade > 0.05 || q.curv > 0.015)) || q.grade > 0.12) return null;
      const a = s + 7;
      if (tier === 0 || (ice && tier === 1)) {
        const side = rng() < 0.5 ? 1 : -1;
        patch(a, a + len, kind[0], side > 0 ? -0.1 : -1.3, side > 0 ? 1.3 : 0.1);
        hint(a, a + len, -side * q.hw * 0.55);
      } else patch(a, a + len, kind[0]);
      return { s0: s, s1: s + L, w: 1, name: kind[1] };
    },
    potholes(s) {
      const L = R(26, 36), q = span(s, s + L);
      if (q.grade > 0.1) return null;
      const n = 4 + 2 * tier, depth = [0.10, 0.14, 0.18, 0.22][tier];
      const placed = [];
      for (let k = 0, tries = 0; k < n && tries < 60; tries++) {
        const sp = s + 4 + rng() * (L - 8), d = R(-1, 1) * (q.hw - 0.7), r = R(0.45, 0.85);
        if (placed.some((p) => Math.hypot(p.s - sp, p.d - d) < p.r + r + 0.5)) continue;
        placed.push({ s: sp, d, r });
        hole(sp, d, r, depth * R(0.8, 1.15));
        k++;
      }
      return { s0: s, s1: s + L, w: 0.9 };
    },
    roadworks(s) {
      const len = 14 + 4 * tier, L = len + 26, q = span(s, s + L);
      if (2 * q.hw < cw + 1.6 || q.curv > 0.02 || q.grade > 0.1) return null;
      const side = rng() < 0.5 ? 1 : -1;
      const a = s + 12, b = a + len;
      const edge = (sv) => {
        const hw = HW[idx(sv)], inner = -side * (hw - cw);      // lateral position of the closed lane's boundary
        const u = Math.min(1, Math.max(0, Math.min(sv - (a - 6), b + 6 - sv) / 6));
        return side * hw + (inner - side * hw) * u;
      };
      for (let sv = a - 6; sv <= b + 6; sv += 1.05) solid(sv, edge(sv) + side * 0.42, 0.42, 0.8, 'block');   // blocks stand on the closed side of the line
      for (let k = 0; k < 4; k++) { const sv = a - 11 + k * 2.2; body('cone', sv, edge(Math.max(sv, a - 5.5)) - side * 0.75); }
      const hw = HW[idx(a)];
      for (let k = 0; k < 2 + tier; k++) body(rng() < 0.5 ? 'crate' : 'barrel', R(a + 1, b - 1), side * (hw - R(0.5, Math.max(0.6, hw - cw - 0.8))));
      if (tier >= 1) slab(a - 9, 0.1, 0.8, { look: 'bump', ramp: 0.35, len: HW[idx(a - 9)] * 2 + 0.3 });
      hint(a - 8, b + 8, -side * (hw - cw / 2));
      return { s0: s, s1: s + L, w: 1.2 };
    },
    wreck(s) {
      const L = 30, q = span(s, s + L);
      if (2 * q.hw < cw + 2.6 || q.curv > 0.03) return null;
      const side = rng() < 0.5 ? 1 : -1;
      const sc = s + 15, hw = HW[idx(sc)];
      const dc = side * (hw - 1.15), yaw = R(-0.2, 0.2);
      const w = solid(sc, dc, 1.05, 1.5, 'wreck');
      w.rot += yaw;
      // two more circles along the hull (the drawn wreck is turned by the same yaw)
      for (const u of [-1.55, 1.55]) { const o = solid(sc + u * Math.cos(yaw), dc + u * Math.sin(yaw), 1.0, 1.4, null); o.part = true; }
      for (let k = 0; k < 2 + Math.min(2, tier); k++) body(rng() < 0.6 ? 'barrel' : 'crate', sc + R(-5, 5), dc - side * R(1.6, 2.6));
      hint(sc - 9, sc + 9, -side * 1.25);           // the wreck takes about 2.5 m off its side of the road
      return { s0: s, s1: s + L, w: 1 };
    },
    rockfall(s) {
      const lead = 34, zone = 18, L = lead + zone + 12, q = span(s + lead, s + lead + zone);
      // needs a real bank above the road for the rocks to come down
      const side = q.bl >= 3.5 && q.bl >= q.br ? 1 : q.br >= 3.5 ? -1 : 0;
      if (!side || q.hw < 2.2) return null;
      const amt = side > 0 ? q.bl : q.br, run = 1.5 + amt * 0.75;
      const slide = tier >= 2 && amt >= 6;
      const n = 3 + tier + (slide ? 4 : 0);
      const ids = [];
      for (let k = 0; k < n; k++) {
        const sv = s + lead + rng() * zone, hw = HW[idx(sv)];
        const r = slide && k >= 3 + tier ? R(0.2, 0.34) : R(0.3, 0.55 + 0.1 * tier);
        ids.push(layer.bodies.length);
        body('rock', sv, side * (hw + run * 0.92 + R(0.6, 1.8)), { r, hidden: true, delay: R(0, 1.6), push: -side });
      }
      const t = { type: 'rockfall', s: s + 4, lead: lead - 4, bodies: ids, side, slide, at: at(s + lead + zone / 2, side * (q.hw + run)) };
      if (slide) t.patch = patch(s + lead - 2, s + lead + zone + 2, 'scree', -1.3, 1.3, true);
      layer.triggers.push(t);
      return { s0: s, s1: s + L, w: 1.6, name: slide ? 'Landslide' : undefined, tip: slide ? 'The bank is giving way!' : undefined };
    },
    rollingBoulder(s) {
      const L = 84, q = span(s + 8, s + 72);
      // the trail has to climb (the boulder comes down it) and be wide enough to dodge
      if (q.mean < 0.04 || q.curv > 0.022 || q.hw < 2.75 || q.soft) return null;
      const side = rng() < 0.5 ? 1 : -1;
      const sb = s + 66, hw = HW[idx(sb)], r = Math.min(1.25, hw - cw / 2 - 0.35);
      if (r < 0.8) return null;
      const lane = side * (hw - r - 0.15);
      const id = layer.bodies.length;
      body('boulder', sb, lane, { r, hidden: true, lane, sOff: s + 4, laneOff: side * (hw + 7), sMin: s - 30 });
      layer.triggers.push({ type: 'boulder', s: s + 6, bodies: [id] });
      hint(s + 10, s + 72, -side * (hw - cw / 2) * 0.9);
      return { s0: s, s1: s + L, w: 1.8 };
    },
    herd(s) {
      const list = HERDS[envId] || [];
      if (!list.length) return null;
      const L = 96, zs = s + 76, q = span(zs - 6, zs + 14);
      if (Math.abs(q.bl) > 3.5 || Math.abs(q.br) > 3.5 || q.curv > 0.03) return null;
      if (track.biomes && track.biomes[track.BIO[idx(zs)]].urban) return null;      // no herds between buildings
      const sp = list[RI(0, list.length - 1)];
      const n = RI(HERD_SIZE[sp][0], HERD_SIZE[sp][1]), side = rng() < 0.5 ? 1 : -1;
      const ids = [];
      for (let k = 0; k < n; k++) {
        const sv = zs + k * R(2.2, 3.4), hw = HW[idx(sv)];
        ids.push(layer.bodies.length);
        body('animal', sv, side * (hw + R(6, 10)), { sp, side, hw, delay: k * R(0.5, 1.1), far: hw + R(11, 16) });
      }
      layer.triggers.push({ type: 'herd', s: s + 4, bodies: ids, sp });
      return { s0: s, s1: s + L, w: 1.2, name: `${sp[0].toUpperCase()}${sp.slice(1)} crossing` };
    },
    gust(s) {
      const L = R(90, 140), q = span(s, s + L);
      const exposed = q.bl < -4 || q.br < -4 || ['ridge', 'snow', 'desert'].includes(envId);
      if (!exposed) return null;
      // on the lower tiers the wind pushes towards the bank, never towards the drop
      let dir = rng() < 0.5 ? 1 : -1;
      if (tier < 2 && (q.bl < -4 || q.br < -4)) dir = q.bl < q.br ? -1 : 1;
      layer.triggers.push({ type: 'gust', s: s + 8, s1: s + L - 8, dir, acc: [0, 0.9, 1.3, 1.7][tier] });
      return { s0: s, s1: s + L, w: 1 };
    },
    squall(s) {
      const id = SQUALL[envId] || 'fog';
      const plan = track.meta.weatherPlan || [[0, track.meta.weather || 'clear']];
      if (plan.some((p) => p[1] === id) || !WEATHER[id]) return null;
      const L = R(150, 240);
      layer.triggers.push({ type: 'squall', s: s + 6, s1: s + L - 6, weather: id });
      return { s0: s, s1: s + L, w: 1, name: `Sudden ${WEATHER[id].name.toLowerCase()}` };
    }
  };
  const add = (type, res) => {
    const def = CHALLENGES[type];
    layer.challenges.push({ type, cat: def.cat, dyn: !!def.dyn, name: res.name || def.name, tip: res.tip || def.tip, s0: res.s0, s1: res.s1, w: res.w });
    mark(res.s0 - 4, res.s1 + 4);
  };
  const allowed = (type) => {
    const def = CHALLENGES[type];
    if (!cfg.categories[def.cat]) return false;
    if (def.dyn && !cfg.dynamicEvents) return false;
    if (type === 'softPatch' && !SOFT[envId]) return false;
    return tier >= (MIN_TIER[type] || 0);
  };

  // ---- broken planks on authored wooden bridges ------------------------------
  const masonry = ['alpine', 'crags', 'dunes', 'snowpeaks'].includes(track.env.silhouette);
  if (cfg.categories.bridges && tier >= 2 && !masonry) {
    for (let bi = 0; bi < track.bridges.length; bi++) {
      const b = track.bridges[bi];
      if (b.len < 14 || b.half < 1.6) continue;
      const n = Math.min(3, 1 + (tier >= 3 ? 1 : 0) + (b.len > 26 ? 1 : 0));
      let side = rng() < 0.5 ? 1 : -1;
      for (let k = 0; k < n; k++) {
        const u = 0.22 + (0.56 * (k + 0.5)) / n + R(-0.04, 0.04);
        const half = 0.36 / b.len;                                // 0.72 m of deck missing
        layer.gaps.push({ bridge: bi, t0: u - half, t1: u + half, side, d0: 0.8 });
        const sg = b.s0 + (b.s1 - b.s0) * u;
        hint(sg - 5, sg + 5, -side * 0.42);
        side = -side;
      }
      layer.challenges.push({ type: 'bridgeGaps', cat: 'bridges', dyn: false, name: CHALLENGES.bridgeGaps.name, tip: CHALLENGES.bridgeGaps.tip, s0: b.s0 - 6, s1: b.s1 + 4, w: 1.5 });
    }
  }

  // ---- walk the route ---------------------------------------------------------
  let pool = POOL[envId] || POOL.forest;
  let types = Object.keys(pool).filter(allowed);
  const setEnv = (sv) => { const e = envOf(sv); if (e !== envId) { envId = e; pool = POOL[envId] || POOL.forest; types = Object.keys(pool).filter(allowed); } };
  const total = () => types.reduce((a, t) => a + pool[t], 0);
  const pick = (skip) => {
    let x = rng() * (total() - (skip && pool[skip] && types.includes(skip) ? pool[skip] : 0));
    for (const t of types) { if (t === skip) continue; x -= pool[t]; if (x <= 0) return t; }
    return types[types.length - 1];
  };
  const NEED = { rockfall: 66, rollingBoulder: 86, herd: 98, treefall: 66, gust: 142, squall: 242, roadworks: 54, boulderSlalom: 96 };
  const gap = () => (40 + (1 - dens) * 230) * R(0.6, 1.4);
  let last = '';
  let s = track.startS + 70 + rng() * 40;
  while ((types.length || track.biomes) && s < track.finishS - 80) {
    setEnv(s);
    if (!types.length) { s += 14; continue; }
    let placed = false;
    for (let attempt = 0; attempt < 4 && !placed; attempt++) {
      const type = pick(last);
      if (!free(s - 6, s + (NEED[type] || 50) + 6)) continue;
      const nO = layer.obstacles.length, nP = layer.patches.length, nB = layer.bodies.length, nS = layer.solids.length, nH = layer.hints.length, nT = layer.triggers.length, nA = layer.anchors.length;
      const res = build[type](s);
      if (res && free(res.s0 - 4, res.s1 + 4) && res.s1 < track.finishS - 55) {
        add(type, res);
        last = type;
        s = res.s1 + gap();
        placed = true;
      } else {
        // the road did not suit it: drop whatever it had started to place
        layer.obstacles.length = nO; layer.patches.length = nP; layer.bodies.length = nB; layer.solids.length = nS; layer.hints.length = nH; layer.triggers.length = nT; layer.anchors.length = nA;
      }
    }
    if (!placed) s += 14;
  }

  // ---- birds: scenery that reacts (no collision, not a challenge) -----------------
  if (cfg.categories.wildlife && envId !== 'volcano') {
    for (let sv = track.startS + 150 + rng() * 200; sv < track.finishS - 100; sv += R(320, 620)) {
      if (!free(sv - 4, sv + 4)) continue;
      const p = at(sv, R(-0.6, 0.6) * HW[idx(sv)]);
      layer.birds.push({ x: p.x, z: p.z, s: sv, n: RI(6, 11) });
    }
  }

  // ---- the hard line: staying on the main trail where an authored bypass exists -----
  if (cfg.alternateRoutes) for (const b of track.bypasses) layer.hardLines.push({ s0: b.s0 + 6, s1: b.s1 - 6, side: b.side });

  layer.challenges.sort((a, b) => a.s0 - b.s0);
  layer.hints.sort((a, b) => a.s0 - b.s0);
  layer.triggers.sort((a, b) => a.s - b.s);
  return layer;
}

/**
 * Prove the layer is playable. Returns a list of problems (empty = OK):
 *  - the recommended line keeps a truck-wide corridor clear of anything that cannot be driven over
 *  - nothing generated sits on a spawn point or checkpoint
 */
export function validateObstacles(track) {
  const out = [];
  const layer = track.layer;
  if (!layer) return out;
  const half = 1.2;
  for (const c of layer.challenges) {
    for (let s = c.s0; s <= c.s1; s += 1) {
      const d = track.lineOffset(s);
      const i = track._idxS(s);
      const ds = s - track.S[i];
      for (let o = -half; o <= half + 1e-6; o += 0.4) {
        const x = track.PX[i] + track.TX[i] * ds + track.TZ[i] * (d + o), z = track.PZ[i] + track.TZ[i] * ds - track.TX[i] * (d + o);
        if (track.bumpAt(x, z) > 0.42) { out.push(`${c.type}: blocked line at s=${s.toFixed(0)} (bump ${track.bumpAt(x, z).toFixed(2)} m)`); s = c.s1; break; }
        let hit = false;
        track.solidsNear(x, z, (p) => { if (Math.hypot(p.x - x, p.z - z) < p.r) hit = true; });
        if (hit) { out.push(`${c.type}: solid on the line at s=${s.toFixed(0)}`); s = c.s1; break; }
      }
    }
  }
  for (const s of [track.startS, ...track.checkpoints.map((c) => c.s)]) {
    const p = track.roadPose(s);
    if (Math.abs(track.bumpAt(p.x, p.z)) > 0.05) out.push(`generated obstacle on the spawn point at s=${s.toFixed(0)}`);
  }
  for (const c of layer.challenges) if (!(c.s1 > c.s0) || c.s0 < track.startS + 40 || c.s1 > track.finishS - 40) out.push(`${c.type}: bad range ${c.s0.toFixed(0)}..${c.s1.toFixed(0)}`);
  return out;
}

/** Counts for docs / tests. */
export function obstacleStats(track) {
  const l = track.layer;
  if (!l) return null;
  const types = {};
  for (const c of l.challenges) types[c.type] = (types[c.type] || 0) + 1;
  return { challenges: l.challenges.length, types, statics: l.obstacles.length + l.solids.length, bodies: l.bodies.length, triggers: l.triggers.length, patches: l.patches.length };
}
