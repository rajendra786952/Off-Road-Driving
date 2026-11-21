// Physics sanity numbers:  node scripts/physcheck.mjs
import { TrackBuilder } from '../src/drive/core/track.js';
import { Vehicle4x4 } from '../src/drive/core/physics.js';
import { buildParams } from '../src/drive/core/specs.js';

const DT = 1 / 120;
function lane(o = {}) {
  const t = new TrackBuilder({ id: 'x', name: 'x', env: o.env || 'forest', seed: 5, startY: 50 });
  t.set({ width: 12, surface: o.surface || 'dirt', rough: o.rough ?? 0, wavy: o.wavy ?? 0, L: 0, R: 0, bank: o.bank || 0 });
  t.go(60, 0, 0).go(o.len || 400, 0, o.grade || 0).go(60, 0, 0);
  if (o.rocks) t.rocks(40, o.rocks, o.size || [0.3, 0.45], { at: -380 });
  return t.build();
}
function car(track, ups, gear, s = 20, weather) {
  const v = new Vehicle4x4(buildParams('mountain-jeep', ups, gear), track, weather);
  const p = track.roadPose(s);
  v.reset(p.x, p.y, p.z, p.heading);
  return v;
}
function run(v, sec, inp, cb) {
  for (let i = 0; i < sec / DT; i++) { v.step(DT, inp); if (cb && cb(i * DT) === false) break; }
}
const kmh = (x) => (x * 3.6).toFixed(1);

// 1. rest + accel + top speed + braking
{
  const tr = lane({ len: 1500 });
  const v = car(tr);
  run(v, 2, { gas: 0, brake: 0 });
  console.log(`rest: comH=${(v.p[1] - tr.heightAt(v.p[0], v.p[2])).toFixed(3)} (spec ${v.P.comH}) comp=${v.wheels.map((w) => w.comp.toFixed(3))} v=${v.speed.toFixed(3)}`);
  let t60 = 0;
  run(v, 30, { gas: 1 }, (t) => { if (!t60 && v.speed > 16.67) t60 = t; });
  console.log(`0-60 km/h ${t60.toFixed(1)}s, speed after 30s ${kmh(v.speed)} km/h`);
  const z0 = v.p[2], v0 = v.speed; let tb = 0;
  run(v, 10, { brake: 1 }, (t) => { tb = t; return v.speed > 0.3; });
  console.log(`brake from ${kmh(v0)} km/h: ${(v.p[2] - z0).toFixed(1)} m in ${tb.toFixed(1)}s`);
  const v2 = car(tr); run(v2, 12, { gas: 1, low: true });
  console.log(`low range top speed ${kmh(v2.speed)} km/h`);
  const v3 = car(tr); run(v3, 6, { brake: 1 });
  console.log(`reverse after 6s ${kmh(v3.speed)} km/h`);
}
// 2. climbing limits per surface
for (const surface of ['dirt', 'grass', 'mud', 'rock', 'snow', 'ice']) {
  let line = `${surface.padEnd(6)} climb:`;
  for (const grade of [10, 20, 30, 40, 55, 70]) {
    const tr = lane({ grade, surface, len: 200 });
    const v = car(tr, {}, {}, 45);
    run(v, 45, { gas: 1, low: true });
    const tr2 = tr.locateMain(v.p[0], v.p[2], 0);
    line += ` ${grade}%:${tr.S[tr2] > 200 ? 'ok' : 'x' + tr.S[tr2].toFixed(0)}`;
  }
  console.log(line);
}
// 3. hold on slope with handbrake
{
  const tr = lane({ grade: 30, len: 200 });
  const v = car(tr, {}, {}, 120);
  run(v, 1, { hand: true, brake: 1 });
  const z0 = v.p[2];
  run(v, 5, { hand: true });
  console.log(`handbrake hold on 30%: slid ${(z0 - v.p[2]).toFixed(2)} m in 5 s`);
}
// 4. mud: gentle vs floored
for (const gas of [0.45, 1]) {
  for (const gear of [{}, { tire: 'mud' }]) {
    const tr = lane({ surface: 'deepmud', len: 200 });
    const v = car(tr, {}, gear, 30);
    run(v, 25, { gas, low: true });
    const i = tr.locateMain(v.p[0], v.p[2], 0);
    console.log(`deep mud gas=${gas} tire=${gear.tire || 'at'}: reached s=${tr.S[i].toFixed(0)} v=${v.speed.toFixed(2)} dig=${v.wheels.map((w) => w.dig.toFixed(2))} belly=${v.bellyDrag.toFixed(2)}`);
  }
}
// 5. side slope rollover
for (const bank of [15, 25, 32, 40]) {
  const tr = lane({ bank, len: 200 });
  const v = car(tr, {}, {}, 100);
  run(v, 6, { gas: 0.25, low: true });
  console.log(`off-camber ${bank} deg: upY=${v.upY.toFixed(2)} roll=${(v.roll * 57.3).toFixed(0)} deg ${v.upY < 0.5 ? 'ROLLED' : 'ok'}`);
}
// 6. rough ground at speed
for (const rough of [0.1, 0.2, 0.35]) {
  for (const sp of [6, 10, 14]) {
    const tr = lane({ rough: 0.06, wavy: rough, len: 600 });
    const v = car(tr);
    let hits = 0, imp = 0, air = 0, minUp = 1;
    const v2 = car(tr);
    for (let i = 0; i < 30 / DT; i++) {
      v2.step(DT, { gas: v2.speed < sp ? 0.8 : 0, steer: (-v2.p[0] * 0.15 - v2.heading * 1.5) });
      if (v2.wheelHit > 2.2) hits++;
      if (v2.impact > 3.2) imp++;
      if (!v2.wheels.some((w) => w.grounded)) air++;
      minUp = Math.min(minUp, v2.upY);
    }
    console.log(`rough ${rough} @${kmh(sp)}km/h: wheel hits ${hits}, body impacts ${imp}, airborne ${(air * DT).toFixed(1)}s, minUp ${minUp.toFixed(2)}, dist ${v2.p[2].toFixed(0)}`);
  }
}
// 7. rock crawl with/without lockers
for (const gear of [{}, { difflock: true }]) {
  const tr = lane({ rocks: 40, size: [0.55, 0.85], len: 400 });
  const v = car(tr, {}, gear, 62);
  let lifted = 0;
  for (let i = 0; i < 40 / DT; i++) {
    v.step(DT, { gas: v.speed < 2 ? 0.7 : 0.1, low: true, lock: true, steer: -v.p[0] * 0.2 - v.heading * 1.5 });
    if (v.wheels.filter((w) => w.grounded).length < 4) lifted++;
  }
  const i = tr.locateMain(v.p[0], v.p[2], 0);
  console.log(`rock garden lock=${!!gear.difflock}: reached s=${tr.S[i].toFixed(0)} (rocks 80-120), wheel lifted ${(lifted * DT).toFixed(1)}s, upY=${v.upY.toFixed(2)}`);
}
// 8. chunk generation cost
{
  const tr = lane({ len: 800, rough: 0.1 });
  const t0 = performance.now();
  let n = 0;
  for (let cx = -3; cx <= 3; cx++) for (let cz = 0; cz < 10; cz++) { tr.getChunk(cx, cz); tr.propsFor(cx, cz); n++; }
  console.log(`chunk gen ${((performance.now() - t0) / n).toFixed(2)} ms each`);
}
