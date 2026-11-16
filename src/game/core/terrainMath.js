// Pure terrain maths. The terrain is a deterministic function of x, so it can be
// streamed in chunks, queried for ground height (crash/grounded checks) and
// unit-tested without Phaser.
import { hashFloat } from './rng.js';

export const SEGMENT = 40; // horizontal spacing of terrain sample points (px)
export const BASE_Y = 400; // world y of flat ground
const BUMP_CELL = 750;

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * @param {{seed:number, hill:number, rough:number, bumps:number, endless:boolean}} cfg
 */
export function createTerrainProfile(cfg) {
  const seed = cfg.seed;
  const p1 = hashFloat(seed, 1) * Math.PI * 2;
  const p2 = hashFloat(seed, 2) * Math.PI * 2;
  const p3 = hashFloat(seed, 3) * Math.PI * 2;
  const p4 = hashFloat(seed, 4) * Math.PI * 2;

  function difficulty(x) {
    return cfg.endless ? Math.min(1, Math.max(0, x) / 50000) : 0;
  }

  function heightAt(x) {
    const d = difficulty(x);
    const hill = cfg.endless ? 0.80 + 0.35 * d : cfg.hill;
    const rough = cfg.endless ? 0.50 + 0.35 * d : cfg.rough;
    const bumps = cfg.endless ? 0.35 + 0.40 * d : cfg.bumps;

    // Macro rollercoaster curvature: modulates between giant soaring drops and rapid camelbacks
    const macro = 0.88 + 0.28 * Math.sin(x * 0.0005 + p4);

    // Primary rollercoaster wave: soaring peaks & deep plunge bowls
    const dropLaunch = Math.sin(x * 0.0023 + p1) * 122 * hill * macro;

    // Secondary steepening kicker / camelback crest:
    const kicker = Math.sin(x * 0.0055 + p2) * 30 * hill;

    // Tertiary camelback ripples / rhythm whoops:
    const whoopMod = Math.max(0, Math.sin(x * 0.0014 + p3));
    const whoop = Math.sin(x * 0.0125 + p1) * 12 * rough * whoopMod;

    let y = dropLaunch + kicker + whoop;

    // Boulder kickers & sharp moguls: can flip the car if hit at full speed!
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

    // Flat, safe start zone.
    return BASE_Y + y * smoothstep(0, 900, x);
  }

  /** Ground height by linear interpolation of the SAME samples the physics uses. */
  function surfaceY(x) {
    const i = Math.floor(x / SEGMENT);
    const t = (x - i * SEGMENT) / SEGMENT;
    const y0 = heightAt(i * SEGMENT);
    const y1 = heightAt((i + 1) * SEGMENT);
    return y0 + (y1 - y0) * t;
  }

  return { heightAt, surfaceY, config: cfg };
}
