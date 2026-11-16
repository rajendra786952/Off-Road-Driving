// A simple "skilled driver" used by the headless tests to prove every track
// can actually be driven start to finish with the intended vehicle setup.
// It only uses what a player has: steering, pedals, low range, diff lock,
// winch and the recovery button.
export class BotDriver {
  constructor(session) {
    this.ss = session;
    this.mode = 'drive';
    this.timer = 0;
    this.lastS = 0;
    this.watch = 0;
    this.tries = 0;
    this.maxSpeed = 0;
  }

  input(dt) {
    const ss = this.ss, tr = ss.track, veh = ss.vehicle;
    const v = veh.speed;
    this.maxSpeed = Math.max(this.maxSpeed, v);
    const i = ss.mainIdx;
    const look = 5 + Math.abs(v) * 0.8;
    const j = Math.min(tr.nMain - 1, i + Math.round(look / 2));
    let tx = tr.PX[j], tz = tr.PZ[j];
    // take a signposted bypass when the main line is beyond the recommended setup
    for (const b of tr.bypasses) {
      if (b.prefer && ss.s > b.s0 - 12 && ss.s < b.s1 - 4) {
        const k = Math.max(0, Math.min(b.n - 1, j - b.i0));
        tx = tr.PX[b.start + k]; tz = tr.PZ[b.start + k];
      }
    }
    const dx = tx - veh.p[0], dz = tz - veh.p[2];
    let err = Math.atan2(dx, dz) - veh.heading;
    while (err > Math.PI) err -= 2 * Math.PI;
    while (err < -Math.PI) err += 2 * Math.PI;
    let steer = Math.max(-1, Math.min(1, err * 2.2));

    // read the road ahead
    let vt = 16;
    let hard = false;
    for (let k = 0; k <= 14; k++) {
      const q = Math.min(tr.nMain - 1, i + k * 2);
      const sh = tr.roadShape(q, 3);
      const curv = Math.abs(sh.curv);
      const dist = k * 4;
      let lim = Math.sqrt(4.0 / Math.max(curv, 0.002));
      lim = Math.min(lim, 2.2 + 1.1 / (tr.WAVY[q] + 0.08));
      if (sh.grade < -0.12) lim = Math.min(lim, 5);
      if (tr.ROUGH[q] > 0.1) { lim = Math.min(lim, 1.8 + 0.35 / tr.ROUGH[q]); hard = hard || (dist < 8 && tr.ROUGH[q] > 0.15); }
      // a careful human on narrow ledges and rail-less bridges
      if (tr.HW[q] < 2.45) lim = Math.min(lim, 5.2);
      if (tr.HW[q] < 2.05) lim = Math.min(lim, 4.2);
      if (Math.abs(tr.SL[q]) > 20 || Math.abs(tr.SR[q]) > 20) lim = Math.min(lim, 6.5);
      for (const b of tr.bridges) if (tr.S[q] > b.s0 - 6 && tr.S[q] < b.s1 + 2) lim = Math.min(lim, 2.2 + b.half);
      // obstacles on the line ahead: crawl over them
      if (k <= 9) {
        const bh = Math.max(tr.bumpAt(veh.p[0] + veh.R[2] * (dist + 1.5), veh.p[2] + veh.R[8] * (dist + 1.5)), tr.bumpAt(tr.PX[q], tr.PZ[q]));
        if (bh > 0.08) { lim = Math.min(lim, bh > 0.3 ? 1.5 : 2.3); if (dist < 10) hard = true; }
      }
      // allow for braking distance at ~3 m/s^2
      lim = Math.sqrt(lim * lim + 2 * 3 * dist);
      if (lim < vt) vt = lim;
      if (dist < 10 && Math.abs(sh.grade) > 0.14) hard = true;
    }
    const w0 = veh.wheels[0];
    const soft = veh.wheels.some((w) => w.surface.sink > 0.05);
    const slick = w0.surface.grip < 0.3;
    if (soft) { vt = Math.min(vt, 6.5); hard = true; }
    if (slick) vt = Math.min(vt, 6);
    if (veh.waterDepth > 0.15) { vt = Math.min(vt, 4); hard = true; }
    if (veh.bellyDrag > 0.01 || tr.bumpAt(veh.p[0], veh.p[2]) > 0.08 || tr.bumpAt(veh.p[0] - veh.R[2] * 1.3, veh.p[2] - veh.R[8] * 1.3) > 0.08) { vt = Math.min(vt, 2.3); hard = true; }

    let gas = 0, brake = 0;
    // low range for anything technical, any real climb/descent, or when the engine is labouring
    const g0 = tr.roadShape(Math.min(tr.nMain - 1, i + 3), 3).grade;
    if (Math.abs(g0) > 0.085) hard = true;
    this.lug = v < 2 && this.gasPrev > 0.8 ? (this.lug || 0) + dt : 0;
    const low = (hard && vt < 9) || this.lug > 0.6 || (this.lowHold = Math.max(0, (this.lowHold || 0) - dt)) > 0;
    if (this.lug > 0.6) this.lowHold = 6;
    if (v < vt) gas = Math.min(1, (vt - v) * 0.45 + 0.12);
    else if (v > vt + 0.8) brake = Math.min(1, (v - vt) * 0.25);
    // do not dig holes: ease off when the wheels spin much faster than the truck moves
    const spin = Math.max(...veh.wheels.map((w) => Math.abs(w.slip)));
    if (soft && spin > 2.5) gas *= 0.55;

    // progress watchdog
    this.watch += dt;
    let winch = false;
    if (this.watch > 5) {
      const moved = ss.s - this.lastS;
      this.lastS = ss.s; this.watch = 0;
      if (moved < 1.0 && this.mode === 'drive') { this.mode = this.tries % 2 === 0 ? 'push' : 'reverse'; this.timer = 0; this.tries++; }
      else if (moved > 4) this.tries = 0;
    }
    if (this.mode === 'push') {
      this.timer += dt;
      gas = 1; brake = 0;
      winch = true;
      if (this.timer > 5) this.mode = 'drive';
    } else if (this.mode === 'reverse') {
      this.timer += dt;
      gas = 0; brake = 0.8; steer = -steer * 0.5;
      if (this.timer > 2.5) this.mode = 'drive';
    }
    if (this.tries >= 5 || veh.upY < 0.3 || ss.offRoute || ss.fuel <= 0) {
      if (ss.fuel <= 0) ss.toCheckpoint(true); else ss.recover();
      this.tries = 0; this.mode = 'drive'; this.watch = 0; this.lastS = ss.s;
    }
    this.gasPrev = gas;
    return { gas, brake, steer, hand: false, low: low || this.mode === 'push', lock: hard || this.mode === 'push', winch };
  }
}

/** Run a bot over a whole track. Returns timing + trouble counters. */
export function botRun(session, maxTime = 2400, onTick) {
  const bot = new BotDriver(session);
  const dt = 1 / 60;
  let t = 0;
  while (!session.finished && t < maxTime) {
    session.update(dt, bot.input(dt));
    session.takeEvents();
    t += dt;
    if (onTick) onTick(t, session, bot);
  }
  return {
    finished: session.finished,
    time: session.time,
    total: session.totalTime,
    recoveries: session.recoveries,
    damage: session.damage,
    fuel: session.fuel / session.params.fuelCap,
    s: session.s,
    length: session.track.finishS,
    maxSpeed: bot.maxSpeed,
    avgSpeed: session.distance / Math.max(1, session.time)
  };
}
