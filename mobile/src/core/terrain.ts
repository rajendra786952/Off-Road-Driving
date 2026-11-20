// Pure terrain maths. The ground is a deterministic function of x: the rolling
// base profile of the original game, plus the level's features (ramps, gaps,
// pits, hills, drops) carved into it. Physics, rendering, pickups and the test
// driver all sample the same function.
import { hashFloat } from './rng';
import type { Feature } from './features';

export const SEGMENT = 40; // horizontal spacing of terrain sample points (px)
export const BASE_Y = 400; // world y of flat ground
export const CHASM_DEPTH = 420;
export const BLEND = 320; // distance over which a flattened zone meets the hills
const BUMP_CELL = 750;

export interface TerrainConfig {
  seed: number;
  hill: number;
  rough: number;
  bumps: number;
}

export interface TerrainProfile {
  heightAt(x: number): number;
  /** Cached height of sample point i (x = i * SEGMENT). */
  sampleAt(i: number): number;
  surfaceY(x: number): number;
  config: TerrainConfig;
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const FLATTENING = new Set(['ramp', 'gap', 'bridge', 'platform', 'mud', 'water', 'hill']);

export function createTerrainProfile(cfg: TerrainConfig, features: Feature[] = []): TerrainProfile {
  const seed = cfg.seed;
  const p1 = hashFloat(seed, 1) * Math.PI * 2;
  const p2 = hashFloat(seed, 2) * Math.PI * 2;
  const p3 = hashFloat(seed, 3) * Math.PI * 2;
  const p4 = hashFloat(seed, 4) * Math.PI * 2;

  const drops = features.filter((f) => f.type === 'drop');
  const flats = features.filter((f) => FLATTENING.has(f.type));

  /** The original rolling profile, plus permanent step-downs. */
  function base(x: number): number {
    const { hill, rough, bumps } = cfg;
    const macro = 0.88 + 0.28 * Math.sin(x * 0.0005 + p4);
    const dropLaunch = Math.sin(x * 0.0023 + p1) * 122 * hill * macro;
    const kicker = Math.sin(x * 0.0055 + p2) * 30 * hill;
    const whoopMod = Math.max(0, Math.sin(x * 0.0014 + p3));
    const whoop = Math.sin(x * 0.0125 + p1) * 12 * rough * whoopMod;
    let y = dropLaunch + kicker + whoop;

    const cell = Math.floor(x / BUMP_CELL);
    const chance = Math.min(0.85, 0.28 + bumps * 0.45);
    for (let k = cell - 1; k <= cell + 1; k++) {
      if (k < 1) continue;
      if (hashFloat(seed + 101, k) > chance) continue;
      const center = (k + 0.15 + 0.7 * hashFloat(seed + 202, k)) * BUMP_CELL;
      const width = 105 + 125 * hashFloat(seed + 303, k);
      const height = (28 + 36 * hashFloat(seed + 404, k)) * (0.65 + Math.min(bumps, 1.2) * 0.4);
      const u = (x - center) / width;
      y -= height * Math.exp(-u * u);
    }

    y = BASE_Y + y * smoothstep(0, 900, x); // flat, safe start zone
    for (const d of drops) if (x > d.a) y += d.h * smoothstep(d.a, d.b, x);
    return y;
  }

  /** Height change a flattening feature applies on top of its plateau. */
  function delta(f: Feature, x: number): number {
    switch (f.type) {
      case 'ramp':
        return x >= f.a && x < f.b ? -f.h * Math.pow((x - f.a) / (f.b - f.a), 1.4) : 0;
      case 'gap': {
        if (x <= f.a) return -f.h * Math.min(1, Math.max(0, (x - (f.a - 200)) / 200)); // take-off lip
        if (x < f.b) return CHASM_DEPTH;
        return f.n; // far side sits a little lower, which makes the landing forgiving
      }
      case 'bridge':
      case 'platform':
        return x > f.a && x < f.b ? CHASM_DEPTH : 0;
      case 'mud':
      case 'water':
        return x > f.a && x < f.b ? f.h * Math.pow(Math.sin((Math.PI * (x - f.a)) / (f.b - f.a)), 0.8) : 0;
      case 'hill': {
        // a mound on level ground, so its steepness never stacks with the rolling hills
        const u = (x - (f.a + f.b) / 2) / ((f.b - f.a) / 4);
        return -f.h * Math.exp(-u * u);
      }
      default:
        return 0;
    }
  }

  function heightAt(x: number): number {
    let y = base(x);
    for (const f of flats) {
      if (x <= f.x0 || x >= f.x1) continue;
      const w = smoothstep(f.x0, f.x0 + BLEND, x) * (1 - smoothstep(f.x1 - BLEND, f.x1, x));
      y = y + (base(f.a) + delta(f, x) - y) * w;
      break; // zones never overlap
    }
    return y;
  }

  // Sample cache: surfaceY is called many times per physics step.
  const OFF = 64;
  let cache = new Float64Array(2048).fill(NaN);
  function sample(i: number): number {
    const k = i + OFF;
    if (k < 0) return heightAt(i * SEGMENT);
    if (k >= cache.length) {
      const next = new Float64Array(Math.max(cache.length * 2, k + 1024)).fill(NaN);
      next.set(cache);
      cache = next;
    }
    let v = cache[k];
    if (v !== v) v = cache[k] = heightAt(i * SEGMENT);
    return v;
  }

  /** Ground height by linear interpolation of the SAME samples the physics uses. */
  function surfaceY(x: number): number {
    const i = Math.floor(x / SEGMENT);
    const t = (x - i * SEGMENT) / SEGMENT;
    const y0 = sample(i);
    return y0 + (sample(i + 1) - y0) * t;
  }

  return { heightAt, sampleAt: sample, surfaceY, config: cfg };
}
