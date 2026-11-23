// Automated test driver. It plays a level with the same two pedals a player
// has, and is used by the tests and scripts/bot.ts to prove that every level can
// be finished and every vehicle can be driven. It is not part of the game.
import { GameWorld } from './world';
import { wrapAngle } from './vehicle';
import { STEEP_VALLEY, STUNT_KIND, stuntRamps } from './stuntshape';
import { GRAVITY_Y, PHYSICS_STEP } from './constants';

export interface BotState {
  /** Speed scale: 1 is the normal pace, lower is more careful. */
  pace: number;
  anchor: number;
  stuck: number;
  reverse: number;
  /** Try the flips each stunt ramp is built for (false: only land them safely). */
  flips: boolean;
  /** Safety factor on the time a flip needs before the driver commits to it (1 = bold). */
  margin: number;
  /** Use the brake on steep descents and after landings (false: hold the throttle). */
  brakes: boolean;
  // flight in progress
  inAir: boolean;
  angle0: number;
  planned: number;
  dir: 1 | -1;
  k: number;
}

export function newBot(pace = 1, flips = true, brakes = true, margin = 1.6): BotState {
  return { pace, anchor: 0, stuck: 0, reverse: 0, flips, margin, brakes, inAir: false, angle0: 0, planned: 0, dir: 1, k: 0 };
}

const G_EFF = GRAVITY_Y * 0.001 * PHYSICS_STEP * PHYSICS_STEP; // px per step per step
const TAU = Math.PI * 2;

/** Which flips a ramp is built for: [direction (1 = front), count]. */
function plannedFlip(w: GameWorld, x: number): [1 | -1, number] {
  for (const f of w.features) {
    if (f.type !== 'stunt' || x < f.a - 120 || x > f.b + 60) continue;
    const ramps = stuntRamps(f);
    const i = ramps.findIndex((r) => x < r.b + 60);
    const idx = i < 0 ? ramps.length - 1 : i;
    switch (f.n) {
      case STUNT_KIND.large: return [1, 1];
      case STUNT_KIND.steep: return [-1, 1];
      case STUNT_KIND.double: return idx === 0 ? [-1, 1] : [1, 1];
      case STUNT_KIND.combo: return idx === 0 ? [-1, 1] : [1, 1];
      case STUNT_KIND.mountain: return [1, 2];
      case STUNT_KIND.downhill: return [1, 1];
      default: return [1, 0];
    }
  }
  return [1, 0];
}

/** Steps until the car (as a falling point) reaches the ground, and the ground slope there. */
function predictLanding(w: GameWorld): { steps: number; slope: number } {
  const c = w.vehicle.chassis;
  let x = c.position.x;
  let y = c.position.y + 24;
  let vx = c.velocity.x;
  let vy = c.velocity.y;
  for (let i = 1; i < 260; i++) {
    vy += G_EFF;
    x += vx;
    y += vy;
    if (y >= w.groundY(x) && vy > 0) return { steps: i, slope: Math.atan2(w.groundY(x + 50) - w.groundY(x - 50), 100) };
  }
  return { steps: 260, slope: 0 };
}

function timeToRotate(delta: number, a: number, cap: number): number {
  const d = Math.abs(delta);
  const peak = Math.sqrt(a * d);
  return peak <= cap ? 2 * Math.sqrt(d / a) : d / cap + cap / a;
}

/** In the air: line up with the landing slope, turning through the ramp's flips if there is time. */
function airControls(w: GameWorld, bot: BotState): { gas: boolean; brake: boolean } {
  const v = w.vehicle;
  const tr = w.stunts;
  const angle = v.angle;
  if (!bot.inAir) {
    bot.inAir = true;
    bot.angle0 = angle;
    const [dir, n] = bot.flips ? plannedFlip(w, v.x) : ([1, 0] as [1 | -1, number]);
    bot.dir = dir;
    bot.planned = n;
    bot.k = n;
  }
  const land = predictLanding(w);
  const a = v.stats.airTorque;
  const cap = v.stats.maxAirSpin;
  const om = v.chassis.angularVelocity;
  const slopeTarget = Math.max(-0.5, Math.min(0.5, land.slope));
  const levelTarget = wrapAngle(slopeTarget - bot.angle0);
  const rNow = tr.rotation;
  // Commit to the flips at take-off if there is time for them with a margin; mid-air,
  // only give up when it has become clearly impossible (and never raise it again).
  const first = tr.airSteps <= 2;
  const margin = first ? bot.margin : 0.95;
  let k = bot.k;
  for (; k > 0; k--) {
    const target = bot.dir * TAU * k + levelTarget;
    if (timeToRotate(target - rNow, a, cap) * margin + (first ? 6 : 0) < land.steps) break;
  }
  bot.k = k;
  const target = k > 0 ? bot.dir * TAU * k + levelTarget : levelTarget;
  const err = target - rNow;
  const stopDist = (om * Math.abs(om)) / (2 * a);
  const e2 = err - stopDist;
  const dead = 0.04;
  if (Math.abs(e2) < dead) return { gas: false, brake: false };
  return e2 > 0 ? { gas: false, brake: true } : { gas: true, brake: false };
}

export interface BotControls {
  gas: boolean;
  brake: boolean;
  /** Flip buttons (in the air the driver uses these, never the pedals). */
  front?: boolean;
  back?: boolean;
}

/** The pedals on the ground, the two flip buttons in the air. */
export function botControls(w: GameWorld, bot: BotState): BotControls {
  const c = pedalControls(w, bot);
  if (w.vehicle.groundedWheels() === 0) return { gas: false, brake: false, front: c.brake, back: c.gas };
  return c;
}

function pedalControls(w: GameWorld, bot: BotState): { gas: boolean; brake: boolean } {
  const v = w.vehicle;
  const x = v.x;
  const vx = v.chassis.velocity.x;
  const angle = wrapAngle(v.angle);
  const slopeAt = (px: number) => Math.atan2(w.groundY(px + 50) - w.groundY(px - 50), 100);
  const grounded = v.groundedWheels();

  if (grounded === 0) {
    if (bot.flips || w.stunts.airSteps > 8) return airControls(w, bot);
    // match the ground we are about to land on
    const target = Math.max(-0.45, Math.min(0.45, slopeAt(x + vx * 16)));
    const err = angle - target;
    return { gas: err > 0.1, brake: err < -0.1 };
  }
  bot.inAir = false;

  // stuck against something: back off, then take a run at it
  if (bot.reverse > 0) {
    bot.reverse--;
    return { gas: false, brake: true };
  }
  if (Math.abs(x - bot.anchor) > 14) {
    bot.anchor = x;
    bot.stuck = 0;
  } else bot.stuck++;
  if (bot.stuck > 110) {
    bot.stuck = 0;
    bot.reverse = 55;
  }

  const slope = slopeAt(x);
  const rel = angle - slope; // negative = nose higher than the ground
  let target = 11;
  let jump = false;
  for (const f of w.features) {
    if (x < f.x0 - 200 || x > f.x1) continue;
    if (f.type === 'steep') {
      // brake all the way down, then build speed on the valley floor for the climb
      const d0 = f.a + f.n;
      if (x > f.a - 260 && x < d0 + 20) target = bot.brakes ? 6 : 99;
      else if (x >= d0 + 20 && x < f.b) target = 15;
    } else if (f.type === 'stunt') {
      const ramps = stuntRamps(f);
      const first = ramps[0];
      const last = ramps[ramps.length - 1];
      if (x < first.b) target = 15;
      else if (x > last.b - 1 && x < last.b + 700) target = bot.brakes ? 7 : 99; // slow after the landing
      else if (ramps.length > 1 && x > first.b && x < last.a - 380) target = bot.brakes && f.n === STUNT_KIND.combo ? 8 : 15; // pad between two ramps
      if (ramps.length > 1 && x >= last.a - 380 && x < last.b) target = 15;
    } else if (f.type === 'ramp' && x < f.b) target = 8;
    else if (f.type === 'drop' && x < f.b) target = 4;
    else if ((f.type === 'mud' || f.type === 'water') && x < f.b) target = 12;
    else if (f.type === 'hill' && x < (f.a + f.b) / 2) target = 10;
    else if (f.type === 'hill') target = 6;
    else if (f.type === 'bridge' && x > f.a - 200 && x < f.b) target = f.n === 1 ? 10 : 6; // a collapsing bridge must be crossed without lingering
    else if (f.type === 'boulder' && x > f.a - 260 && x < f.b + 60) target = 5; // nudge it, don't ram it
    else if (f.type === 'seesaw' && x > f.a - 300 && x < f.b + 40) target = 5; // roll over it, it is not a ramp
    else if (f.type === 'pendulum' && x > f.a - 300 && x < f.b + 120) target = 9; // don't linger under the ball
    else if (f.type === 'falling' && x < f.a - 120) {
      // wait for the rocks to land, then drive over them
      const airborne = w.props.some((p) => p.kind === 'fallrock' && p.fid === f.id && p.body.speed > 1.5);
      const started = w.props.some((p) => p.kind === 'fallrock' && p.fid === f.id);
      if (x > f.a - 740 && (airborne || !started)) target = x > f.a - 420 ? 0 : 3;
    }
    if (f.type === 'gap' && x < f.a - 520) target = 8; // arrive on the ground, not in the air
    else if (f.type === 'gap' && x < f.b) jump = true;
  }
  if (target > 4) target *= bot.pace;
  if (slope > 0.4) target = Math.min(target, 8); // steep descent
  if (slope < -0.3) target = Math.max(target, 11); // keep momentum uphill

  // on a ramp the throttle stays down all the way to the lip
  for (const f of w.features) {
    if (f.type !== 'stunt') continue;
    const ramps = stuntRamps(f);
    if (ramps.some((r) => x > r.a - 340 && x < r.b + 30)) return { gas: true, brake: false };
  }
  if (jump) return { gas: rel > -0.7, brake: false };
  if (rel < -0.32) return { gas: false, brake: rel < -0.8 && vx > 1 };
  if (target === 0) return { gas: false, brake: vx > 0.9 };
  return { gas: vx < target, brake: vx > target + 2.2 };
}

export interface BotRun {
  win: boolean;
  reason: string;
  steps: number;
  continues: number;
  progress: number;
  fuel: number;
  coins: number;
  totalCoins: number;
  stars: number;
  x: number;
}

/** Drive a whole level. Uses checkpoint restarts like a player would. */
export function runBot(w: GameWorld, pace = 1, maxSteps = 60 * 60 * 12): BotRun {
  let bot = newBot(pace);
  let continues = 0;
  let steps = 0;
  for (; steps < maxSteps; steps++) {
    const c = botControls(w, bot);
    w.step(c.gas, c.brake, c.front, c.back);
    if (w.state !== 'ending') continue;
    if (w.endReason === 'win') break;
    if (!w.continueFromCheckpoint()) break;
    continues++;
    bot = newBot(pace);
  }
  const r = w.result();
  return {
    win: r.win, reason: w.endReason ?? 'timeout', steps, continues, progress: r.progress,
    fuel: w.fuel, coins: r.coins, totalCoins: r.totalCoins, stars: r.stars, x: w.vehicle.x,
  };
}
