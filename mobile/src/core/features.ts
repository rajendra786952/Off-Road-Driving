// Level features: every obstacle and set piece on a track is one Feature record.
// Features are generated from the level seed, so the 100 levels need no
// hand-written layouts and never duplicate code.
import { mulberry32 } from './rng';
import { BLEND, SEGMENT } from './terrain';

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
  checkpoint: 'Checkpoints',
};

/** Level index (0-based) at which each obstacle first appears. */
export const FEATURE_UNLOCK: [FeatureType, number][] = [
  ['rocks', 1],
  ['crates', 1],
  ['logs', 2],
  ['ramp', 3],
  ['barrels', 4],
  ['hill', 5],
  ['mud', 7],
  ['boulder', 10],
  ['gap', 13],
  ['water', 17],
  ['bridge', 21],
  ['falling', 26],
  ['roller', 31],
  ['platform', 36],
  ['drop', 42],
];

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
    pool.push([type, fresh * (bias[type] ?? 1)]);
  }
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
  while (pool.length && x < end) {
    let type = pick();
    if (type === last && pool.length > 1) type = pick();
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
      case 'gap':
        f.h = 20 + rnd() * 8; // lip height
        f.n = 30 + rnd() * 14; // how much lower the far side is
        f.a = snap(x + BLEND + 700); // long flat run-up
        f.b = f.a + 120 + 40 * Math.floor(rnd() * 1.5 + d * 1.5);
        f.x0 = f.a - 700 - BLEND;
        f.x1 = f.b + 520 + BLEND;
        break;
      case 'bridge':
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
    const spacing = 1500 - 850 * d + rnd() * (900 - 400 * d);
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
