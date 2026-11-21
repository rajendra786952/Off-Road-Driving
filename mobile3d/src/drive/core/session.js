// One run of one track: vehicle + rules (checkpoints, fuel, damage, heat, recovery,
// caches, hidden relics, changing weather and time of day, finish).
// Pure logic - used by the real game AND the headless bot tests, so the rules
// that are tested are the rules that ship.
import { Vehicle4x4 } from './physics.js';
import { WEATHER } from './surfaces.js';
import { generateObstacles, TIER_FOR_DIFFICULTY } from './obstacles.js';
import { Hazards } from './hazards.js';

export const PHYS_DT = 1 / 120;
export const RECOVER_PENALTY = 20;
export const TOW_PENALTY = 60;

/** Difficulty levels: same tracks, different consequences. */
export const DIFFICULTY = {
  casual:   { id: 'casual',   name: 'Casual',   desc: 'Half damage, lighter fuel use, 10 s recoveries. Rewards x0.8.', damage: 0.5, fuel: 0.7, recover: 10, reward: 0.8 },
  standard: { id: 'standard', name: 'Standard', desc: 'The intended experience.',                                    damage: 1.0, fuel: 1.0, recover: 20, reward: 1.0 },
  hardcore: { id: 'hardcore', name: 'Hardcore', desc: 'Heavy damage, thirsty engine, 40 s recoveries, no checkpoint repairs. Rewards x1.5.', damage: 1.7, fuel: 1.3, recover: 40, reward: 1.5 }
};
DIFFICULTY.hardcore.noRepair = true;

const HOURS = { morning: 8, day: 13, dusk: 18.2, night: 23, overcast: 13 };
const W_KEYS = ['grip', 'wet', 'fog', 'rain', 'snow', 'wind', 'dust', 'ash'];

export class DriveSession {
  /**
   * opts: { difficulty, weather (override), resume: snapshot() of an earlier run,
   *         obstacles: true (generated obstacles at this difficulty's tier) | obstacle config (see core/obstacles.js) }
   */
  constructor(track, params, opts = {}) {
    this.track = track;
    this.params = params;
    this.diff = DIFFICULTY[opts.difficulty] || DIFFICULTY.standard;
    const m = track.meta;
    // weather plan: [[progress 0..1, weatherId], ...]
    this.plan = opts.weather ? [[0, opts.weather]] : (m.weatherPlan || [[0, m.weather || 'clear']]);
    this.weather = { name: '', id: '', grip: 1, wet: 0, fog: 1, rain: 0, snow: 0, wind: 0, dust: 0, ash: 0 };
    // time of day: fixed, or sliding from hours[0] to hours[1] over the run
    this.hours = m.hours || [HOURS[m.time] ?? 13, HOURS[m.time] ?? 13];
    this.hour = this.hours[0];
    this._applyWeather(0);
    // the generated obstacle layer for this run (the compiled track is shared, so always reset it)
    const oc = opts.obstacles === true ? { difficulty: TIER_FOR_DIFFICULTY[this.diff.id] } : opts.obstacles || null;
    track.setLayer(opts.layer || (oc ? generateObstacles(track, oc) : null));   // opts.layer: a ready-made layer (tests, tools)
    this.hazards = null;
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
    this.heat = 0.35;          // engine temperature 0..1 (only climbs in hot regions)
    this.overheated = false;
    this.recoveries = 0;
    this.finished = false;
    this.caches = track.caches.map((c) => ({ ...c, found: false }));
    this.relics = (track.relics || []).map((c) => ({ ...c, found: false }));
    this.cacheCoins = 0;
    this.events = [];
    this.distance = 0;
    this.airTime = 0;
    this.stuckTime = 0;
    this.hitCool = 0;
    this.burnCool = 0;
    this.offRoute = false;
    this._sd = { s: 0, d: 0 };
    // wear and tear beyond the damage bar
    this.flats = [false, false, false, false];   // punctured tyres (fixed at checkpoints, except on Hardcore)
    this.brakeHeat = 0;                          // 0..1.2: hot brakes fade
    this.pull = (track.seed % 2 ? 1 : -1);       // which way bent steering pulls once damage passes 50%
    this._pz = (track.seed * 2654435761) >>> 0;  // deterministic dice for punctures
    // ghost: progress + lateral offset every half second (saved with a new best time)
    this.trace = { s: [], d: [] };
    this.traceT = 0;
    if (track.layer) this.hazards = new Hazards(this);
    this.spawn(track.startS);
    if (opts.resume) this.restore(opts.resume);
  }

  /** Blend the weather plan at progress p into this.weather (the physics holds the same object). */
  _applyWeather(p) {
    const plan = this.plan;
    let k = 0;
    while (k < plan.length - 1 && plan[k + 1][0] <= p) k++;
    const cur = WEATHER[plan[k][1]] || WEATHER.clear;
    const prev = k > 0 ? WEATHER[plan[k - 1][1]] || cur : cur;
    const t = k > 0 ? Math.min(1, (p - plan[k][0]) / 0.05) : 1;
    const w = this.weather;
    for (const key of W_KEYS) w[key] = (prev[key] || 0) + ((cur[key] || 0) - (prev[key] || 0)) * t;
    if (w.id !== plan[k][1]) {
      const first = w.id === '';
      w.id = plan[k][1]; w.name = cur.name;
      if (!first && this.events) this.events.push({ type: 'weather', name: cur.name });
    }
    if (this.hazards) this.hazards.applyWeather(w);      // a sudden squall on top of the plan
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
    this.penalty += this.diff.recover;
    // inside a generated challenge the truck goes back to its entrance (always clear ground)
    const sp = this.hazards ? this.hazards.safePoint(this.s) : Infinity;
    if (this.hazards) this.hazards.onRecover();
    this.spawn(Math.max(this.cpS, Math.min(this.safeS - 6, sp)));
    this.events.push({ type: 'recover' });
  }

  /** Restart from the last checkpoint (also used when out of fuel). */
  toCheckpoint(tow = false) {
    if (this.finished) return;
    this.recoveries++;
    this.penalty += tow ? TOW_PENALTY : this.diff.recover;
    if (tow) this.fuel = Math.max(this.fuel, this.params.fuelCap * 0.3);
    if (this.hazards) this.hazards.onRecover();
    this.safeS = this.cpS;
    this.spawn(this.cpS);
    this.events.push({ type: 'recover', tow });
  }

  /** Everything needed to pick the run up again from the last checkpoint (stored in the save file). */
  snapshot() {
    return {
      v: 1, cpNext: this.cpNext, cpS: this.cpS, time: this.time, penalty: this.penalty, fuel: this.fuel, damage: this.damage,
      heat: this.heat, recoveries: this.recoveries, caches: this.caches.map((c) => c.found), relics: this.relics.map((c) => c.found),
      cacheCoins: this.cacheCoins, distance: this.distance, diff: this.diff.id,
      flats: [...this.flats], trace: { s: [...this.trace.s], d: [...this.trace.d] },
      hz: this.hazards ? this.hazards.snapshot() : null
    };
  }

  restore(o) {
    if (!o || o.v !== 1 || !(o.cpNext >= 0) || o.cpNext > this.track.checkpoints.length) return false;
    this.cpNext = o.cpNext;
    this.cpS = o.cpNext > 0 ? this.track.checkpoints[o.cpNext - 1].s : this.track.startS;
    this.safeS = this.cpS; this.maxS = this.cpS;
    this.time = +o.time || 0; this.penalty = +o.penalty || 0;
    this.fuel = Math.min(this.params.fuelCap, Math.max(0, +o.fuel || 0));
    this.damage = Math.min(100, Math.max(0, +o.damage || 0));
    this.heat = Math.min(1, Math.max(0.3, +o.heat || 0.35));
    this.recoveries = o.recoveries | 0;
    (o.caches || []).forEach((f, i) => { if (this.caches[i]) this.caches[i].found = !!f; });
    (o.relics || []).forEach((f, i) => { if (this.relics[i]) this.relics[i].found = !!f; });
    this.cacheCoins = +o.cacheCoins || 0; this.distance = +o.distance || 0;
    this.flats = [0, 1, 2, 3].map((i) => !!(o.flats && o.flats[i]));
    if (o.trace && Array.isArray(o.trace.s)) this.trace = { s: [...o.trace.s], d: [...(o.trace.d || [])] };
    this.spawn(this.cpS);
    this.flats.forEach((f, i) => { this.vehicle.wheels[i].flat = f; });
    if (this.hazards) this.hazards.restore(o.hz, this.cpS);
    this.resumed = true;
    return true;
  }

  get totalTime() { return this.time + this.penalty; }
  get remaining() { return Math.max(0, this.track.finishS - this.s); }
  get progress() { return Math.min(1, Math.max(0, this.s / this.track.finishS)); }

  /** Advance by frame time dt with the given driver input. */
  update(dt, input) {
    // after the finish: brake to a stop, then hold on the handbrake (the brake pedal reverses once stopped)
    if (this.finished) { input = { gas: 0, brake: this.vehicle.speed > 0.6 ? 1 : 0, steer: 0, hand: true }; }
    this.acc += Math.min(dt, 0.1);
    let steps = 0;
    const veh = this.vehicle;
    const diff = this.diff;
    input.noFuel = this.fuel <= 0;
    let limp = 1;
    if (this.damage >= 100) limp = 0.55;
    if (this.overheated) limp = Math.min(limp, 0.35);
    if (limp < 1) input = { ...input, gas: (input.gas || 0) * limp };
    // bent steering pulls to one side once the truck is badly damaged
    if (this.damage > 50 && !this.finished) input = { ...input, steer: Math.max(-1, Math.min(1, (input.steer || 0) + this.pull * 0.16 * (this.damage - 50) / 50)) };
    // hot brakes fade (the brake pedal only brakes while rolling forward; stopped, it selects reverse)
    const braking = veh.speed > 0.6 && (input.brake || 0) > 0.05;
    if (braking && this.brakeHeat > 0.75) input = { ...input, brake: input.brake * (1 - 0.55 * Math.min(1, (this.brakeHeat - 0.75) / 0.25)) };
    while (this.acc >= PHYS_DT && steps < 6) {
      veh.step(PHYS_DT, input);
      if (this.hazards) this.hazards.step(PHYS_DT);
      this.acc -= PHYS_DT;
      steps++;
      this.fuel = Math.max(0, this.fuel - veh.fuelUse * 52 * diff.fuel);
      if (veh.impact > 3.2) {
        const dmg = (veh.impact - 3.2) * 3.5 * diff.damage;
        this.damage = Math.min(100, this.damage + dmg);
        this.events.push({ type: 'impact', v: veh.impact, dmg });
        if (veh.impact > 6) this._puncture();
      } else if (veh.impact > 1.3) this.events.push({ type: 'scrape', v: veh.impact });
      this.hitCool -= PHYS_DT;
      if (veh.wheelHit > 1.2 && this.hitCool <= 0) {
        this.hitCool = 0.35;
        this.events.push({ type: 'thump', v: veh.wheelHit });
        if (veh.wheelHit > 2.5) this.damage = Math.min(100, this.damage + (veh.wheelHit - 2.5) * 0.8 * diff.damage);
        if (veh.wheelHit > 3.6) this._puncture();
      }
    }
    if (steps === 6) this.acc = 0;
    const st = steps * PHYS_DT;
    if (!this.finished) this.time += st;
    // brakes heat with hard use at speed and cool in the airflow
    this.brakeHeat = Math.min(1.2, Math.max(0, this.brakeHeat + ((braking ? (input.brake || 0) * Math.abs(veh.speed) * 0.035 : 0) - 0.03) * st));
    if (veh.broken) { veh.broken = false; this.recover(); return; }

    const tr = this.track;
    const p = veh.p;
    this.mainIdx = tr.locateMain(p[0], p[2], this.mainIdx);
    tr.mainSD(this.mainIdx, p[0], p[2], this._sd);
    this.s = this._sd.s; this.d = this._sd.d;
    this.distance += Math.abs(veh.speed) * st;
    this.traceT += st;
    if (this.traceT >= 0.5 && !this.finished && this.trace.s.length < 6000) { this.traceT -= 0.5; this.trace.s.push(Math.round(this.s)); this.trace.d.push(Math.round(this.d * 10)); }
    const hw = tr.HW[this.mainIdx];
    this.offRoute = Math.abs(this.d) > hw + 25;
    if (this.hazards) this.hazards.update(st);

    // weather and daylight follow progress along the route
    const prog = Math.min(1, Math.max(0, this.maxS / tr.finishS));
    this._applyWeather(prog);
    this.hour = this.hours[0] + (this.hours[1] - this.hours[0]) * prog;

    // engine heat (desert / volcanic heat): hard work at low speed heats, airflow cools
    const hot = tr.env.hot || 0;
    if (hot > 0) {
      const load = Math.abs(veh.throttle) * (veh.low ? 1.15 : 1);
      // low range now tops out near 9 m/s, so airflow cooling is scaled to match
      const dT = (load * 0.021 * hot - 0.0075 - Math.abs(veh.speed) * 0.0011) * st;
      this.heat = Math.min(1, Math.max(0.3, this.heat + dT));
      if (!this.overheated && this.heat >= 1) { this.overheated = true; this.events.push({ type: 'overheat' }); }
      else if (this.overheated && this.heat < 0.72) { this.overheated = false; this.events.push({ type: 'cooled' }); }
    }

    // lava and other burning ground
    this.burnCool -= st;
    let burning = false;
    for (let i = 0; i < 4; i++) if (veh.wheels[i].grounded && veh.wheels[i].surface.hot) burning = true;
    if (burning) {
      this.damage = Math.min(100, this.damage + 14 * st * diff.damage);
      if (this.burnCool <= 0) { this.burnCool = 0.8; this.events.push({ type: 'burn' }); }
    }

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
      this.fuel = Math.min(this.params.fuelCap, this.fuel + this.params.fuelCap * 0.18);
      if (!diff.noRepair) {
        this.damage = Math.max(0, this.damage - 20);
        this.flats.fill(false); for (const w of veh.wheels) w.flat = false;     // checkpoint crews change tyres
      }
      this.brakeHeat = Math.min(this.brakeHeat, 0.3);
      this.heat = Math.min(this.heat, 0.6);
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
    for (let ri = 0; ri < this.relics.length; ri++) {
      const c = this.relics[ri];
      if (!c.found && Math.hypot(p[0] - c.x, p[2] - c.z) < 4.5) {
        c.found = true;
        this.events.push({ type: 'relic', index: ri, found: this.relics.filter((r) => r.found).length, total: this.relics.length });
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

  /** A heavy hit may puncture a tyre (roughly one hit in three). */
  _puncture() {
    this._pz = (Math.imul(this._pz, 1103515245) + 12345) >>> 0;
    if (this._pz / 4294967296 > 0.35) return;
    const i = (this._pz >>> 8) % 4;
    if (this.flats[i]) return;
    this.flats[i] = true;
    this.vehicle.wheels[i].flat = true;
    this.events.push({ type: 'puncture', wheel: i });
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
  if (session.relics.length) {
    objectives.push({ id: 'relics', label: `Find the ${session.relics.length} hidden relics`, done: session.relics.every((c) => c.found) });
  }
  return { time: t, medal, objectives, stars: objectives.filter((o) => o.done).length };
}

export function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
