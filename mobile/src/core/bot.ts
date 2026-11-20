// Automated test driver. It plays a level with the same two pedals a player
// has, and is used by the tests and scripts/bot.ts to prove that every level can
// be finished and every vehicle can be driven. It is not part of the game.
import { GameWorld } from './world';
import { wrapAngle } from './vehicle';

export interface BotState {
  /** Speed scale: 1 is the normal pace, lower is more careful. */
  pace: number;
  anchor: number;
  stuck: number;
  reverse: number;
}

export function newBot(pace = 1): BotState {
  return { pace, anchor: 0, stuck: 0, reverse: 0 };
}

export function botControls(w: GameWorld, bot: BotState): { gas: boolean; brake: boolean } {
  const v = w.vehicle;
  const x = v.x;
  const vx = v.chassis.velocity.x;
  const angle = wrapAngle(v.angle);
  const slopeAt = (px: number) => Math.atan2(w.groundY(px + 50) - w.groundY(px - 50), 100);
  const grounded = v.groundedWheels();

  if (grounded === 0) {
    // match the ground we are about to land on
    const target = Math.max(-0.45, Math.min(0.45, slopeAt(x + vx * 16)));
    const err = angle - target;
    return { gas: err > 0.1, brake: err < -0.1 };
  }

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
    if (f.type === 'ramp' && x < f.b) target = 8;
    else if (f.type === 'drop' && x < f.b) target = 4;
    else if ((f.type === 'mud' || f.type === 'water') && x < f.b) target = 12;
    else if (f.type === 'hill' && x < (f.a + f.b) / 2) target = 10;
    else if (f.type === 'hill') target = 6;
    else if (f.type === 'bridge' && x > f.a - 200 && x < f.b) target = 6;
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
    w.step(c.gas, c.brake);
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
