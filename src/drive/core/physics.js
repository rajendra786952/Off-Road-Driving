// 4x4 rigid-body vehicle with four independent raycast wheels.
//
// Real calculations, no canned animation:
//  - 6-DOF rigid body (mass, box inertia, quaternion orientation)
//  - per-wheel suspension spring/damper + bump stop against the true terrain
//  - per-wheel tyre model: slip-ratio / slip-angle forces inside a friction
//    circle, with surface grip, tyre compound, weather and water
//  - wheel spin dynamics (wheels really spin up, lock and slip)
//  - open differentials per axle (a lifted wheel steals the torque) and
//    optional diff locks; low range; engine braking
//  - soft ground: tyres sink, spinning tyres dig in, the belly drags
//  - chassis contact points (ground clearance, rollover, resting on the roof)
//  - tree / boulder colliders, water drag, winch
//
// Body frame: +X = left, +Y = up, +Z = forward. COM at the origin.
import { tireGrip, SURFACES } from './surfaces.js';

const G = 9.81;
const WHEEL_I = 2.2;      // kg m^2 incl. drivetrain
const C_LONG = 9;         // longitudinal slip stiffness
const C_LAT = 6.5;        // lateral slip stiffness (per rad)
const KB = 110000;        // chassis contact stiffness (N/m per point)
const CB = 7000;          // chassis contact damping

const WET_ROCK = SURFACES.wetrock;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export class Vehicle4x4 {
  /**
   * @param P     params from buildParams()
   * @param world Track (groundAt, normalAt, surfaceAt, collidersNear)
   * @param env   { grip:number } weather grip multiplier, { wet }
   */
  constructor(P, world, weather = { grip: 1, wet: 0 }) {
    this.P = P;
    this.world = world;
    this.weather = weather;
    this.p = [0, 0, 0];
    this.q = [0, 0, 0, 1];
    this.v = [0, 0, 0];
    this.w = [0, 0, 0];
    this.R = new Float64Array(9);

    const hx = P.track / 2, hz = P.wheelbase / 2;
    this.sag = (P.mass * G) / (4 * P.springK);
    // wheel-centre height (body frame) at full droop
    this.yDroop = -(P.comH - P.wheelR) - this.sag;
    this.wheels = [
      { lx: hx, lz: hz, front: true }, { lx: -hx, lz: hz, front: true },
      { lx: hx, lz: -hz, front: false }, { lx: -hx, lz: -hz, front: false }
    ].map((w) => ({
      ...w, comp: 0, x: 0, grounded: false, omega: 0, spin: 0, slip: 0, dig: 0, load: 0, flat: false,
      surface: world.offSurface, water: 0, fx: 0, wx: 0, wy: 0, wz: 0
    }));

    // chassis contact points (body frame)
    const bw = P.body.w / 2 - 0.05, bl = P.body.l / 2 - 0.05;
    const yb = -(P.comH - P.clearance);          // belly
    const yt = yb + P.body.h + 0.45;             // roof / roll bar
    this.bodyPts = [
      [bw, yb + 0.12, bl], [-bw, yb + 0.12, bl], [bw, yb + 0.12, -bl], [-bw, yb + 0.12, -bl],
      [0, yb, 0], [0, yb, hz * 0.6], [0, yb, -hz * 0.6], [bw, yb, 0], [-bw, yb, 0],
      [bw * 0.8, yt, bl * 0.35], [-bw * 0.8, yt, bl * 0.35], [bw * 0.8, yt, -bl * 0.6], [-bw * 0.8, yt, -bl * 0.6]
    ];
    this.bodyPen = new Float32Array(this.bodyPts.length);
    this.Ib = [
      (P.mass / 12) * (P.body.h * P.body.h * 2.2 + P.body.l * P.body.l),
      (P.mass / 12) * (P.body.w * P.body.w + P.body.l * P.body.l),
      (P.mass / 12) * (P.body.w * P.body.w + P.body.h * P.body.h * 2.2)
    ];

    this.steer = 0;
    this.low = false;
    this.lock = false;
    this.speed = 0;        // signed forward speed
    this.rpm01 = 0;
    this.throttle = 0;
    this.fuelUse = 0;      // litres-ish consumed this step
    this.impact = 0;       // strongest chassis impact this step (m/s)
    this.wheelHit = 0;     // strongest suspension hit this step
    this.winchOn = false;
    this.winchAnchor = null;
    this.bellyDrag = 0;
    this._wade = 1;
    this.gear = 1;
    this.waterDepth = 0;
    this.winchTension = 0;
    this.dyn = null;       // Hazards instance for this run (set by the session)
    this._n = [0, 1, 0];
    this._F = [0, 0, 0];
    this._T = [0, 0, 0];
  }

  reset(x, y, z, heading) {
    this.p[0] = x; this.p[1] = y + this.P.comH + 0.15; this.p[2] = z;
    this.q[0] = 0; this.q[1] = Math.sin(heading / 2); this.q[2] = 0; this.q[3] = Math.cos(heading / 2);
    this.v[0] = this.v[1] = this.v[2] = 0;
    this.w[0] = this.w[1] = this.w[2] = 0;
    for (const wl of this.wheels) { wl.omega = 0; wl.dig = 0; wl.comp = 0; wl.x = 0; wl.grounded = false; }
    this.steer = 0;
    this._updateR();
  }

  _updateR() {
    const [x, y, z, w] = this.q;
    const R = this.R;
    R[0] = 1 - 2 * (y * y + z * z); R[1] = 2 * (x * y - w * z); R[2] = 2 * (x * z + w * y);
    R[3] = 2 * (x * y + w * z); R[4] = 1 - 2 * (x * x + z * z); R[5] = 2 * (y * z - w * x);
    R[6] = 2 * (x * z - w * y); R[7] = 2 * (y * z + w * x); R[8] = 1 - 2 * (x * x + y * y);
  }

  get pitch() { return Math.asin(clamp(this.R[5], -1, 1)); }      // nose up positive
  get roll() { return Math.atan2(this.R[3], this.R[4]); }         // left side up positive... sign only for display
  get upY() { return this.R[4]; }
  get heading() { return Math.atan2(this.R[2], this.R[8]); }

  _addForce(fx, fy, fz, px, py, pz) {
    const F = this._F, T = this._T, p = this.p;
    F[0] += fx; F[1] += fy; F[2] += fz;
    const rx = px - p[0], ry = py - p[1], rz = pz - p[2];
    T[0] += ry * fz - rz * fy;
    T[1] += rz * fx - rx * fz;
    T[2] += rx * fy - ry * fx;
  }

  /**
   * @param inp { gas 0..1, brake 0..1, steer -1..1 (+ = left), hand:boolean, low:boolean, lock:boolean, winch:boolean }
   */
  step(dt, inp) {
    const P = this.P, R = this.R, p = this.p, v = this.v, w = this.w, world = this.world;
    this._updateR();
    const lX = R[0], lY = R[3], lZ = R[6];   // left
    const uX = R[1], uY = R[4], uZ = R[7];   // up
    const fX = R[2], fY = R[5], fZ = R[8];   // forward
    const F = this._F, T = this._T;
    F[0] = 0; F[1] = -P.mass * G; F[2] = 0;
    T[0] = T[1] = T[2] = 0;
    this.impact = 0; this.wheelHit = 0; this.bellyDrag = 0;

    const vF = v[0] * fX + v[1] * fY + v[2] * fZ;
    this.speed = vF;
    this.low = !!inp.low;
    this.lock = !!inp.lock && P.difflock;

    // ---- pedals -> throttle / brake (brake pedal reverses when stopped)
    let th = clamp(inp.gas || 0, 0, 1);
    let br = 0;
    const bp = clamp(inp.brake || 0, 0, 1);
    if (bp > 0) {
      if (vF > 0.4 || th > 0.05) br = bp; else th = -bp;
    }
    if (inp.noFuel) th = 0;
    this.throttle = th;

    // ---- steering (speed-sensitive lock, rate limited)
    const maxSteer = 0.65 / (1 + Math.abs(vF) / 15);
    const target = clamp(inp.steer || 0, -1, 1) * maxSteer;
    const rate = 2.6 * dt;
    this.steer += clamp(target - this.steer, -rate, rate);
    const cs = Math.cos(this.steer), sn = Math.sin(this.steer);

    // ---- engine torque per axle
    const Rw = P.wheelR;
    const wl = this.wheels;
    const torque = [0, 0, 0, 0];
    const dir = th >= 0 ? 1 : -1;
    const vmax = dir < 0 ? P.vmaxRev : this.low ? P.vmaxLow : P.vmax;
    const fTop = P.mass * G * P.fmax * (this.low ? P.lowRatio : 1);
    let rpmV = 0;
    for (let a = 0; a < 2; a++) {
      const i = a * 2;
      const vAx = Rw * (wl[i].omega + wl[i + 1].omega) * 0.5;
      rpmV = Math.max(rpmV, Math.abs(vAx));
      if (th !== 0) {
        const fAx = Math.min(fTop, P.power / Math.max(Math.abs(vAx), 1.2)) * 0.5;
        const lim = 1 - sstep(vmax * 0.9, vmax, vAx * dir);
        const tq = th * fAx * 0.5 * Rw * lim * this._wade;
        torque[i] = tq; torque[i + 1] = tq;
      }
    }
    // engine speed for audio / HUD (auto gearbox sawtooth)
    {
      const top = this.low ? P.vmaxLow : P.vmax;
      const gears = this.low ? 2 : 4;
      const g = Math.min(gears - 1, Math.floor((rpmV / top) * gears));
      const frac = clamp((rpmV / top) * gears - g, 0, 1);
      const tgt = 0.16 + 0.74 * frac * (g === 0 ? 1 : 0.55 + 0.45 * frac) + Math.abs(th) * 0.1;
      this.rpm01 += (tgt - this.rpm01) * Math.min(1, dt * 9);
      this.gear = g + 1;
    }
    this.fuelUse = (0.0006 + Math.abs(th) * (0.0022 + 0.0016 * this.rpm01)) * dt * (P.power / 52000);

    const engBrake = (Math.abs(th) < 0.05 ? (this.low ? 95 : 28) : 0);
    const brakeT = br * 3400 * P.brake;
    const wGrip = this.weather.grip * P.gripMult;
    const n = this._n;
    let waterMax = 0;

    // ---- wheels
    for (let i = 0; i < 4; i++) {
      const W = wl[i];
      const ly = this.yDroop - Rw;
      const bx = p[0] + lX * W.lx + uX * ly + fX * W.lz;
      const by = p[1] + lY * W.lx + uY * ly + fY * W.lz;
      const bz = p[2] + lZ * W.lx + uZ * ly + fZ * W.lz;

      // wheel heading on the horizontal plane (for the 3-sample footprint)
      let hfx = fX, hfz = fZ;
      if (W.front) { hfx = fX * cs + lX * sn; hfz = fZ * cs + lZ * sn; }
      const hl = Math.hypot(hfx, hfz) || 1;
      const ox = (hfx / hl) * Rw * 0.7, oz = (hfz / hl) * Rw * 0.7;
      const probeY = by + 1.0;
      let g = world.groundAt(bx, bz, probeY);
      const gF = world.groundAt(bx + ox, bz + oz, probeY) - Rw * 0.29;
      const gB = world.groundAt(bx - ox, bz - oz, probeY) - Rw * 0.29;
      if (gF > g) g = gF;
      if (gB > g) g = gB;

      const sq = world.surfaceAt(bx, bz, probeY);
      let surf = sq.surface;
      if (this.weather.wet > 0.4 && surf.name === 'rock') surf = WET_ROCK || surf;
      const water = Math.max(0, sq.waterY - g);
      W.surface = surf; W.water = water;
      if (water > waterMax) waterMax = water;

      const sink = surf.sink * P.sinkMult + W.dig;
      const pen = g - sink - by;
      let tWheel = torque[i];
      const hb = inp.hand && !W.front ? 5200 : 0;
      const tBrake = brakeT * (W.front ? 0.62 : 0.38) * 2 + hb;

      if (pen <= 0 || uY < 0.2) {
        // airborne wheel: free spin
        W.grounded = false; W.x = 0; W.load = 0; W.slip = 0; W.fx = 0;
        W.comp += (0 - W.comp) * Math.min(1, dt * 12);
        let om = W.omega + (dt / WHEEL_I) * (tWheel - W.omega * engBrake * 0.02);
        const db = (tBrake * dt) / WHEEL_I;
        om = Math.abs(om) <= db ? 0 : om - Math.sign(om) * db;
        W.omega = clamp(om, -160, 160);
        W.dig = Math.max(0, W.dig - dt * 0.3);
        W.wx = bx; W.wy = by + Rw; W.wz = bz;
        continue;
      }

      const x = pen * uY;
      const xv = W.grounded ? (x - W.x) / dt : 0;
      let Fs = P.springK * x + P.springC * clamp(xv, -3, 3);
      if (x > P.travel) Fs += P.springK * 7 * (x - P.travel);
      Fs = clamp(Fs, 0, P.mass * G * 3.5);
      W.grounded = true; W.x = x; W.load = Fs;
      W.comp = Math.min(x, P.travel);

      world.normalAt(bx, bz, probeY, n);
      const cx = bx + uX * x, cy = by + uY * x, cz = bz + uZ * x;
      W.wx = cx; W.wy = cy + Rw; W.wz = cz;
      this._addForce(n[0] * Fs, n[1] * Fs, n[2] * Fs, cx, cy, cz);

      // contact velocity
      const rx = cx - p[0], ry = cy - p[1], rz = cz - p[2];
      const vx = v[0] + w[1] * rz - w[2] * ry;
      const vy = v[1] + w[2] * rx - w[0] * rz;
      const vz = v[2] + w[0] * ry - w[1] * rx;

      // tyre axes in the contact plane
      let wfx = fX, wfy = fY, wfz = fZ;
      if (W.front) { wfx = fX * cs + lX * sn; wfy = fY * cs + lY * sn; wfz = fZ * cs + lZ * sn; }
      const dn = wfx * n[0] + wfy * n[1] + wfz * n[2];
      let tfx = wfx - n[0] * dn, tfy = wfy - n[1] * dn, tfz = wfz - n[2] * dn;
      const tl = Math.hypot(tfx, tfy, tfz) || 1;
      tfx /= tl; tfy /= tl; tfz /= tl;
      const sx = n[1] * tfz - n[2] * tfy, sy = n[2] * tfx - n[0] * tfz, sz = n[0] * tfy - n[1] * tfx; // left
      // suspension bottoming out: how fast the chassis is really closing on the ground
      if (x > P.travel) { const close = -(vx * n[0] + vy * n[1] + vz * n[2]); if (close > 1.2) this.wheelHit = Math.max(this.wheelHit, close); }
      const vLong = vx * tfx + vy * tfy + vz * tfz;
      const vLat = vx * sx + vy * sy + vz * sz;

      let mu = surf.grip * tireGrip(P.tire, surf.name) * wGrip;
      if (water > 0.05) mu *= 0.85;
      if (W.flat) mu *= 0.55;                       // a punctured tyre has little bite
      const N = Fs;
      const cap = mu * N;

      // longitudinal: semi-implicit wheel spin
      const denom = Math.max(Math.abs(vLong), Math.abs(W.omega * Rw)) + 1.0;
      const K = (cap * C_LONG) / denom;
      const tNet = tWheel - W.omega * engBrake;
      let om = (W.omega + (dt / WHEEL_I) * (tNet + Rw * K * vLong)) / (1 + (dt * Rw * Rw * K) / WHEEL_I);
      let Fx = K * (om * Rw - vLong);
      if (Math.abs(Fx) > cap) {
        Fx = Math.sign(Fx) * cap;
        om = W.omega + (dt / WHEEL_I) * (tNet - Rw * Fx);
      }
      if (tBrake > 0) {
        const db = (tBrake * dt) / WHEEL_I;
        om = Math.abs(om) <= db ? 0 : om - Math.sign(om) * db;
        Fx = clamp(K * (om * Rw - vLong), -cap, cap);
      }
      W.omega = clamp(om, -160, 160);
      W.fx = Fx;

      // lateral
      const alpha = Math.atan2(vLat, Math.abs(vLong) + 1.4);
      let Fy = -cap * clamp(C_LAT * alpha, -1, 1);

      // friction circle
      const mag = Math.hypot(Fx, Fy);
      if (mag > cap && mag > 0) { const k = cap / mag; Fx *= k; Fy *= k; }

      // rolling resistance + soft-ground drag
      const slipV = W.omega * Rw - vLong;
      W.slip = slipV;
      const rr = (surf.roll + (W.flat ? 0.07 : 0)) * N * Math.tanh(vLong * 3);   // ...and drags
      const dragK = surf.drag * (sink / 0.15) + water * 900;
      const fLong = Fx - rr - dragK * vLong;
      const fLat = Fy - dragK * 0.6 * vLat;
      const ax = cx + uX * 0.18, ay = cy + uY * 0.18, az = cz + uZ * 0.18;
      this._addForce(tfx * fLong + sx * fLat, tfy * fLong + sy * fLat, tfz * fLong + sz * fLat, ax, ay, az);

      // spinning tyres dig into soft ground; rolling onto fresh ground frees them
      if (surf.dig > 0) {
        const sa = Math.abs(slipV);
        if (sa > 1.2) W.dig = Math.min(surf.dig * P.digMult, W.dig + dt * 0.055 * Math.min(1, sa / 5));
      }
      // a dug-in wheel fills back slowly at rest (slower than it digs) and quickly once it rolls
      W.dig = Math.max(0, W.dig - dt * (0.02 + Math.abs(vLong) * 0.3));
    }

    // ---- differential locks: both wheels of an axle turn together
    if (this.lock) {
      for (let a = 0; a < 2; a++) {
        const i = a * 2;
        const m = (wl[i].omega + wl[i + 1].omega) * 0.5;
        wl[i].omega = m; wl[i + 1].omega = m;
      }
    }
    for (let i = 0; i < 4; i++) wl[i].spin += wl[i].omega * dt;

    // ---- chassis contact points
    const bodySurf = wl[0].surface;
    const soft = bodySurf.sink > 0.05 ? 1 : 0;
    for (let k = 0; k < this.bodyPts.length; k++) {
      const b = this.bodyPts[k];
      const px = p[0] + lX * b[0] + uX * b[1] + fX * b[2];
      const py = p[1] + lY * b[0] + uY * b[1] + fY * b[2];
      const pz = p[2] + lZ * b[0] + uZ * b[1] + fZ * b[2];
      const g = world.groundAt(px, pz, py + 0.6);
      const pen = g - py;
      if (pen <= 0) { this.bodyPen[k] = 0; continue; }
      world.normalAt(px, pz, py + 0.6, n);
      const rx = px - p[0], ry = py - p[1], rz = pz - p[2];
      const vx = v[0] + w[1] * rz - w[2] * ry;
      const vy = v[1] + w[2] * rx - w[0] * rz;
      const vz = v[2] + w[0] * ry - w[1] * rx;
      const vn = vx * n[0] + vy * n[1] + vz * n[2];
      if (this.bodyPen[k] === 0 && vn < -1.2) this.impact = Math.max(this.impact, -vn);
      this.bodyPen[k] = pen;
      const Fn = clamp(KB * pen - CB * vn, 0, P.mass * G * 3);
      const tx = vx - n[0] * vn, ty = vy - n[1] * vn, tz = vz - n[2] * vn;
      const tv = Math.hypot(tx, ty, tz);
      const mu = soft ? 0.35 : 0.55;
      // a belly resting in soft ground drags as well as slides
      const fr = (mu * Fn) / (tv + 0.45) + (soft ? 2400 * Math.min(pen, 0.3) / 0.3 : 0);
      if (k >= 4 && k <= 8) this.bellyDrag = Math.max(this.bellyDrag, pen);
      this._addForce(n[0] * Fn - tx * fr, n[1] * Fn - ty * fr, n[2] * Fn - tz * fr, px, py, pz);
    }

    // ---- trees / boulders (horizontal circle colliders along the body)
    const half = P.body.l / 2 - 0.7;
    for (let c = -1; c <= 1; c++) {
      const px = p[0] + fX * half * c, py = p[1] + fY * half * c, pz = p[2] + fZ * half * c;
      world.collidersNear(px, pz, (o) => {
        if (py - 0.6 > o.y + (o.h !== undefined ? o.h : o.type === 'tree' ? 9 : o.r * 1.2)) return;
        const dx = px - o.x, dz = pz - o.z;
        const d = Math.hypot(dx, dz) || 0.001;
        const pen = o.r + 0.92 - d;
        if (pen <= 0) return;
        const nx = dx / d, nz = dz / d;
        const rx = px - p[0], ry = py - p[1], rz = pz - p[2];
        const vx = v[0] + w[1] * rz - w[2] * ry;
        const vz = v[2] + w[0] * ry - w[1] * rx;
        const vn = vx * nx + vz * nz;
        if (vn < -1.2) this.impact = Math.max(this.impact, -vn);
        const Fn = clamp(160000 * pen - 9000 * vn, 0, P.mass * G * 5);
        this._addForce(nx * Fn, 0, nz * Fn, px, py, pz);
      });
    }

    // ---- loose and moving obstacles (cones, crates, rocks, animals), side wind
    if (this.dyn) this.dyn.collide(this, dt);

    // ---- water + air drag
    const sp = Math.hypot(v[0], v[1], v[2]);
    const cd = 0.9 + waterMax * 420;
    F[0] -= v[0] * sp * cd; F[1] -= v[1] * sp * cd * 0.3; F[2] -= v[2] * sp * cd;
    this.waterDepth = waterMax;
    // deep water drowns the engine progressively (wading depth ~ wheel diameter)
    this._wade = 1 - 0.75 * sstep(Rw * 2.0, Rw * 3.1, waterMax);

    // ---- winch
    this.winchTension = 0;
    if (inp.winch && P.winch && this.winchAnchor) {
      const hx = p[0] + fX * (P.body.l / 2), hy = p[1] + fY * (P.body.l / 2) - 0.2, hz = p[2] + fZ * (P.body.l / 2);
      const dx = this.winchAnchor.x - hx, dy = this.winchAnchor.y - hy, dz = this.winchAnchor.z - hz;
      const d = Math.hypot(dx, dy, dz);
      if (d > 2.2) {
        const ux = dx / d, uy = dy / d, uz = dz / d;
        const vl = v[0] * ux + v[1] * uy + v[2] * uz;
        const f = P.winchForce * clamp(1 - vl / 1.3, 0, 1);
        this.winchTension = f;
        this._addForce(ux * f, uy * f, uz * f, hx, hy, hz);
      }
    }

    // ---- integrate
    const im = 1 / P.mass;
    v[0] += F[0] * im * dt; v[1] += F[1] * im * dt; v[2] += F[2] * im * dt;
    // torque -> body frame
    const tbx = lX * T[0] + lY * T[1] + lZ * T[2];
    const tby = uX * T[0] + uY * T[1] + uZ * T[2];
    const tbz = fX * T[0] + fY * T[1] + fZ * T[2];
    let wbx = lX * w[0] + lY * w[1] + lZ * w[2];
    let wby = uX * w[0] + uY * w[1] + uZ * w[2];
    let wbz = fX * w[0] + fY * w[1] + fZ * w[2];
    const I = this.Ib;
    wbx += ((tbx - (wby * wbz * (I[2] - I[1]))) / I[0]) * dt;
    wby += ((tby - (wbz * wbx * (I[0] - I[2]))) / I[1]) * dt;
    wbz += ((tbz - (wbx * wby * (I[1] - I[0]))) / I[2]) * dt;
    const ad = 1 - 0.35 * dt;
    wbx *= ad; wby *= ad; wbz *= ad;
    w[0] = lX * wbx + uX * wby + fX * wbz;
    w[1] = lY * wbx + uY * wby + fY * wbz;
    w[2] = lZ * wbx + uZ * wby + fZ * wbz;

    const vm = Math.hypot(v[0], v[1], v[2]);
    if (vm > 55) { const k = 55 / vm; v[0] *= k; v[1] *= k; v[2] *= k; }
    const wm = Math.hypot(w[0], w[1], w[2]);
    if (wm > 9) { const k = 9 / wm; w[0] *= k; w[1] *= k; w[2] *= k; }

    p[0] += v[0] * dt; p[1] += v[1] * dt; p[2] += v[2] * dt;
    const q = this.q;
    const hx2 = w[0] * dt * 0.5, hy2 = w[1] * dt * 0.5, hz2 = w[2] * dt * 0.5;
    const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
    q[0] += hx2 * qw + hy2 * qz - hz2 * qy;
    q[1] += hy2 * qw + hz2 * qx - hx2 * qz;
    q[2] += hz2 * qw + hx2 * qy - hy2 * qx;
    q[3] += -hx2 * qx - hy2 * qy - hz2 * qz;
    const ql = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    q[0] /= ql; q[1] /= ql; q[2] /= ql; q[3] /= ql;

    if (!(p[0] === p[0]) || !(q[3] === q[3])) this.broken = true;
  }
}
