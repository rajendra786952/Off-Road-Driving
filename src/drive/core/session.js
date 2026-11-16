// One run of one track: vehicle + rules (checkpoints, fuel, damage, recovery,
// caches, finish). Pure logic - used by the real game AND the headless bot tests,
// so the rules that are tested are the rules that ship.
import { Vehicle4x4 } from './physics.js';
import { WEATHER } from './surfaces.js';

export const PHYS_DT = 1 / 120;
export const RECOVER_PENALTY = 20;
export const TOW_PENALTY = 60;

export class DriveSession {
  constructor(track, params, opts = {}) {
    this.track = track;
    this.params = params;
    this.weather = WEATHER[opts.weather || track.meta.weather] || WEATHER.clear;
    this.vehicle = new Vehicle4x4(params, track, this.weather);
    this.time = 0;
    this.penalty = 0;
    this.acc = 0;
    this.cpNext = 0;
    this.cpS = track.startS;
    this.safeS = track.startS;
    this.mainIdx = 0;
    this.s = 0;
    this.d = 0;
    this.maxS = 0;
    this.fuel = params.fuelCap;
    this.damage = 0;
    this.recoveries = 0;
    this.finished = false;
    this.caches = track.caches.map((c) => ({ ...c, found: false }));
    this.cacheCoins = 0;
    this.events = [];
    this.distance = 0;
    this.airTime = 0;
    this.stuckTime = 0;
    this.hitCool = 0;
    this.offRoute = false;
    this._sd = { s: 0, d: 0 };
    this.spawn(track.startS);
  }

  spawn(s) {
    const pose = this.track.roadPose(s);
    this.vehicle.reset(pose.x, pose.y, pose.z, pose.heading);
    this.mainIdx = pose.i;
    this.vehicle.winchAnchor = null;
  }

  /** Put the truck back on firm road behind where it got into trouble. */
  recover() {
    if (this.finished) return;
    this.recoveries++;
    this.penalty += RECOVER_PENALTY;
    this.spawn(Math.max(this.cpS, this.safeS - 6));
    this.events.push({ type: 'recover' });
  }

  /** Restart from the last checkpoint (also used when out of fuel). */
  toCheckpoint(tow = false) {
    if (this.finished) return;
    this.recoveries++;
    this.penalty += tow ? TOW_PENALTY : RECOVER_PENALTY;
    if (tow) this.fuel = Math.max(this.fuel, this.params.fuelCap * 0.3);
    this.safeS = this.cpS;
    this.spawn(this.cpS);
    this.events.push({ type: 'recover', tow });
  }

  get totalTime() { return this.time + this.penalty; }
  get remaining() { return Math.max(0, this.track.finishS - this.s); }
  get progress() { return Math.min(1, Math.max(0, this.s / this.track.finishS)); }

  /** Advance by frame time dt with the given driver input. */
  update(dt, input) {
    if (this.finished) { input = { gas: 0, brake: 1, steer: 0 }; }
    this.acc += Math.min(dt, 0.1);
    let steps = 0;
    const veh = this.vehicle;
    input.noFuel = this.fuel <= 0;
    if (this.damage >= 100) input = { ...input, gas: (input.gas || 0) * 0.55 };
    while (this.acc >= PHYS_DT && steps < 6) {
      veh.step(PHYS_DT, input);
      this.acc -= PHYS_DT;
      steps++;
      this.fuel = Math.max(0, this.fuel - veh.fuelUse * 52);
      if (veh.impact > 3.2) {
        const dmg = (veh.impact - 3.2) * 3.5;
        this.damage = Math.min(100, this.damage + dmg);
        this.events.push({ type: 'impact', v: veh.impact, dmg });
      } else if (veh.impact > 1.3) this.events.push({ type: 'scrape', v: veh.impact });
      this.hitCool -= PHYS_DT;
      if (veh.wheelHit > 1.2 && this.hitCool <= 0) {
        this.hitCool = 0.35;
        this.events.push({ type: 'thump', v: veh.wheelHit });
        if (veh.wheelHit > 2.5) this.damage = Math.min(100, this.damage + (veh.wheelHit - 2.5) * 0.8);
      }
    }
    if (steps === 6) this.acc = 0;
    const st = steps * PHYS_DT;
    if (!this.finished) this.time += st;
    if (veh.broken) { veh.broken = false; this.recover(); return; }

    const tr = this.track;
    const p = veh.p;
    this.mainIdx = tr.locateMain(p[0], p[2], this.mainIdx);
    tr.mainSD(this.mainIdx, p[0], p[2], this._sd);
    this.s = this._sd.s; this.d = this._sd.d;
    this.distance += Math.abs(veh.speed) * st;
    const hw = tr.HW[this.mainIdx];
    this.offRoute = Math.abs(this.d) > hw + 25;

    const grounded = veh.wheels.reduce((n, w) => n + (w.grounded ? 1 : 0), 0);
    this.airTime = grounded === 0 ? this.airTime + st : 0;
    const firm = veh.wheels.every((w) => w.surface.sink < 0.05 && w.water < 0.1);
    if (grounded >= 3 && veh.upY > 0.8 && Math.abs(this.d) < hw && firm && this.s > this.safeS && this.s <= this.maxS + 30) this.safeS = this.s;
    if (Math.abs(this.d) < hw + 12 && this.s > this.maxS && this.s < this.maxS + 40) this.maxS = this.s;

    // checkpoints must be taken in order, on the road
    const cp = tr.checkpoints[this.cpNext];
    if (cp && this.s >= cp.s && this.s < cp.s + 30 && Math.abs(this.d) < hw + 6) {
      this.cpNext++;
      this.cpS = cp.s;
      this.safeS = Math.max(this.safeS, cp.s);
      const before = this.fuel;
      this.fuel = Math.min(this.params.fuelCap, this.fuel + this.params.fuelCap * 0.15);
      this.damage = Math.max(0, this.damage - 20);
      this.events.push({ type: 'checkpoint', index: this.cpNext, total: tr.checkpoints.length, name: cp.name, fuel: this.fuel - before });
    }
    for (let ci = 0; ci < this.caches.length; ci++) {
      const c = this.caches[ci];
      if (!c.found && Math.hypot(p[0] - c.x, p[2] - c.z) < 5) {
        c.found = true;
        this.cacheCoins += c.reward;
        this.events.push({ type: 'cache', index: ci, name: c.name, reward: c.reward });
      }
    }
    if (!this.finished && this.cpNext >= tr.checkpoints.length && this.s >= tr.finishS && Math.abs(this.d) < hw + 6) {
      this.finished = true;
      this.events.push({ type: 'finish' });
    }

    // winch: keep a target anchor while idle, hold it while pulling
    // (also pick one up if the button is already held, and move on once an anchor is reached)
    if (this.params.winch) {
      const a = veh.winchAnchor;
      const spent = a && Math.hypot(a.x - p[0], a.z - p[2]) < 4.5;
      if (!input.winch || !a || spent) {
        const R = veh.R;
        veh.winchAnchor = tr.findAnchor(p[0] + R[2] * 1.8, p[2] + R[8] * 1.8, R[2], R[8]);
      }
    }

    // stuck detector (HUD hint + bot)
    if (Math.abs(veh.speed) < 0.35 && (input.gas > 0.3 || input.brake > 0.3) && !this.finished) this.stuckTime += st;
    else this.stuckTime = Math.max(0, this.stuckTime - st * 2);
  }

  /** Drain queued events. */
  takeEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}

/** Score a finished run against the track's par. */
export function scoreRun(session, par) {
  const t = session.totalTime;
  const medal = t <= par.gold ? 3 : t <= par.silver ? 2 : t <= par.bronze ? 1 : 0;
  const objectives = [
    { id: 'finish', label: 'Reach the finish', done: true },
    { id: 'time', label: `Finish under ${fmtTime(par.silver)}`, done: t <= par.silver },
    { id: 'clean', label: 'No recoveries, damage under 40%', done: session.recoveries === 0 && session.damage < 40 }
  ];
  if (session.caches.length) {
    objectives.push({ id: 'caches', label: `Find every supply cache (${session.caches.length})`, done: session.caches.every((c) => c.found) });
  }
  return { time: t, medal, objectives, stars: objectives.filter((o) => o.done).length };
}

export function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
