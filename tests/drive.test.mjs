// Tests for the 3D expedition core (pure logic: no Three.js, no browser).
import test from 'node:test';
import assert from 'node:assert/strict';

import { TrackBuilder } from '../src/drive/core/track.js';
import { Vehicle4x4 } from '../src/drive/core/physics.js';
import { buildParams, DRIVE_SPECS } from '../src/drive/core/specs.js';
import { DriveSession, scoreRun, DIFFICULTY } from '../src/drive/core/session.js';
import { ENVIRONMENTS } from '../src/drive/core/environments.js';
import { sunElevation } from '../src/drive/render/sky.js';
import { botRun } from '../src/drive/core/bot.js';
import { validateTrack, trackStats } from '../src/drive/core/validate.js';
import { SURFACES, TIRES, WEATHER, tireGrip } from '../src/drive/core/surfaces.js';
import { TRACKS } from '../src/drive/tracks/index.js';
import { TRACK_META } from '../src/drive/tracks/meta.js';
import { REGIONS } from '../src/drive/tracks/regions.js';
import { applyResult, isTrackUnlocked, isRegionUnlocked, ACHIEVEMENTS, dailyChallenge } from '../src/drive/core/progress.js';
import { defaultSave, migrateSave, UPGRADE_KEYS } from '../src/game/core/saveModel.js';

const DT = 1 / 120;
function lane(o = {}) {
  const t = new TrackBuilder({ id: 'lane', name: 'lane', env: o.env || 'forest', seed: 5, startY: 50 });
  t.set({ width: 12, surface: o.surface || 'dirt', rough: 0, wavy: 0, L: 0, R: 0, bank: o.bank || 0 });
  t.go(60, 0, 0).go(o.len || 300, 0, o.grade || 0).go(60, 0, 0);
  return t.build();
}
function car(track, ups, gear, s = 20) {
  const v = new Vehicle4x4(buildParams('mountain-jeep', ups, gear), track);
  const p = track.roadPose(s);
  v.reset(p.x, p.y, p.z, p.heading);
  return v;
}
const drive = (v, sec, inp) => { for (let i = 0; i < sec / DT; i++) v.step(DT, inp); };
const reached = (tr, v) => tr.S[tr.locateMain(v.p[0], v.p[2], 0)];

test('world: 8 expedition regions + the open Grand Tour, 5 tracks each, unique ids, complete metadata', () => {
  assert.equal(REGIONS.length, 9);
  assert.equal(REGIONS.filter((r) => r.open).length, 1);
  assert.equal(TRACKS.length, 45);
  assert.equal(new Set(TRACK_META.map((t) => t.id)).size, 45);
  for (const r of REGIONS) assert.equal(TRACK_META.filter((t) => t.region === r.id).length, 5, r.id);
  assert.ok(TRACK_META.reduce((s, t) => s + t.par.gold, 0) >= 6 * 3600, 'gold times must total at least 6 hours');
  for (const t of TRACK_META) { assert.ok(WEATHER[t.weather], t.id); for (const p of t.weatherPlan || []) assert.ok(WEATHER[p[1]], `${t.id} plan`); }
  for (const t of TRACK_META) {
    assert.ok(t.name && t.blurb && t.rec && t.reward > 0, t.id);
    assert.ok(t.par.gold >= (t.region === 'tour' ? 350 : 420), `${t.id}: gold par ${t.par.gold}s is too short`);   // Grand Tour tracks are shorter by design
    assert.ok(t.par.gold < t.par.silver && t.par.silver < t.par.bronze);
  }
});

test('every track compiles to valid, distinct geometry with checkpoints and a finish', () => {
  const sigs = new Set();
  for (const def of TRACKS) {
    const tr = def.build();
    assert.deepEqual(validateTrack(tr), [], def.id);
    const st = trackStats(tr);
    assert.ok(st.length > 2100, `${def.id} is only ${st.length.toFixed(0)} m`);   // crawling tracks are short in metres, not in minutes
    assert.ok(st.checkpoints >= 5, `${def.id} checkpoints`);
    assert.ok(tr.finishS > tr.checkpoints[tr.checkpoints.length - 1].s);
    assert.ok(tr.caches.length >= 2, `${def.id} needs optional routes`);
    assert.equal(tr.relics.length, 3, `${def.id} needs 3 hidden relics`);
    for (const r of tr.relics) { tr.surfaceAt(r.x, r.z); assert.ok(!tr.sq.surface.hot && !(tr.sq.waterY > tr.heightAt(r.x, r.z)), `${def.id}: relic in lava/water`); }
    // lava never lies on the driving line
    for (let i = 5; i < tr.nMain - 5; i += 7) { tr.surfaceAt(tr.PX[i], tr.PZ[i]); assert.ok(!tr.sq.surface.hot, `${def.id}: lava on the road at s=${tr.S[i]}`); }
    // layout signature: where the route ends up + how much it climbs
    const n = tr.nMain - 1;
    sigs.add(`${Math.round(tr.PX[n] / 20)}:${Math.round(tr.PZ[n] / 20)}:${Math.round(st.climb / 5)}`);
    // road is carved into the terrain: the surface under the centreline matches the authored profile
    for (let i = 10; i < n; i += 97) {
      const onBridge = tr.bridges.some((b) => tr.S[i] > b.s0 - 4 && tr.S[i] < b.s1 + 4);
      if (!onBridge) assert.ok(Math.abs(tr.heightAt(tr.PX[i], tr.PZ[i]) - tr.PY[i]) < 0.9, `${def.id}: road floats at s=${tr.S[i]}`);
    }
  }
  assert.equal(sigs.size, 45, 'tracks must not share a layout');
});

test('terrain: heights are continuous and props never sit on the road', () => {
  const tr = TRACKS[0].build();
  for (let i = 50; i < tr.nMain - 50; i += 211) {
    const x = tr.PX[i], z = tr.PZ[i];
    for (const [dx, dz] of [[0.5, 0], [0, 0.5], [3, 3], [20, -15]]) {
      const a = tr.heightAt(x + dx, z + dz), b = tr.heightAt(x + dx + 0.25, z + dz);
      assert.ok(Math.abs(a - b) < 0.6, 'height jump');
    }
    const cx = Math.floor(x / 32), cz = Math.floor(z / 32);
    for (const p of tr.propsFor(cx, cz)) {
      tr.surfaceAt(p.x, p.z);
      assert.ok(!tr.sq.onRoad, 'prop on the road');
      if (p.type !== 'building') assert.ok(Math.abs(p.y - tr.heightAt(p.x, p.z)) < 1e-6, 'floating prop');      // a building stands on a level foundation
    }
  }
});

test('physics: truck rests on its suspension at the designed ride height', () => {
  const tr = lane();
  const v = car(tr);
  drive(v, 3, {});
  assert.ok(Math.abs(v.p[1] - tr.heightAt(v.p[0], v.p[2]) - v.P.comH) < 0.03);
  assert.ok(v.wheels.every((w) => w.grounded && w.comp > 0.05 && w.comp < 0.2));
  assert.ok(Math.abs(v.speed) < 0.05);
});

test('physics: accelerates, brakes, reverses, low range is slower but stronger', () => {
  const tr = lane({ len: 900 });
  const v = car(tr);
  drive(v, 25, { gas: 1 });
  assert.ok(v.speed > 22 && v.speed < 29, `top speed ${v.speed}`);
  const z0 = v.p[2];
  for (let i = 0; i < 8 / DT && v.speed > 0.3; i++) v.step(DT, { brake: 1 });
  assert.ok(v.p[2] - z0 > 8 && v.p[2] - z0 < 40, `braking distance ${v.p[2] - z0}`);
  const lo = car(tr);
  drive(lo, 10, { gas: 1, low: true });
  assert.ok(lo.speed > 6 && lo.speed < 10, `low range speed ${lo.speed}`);
  const rev = car(tr, {}, {}, 200);
  drive(rev, 4, { brake: 1 });
  assert.ok(rev.speed < -2);
  // steep hill: high range stalls, low range climbs
  const hill = lane({ grade: 38, len: 200 });
  const hi = car(hill, {}, {}, 45);
  drive(hi, 30, { gas: 1 });
  const lw = car(hill, {}, {}, 45);
  drive(lw, 30, { gas: 1, low: true });
  assert.ok(reached(hill, lw) > reached(hill, hi) + 40, 'low range must out-climb high range');
});

test('physics: surfaces change traction (dirt > mud > ice), tyres change it back', () => {
  const climb = (surface, gear) => {
    const tr = lane({ grade: 22, surface, len: 200 });
    const v = car(tr, {}, gear, 45);
    drive(v, 40, { gas: 1, low: true });
    return reached(tr, v);
  };
  assert.ok(climb('dirt') > 250);
  assert.ok(climb('deepmud') < 200, 'stock tyres must not climb 22% deep mud');
  assert.ok(climb('deepmud', { tire: 'mud' }) > 250, 'mud tyres must');
  assert.ok(climb('ice') < 120);
  assert.ok(tireGrip('snow', 'ice') > 2 && tireGrip('at', 'ice') === 1);
  // braking distance on ice is much longer than on dirt
  const stop = (surface) => {
    const tr = lane({ surface, len: 600 });
    const v = car(tr);
    // brake from the same speed on both surfaces, and stop measuring once the truck has stopped
    // (holding the brake pedal at a standstill selects reverse)
    for (let i = 0; i < 40 / DT && v.speed < 10; i++) v.step(DT, { gas: 1 });
    const z0 = v.p[2];
    for (let i = 0; i < 30 / DT && v.speed > 0.3; i++) v.step(DT, { brake: 1 });
    return v.p[2] - z0;
  };
  assert.ok(stop('ice') > stop('dirt') * 3);
});

test('physics: off-camber slopes roll the truck over', () => {
  const ok = car(lane({ bank: 15 }), {}, {}, 100);
  drive(ok, 5, { gas: 0.25, low: true });
  assert.ok(ok.upY > 0.9);
  const over = car(lane({ bank: 31 }), {}, {}, 100);
  drive(over, 6, { gas: 0.25, low: true });
  assert.ok(over.upY < 0.5, 'should have rolled');
});

test('upgrades and equipment change real physics parameters', () => {
  const base = buildParams('mountain-jeep', {}, {});
  const maxed = buildParams('mountain-jeep', Object.fromEntries(UPGRADE_KEYS.map((k) => [k, 5])), { difflock: true, winch: true, tire: 'rock' });
  assert.ok(maxed.power > base.power * 1.3 && maxed.fmax > base.fmax * 1.2);
  assert.ok(maxed.clearance > base.clearance + 0.09 && maxed.comH > base.comH, 'lift raises clearance AND centre of gravity');
  assert.ok(maxed.travel > base.travel && maxed.brake > base.brake && maxed.fuelCap > base.fuelCap * 1.7 && maxed.gripMult > 1.1);
  assert.ok(maxed.difflock && maxed.winch && !base.difflock && !base.winch);
  for (const id of Object.keys(DRIVE_SPECS)) assert.ok(buildParams(id).mass > 900);
  for (const t of Object.values(TIRES)) assert.ok(t.name && t.desc);
  assert.ok(SURFACES.deepmud.grip < SURFACES.mud.grip && SURFACES.ice.grip < SURFACES.snow.grip);
});

test('winch pulls a truck through a bog that stops it otherwise', () => {
  const mk = () => {
    const t = new TrackBuilder({ id: 'bog', name: 'bog', env: 'mud', seed: 3, startY: 40 });
    t.set({ width: 10, surface: 'dirt', rough: 0, wavy: 0, L: 0, R: 0 });
    t.go(60, 0, 0);
    t.patch(40, 'bog');
    t.go(40, 0, 6);
    t.anchor(0.1, 6);
    t.cp('a'); t.go(40, 0, 0); t.cp('b'); t.go(40, 0, 0); t.cp('c'); t.go(60, 0, 0);
    return t.build();
  };
  const run = (gear, winch) => {
    const ss = new DriveSession(mk(), buildParams('mountain-jeep', {}, gear));
    ss.spawn(56);
    for (let i = 0; i < 60 * 60; i++) ss.update(1 / 60, { gas: 0.9, low: true, winch });
    return ss.s;
  };
  const stuck = run({}, false), winched = run({ winch: true }, true);
  assert.ok(stuck < 100, 'stock truck should bog down');
  assert.ok(winched > 100 && winched > stuck + 20, `winch should drag it out (${stuck} vs ${winched})`);
});

test('session rules: checkpoints in order, finish only after all checkpoints, recovery costs time', () => {
  const def = TRACKS[0];
  const tr = def.build();
  const ss = new DriveSession(tr, buildParams('mountain-jeep'));
  // teleport to just before the finish without touching any checkpoint: must NOT finish
  ss.spawn(tr.finishS - 20);
  ss.mainIdx = tr.locateMain(ss.vehicle.p[0], ss.vehicle.p[2], tr.nMain - 1);
  for (let i = 0; i < 60 * 12; i++) ss.update(1 / 60, { gas: 0.7 });
  assert.equal(ss.finished, false, 'finish must require every checkpoint');
  assert.equal(ss.cpNext, 0);
  const before = ss.totalTime;
  ss.recover();
  assert.ok(ss.totalTime >= before + 19 && ss.recoveries === 1);
});

test('difficulty, changing weather, daylight, engine heat and lava', () => {
  // difficulty changes the cost of a recovery and the reward multiplier
  const tr = TRACKS[0].build();
  const easy = new DriveSession(tr, buildParams('mountain-jeep'), { difficulty: 'casual' });
  const hard = new DriveSession(tr, buildParams('mountain-jeep'), { difficulty: 'hardcore' });
  easy.recover(); hard.recover();
  assert.ok(hard.penalty > easy.penalty * 3);
  assert.ok(DIFFICULTY.hardcore.reward > 1 && DIFFICULTY.casual.reward < 1);
  // weather plan: grip falls as the rain arrives; the clock advances with progress
  const swamp = TRACKS.find((t) => t.id === 'swamp-survival');
  const ss = new DriveSession(swamp.build(), buildParams('mountain-jeep'));
  const g0 = ss.weather.grip, h0 = ss.hour;
  ss.maxS = ss.track.finishS * 0.9;
  ss.update(1 / 60, {});
  assert.ok(ss.weather.grip < g0 - 0.15 && ss.weather.rain > 0.9, 'heavy rain should have arrived');
  assert.ok(ss.hour > h0 + 2, 'clock should advance');
  assert.ok(sunElevation(13) > 0.9 && sunElevation(23) < 0 && sunElevation(18.5) < 0.2);
  // heat: flat-out crawling in the desert overheats, the same in the forest does not
  const hot = (env) => {
    const t = new TrackBuilder({ id: 'h', name: 'h', env, seed: 2, startY: 30 });
    t.set({ width: 10, surface: 'deepsand', rough: 0, wavy: 0, L: 0, R: 0 });
    t.go(60, 0, 0).go(600, 0, 12).cp('a').go(40, 0, 0).cp('b').go(40, 0, 0).cp('c').go(60, 0, 0);
    const s = new DriveSession(t.build(), buildParams('mountain-jeep'));
    let peak = 0, overheated = false;
    for (let i = 0; i < 60 * 150; i++) {
      s.update(1 / 60, { gas: 1, low: true });
      peak = Math.max(peak, s.heat);
      if (s.takeEvents().some((e) => e.type === 'overheat')) overheated = true;
    }
    return { peak, overheated };
  };
  assert.ok(ENVIRONMENTS.desert.hot > 0 && ENVIRONMENTS.volcano.hot > 0);
  const dz = hot('desert');
  assert.ok(dz.peak > 0.95 && dz.overheated, 'desert crawl should overheat');
  assert.ok(hot('forest').peak < 0.5);
  // lava burns the truck
  const lt = new TrackBuilder({ id: 'l', name: 'l', env: 'volcano', seed: 2, startY: 30 });
  lt.set({ width: 8, surface: 'lavarock', rough: 0, wavy: 0, L: 0, R: 0 });
  lt.go(60, 0, 0); lt.patch(60, 'lava'); lt.go(200, 0, 0); lt.cp('a'); lt.go(40, 0, 0); lt.cp('b'); lt.go(40, 0, 0); lt.cp('c'); lt.go(60, 0, 0);
  const ls = new DriveSession(lt.build(), buildParams('mountain-jeep'));
  ls.spawn(70);
  for (let i = 0; i < 60 * 4; i++) ls.update(1 / 60, {});
  assert.ok(ls.damage > 20, 'standing in lava must damage the truck');
});

test('the test driver finishes the first track cleanly and scoring works', () => {
  const def = TRACKS[0];
  const ss = new DriveSession(def.build(), buildParams(def.bot.vehicle, def.bot.ups, def.bot.gear));
  const res = botRun(ss, 2400);
  assert.ok(res.finished, 'bot must finish Forest Entry');
  assert.equal(ss.cpNext, ss.track.checkpoints.length);
  assert.ok(res.time >= 600, `Forest Entry took the bot only ${res.time.toFixed(0)}s`);
  const score = scoreRun(ss, def.par);
  assert.ok(score.medal >= 1 && score.stars >= 2);
});

test('progression: unlock chain, rewards, records, achievements, save round-trip', () => {
  const save = defaultSave();
  assert.ok(isTrackUnlocked(save, 'forest-entry') && !isTrackUnlocked(save, 'fallen-forest'));
  assert.ok(isRegionUnlocked(save, 'forest') && !isRegionUnlocked(save, 'mud'));
  const run = (time, medal) => ({ relicsFound: [true, false, false], rewardMult: 1, difficulty: 'Standard', difficultyId: 'standard', time, medal, stars: 3, objectives: [{ id: 'finish', done: true }, { id: 'time', done: true }], recoveries: 0, damage: 5, cachesFound: [true, false], cacheRewards: [120, 120], distance: 4000, driveTime: time });
  const r1 = applyResult(save, 'forest-entry', run(700, 3));
  assert.ok(r1.first && r1.coins > 350 && save.coins === r1.coins);
  assert.ok(save.achievements['first-trail'] && save.achievements.gold && save.achievements.clean);
  assert.ok(isTrackUnlocked(save, 'fallen-forest'));
  const coins = save.coins;
  const r2 = applyResult(save, 'forest-entry', run(800, 1));
  assert.ok(!r2.first && r2.coins < r1.coins / 2, 'replays pay less');
  assert.equal(save.tracks['forest-entry'].bestTime, 700);
  assert.equal(save.tracks['forest-entry'].medal, 3);
  assert.deepEqual(save.tracks['forest-entry'].relics, [true, false, false]);
  assert.equal(save.stats.relics, 1);
  const hc = applyResult(defaultSave(), 'forest-entry', { ...run(700, 3), rewardMult: 1.5, difficultyId: 'hardcore', difficulty: 'Hardcore' });
  assert.ok(hc.coins > r1.coins, 'hardcore pays more');
  assert.ok(save.coins > coins);
  // finishing a whole region unlocks the next one; all 20 unlocks the final achievement
  for (const t of TRACK_META) applyResult(save, t.id, run(900, 2));
  for (const r of REGIONS) assert.ok(isRegionUnlocked(save, r.id));
  assert.ok(save.achievements.legend, 'completing all 40 tracks grants the final achievement');
  assert.ok(ACHIEVEMENTS.length >= 10);
  // persisted form survives migration untouched; old v2 saves keep their coins/vehicles
  const round = migrateSave(JSON.parse(JSON.stringify(save)));
  assert.deepEqual(round.tracks, save.tracks);
  assert.equal(round.xp, save.xp);
  const old = migrateSave({ version: 2, coins: 777, unlockedVehicles: ['mountain-jeep', 'rally-buggy'], upgrades: { 'mountain-jeep': { engine: 4, tires: 2, suspension: 1, fuel: 3 } }, levels: { 1: { stars: 3, bestCoins: 20 } } });
  assert.equal(old.coins, 777);
  assert.equal(old.upgrades['mountain-jeep'].engine, 4);
  assert.equal(old.upgrades['mountain-jeep'].clearance, 1);
  assert.ok(old.unlockedVehicles.includes('rally-buggy') && old.levels[1].stars === 3);
  assert.deepEqual(old.tires['mountain-jeep'], { owned: ['at'], sel: 'at' });
});

test('resume from a checkpoint, punctures, steering pull and brake fade', () => {
  const def = TRACKS[0];
  const tr = def.build();
  // drive past the first checkpoint, snapshot, and restore into a fresh session
  const a = new DriveSession(tr, buildParams('mountain-jeep'));
  a.spawn(tr.checkpoints[0].s - 6);
  a.mainIdx = tr.locateMain(a.vehicle.p[0], a.vehicle.p[2], 0);
  for (let i = 0; i < 60 * 8 && a.cpNext === 0; i++) a.update(1 / 60, { gas: 0.6 });
  assert.equal(a.cpNext, 1, 'should have taken checkpoint 1');
  a.damage = 37; a.penalty = 20; a.caches[0].found = true;
  const snap = JSON.parse(JSON.stringify(a.snapshot()));
  const b = new DriveSession(tr, buildParams('mountain-jeep'), { resume: snap });
  assert.ok(b.resumed && b.cpNext === 1 && b.damage === 37 && b.penalty === 20 && b.caches[0].found);
  assert.ok(Math.abs(b.time - a.time) < 1e-9);
  const pose = tr.roadPose(tr.checkpoints[0].s);
  assert.ok(Math.hypot(b.vehicle.p[0] - pose.x, b.vehicle.p[2] - pose.z) < 1, 'resumes at the checkpoint');
  assert.ok(!new DriveSession(tr, buildParams('mountain-jeep'), { resume: { v: 99 } }).resumed, 'a bad snapshot is ignored');
  assert.ok(a.trace.s.length > 0 && a.trace.s.length === a.trace.d.length, 'the ghost trace records progress');

  // a punctured tyre grips less: the same hill is climbed more slowly
  const climb = (flat) => {
    const t = lane({ grade: 22, surface: 'mud', len: 200 });
    const v = car(t, {}, {}, 45);
    if (flat) for (const w of v.wheels) w.flat = true;
    drive(v, 30, { gas: 1, low: true });
    return reached(t, v);
  };
  assert.ok(climb(true) < climb(false) - 3, 'flat tyres must cost progress');

  // bent steering pulls to one side above 50% damage
  const flatTrack = lane({ len: 600 });
  const drift = (dmg) => {
    const ss = new DriveSession(flatTrack, buildParams('mountain-jeep'));
    ss.damage = dmg;
    for (let i = 0; i < 60 * 6; i++) ss.update(1 / 60, { gas: 0.5, steer: 0 });
    return Math.abs(ss.d);
  };
  assert.ok(drift(95) > drift(10) + 0.5, 'a wrecked truck should wander off line');

  // brakes fade when held hard at speed and recover when released
  const hot = new DriveSession(lane({ len: 900, grade: -12 }), buildParams('mountain-jeep'));
  hot.spawn(40);
  let peak = 0;
  for (let c = 0; c < 4; c++) {            // four hard stops in a row down a hill
    for (let i = 0; i < 60 * 4; i++) hot.update(1 / 60, { gas: 1 });
    for (let i = 0; i < 60 * 2.5; i++) { hot.update(1 / 60, { brake: 1 }); peak = Math.max(peak, hot.brakeHeat); }
  }
  assert.ok(peak > 0.5, `repeated hard stops should heat the brakes (${peak.toFixed(2)})`);
  peak = hot.brakeHeat;
  for (let i = 0; i < 60 * 12; i++) hot.update(1 / 60, {});
  assert.ok(hot.brakeHeat < peak, 'brakes cool when released');
  // reverse is a crawl, not a sprint
  const rv = car(lane({ len: 600 }), {}, {}, 300);
  drive(rv, 8, { brake: 1 });
  assert.ok(rv.speed < -2 && rv.speed > -9.5, `reverse speed ${rv.speed}`);
});

test('economy and retention: repairs, daily challenge, best times, paint, upgrade tiers', () => {
  const run = (o = {}) => ({ relicsFound: [false, false, false], rewardMult: 1, difficulty: 'Standard', difficultyId: 'standard', time: 700, medal: 2, stars: 2, objectives: [{ id: 'finish', done: true }], recoveries: 1, damage: 0, cachesFound: [false, false], cacheRewards: [120, 120], distance: 4000, driveTime: 700, ...o });
  const clean = applyResult(defaultSave(), 'forest-entry', run());
  const wrecked = applyResult(defaultSave(), 'forest-entry', run({ damage: 90 }));
  assert.ok(wrecked.coins < clean.coins && wrecked.lines.some((l) => /Repairs/.test(l.text)), 'damage costs coins');
  // daily challenge: deterministic per date, only among unlocked tracks, pays once
  const save = defaultSave();
  const dc = dailyChallenge(save, '2026-11-18');
  assert.deepEqual(dc, dailyChallenge(save, '2026-11-18'));
  assert.ok(isTrackUnlocked(save, dc.trackId) && dc.bonus > 500 && !dc.done);
  const first = applyResult(save, dc.trackId, run({ daily: dc.date }));
  assert.ok(first.lines.some((l) => /Daily challenge/.test(l.text)) && dailyChallenge(save, '2026-11-18').done);
  assert.ok(!dailyChallenge(save, '2026-11-19').done, 'a new day is a new challenge');
  // best-times board keeps the five fastest, fastest first, and survives a save round-trip
  for (const t of [650, 720, 610, 800, 590, 640]) applyResult(save, dc.trackId, run({ time: t }));
  const times = save.tracks[dc.trackId].times.map((x) => x.t);
  assert.deepEqual(times, [590, 610, 640, 650, 700]);
  const round = migrateSave(JSON.parse(JSON.stringify({ ...save, resume: { trackId: 'forest-entry', state: { v: 1 } }, ghosts: { 'forest-entry': { s: [1, 2], d: [0, 1] }, bad: 5 }, paint: { 'mountain-jeep': { owned: ['stock', 'crimson', 'nope'], sel: 'crimson' } } })));
  assert.deepEqual(round.tracks[dc.trackId].times.map((x) => x.t), times);
  assert.ok(round.resume && round.ghosts['forest-entry'] && !round.ghosts.bad);
  assert.deepEqual(round.paint['mountain-jeep'], { owned: ['stock', 'crimson'], sel: 'crimson' });
  assert.deepEqual(round.paint['rally-buggy'], { owned: ['stock'], sel: 'stock' });
  // late-game tiers exist and still change the physics
  const l5 = buildParams('mountain-jeep', { engine: 5 }), l8 = buildParams('mountain-jeep', { engine: 8 });
  assert.ok(l8.power > l5.power * 1.15);
});
