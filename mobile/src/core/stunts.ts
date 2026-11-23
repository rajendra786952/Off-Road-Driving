// Stunt rules: air time, real accumulated rotation, landing grade, damage, points
// and combos. Pure maths (no Matter, no React): the world feeds it one sample per
// physics step and it reports what happened when the car touches down.
//
// Nothing here moves the car. The rotation it counts comes from the physics body:
// the player's air control (core/vehicle.ts) plus whatever spin the ramp gave.
// Points are paid only after a landing that is clean enough (a crash pays nothing).
import { wrapAngle } from './vehicle';

export type Grade = 'perfect' | 'good' | 'rough' | 'crash';
/** Which way the car turned: a front flip rotates the nose down (clockwise on screen). */
export type FlipDir = 'front' | 'back';

export const STEP = 1 / 60;
const TAU = Math.PI * 2;

export const STUNT_POINTS = {
  /** Points for 1, 2 and 3 flips in one jump. More than three add `extraFlip` each. */
  flips: [0, 500, 1200, 2200],
  extraFlip: 1000,
  perfectLanding: 300,
  frontBackCombo: 1500,
  /** Rough landings still pay a little. */
  roughShare: 0.4,
  /** Pays when the car stays up for this long, without a flip. */
  airBonusFrom: 0.8,
};

/** Shortest jump that counts as a landing at all (steps). Short bumps are just driving. */
export const MIN_AIR_STEPS = 15;
/** Longest flight that still earns a perfect-landing bonus without a flip needs this much air (s). */
export const PERFECT_MIN_AIR = 0.45;
/** Steps after first touchdown before the landing is judged. */
export const SETTLE_STEPS = 14;
/** The combo chain survives this long between stunts (steps). */
export const CHAIN_STEPS = 60 * 6;
export const MAX_MULTIPLIER = 4;
/** Normal impact speed (px per step) a car shrugs off; above it the suspension takes damage. */
export const SOFT_IMPACT = 11;
export const WRECK_DAMAGE = 100;

export interface StuntSample {
  angle: number;
  /** Slope angle of the ground under the car (rad, positive = downhill to the right). */
  slope: number;
  vx: number;
  vy: number;
  rearGrounded: boolean;
  frontGrounded: boolean;
  stability: number;
  harsh: number;
}

export interface Landing {
  grade: Grade;
  flips: number;
  dir: FlipDir | null;
  airTime: number;
  impact: number;
  /** Angle between the car and the ground at the end of the settle window (rad). */
  rel: number;
  points: number;
  perfectBonus: number;
  comboBonus: number;
  multiplier: number;
  damage: number;
  text: string;
}

interface Pending {
  steps: number;
  worst: number;
  flips: number;
  dir: FlipDir | null;
  airTime: number;
  impact: number;
  rel: number;
}

export function flipPoints(n: number): number {
  if (n <= 0) return 0;
  if (n < STUNT_POINTS.flips.length) return STUNT_POINTS.flips[n];
  return STUNT_POINTS.flips[STUNT_POINTS.flips.length - 1] + (n - (STUNT_POINTS.flips.length - 1)) * STUNT_POINTS.extraFlip;
}

export function flipName(n: number, dir: FlipDir): string {
  const word = dir === 'front' ? 'FRONT FLIP' : 'BACK FLIP';
  return n === 1 ? word : n === 2 ? `DOUBLE ${word}` : n === 3 ? `TRIPLE ${word}` : `${n}x ${word}`;
}

/** The angle limits (rad between car and ground) for each landing grade. */
export function gradeLimits(stability: number): { perfect: number; good: number; rough: number } {
  return { perfect: 0.22 * stability, good: 0.5 * stability, rough: 0.9 * stability };
}

export class StuntTracker {
  // ---- run totals
  frontFlips = 0;
  backFlips = 0;
  points = 0;
  damage = 0;
  bestMultiplier = 1;
  landings = 0;
  perfects = 0;
  // ---- combo chain
  chain = 0;
  multiplier = 1;
  private chainLeft = 0;
  private chainDirs = 0;
  private comboPaid = false;
  // ---- live (this jump)
  airSteps = 0;
  rotation = 0;
  private lastAngle: number | null = null;
  private pending: Pending | null = null;
  /** The last landing (for the HUD indicator) and how many steps ago it was. */
  lastLanding: Landing | null = null;
  lastLandingAge = 1e9;

  get airTime(): number {
    return this.airSteps * STEP;
  }

  /** Whole flips completed so far in this jump, for the live counter. */
  get liveFlips(): number {
    return Math.floor(Math.abs(this.rotation) / TAU + 0.35);
  }

  get liveDir(): FlipDir | null {
    return this.rotation === 0 ? null : this.rotation > 0 ? 'front' : 'back';
  }

  /** Fraction (0..1) of the way round the next flip. */
  get liveProgress(): number {
    const t = Math.abs(this.rotation) / TAU;
    return t - Math.floor(t);
  }

  /** The car was put back on the road (checkpoint): drop the jump in progress. */
  reset(): void {
    this.airSteps = 0;
    this.rotation = 0;
    this.lastAngle = null;
    this.pending = null;
    this.chain = 0;
    this.multiplier = 1;
    this.chainLeft = 0;
    this.chainDirs = 0;
    this.comboPaid = false;
  }

  repair(to = 0): void {
    this.damage = Math.min(this.damage, to);
  }

  update(s: StuntSample): Landing | null {
    this.lastLandingAge++;
    if (this.chainLeft > 0 && --this.chainLeft === 0) this.breakChain();

    const airborne = !s.rearGrounded && !s.frontGrounded;
    if (airborne) {
      if (this.pending) {
        // bounced back into the air before settling: judge what we have
        if (this.pending.steps >= 4) return this.finish(this.pending, s);
        return null;
      }
      this.airSteps++;
      if (this.lastAngle !== null) this.rotation += wrapAngle(s.angle - this.lastAngle);
      this.lastAngle = s.angle;
      return null;
    }

    if (!this.pending && this.airSteps >= MIN_AIR_STEPS) {
      const n = Math.floor(Math.abs(this.rotation) / TAU + 0.35);
      // velocity component into the ground (normal = (-sin, cos) for y pointing down)
      const impact = -s.vx * Math.sin(s.slope) + s.vy * Math.cos(s.slope);
      this.pending = {
        steps: 0,
        worst: 0,
        flips: n,
        dir: n > 0 ? (this.rotation > 0 ? 'front' : 'back') : null,
        airTime: this.airSteps * STEP,
        impact: Math.max(0, impact),
        rel: 0,
      };
    }
    this.airSteps = 0;
    this.rotation = 0;
    this.lastAngle = null;

    const p = this.pending;
    if (!p) return null;
    p.steps++;
    p.rel = wrapAngle(s.angle - s.slope);
    p.worst = Math.max(p.worst, Math.abs(p.rel));
    if (p.steps >= SETTLE_STEPS) return this.finish(p, s);
    return null;
  }

  private breakChain(): void {
    this.chain = 0;
    this.multiplier = 1;
    this.chainDirs = 0;
    this.comboPaid = false;
  }

  private finish(p: Pending, s: StuntSample): Landing {
    this.pending = null;
    const lim = gradeLimits(s.stability);
    // judged on where the car ended up, with some weight on how badly it first touched
    const eff = Math.max(Math.abs(p.rel), 0.6 * p.worst);
    let grade: Grade = eff < lim.perfect && p.impact < SOFT_IMPACT + 3 ? 'perfect' : eff < lim.good ? 'good' : eff < lim.rough ? 'rough' : 'crash';

    const impactDamage = Math.max(0, p.impact - SOFT_IMPACT) * 3.5 * s.harsh;
    const gradeDamage = grade === 'rough' ? 12 * s.harsh : grade === 'crash' ? 45 * s.harsh : 0;
    const damage = Math.round(impactDamage + gradeDamage);
    this.damage = Math.min(WRECK_DAMAGE, this.damage + damage);
    this.landings++;

    let points = 0;
    let perfectBonus = 0;
    let comboBonus = 0;
    const parts: string[] = [];
    const base = flipPoints(p.flips);

    if (grade === 'crash') {
      this.breakChain();
    } else if (grade === 'rough') {
      points = Math.round(base * STUNT_POINTS.roughShare);
      this.breakChain();
      if (points) parts.push(`${flipName(p.flips, p.dir!)} (rough)`);
    } else {
      if (p.flips > 0 && p.dir) {
        this.chain++;
        this.chainLeft = CHAIN_STEPS;
        this.multiplier = Math.min(MAX_MULTIPLIER, 1 + 0.5 * (this.chain - 1));
        this.bestMultiplier = Math.max(this.bestMultiplier, this.multiplier);
        if (p.dir === 'front') this.frontFlips += p.flips;
        else this.backFlips += p.flips;
        this.chainDirs |= p.dir === 'front' ? 1 : 2;
        points = Math.round(base * this.multiplier);
        parts.push(flipName(p.flips, p.dir));
        if (this.chainDirs === 3 && !this.comboPaid) {
          this.comboPaid = true;
          comboBonus = STUNT_POINTS.frontBackCombo;
        }
      } else if (p.airTime >= STUNT_POINTS.airBonusFrom) {
        points = Math.min(150, Math.floor(p.airTime * 80));
        parts.push(`AIR TIME ${p.airTime.toFixed(1)}s`);
      }
      if (grade === 'perfect' && (p.flips > 0 || p.airTime >= PERFECT_MIN_AIR)) {
        perfectBonus = STUNT_POINTS.perfectLanding;
      } else if (grade === 'perfect') {
        grade = 'good'; // a hop is not worth a perfect-landing bonus
      }
    }
    const total = points + perfectBonus + comboBonus;
    this.points += total;
    if (perfectBonus) this.perfects++;
    if (comboBonus) parts.push('FRONT + BACK COMBO');
    if (perfectBonus) parts.push('PERFECT LANDING');

    const landing: Landing = {
      grade, flips: p.flips, dir: p.dir, airTime: p.airTime, impact: p.impact, rel: p.rel,
      points, perfectBonus, comboBonus, multiplier: this.multiplier, damage, text: parts.join(' + '),
    };
    this.lastLanding = landing;
    this.lastLandingAge = 0;
    return landing;
  }
}
