// Level features: every obstacle and set piece on a track is one Feature record.
// Features are generated from the level seed, so the 100 levels need no
// hand-written layouts and never duplicate code.
import { mulberry32 } from './rng';
import { BLEND, SEGMENT } from './terrain';
import { STEEP_VALLEY, STUNT_KIND, landingLength, runUpLength } from './stuntshape';

export type FeatureType =
  | 'rocks' // fixed rocks half buried in the ground
  | 'logs' // loose wooden logs
  | 'crates' // stack of light crates
  | 'barrels' // loose barrels
  | 'boulder' // one heavy loose boulder
  | 'ramp' // launch ramp, big jump
  | 'gap' // broken road: lip, hole, lower far side
  | 'bridge' // plank bridge over a chasm
  | 'platform' // moving platform over a chasm
  | 'mud' // mud pit
  | 'water' // water pit
  | 'hill' // steep hill
  | 'drop' // dangerous slope: the ground steps down
  | 'falling' // rocks fall when the car arrives
  | 'roller' // boulder rolls towards the car
  | 'seesaw' // plank on a pivot that tips under the car
  | 'pendulum' // wrecking ball swinging across the road
  | 'stunt' // stunt ramp, see core/stuntshape.ts (n is the kind)
  | 'steep' // long steep descent into a valley, then a steep climb out: brake going down
  | 'checkpoint';

export interface Feature {
  id: number;
  type: FeatureType;
  /** Whole zone the feature owns (nothing else is placed inside it). */
  x0: number;
  x1: number;
  /** Core span: the hole, pit, ramp or object row. */
  a: number;
  b: number;
  /** Height, depth or radius, depending on the type. */
  h: number;
  /** Count, or a second size parameter. */
  n: number;
  seed: number;
  /** Stunts: how far the road falls away after the last lip. */
  d?: number;
}

export const FEATURE_LABEL: Record<FeatureType, string> = {
  rocks: 'Rocks',
  logs: 'Logs',
  crates: 'Crates',
  barrels: 'Barrels',
  boulder: 'Boulders',
  ramp: 'Jumps',
  gap: 'Broken road',
  bridge: 'Bridges',
  platform: 'Moving platforms',
  mud: 'Mud pits',
  water: 'Water',
  hill: 'Steep hills',
  drop: 'Cliff drops',
  falling: 'Falling rocks',
  roller: 'Rolling boulders',
  seesaw: 'Seesaws',
  pendulum: 'Wrecking balls',
  stunt: 'Stunt ramps',
  steep: 'Steep descents',
  checkpoint: 'Checkpoints',
};

/** Level index (0-based) at which each stunt ramp kind (stuntshape.ts) first appears. */
export const STUNT_UNLOCK: [number, number][] = [
  [STUNT_KIND.large, 5], // levels 6-10: flips
  [STUNT_KIND.steep, 7],
  [STUNT_KIND.double, 20], // levels 21-30: several ramps, hard landings
  [STUNT_KIND.uneven, 24],
  [STUNT_KIND.downhill, 30], // levels 31-50: combinations
  [STUNT_KIND.mountain, 34],
  [STUNT_KIND.combo, 38],
];

/** Level index (0-based) at which each obstacle first appears. */
export const FEATURE_UNLOCK: [FeatureType, number][] = [
  ['rocks', 1],
  ['crates', 1],
  ['steep', 1],
  ['logs', 2],
  ['ramp', 2],
  ['stunt', 5],
  ['barrels', 4],
  ['hill', 5],
  ['mud', 7],
  ['boulder', 10],
  ['gap', 13],
  ['seesaw', 15],
  ['water', 17],
  ['bridge', 21],
  ['pendulum', 23],
  ['falling', 26],
  ['roller', 31],
  ['platform', 36],
  ['drop', 42],
];

/** Level index (0-based) from which some bridges collapse under a car that crawls. */
export const COLLAPSE_FROM = 30;

/** Obstacles after which a brake zone often follows at once (jump, brake, steep descent). */
const BRAKE_AFTER = new Set<FeatureType>(['stunt', 'gap', 'bridge', 'mud', 'ramp', 'platform']);
const SEQUENCE_FROM = 9;

const snap = (x: number) => Math.round(x / SEGMENT) * SEGMENT;

export interface FeatureGenInput {
  index: number; // 0..99
  length: number;
  seed: number;
  /** Extra weight per type for this environment. */
  bias: Partial<Record<FeatureType, number>>;
}

export function generateFeatures(input: FeatureGenInput): Feature[] {
  const { index, length, seed, bias } = input;
  const d = index / 99;
  const rnd = mulberry32(seed * 7919 + 17);
  const pool: [FeatureType, number][] = [];
  for (const [type, from] of FEATURE_UNLOCK) {
    if (index < from) continue;
    // a newly introduced obstacle is common for a few levels so the player meets it
    const fresh = index - from < 3 ? 2.2 : 1;
    let weight = fresh * (bias[type] ?? 1);
    if (type === 'stunt') weight *= 1.2 + 0.3 * STUNT_UNLOCK.filter(([, at]) => index >= at).length;
    if (type === 'steep') weight *= 1.3;
    pool.push([type, weight]);
  }
  const kinds = STUNT_UNLOCK.filter(([, at]) => index >= at);
  const newest = kinds.reduce((m, [, at]) => Math.max(m, at), -1);
  const total = pool.reduce((s, p) => s + p[1], 0);
  const pick = (): FeatureType => {
    let r = rnd() * total;
    for (const [type, w] of pool) {
      r -= w;
      if (r <= 0) return type;
    }
    return pool[pool.length - 1][0];
  };

  const out: Feature[] = [];
  const end = length - 1300;
  let x = 1500 + rnd() * 400;
  let id = 1;
  let last: FeatureType | null = null;
  let forceSteep = false;
  let hasJump = false;
  let hasSteep = false;
  while (pool.length && x < end) {
    let type = pick();
    if (type === last && pool.length > 1) type = pick();
    // a jump, a gap, a bridge or a mud pit is often followed straight away by a steep descent:
    // land, let off the gas, brake down the slope, then accelerate again in the valley
    // every level from the sixth on has a jump, and from the eleventh a steep descent: the
    // lessons of that stretch of levels are never left to chance
    if (index >= 5 && !hasJump && out.length >= 1) type = 'stunt';
    else if (index >= 10 && !hasSteep && out.length >= 3 && pool.some(([t]) => t === 'steep')) type = 'steep';
    if (forceSteep) type = 'steep';
    forceSteep = false;
    last = type;
    const f: Feature = { id: id++, type, x0: x, x1: x, a: x, b: x, h: 0, n: 0, seed: Math.floor(rnd() * 1e9) };
    switch (type) {
      case 'rocks':
        f.n = 2 + Math.floor(rnd() * 3);
        f.h = 30 + rnd() * 8 + d * 10; // radius; most of it is buried
        f.a = x + 60;
        f.b = f.a + f.n * 110;
        f.x1 = f.b + 60;
        break;
      case 'logs':
        f.n = 1 + Math.floor(rnd() * 2 + d * 1.2);
        f.h = 11 + rnd() * 4;
        f.a = x + 60;
        f.b = f.a + 120;
        f.x1 = f.b + 80;
        break;
      case 'crates':
        f.n = 3 + Math.floor(rnd() * 3 + d * 2);
        f.h = 34;
        f.a = x + 60;
        f.b = f.a + 120;
        f.x1 = f.b + 80;
        break;
      case 'barrels':
        f.n = 2 + Math.floor(rnd() * 2 + d * 1.5);
        f.h = 38;
        f.a = x + 60;
        f.b = f.a + 140;
        f.x1 = f.b + 80;
        break;
      case 'boulder':
        f.n = 1;
        f.h = 24 + rnd() * 8;
        f.a = x + 80;
        f.b = f.a + 80;
        f.x1 = f.b + 100;
        break;
      case 'ramp':
        f.h = 55 + 45 * d + rnd() * 20;
        f.a = snap(x + BLEND + 200);
        f.b = f.a + snap(240 + rnd() * 80);
        f.x0 = f.a - 200 - BLEND;
        f.x1 = f.b + 520 + BLEND;
        break;
      case 'stunt': {
        // a ramp kind this level has unlocked; the newest one is common so it is met on purpose
        const weights = kinds.map(([k, at]) => [k, at === newest && index - at < 3 ? 3 : 1] as const);
        let r = rnd() * weights.reduce((t, w) => t + w[1], 0);
        let kind: number = weights[0][0];
        for (const [k, w] of weights) {
          r -= w;
          if (r <= 0) {
            kind = k;
            break;
          }
        }
        f.n = kind;
        const grow = Math.min(1.35, 0.92 + 0.5 * d); // ramps get bigger as the levels go on
        const run = runUpLength(kind);
        f.a = snap(x + BLEND + run);
        switch (kind) {
          case STUNT_KIND.large:
            f.h = (78 + rnd() * 10) * grow;
            f.b = f.a + snap(320 + rnd() * 40);
            f.d = 380 * grow;
            break;
          case STUNT_KIND.steep:
            f.h = (56 + rnd() * 8) * grow;
            f.b = f.a + snap(240 + rnd() * 40);
            f.d = 320 * grow;
            break;
          case STUNT_KIND.double:
            f.h = (80 + rnd() * 10) * grow;
            f.b = f.a + 1150;
            f.d = 2.5 * f.h;
            break;
          case STUNT_KIND.downhill:
            f.h = (72 + rnd() * 10) * grow;
            f.b = f.a + snap(280 + rnd() * 40);
            f.d = 480 * Math.min(grow, 1.1);
            break;
          case STUNT_KIND.mountain:
            f.h = (66 + rnd() * 8) * grow;
            f.b = f.a + snap(300 + rnd() * 40);
            f.d = 480 * Math.min(grow, 1.1);
            break;
          case STUNT_KIND.uneven:
            f.h = (76 + rnd() * 10) * grow;
            f.b = f.a + snap(320 + rnd() * 40);
            f.d = 300 * grow;
            break;
          default: // combo
            f.h = (80 + rnd() * 8) * grow;
            f.b = f.a + 1280;
            f.d = 2.5 * f.h;
        }
        f.x0 = f.a - run - BLEND;
        f.x1 = f.b + landingLength(kind) + BLEND;
        break;
      }
      case 'steep': {
        // depth and steepness grow with the level; the climb out needs momentum from the valley floor
        const g = Math.min(1, Math.max(0, (index - 1) / 70));
        f.h = 170 + 170 * g + rnd() * 40;
        f.n = snap(f.h / (0.33 + 0.17 * g));
        f.a = snap(x + BLEND + 300);
        f.b = f.a + f.n + STEEP_VALLEY + snap(f.h / (0.5 + 0.12 * g));
        f.x0 = f.a - 300 - BLEND;
        f.x1 = f.b + 420 + BLEND;
        break;
      }
      case 'gap':
        f.h = 20 + rnd() * 8; // lip height
        f.n = 30 + rnd() * 14; // how much lower the far side is
        f.a = snap(x + BLEND + 700); // long flat run-up
        f.b = f.a + 120 + 40 * Math.floor(rnd() * 1.5 + d * 1.5);
        f.x0 = f.a - 700 - BLEND;
        f.x1 = f.b + 520 + BLEND;
        break;
      case 'bridge':
        f.n = index >= COLLAPSE_FROM && rnd() < 0.5 ? 1 : 0; // 1: collapses under a slow car
        f.a = snap(x + BLEND + 120);
        f.b = f.a + snap(360 + rnd() * 240);
        f.x0 = f.a - 120 - BLEND;
        f.x1 = f.b + 120 + BLEND;
        break;
      case 'platform':
        f.a = snap(x + BLEND + 120);
        f.b = f.a + snap(240 + rnd() * 120);
        f.h = 14 + 10 * d; // travel
        f.x0 = f.a - 120 - BLEND;
        f.x1 = f.b + 120 + BLEND;
        break;
      case 'mud':
        f.h = 22 + rnd() * 14;
        f.a = snap(x + BLEND + 80);
        f.b = f.a + snap(320 + rnd() * 280);
        f.x0 = f.a - 80 - BLEND;
        f.x1 = f.b + 80 + BLEND;
        break;
      case 'water':
        f.h = 34 + rnd() * 20;
        f.a = snap(x + BLEND + 80);
        f.b = f.a + snap(280 + rnd() * 240);
        f.x0 = f.a - 80 - BLEND;
        f.x1 = f.b + 80 + BLEND;
        break;
      case 'hill': {
        const sigma = 170 + rnd() * 60;
        f.h = 60 + 50 * d + rnd() * 20;
        f.a = snap(x + BLEND + sigma * 0.5);
        f.b = f.a + snap(sigma * 4);
        f.x1 = f.b + sigma * 0.5 + BLEND;
        break;
      }
      case 'drop':
        f.h = 110 + 90 * d * rnd();
        f.a = x + 60;
        f.b = f.a + 240 + rnd() * 100;
        f.x1 = f.b + 320;
        break;
      case 'falling':
        f.n = 3 + Math.floor(rnd() * 2 + d);
        f.h = 12 + rnd() * 5;
        f.a = x + 120;
        f.b = f.a + 420;
        f.x1 = f.b + 60;
        break;
      case 'seesaw':
        f.h = 30 + rnd() * 10; // pivot height
        f.a = snap(x + BLEND + 160);
        f.b = f.a + snap(260 + rnd() * 60); // plank length
        f.x0 = f.a - 160 - BLEND;
        f.x1 = f.b + 240 + BLEND;
        break;
      case 'pendulum':
        f.h = 24 + rnd() * 6; // ball radius
        f.n = 160 + rnd() * 30; // rope length
        f.a = snap(x + BLEND + 260);
        f.b = f.a + 40;
        f.x0 = f.a - 260 - BLEND;
        f.x1 = f.b + 260 + BLEND;
        break;
      case 'roller':
        f.n = 1;
        f.h = 22 + rnd() * 7;
        f.a = x;
        f.b = x + 860;
        f.x1 = f.b + 40;
        break;
    }
    if (f.x1 > end) break;
    out.push(f);
    if (f.type === 'stunt' || f.type === 'ramp') hasJump = true;
    if (f.type === 'steep') hasSteep = true;
    forceSteep = BRAKE_AFTER.has(f.type) && index >= SEQUENCE_FROM && pool.some(([t]) => t === 'steep') && rnd() < 0.35 + 0.2 * d;
    const spacing = forceSteep ? 200 + rnd() * 200 : 1500 - 850 * d + rnd() * (900 - 400 * d);
    x = f.x1 + spacing;
  }

  // Checkpoints sit between obstacles, never inside one.
  const count = Math.min(5, Math.max(1, Math.floor(length / 15000)));
  for (let k = 1; k <= count; k++) {
    let cx = snap((length * k) / (count + 1));
    for (let guard = 0; guard < 40; guard++) {
      const hit = out.find((f) => cx > f.x0 - 160 && cx < f.x1 + 160);
      if (!hit) break;
      cx = snap(hit.x1 + 200);
    }
    if (cx < length - 900) out.push({ id: id++, type: 'checkpoint', x0: cx, x1: cx, a: cx, b: cx, h: 0, n: k, seed: 0 });
  }
  out.sort((p, q) => p.x0 - q.x0);
  return out;
}

/** True if x lies over a hole (no ground to stand on, coins float there). */
export function chasmAt(features: Feature[], x: number): Feature | null {
  for (const f of features) {
    if ((f.type === 'gap' || f.type === 'bridge' || f.type === 'platform') && x > f.a - 20 && x < f.b + 20) return f;
  }
  return null;
}

export function liquidAt(features: Feature[], x: number): Feature | null {
  for (const f of features) if ((f.type === 'mud' || f.type === 'water') && x > f.a && x < f.b) return f;
  return null;
}
