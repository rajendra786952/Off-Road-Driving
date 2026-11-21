// Moving obstacles and challenge rules for one run (pure logic, no rendering).
//
// Simulates what the generated obstacle layer (obstacles.js) describes:
//   - loose objects with mass and friction: cones, crates, barrels, branches (breakable),
//     rocks and boulders. They roll or slide down the real terrain and trade momentum
//     with the truck. A heavy rock at rest needs real force to shift.
//   - events tied to progress: rockfalls and landslides off a bank, a boulder rolling down
//     the trail, a tree coming down, crosswind zones, sudden squalls
//   - animals that wait at the roadside, cross when it is safe, and run from the truck
//   - the challenge rules: entering, clearing, clean bonuses, recovery points, hard lines
// Everything is pre-allocated when the run starts; bodies far from the truck sleep.
import { WEATHER } from './surfaces.js';

const G = 9.81;
const NEAR = 16;          // bodies this close to the truck can touch it (m)
const WAKE = 150;         // moving bodies further than this are frozen (m)

/** r = collision radius, h = height, m = mass (kg), mu = sliding / rolling resistance, round = rolls down slopes. */
export const BODY_KINDS = {
  cone:    { r: 0.22, h: 0.7, m: 4,    mu: 0.7,  round: 0 },
  crate:   { r: 0.48, h: 0.8, m: 45,   mu: 0.65, round: 0, breakAt: 7.5 },
  barrel:  { r: 0.36, h: 0.9, m: 30,   mu: 0.45, round: 0 },
  branch:  { r: 0.55, h: 0.3, m: 6,    mu: 0.7,  round: 0, breakAt: 1.0, soft: true },
  rock:    { r: 0.45, h: 0.8, m: 0,    mu: 0.33, round: 1 },      // mass from its radius
  boulder: { r: 1.2,  h: 2.2, m: 4500, mu: 0.02, round: 1 },
  animal:  { r: 0.5,  h: 1.2, m: 90,   mu: 0,    round: 0 }
};

/** walk / run speeds in m/s. len / tall size the drawn animal. */
export const SPECIES = {
  deer:     { r: 0.5,  m: 90,   walk: 2.6, run: 9.0,  len: 1.5, tall: 1.25, color: [0.55, 0.38, 0.22] },
  boar:     { r: 0.45, m: 80,   walk: 2.2, run: 7.0,  len: 1.2, tall: 0.75, color: [0.24, 0.19, 0.16] },
  cow:      { r: 0.75, m: 550,  walk: 1.5, run: 4.5,  len: 2.1, tall: 1.4,  color: [0.82, 0.78, 0.72] },
  goat:     { r: 0.38, m: 45,   walk: 2.2, run: 7.0,  len: 1.0, tall: 0.8,  color: [0.78, 0.74, 0.66] },
  horse:    { r: 0.7,  m: 450,  walk: 2.4, run: 10.0, len: 2.2, tall: 1.6,  color: [0.36, 0.22, 0.13] },
  elephant: { r: 1.35, m: 4000, walk: 1.6, run: 5.0,  len: 3.4, tall: 2.8,  color: [0.42, 0.40, 0.40] },
  monkey:   { r: 0.28, m: 12,   walk: 2.6, run: 8.0,  len: 0.6, tall: 0.6,  color: [0.40, 0.30, 0.20] }
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Hazards {
  constructor(session) {
    this.ss = session;
    this.track = session.track;
    const L = this.layer = this.track.layer;
    this.t = 0;
    // ---- bodies (the pool)
    this.bodies = L.bodies.map((d, id) => {
      const K = BODY_KINDS[d.kind];
      const sp = d.sp ? SPECIES[d.sp] : null;
      const r = d.r || (sp ? sp.r : K.r);
      const m = sp ? sp.m : d.kind === 'rock' ? Math.min(5000, 2400 * 4.19 * r * r * r * 0.75) : d.kind === 'boulder' ? Math.min(6000, 4500 * (r / 1.2) ** 3) : K.m;
      return {
        id, kind: d.kind, sp: d.sp || null, spec: sp, x: d.x, z: d.z, y: 0, hasY: false, vx: 0, vz: 0,
        x0: d.x, z0: d.z, s: d.s, r, h: sp ? sp.tall : d.kind === 'rock' || d.kind === 'boulder' ? r * 1.8 : K.h, m, mu: K.mu, round: K.round,
        breakAt: K.breakAt || 0, soft: !!K.soft, rot: d.rot || 0, spin: 0,
        active: !d.hidden, awake: false, broken: false, def: d,
        // animals
        state: d.kind === 'animal' ? 'idle' : '', wait: 0, hx: 0, hz: 0, struck: false
      };
    });
    this.near = [];
    this.awake = [];
    this.scanT = 0;
    // ---- triggers
    this.triggers = L.triggers.map((t) => ({ ...t, fired: false, done: false, t0: 0 }));
    this.trees = this.triggers.filter((t) => t.type === 'treefall').map((t) => { t.ang = 0; t.state = 'stand'; return t; });
    this.birds = L.birds.map((b) => ({ ...b, up: false, t0: 0 }));
    // ---- zone effects
    this.wind = 0;            // lateral acceleration on the truck right now (m/s^2, + = left)
    this.windZone = null;
    this.squall = { id: '', k: 0 };
    // ---- challenge rules
    this.ch = L.challenges.map(() => ({ st: 0, dmg0: 0, hits0: 0 }));   // st: 0 pending, 1 inside, 2 cleared, 3 clean, 4 failed
    this.cur = -1;
    this.strikes = 0;         // animals hit
    this.broke = 0;           // things smashed
    this.hard = L.hardLines.map(() => ({ st: 0 }));                      // 0 pending, 1 holding the line, 2 done, 3 left it
    session.vehicle.dyn = this;
  }

  // ------------------------------------------------------------------ bodies
  _ground(b) { b.y = this.track.heightAt(b.x, b.z); b.hasY = true; }

  /** One physics step for everything that is moving. */
  step(dt) {
    this.t += dt;
    const tr = this.track, list = this.awake;
    for (let k = list.length - 1; k >= 0; k--) {
      const b = list[k];
      if (!b.active || !b.awake) { list[k] = list[list.length - 1]; list.pop(); b.awake = false; continue; }
      if (b.kind === 'animal') { this._animal(b, dt); continue; }
      if (b.delay > 0) { b.delay -= dt; if (b.delay > 0) continue; b.vx = b.px * 3.2; b.vz = b.pz * 3.2; }
      // slope of the ground under it
      const e = 0.6;
      const gx = (tr.heightAt(b.x + e, b.z) - tr.heightAt(b.x - e, b.z)) / (2 * e);
      const gz = (tr.heightAt(b.x, b.z + e) - tr.heightAt(b.x, b.z - e)) / (2 * e);
      const sl = Math.hypot(gx, gz);
      const v = Math.hypot(b.vx, b.vz);
      // round things roll (a solid sphere keeps 5/7 of the pull); boxes only slide when it is steeper than their friction
      const pull = b.round ? 0.71 : sl > b.mu ? 1 : 0;
      let ax = -G * gx * pull, az = -G * gz * pull;
      if (v > 0.02) { ax -= (b.vx / v) * b.mu * G; az -= (b.vz / v) * b.mu * G; }
      else if (G * sl * pull <= b.mu * G) { b.vx = b.vz = 0; this._sleep(b); continue; }
      if (b.kind === 'boulder') {
        // the trail is a gutter: the boulder is held to its lane while it runs down it
        const i = tr.locateMain(b.x, b.z, b.idx || 0);
        b.idx = i;
        const d = (b.x - tr.PX[i]) * tr.TZ[i] - (b.z - tr.PZ[i]) * tr.TX[i];
        const lv = b.vx * tr.TZ[i] - b.vz * tr.TX[i];
        // ...and once it is past the challenge it runs off the trail instead of parking on it
        const lane = tr.S[i] < b.def.sOff ? b.def.laneOff : b.def.lane;
        const a = (lane - d) * 2.2 - lv * 2.4;
        ax += tr.TZ[i] * a; az -= tr.TX[i] * a;
        if (tr.S[i] < b.def.sMin || this.t - b.t0 > 45) { b.vx = b.vz = 0; this._sleep(b); if (Math.abs(d) < tr.HW[i] + 1) b.active = false; continue; }
      }
      const nvx = b.vx + ax * dt, nvz = b.vz + az * dt;
      // friction can stop it but never reverse it
      if (v > 0.02 && nvx * b.vx + nvz * b.vz < 0 && G * sl * pull <= b.mu * G) { b.vx = b.vz = 0; this._sleep(b); continue; }
      b.vx = nvx; b.vz = nvz;
      b.x += b.vx * dt; b.z += b.vz * dt;
      b.y = tr.heightAt(b.x, b.z);
      const sp = Math.hypot(b.vx, b.vz);
      if (b.round) { b.spin += (sp / b.r) * dt; if (sp > 0.3) b.rot = Math.atan2(b.vx, b.vz); }
    }
    // trees coming down
    for (const t of this.trees) {
      if (t.state !== 'fall') continue;
      const u = (this.t - t.t0) / 2.3;
      t.ang = Math.min(1, u * u) * (Math.PI / 2);
      if (u >= 1) this._treeDown(t);
    }
  }

  _sleep(b) { b.awake = false; if (b.kind === 'rock' && b.def.hidden) b.settled = true; }
  _wake(b) { if (!b.awake) { b.awake = true; if (!b.hasY) this._ground(b); this.awake.push(b); } }

  /** Contact between the truck and nearby bodies, plus wind. Called from inside the vehicle's physics step. */
  collide(veh, dt) {
    const P = veh.P, p = veh.p, v = veh.v, w = veh.w, R = veh.R;
    if (this.wind) {
      // side wind on the body, applied at the centre of mass so it pushes rather than rolls
      const f = P.mass * this.wind;
      veh._F[0] += R[0] * f; veh._F[2] += R[6] * f;
    }
    const near = this.near;
    if (!near.length) return;
    const cr = P.body.w / 2 + 0.06, half = P.body.l / 2 - cr * 0.85;
    const fl = Math.hypot(R[2], R[8]) || 1, fX = R[2] / fl, fZ = R[8] / fl;
    const M = P.mass;
    for (let k = 0; k < near.length; k++) {
      const b = near[k];
      if (!b.active || b.delay > 0) continue;
      if (Math.abs(p[1] - b.y - 0.8) > 2.8) continue;                 // well above it (on a bridge) or below
      for (let c = -1; c <= 1; c++) {
        const cx = p[0] + fX * half * c, cz = p[2] + fZ * half * c;
        const dx = cx - b.x, dz = cz - b.z;
        const d = Math.hypot(dx, dz) || 0.001;
        const pen = cr + b.r - d;
        if (pen <= 0) continue;
        const nx = dx / d, nz = dz / d;
        const qx = cx - nx * cr, qy = p[1] - 0.25, qz = cz - nz * cr;   // contact point on the hull
        const rx = qx - p[0], ry = qy - p[1], rz = qz - p[2];
        const vx = v[0] + w[1] * rz - w[2] * ry, vz = v[2] + w[0] * ry - w[1] * rx;
        const vn = (vx - b.vx) * nx + (vz - b.vz) * nz;                 // < 0 = closing
        if (b.breakAt && -vn > b.breakAt) { this._break(b, veh, nx, nz, -vn, dt); break; }
        // a heavy thing at rest is held by friction: it is a wall until the push beats mu * m * g
        const hold = !b.awake && b.m >= 150 ? 0.9 * b.m * G : 0;
        if (hold > 0) {
          const Fn = clamp(160000 * pen - 9000 * vn, 0, M * G * 5);
          veh._addForce(nx * Fn, 0, nz * Fn, qx, qy, qz);
          if (vn < -1.2) veh.impact = Math.max(veh.impact, -vn);
          // only the part of the push that beats its friction gets it moving
          if (Fn > hold) { this._wake(b); const dv = ((Fn - hold) / b.m) * dt; b.vx -= nx * dv; b.vz -= nz * dv; }
          continue;
        }
        this._wake(b);
        if (vn < 0) {
          const mr = (b.m * M) / (b.m + M), e = b.soft ? 0 : 0.25;
          const j = -(1 + e) * vn * mr;
          b.vx -= (nx * j) / b.m; b.vz -= (nz * j) / b.m;
          const F = Math.min(j / dt, M * G * 6);
          veh._addForce(nx * F, 0, nz * F, qx, qy, qz);
          const hit = -vn * (b.m / (b.m + M)) * (b.soft ? 0.2 : b.kind === 'animal' ? 2.2 : 1.6);
          if (hit > 1.2) veh.impact = Math.max(veh.impact, hit);
          if (b.kind === 'animal' && -vn > 2.2 && !b.struck) { b.struck = true; this.strikes++; this.ss.events.push({ type: 'animalHit', sp: b.sp, x: b.x, y: b.y, z: b.z }); }
        }
        // push the two apart in proportion to their masses
        const share = M / (b.m + M);
        b.x -= nx * pen * share; b.z -= nz * pen * share;
        const Fs = 60000 * pen * (1 - share);
        if (Fs > 1) veh._addForce(nx * Fs, 0, nz * Fs, qx, qy, qz);
      }
    }
  }

  _break(b, veh, nx, nz, speed, dt) {
    b.active = false; b.broken = true; this.broke++;
    // smashing through costs a little momentum
    const j = Math.min(speed, 6) * b.m * 1.5;
    veh._F[0] += (nx * j) / dt; veh._F[2] += (nz * j) / dt;
    this.ss.events.push({ type: 'break', kind: b.kind, x: b.x, y: b.y, z: b.z });
  }

  // ------------------------------------------------------------------ animals
  _animal(b, dt) {
    const tr = this.track, sp = b.spec, veh = this.ss.vehicle, p = veh.p;
    const i = tr.locateMain(b.x, b.z, b.idx || tr._idxS(b.s));
    b.idx = i;
    const lx = tr.TZ[i], lz = -tr.TX[i];                               // left of travel
    const d = (b.x - tr.PX[i]) * lx + (b.z - tr.PZ[i]) * lz;           // its lateral position
    const side = b.def.side, hw = tr.HW[i];
    // where is the truck relative to it
    const ex = b.x - p[0], ez = b.z - p[2];
    const dist = Math.hypot(ex, ez);
    const vs = Math.hypot(veh.v[0], veh.v[2]);
    const closing = vs > 0.5 ? (ex * veh.v[0] + ez * veh.v[2]) / (dist * vs + 1e-6) : 0;   // 1 = truck heading straight at it
    const danger = dist < 9 + vs * 1.3 && closing > 0.55 && vs > 2;
    let tvx = 0, tvz = 0;
    if (b.state === 'wait') {
      b.wait -= dt;
      // step out only when the truck is far enough away to stop, or has stopped for them
      const safe = dist > 16 + vs * 2.4 || vs < 1.2 || closing < 0;
      if (b.wait <= 0 && safe) b.state = 'cross';
    } else if (b.state === 'cross') {
      if (danger) { b.state = 'flee'; b.dir = d >= this.ss.d ? 1 : -1; }      // away from the truck's side of the road
      else {
        tvx = -side * lx * sp.walk + tr.TX[i] * 0.3 * Math.sin(b.id * 1.7 + this.t * 0.6);
        tvz = -side * lz * sp.walk + tr.TZ[i] * 0.3 * Math.sin(b.id * 1.7 + this.t * 0.6);
        if (d * -side > b.def.far) b.state = 'graze';
      }
    }
    if (b.state === 'flee') {
      // bolt for whichever verge gets it out of the truck's path, then carry on across
      tvx = b.dir * lx * sp.run; tvz = b.dir * lz * sp.run;
      if (Math.abs(d) > hw + 5 || (!danger && dist > 22)) {
        // back on the side it came from: wait for a gap again. Anywhere else: finish crossing.
        if (d * side > hw + 1) { b.state = 'wait'; b.wait = 1.5; } else b.state = 'cross';
      }
    }
    if (b.state === 'graze' && dist > 60) { b.vx = b.vz = 0; this._sleep(b); return; }
    const acc = 9 * dt;
    const dvx = tvx - b.vx, dvz = tvz - b.vz, dv = Math.hypot(dvx, dvz);
    if (dv > acc) { b.vx += (dvx / dv) * acc; b.vz += (dvz / dv) * acc; } else { b.vx = tvx; b.vz = tvz; }
    b.x += b.vx * dt; b.z += b.vz * dt;
    b.y = tr.heightAt(b.x, b.z);
    const sv = Math.hypot(b.vx, b.vz);
    if (sv > 0.3) { const a = Math.atan2(b.vx, b.vz); let da = a - b.rot; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; b.rot += da * Math.min(1, dt * 8); }
    b.spin += sv * dt;                                                 // gait phase for the renderer
  }

  // ------------------------------------------------------------------ events
  _fire(t) {
    t.fired = true; t.t0 = this.t;
    const B = this.bodies;
    if (t.type === 'rockfall') {
      for (const id of t.bodies) {
        const b = B[id], i = this.track._idxS(b.s);
        b.active = true; b.x = b.x0; b.z = b.z0; b.delay = b.def.delay + 0.01; b.settled = false;
        b.px = this.track.TZ[i] * b.def.push; b.pz = -this.track.TX[i] * b.def.push;
        this._wake(b);
      }
      if (t.patch) t.patch.off = false;
      this.ss.events.push({ type: 'hazard', kind: t.slide ? 'landslide' : 'rockfall', x: t.at.x, z: t.at.z, y: this.track.heightAt(t.at.x, t.at.z) });
    } else if (t.type === 'boulder') {
      for (const id of t.bodies) {
        const b = B[id], i = this.track._idxS(b.s);
        b.active = true; b.x = b.x0; b.z = b.z0; b.t0 = this.t; b.idx = i; b.delay = 0;
        b.vx = -this.track.TX[i] * 5; b.vz = -this.track.TZ[i] * 5;       // set rolling back down the trail
        this._wake(b);
        this.ss.events.push({ type: 'hazard', kind: 'boulder', x: b.x, z: b.z, y: this.track.heightAt(b.x, b.z) });
      }
    } else if (t.type === 'herd') {
      for (const id of t.bodies) { const b = B[id]; b.state = 'wait'; b.wait = b.def.delay; this._wake(b); }
      this.ss.events.push({ type: 'hazard', kind: 'herd', sp: t.sp });
    } else if (t.type === 'treefall') {
      t.state = 'fall';
      this.ss.events.push({ type: 'hazard', kind: 'treefall', x: t.base.x, z: t.base.z, y: this.track.heightAt(t.base.x, t.base.z) });
    }
  }

  _treeDown(t) {
    t.state = 'down'; t.ang = Math.PI / 2;
    this.track.addObstacle({ ...t.log });
    // anything under the trunk when it lands takes the hit
    const p = this.ss.vehicle.p, o = t.log;
    const along = (p[0] - o.x) * o.ax + (p[2] - o.z) * o.az, off = Math.abs((p[0] - o.x) * o.az - (p[2] - o.z) * o.ax);
    const under = Math.abs(along) < o.len / 2 + 0.5 && off < 1.6;
    if (under) this.ss.vehicle.impact = Math.max(this.ss.vehicle.impact, 6.5);
    this.ss.events.push({ type: 'hazard', kind: 'treedown', x: o.x, z: o.z, y: this.track.heightAt(o.x, o.z), under });
  }

  /** Once per frame, after the session knows where the truck is. */
  update(dt) {
    const ss = this.ss, tr = this.track, veh = ss.vehicle, p = veh.p, s = ss.s;
    const speed = Math.abs(veh.speed);
    const onLine = Math.abs(ss.d) < tr.HW[ss.mainIdx] + 18;

    // which bodies can touch the truck, which should be simulated at all
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.2;
      this.near.length = 0;
      for (const b of this.bodies) {
        if (!b.active) continue;
        const d = Math.abs(b.x - p[0]) + Math.abs(b.z - p[2]);
        if (d < NEAR * 1.4) { if (!b.hasY) this._ground(b); this.near.push(b); }
        // far from the truck nothing needs simulating: freeze it where it is
        if (b.awake && d > WAKE * 1.4 && b.kind !== 'animal') { b.vx = b.vz = 0; b.awake = false; }
      }
    }

    // events
    this.wind = 0; this.windZone = null;
    let sq = '';
    for (const t of this.triggers) {
      if (t.type === 'gust' || t.type === 'squall') {
        if (s < t.s || s > t.s1 || !onLine) continue;
        if (!t.fired) { t.fired = true; this.ss.events.push({ type: 'hazard', kind: t.type, weather: t.weather }); }
        if (t.type === 'gust') {
          const edge = Math.min(1, (s - t.s) / 12, (t.s1 - s) / 12);
          const g = 0.45 + 0.55 * Math.max(0, Math.sin(this.t * 0.9 + t.s) * 0.6 + Math.sin(this.t * 2.3 + t.s * 0.5) * 0.4 + 0.3);
          this.wind = t.dir * t.acc * edge * g;
          this.windZone = t;
        } else sq = t.weather;
        continue;
      }
      if (t.fired || !onLine) continue;
      if (t.type === 'treefall') {
        // dropped so that a truck at this speed still has room to stop
        if (s > t.arm && s < t.s - 14 && t.s - s < Math.max(30, 14 + speed * 3.4)) this._fire(t);
        else if (s >= t.s - 14) t.fired = true;                          // drove past before it could go: it stays up
      } else if (s >= t.s && s < t.s + 60) this._fire(t);
    }
    // a squall blends in and out
    const k = this.squall.k + (sq ? dt / 4 : -dt / 5);
    if (sq) this.squall.id = sq;
    this.squall.k = clamp(k, 0, 1);

    // birds lift off as the truck approaches
    for (const b of this.birds) {
      if (b.up) continue;
      if (Math.abs(b.s - s) < 60 && Math.hypot(b.x - p[0], b.z - p[2]) < 22 + speed) { b.up = true; b.t0 = this.t; this.ss.events.push({ type: 'birds', x: b.x, z: b.z, y: tr.heightAt(b.x, b.z) }); }
    }

    // challenge rules
    const C = this.layer.challenges;
    this.cur = -1;
    for (let i = 0; i < C.length; i++) {
      const c = C[i], st = this.ch[i];
      if (st.st === 0 && s >= c.s0 - 2 && s <= c.s1 && onLine) {
        st.st = 1; st.dmg0 = ss.damage; st.hits0 = this.strikes;
        this.ss.events.push({ type: 'challenge', index: i, name: c.name, tip: c.tip, dyn: c.dyn });
      }
      if (st.st === 1) {
        if (s > c.s1 + 3) {
          const clean = ss.damage - st.dmg0 < 4 && this.strikes === st.hits0;
          st.st = clean ? 3 : 2;
          // working through obstacles burns fuel: clearing one earns a top-up, a clean pass a bigger one
          const cap = ss.params.fuelCap, before = ss.fuel;
          ss.fuel = Math.min(cap, ss.fuel + cap * (clean ? 0.02 : 0.013) * c.w);
          this.ss.events.push({ type: 'challengeDone', index: i, name: c.name, clean, w: c.w, fuel: ss.fuel - before });
        } else this.cur = i;
      }
    }
    // the hard line: stay on the main trail all the way past an authored bypass
    const H = this.layer.hardLines;
    for (let i = 0; i < H.length; i++) {
      const h = H[i], st = this.hard[i];
      if (st.st === 0 && s >= h.s0 && s < h.s0 + 12 && Math.abs(ss.d) < tr.HW[ss.mainIdx] + 1.5) st.st = 1;
      if (st.st === 1) {
        if (Math.abs(ss.d) > tr.HW[ss.mainIdx] + 2.5) st.st = 3;
        else if (s >= h.s1) { st.st = 2; this.ss.events.push({ type: 'hardLine' }); }
      }
    }
  }

  /** The session calls this when the truck is recovered or sent back to a checkpoint. */
  onRecover() {
    if (this.cur >= 0) { this.ch[this.cur].st = 4; this.ss.events.push({ type: 'challengeFailed', index: this.cur, name: this.layer.challenges[this.cur].name }); }
    this.cur = -1;
    for (const st of this.hard) if (st.st === 1) st.st = 3;
  }

  /** Where a recovery should put the truck: the entrance of the challenge it is in, if any. */
  safePoint(s) {
    if (!this.layer.cfg.checkpoints) return Infinity;
    for (const c of this.layer.challenges) if (s >= c.s0 - 2 && s <= c.s1 + 2) return c.s0 - 8;
    return Infinity;
  }

  /** Blend a sudden squall over the session weather (the physics holds the same object). */
  applyWeather(w) {
    const k = this.squall.k, o = WEATHER[this.squall.id];
    if (k <= 0 || !o) return;
    for (const key of ['grip', 'wet', 'fog', 'rain', 'snow', 'wind', 'dust', 'ash']) w[key] += ((o[key] || 0) - w[key]) * k;
  }

  /** Something on the trail ahead the driver should slow for: { dist, stop }. Used by the test driver. */
  threatAhead(range = 34) {
    const veh = this.ss.vehicle, p = veh.p, R = veh.R;
    let best = null;
    for (const b of this.bodies) {
      if (!b.active) continue;
      const live = b.kind === 'animal' ? b.state === 'cross' || b.state === 'flee' : b.awake && (b.kind === 'rock' || b.kind === 'boulder');
      if (!live) continue;
      const ex = b.x - p[0], ez = b.z - p[2];
      const ahead = ex * R[2] + ez * R[8], lat = Math.abs(ex * R[8] - ez * R[2]);
      if (ahead < 1 || ahead > range || lat > 2.4 + b.r) continue;
      if (!best || ahead < best.dist) best = { dist: ahead, stop: true };
    }
    for (const t of this.trees) {
      if (t.state !== 'fall') continue;
      const ex = t.log.x - p[0], ez = t.log.z - p[2], ahead = ex * R[2] + ez * R[8];
      if (ahead > 2 && ahead < range && (!best || ahead < best.dist)) best = { dist: ahead - 5, stop: true };
    }
    return best;
  }

  /** Totals for the results screen and the save. */
  summary() {
    let cleared = 0, clean = 0, weight = 0, cleanWeight = 0;
    this.ch.forEach((st, i) => {
      const w = this.layer.challenges[i].w;
      if (st.st === 2 || st.st === 3) { cleared++; weight += w; }
      if (st.st === 3) { clean++; cleanWeight += w; }
    });
    return {
      total: this.ch.length, cleared, clean, weight, cleanWeight, strikes: this.strikes, broke: this.broke,
      hardLines: this.hard.filter((h) => h.st === 2).length, hardTotal: this.hard.length, tier: this.layer.cfg.difficulty
    };
  }

  snapshot() { return { tier: this.layer.cfg.difficulty, ch: this.ch.map((c) => (c.st === 1 ? 0 : c.st)), hard: this.hard.map((h) => (h.st === 1 ? 0 : h.st)), strikes: this.strikes, broke: this.broke }; }

  /** Resume at checkpoint distance cpS: results carry over, events behind the truck are spent. */
  restore(o, cpS) {
    if (o && o.tier === this.layer.cfg.difficulty && Array.isArray(o.ch) && o.ch.length === this.ch.length) {
      o.ch.forEach((v, i) => { this.ch[i].st = v | 0; });
      (o.hard || []).forEach((v, i) => { if (this.hard[i]) this.hard[i].st = v | 0; });
      this.strikes = o.strikes | 0; this.broke = o.broke | 0;
    }
    this.layer.challenges.forEach((c, i) => { if (c.s1 < cpS && this.ch[i].st === 0) this.ch[i].st = 4; });
    for (const t of this.triggers) if ((t.s1 || t.s) < cpS) t.fired = true;
    for (const b of this.birds) if (b.s < cpS) b.up = true;
  }
}
