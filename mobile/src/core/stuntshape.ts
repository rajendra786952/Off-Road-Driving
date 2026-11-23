// Geometry of the stunt ramps and steep descents. Pure functions of a feature, so the
// terrain, the generator, the renderer and the test driver all agree on the shapes.
// y grows downwards: a negative delta lifts the road.

export interface ShapeFeature {
  a: number;
  b: number;
  h: number;
  n: number;
  seed: number;
  /** How far the road falls away after the last lip (stunts); the kind's default if absent. */
  d?: number;
}

export const STUNT_KIND = {
  large: 1, // big ramp: front flips
  steep: 2, // short steep ramp: back flips
  double: 3, // two ramps in a row
  downhill: 4, // ramp onto a downhill landing
  mountain: 5, // long climb, then a big jump
  uneven: 6, // ripples on the ramp and the landing
  combo: 7, // back-flip ramp, a pad to brake on, then a front-flip ramp
} as const;

export const STUNT_LABEL: Record<number, string> = {
  1: 'Front-flip ramps',
  2: 'Back-flip ramps',
  3: 'Double ramps',
  4: 'Downhill jumps',
  5: 'Mountain jumps',
  6: 'Uneven ramps',
  7: 'Stunt combos',
};

export interface Ramp {
  a: number;
  b: number;
  h: number;
  /** Curve exponent: the bigger it is, the steeper the lip. */
  e: number;
  /** How far below the zone's road the ramp starts (a lower pad between two ramps). */
  y: number;
}

/** A pad between two ramps sits this far below the first one: the first jump lands in a drop. */
export function padDrop(f: ShapeFeature): number {
  return 0.85 * f.h;
}

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (t: number) => {
  t = clamp01(t);
  return t * t * (3 - 2 * t);
};

/** Distance of road a stunt keeps after its last ramp (the landing zone). */
export function landingLength(kind: number): number {
  return kind === 4 ? 760 : kind === 6 ? 640 : kind === 5 ? 520 : 560;
}

/** Run-up before the first ramp, on flat road. */
export function runUpLength(kind: number): number {
  return kind === 5 ? 1000 : 560;
}

export function stuntRamps(f: ShapeFeature): Ramp[] {
  switch (f.n) {
    case STUNT_KIND.large:
      return [{ a: f.a, b: f.b, h: f.h, e: 2.0, y: 0 }];
    case STUNT_KIND.steep:
      return [{ a: f.a, b: f.b, h: f.h, e: 2.0, y: 0 }];
    case STUNT_KIND.double:
      return [
        { a: f.a, b: f.a + 300, h: f.h * 0.95, e: 2.0, y: 0 },
        { a: f.b - 330, b: f.b, h: f.h, e: 2.0, y: padDrop(f) },
      ];
    case STUNT_KIND.downhill:
      return [{ a: f.a, b: f.b, h: f.h, e: 1.8, y: 0 }];
    case STUNT_KIND.mountain:
      return [{ a: f.a, b: f.b, h: f.h, e: 1.9, y: 0 }];
    case STUNT_KIND.uneven:
      return [{ a: f.a, b: f.b, h: f.h, e: 1.8, y: 0 }];
    case STUNT_KIND.combo:
      return [
        { a: f.a, b: f.a + 320, h: f.h * 0.9, e: 2.0, y: 0 },
        { a: f.b - 380, b: f.b, h: f.h, e: 2.0, y: padDrop(f) },
      ];
    default:
      return [{ a: f.a, b: f.b, h: f.h, e: 1.8, y: 0 }];
  }
}

export function mountainClimb(f: ShapeFeature): number {
  return 90 + 0.6 * f.h;
}

/** How far the road falls away after the last lip, and over what distance. */
export function landingDrop(f: ShapeFeature): { by: number; len: number } {
  if (f.d !== undefined) return { by: f.d, len: Math.max(300, f.d * (f.n === STUNT_KIND.mountain ? 1.1 : f.n === STUNT_KIND.downhill ? 2.1 : 2.4)) };
  switch (f.n) {
    case STUNT_KIND.large: return { by: 0.6 * f.h, len: 420 };
    case STUNT_KIND.steep: return { by: 0.35 * f.h, len: 300 };
    case STUNT_KIND.double: return { by: 0.5 * f.h, len: 420 };
    case STUNT_KIND.downhill: return { by: 1.0 * f.h + 80, len: 620 };
    case STUNT_KIND.mountain: return { by: 130, len: 360 };
    case STUNT_KIND.uneven: return { by: 0.25 * f.h, len: 360 };
    default: return { by: 0.5 * f.h, len: 420 };
  }
}

/** Height change (relative to the flat road through the zone) of a stunt feature. */
export function stuntDelta(f: ShapeFeature, x: number): number {
  let d = 0;
  const ramps = stuntRamps(f);
  ramps.forEach((r, i) => {
    if (x < r.a) return;
    if (x >= r.b) {
      d = ramps[i + 1] ? ramps[i + 1].y : r.y; // the pad after a lip is the next ramp's start level
      return;
    }
    d = r.y - r.h * Math.pow((x - r.a) / (r.b - r.a), r.e);
    if (f.n === STUNT_KIND.uneven) d += 7 * Math.sin(((x - r.a) / 46) * Math.PI) * clamp01((x - r.a) / 90);
  });
  if (f.n === STUNT_KIND.mountain) {
    // a long climb up to the ramp: the jump starts high above the road beyond it
    d -= mountainClimb(f) * smooth((x - (f.a - 1000)) / 1000) * (x < f.b ? 1 : 0);
  }
  return d;
}

/**
 * Extra height of the ground after a stunt's last lip: the road falls away for good
 * (like a cliff drop), which buys the air time for the flip. Added to the base terrain.
 */
export function landingDropAt(f: ShapeFeature, x: number): number {
  const drop = landingDrop(f);
  return drop.by > 0 ? drop.by * smooth((x - f.b - 20) / drop.len) : 0;
}

/** Bumps on the landing of an uneven ramp: balance matters. */
export function landingRipple(f: ShapeFeature, x: number): number {
  if (f.n !== STUNT_KIND.uneven || x < f.b || x > f.b + 560) return 0;
  const u = (x - f.b) / 560;
  return 15 * Math.sin(((x - f.b) / 85) * Math.PI) * clamp01((x - f.b) / 60) * (1 - smooth(u * 1.2 - 0.2));
}

// ------------------------------------------------------------------ steep descent

/** Flat valley between the descent and the climb out of it. */
export const STEEP_VALLEY = 420;

export interface SteepParts {
  /** Start and end of the descent. */
  a: number;
  descentEnd: number;
  /** Flat valley floor. */
  valleyEnd: number;
  /** Where the climb out ends. */
  b: number;
  depth: number;
}

export function steepParts(f: ShapeFeature): SteepParts {
  return { a: f.a, descentEnd: f.a + f.n, valleyEnd: f.a + f.n + STEEP_VALLEY, b: f.b, depth: f.h };
}

/** Drop in the road: a long steep descent, a flat valley, then a climb back out. */
export function steepDelta(f: ShapeFeature, x: number): number {
  const p = steepParts(f);
  if (x <= p.a) return 0;
  if (x < p.descentEnd) return p.depth * smooth((x - p.a) / (p.descentEnd - p.a));
  if (x < p.valleyEnd) return p.depth;
  if (x < p.b) {
    const u = (x - p.valleyEnd) / (p.b - p.valleyEnd);
    // mostly a straight, steep climb, eased at both ends
    return p.depth * (1 - (0.7 * u + 0.3 * smooth(u)));
  }
  return 0;
}
