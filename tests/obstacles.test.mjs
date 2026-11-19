// Tests for the generated obstacle layer and the moving hazards (pure logic, no Three.js).
import test from 'node:test';
import assert from 'node:assert/strict';

import { TrackBuilder } from '../src/drive/core/track.js';
import { buildParams } from '../src/drive/core/specs.js';
import { DriveSession, DIFFICULTY } from '../src/drive/core/session.js';
import { BotDriver, botRun } from '../src/drive/core/bot.js';
import { validateTrack } from '../src/drive/core/validate.js';
import { generateObstacles, validateObstacles, obstacleConfig, obstacleStats, OBSTACLE_TIERS, TIER_FOR_DIFFICULTY, CHALLENGES } from '../src/drive/core/obstacles.js';
import { BODY_KINDS, SPECIES } from '../src/drive/core/hazards.js';
import { applyResult, challengeRewards } from '../src/drive/core/progress.js';
import { defaultSave } from '../src/game/core/saveModel.js';
import { TRACKS, getTrackDef } from '../src/drive/tracks/index.js';

const jeep = () => buildParams('mountain-jeep');
const emptyLayer = (o = {}) => ({
  cfg: obstacleConfig(), tier: 1, challenges: [], hints: [], triggers: [], bodies: [], solids: [],
  obstacles: [], patches: [], anchors: [], gaps: [], birds: [], hardLines: [], ...o
});
function lane(o = {}) {
  const t = new TrackBuilder({ id: 'lane', name: 'lane', env: 'forest', seed: 5, startY: 50 });
  t.set({ width: 12, surface: 'dirt', rough: 0, wavy: 0, L: 0, R: 0 });
  t.go(60, 0, 0);
  if (o.bridge) t.bridge(24);
  t.go(300, 0, 0).go(60, 0, 0);
  return t.build();
}
const at = (tr, s, d = 0) => tr.roadPose(s, d);
/** Put the session's truck on the road at distance s. */
function place(ss, s) {
  ss.spawn(s);
  ss.mainIdx = ss.track.locateMain(ss.vehicle.p[0], ss.vehicle.p[2], ss.track._idxS(s));
  ss.maxS = s; ss.safeS = s;
}
function run(ss, sec, inp = {}) {
  const ev = [];
  for (let i = 0; i < sec * 60; i++) { ss.update(1 / 60, { ...inp }); ev.push(...ss.takeEvents()); }
  return ev;
}
/** First track + tier (from the candidates) whose layer has a challenge of this type. */
function find(type, ids, tiers = OBSTACLE_TIERS) {
  for (const id of ids) for (const tier of tiers) {
    const tr = getTrackDef(id).build();
    const layer = generateObstacles(tr, { difficulty: tier });
    if (layer.challenges.some((c) => c.type === type)) return { id, tier, def: getTrackDef(id) };
  }
  return null;
}

test('config: tiers, density and switches', () => {
  const c = obstacleConfig({ difficulty: 'nonsense', categories: { wildlife: false } });
  assert.equal(c.difficulty, 'medium');
  assert.ok(c.categories.rocks && !c.categories.wildlife);
  assert.ok(c.density.easy < c.density.medium && c.density.medium < c.density.hard && c.density.hard < c.density.extreme);
  for (const d of Object.keys(DIFFICULTY)) assert.ok(OBSTACLE_TIERS.includes(TIER_FOR_DIFFICULTY[d]), `no obstacle tier for ${d}`);
  // a category switch removes its challenges; dynamicEvents: false removes everything that moves on its own
  const tr = getTrackDef('tour-mountain').build();
  const all = generateObstacles(tr, { difficulty: 'hard' });
  assert.ok(all.challenges.some((x) => x.cat === 'rocks') && all.challenges.some((x) => x.dyn));
  const noRocks = generateObstacles(tr, { difficulty: 'hard', categories: { rocks: false } });
  assert.ok(!noRocks.challenges.some((x) => x.cat === 'rocks'));
  const calm = generateObstacles(tr, { difficulty: 'hard', dynamicEvents: false });
  assert.ok(!calm.challenges.some((x) => x.dyn) && calm.triggers.every((t) => t.type === 'herd'), 'only animals are left moving');
});

test('every track gets a playable, deterministic layer on every tier', () => {
  const totals = { easy: 0, medium: 0, hard: 0, extreme: 0 };
  const seen = new Set();
  for (const def of TRACKS) {
    const tr = def.build();
    const base = { ob: tr.obstacles.length, pa: tr.patches.length, an: tr.anchors.length };
    const sigs = new Set();
    for (const tier of OBSTACLE_TIERS) {
      const layer = generateObstacles(tr, { difficulty: tier });
      tr.setLayer(layer);
      assert.deepEqual(validateObstacles(tr), [], `${def.id} ${tier}`);
      assert.deepEqual(validateTrack(tr), [], `${def.id} ${tier}: track checks with the layer on`);
      const st = obstacleStats(tr);
      assert.ok(st.challenges >= 4, `${def.id} ${tier}: only ${st.challenges} challenges`);
      totals[tier] += st.challenges;
      for (const c of layer.challenges) { seen.add(c.type); assert.ok(CHALLENGES[c.type] && c.name && c.tip && c.w > 0); }
      // the same input gives the same layer
      const again = generateObstacles(tr, { difficulty: tier });
      assert.equal(JSON.stringify(again.challenges), JSON.stringify(layer.challenges), `${def.id} ${tier}: not deterministic`);
      sigs.add(layer.challenges.map((c) => `${c.type}@${Math.round(c.s0)}`).join(','));
      // blockers never sit on the recommended line, and nothing generated is near a checkpoint
      for (const c of tr.checkpoints) assert.ok(!layer.challenges.some((x) => c.s > x.s0 - 4 && c.s < x.s1 + 4 && x.type !== 'bridgeGaps'), `${def.id} ${tier}: challenge over a checkpoint`);
    }
    assert.ok(sigs.size >= 3, `${def.id}: tiers should give different layers`);
    // removing the layer leaves the authored track exactly as it was
    tr.setLayer(null);
    assert.deepEqual({ ob: tr.obstacles.length, pa: tr.patches.length, an: tr.anchors.length }, base, `${def.id}: layer left something behind`);
    assert.ok(tr.bridges.every((b) => !b.gaps));
  }
  assert.ok(totals.easy < totals.medium && totals.medium < totals.hard && totals.hard < totals.extreme, JSON.stringify(totals));
  assert.ok(totals.extreme > totals.easy * 1.4);
  for (const t of ['rockGarden', 'boulderSlalom', 'stoneSteps', 'logSteps', 'fallenTree', 'mudPit', 'softPatch', 'potholes', 'roadworks', 'wreck', 'rockfall', 'rollingBoulder', 'treefall', 'gust', 'squall', 'herd', 'bridgeGaps']) {
    assert.ok(seen.has(t), `no track ever gets a ${t}`);
  }
});

test('static pieces collide: steps, potholes, missing planks, cement blocks', () => {
  const tr = lane({ bridge: true });
  const a = at(tr, 150), h = at(tr, 170);
  const blocks = [];
  for (let d = -7; d <= 7; d += 0.8) { const p = at(tr, 220, d); blocks.push({ type: 'solid', x: p.x, z: p.z, r: 0.42, h: 0.8, look: 'block', rot: 0 }); }
  const layer = emptyLayer({
    obstacles: [
      { type: 'slab', x: a.x, z: a.z, ax: tr.TZ[a.i], az: -tr.TX[a.i], len: 13, depth: 2, h: 0.2, ramp: 0.28, gen: true },
      { type: 'hole', x: h.x, z: h.z, r: 0.8, h: 0.2, gen: true }
    ],
    solids: blocks,
    gaps: [{ bridge: 0, t0: 0.4, t1: 0.6, side: 1, d0: 0.8 }]
  });
  const ss = new DriveSession(tr, jeep(), { layer });
  assert.ok(Math.abs(tr.bumpAt(a.x, a.z) - 0.2) < 1e-6, 'step height');
  assert.ok(tr.bumpAt(at(tr, 150.95).x, at(tr, 150.95).z) < 0.06, 'ramped edge');
  assert.ok(Math.abs(tr.bumpAt(h.x, h.z) + 0.2) < 1e-6 && tr.bumpAt(at(tr, 171).x, at(tr, 171).z) === 0, 'pothole bowl');
  // the deck is gone on the left of the bridge's middle, and only there
  const b = tr.bridges[0], mid = (b.s0 + b.s1) / 2;
  const L = at(tr, mid, 1.3), Rr = at(tr, mid, -1.3), F = at(tr, b.s0 + 3, 1.3);
  assert.equal(tr.deckAt(L.x, L.z), -Infinity);
  assert.ok(tr.deckAt(Rr.x, Rr.z) > -1e8 && tr.deckAt(F.x, F.z) > -1e8);
  // a wheel in a pothole drops: the suspension follows the bowl
  place(ss, 162);
  let low = 1e9;
  for (let i = 0; i < 60 * 6; i++) { ss.update(1 / 60, { gas: 0.35 }); low = Math.min(low, tr.bumpAt(ss.vehicle.wheels[0].wx, ss.vehicle.wheels[0].wz), tr.bumpAt(ss.vehicle.wheels[1].wx, ss.vehicle.wheels[1].wz)); }
  assert.ok(ss.s > 172, 'drives through the pothole');
  // a row of cement blocks is a wall
  place(ss, 205);
  run(ss, 10, { gas: 0.6 });
  assert.ok(ss.s < 219.6, `cement blocks must stop the truck (s=${ss.s.toFixed(1)})`);
  tr.setLayer(null);
});

test('loose objects have mass: cones fly, crates shove, big rocks hold, branches snap', () => {
  const tr = lane();
  const mk = (kind, o = {}) => { const p = at(tr, 100); return { kind, x: p.x, z: p.z, s: 100, d: 0, rot: 0, ...o }; };
  const push = (def, gas = 0.5, sec = 7) => {
    const ss = new DriveSession(tr, jeep(), { layer: emptyLayer({ bodies: [def] }) });
    place(ss, 88);
    const ev = run(ss, sec, { gas });
    const b = ss.hazards.bodies[0];
    return { ss, b, ev, moved: Math.hypot(b.x - b.x0, b.z - b.z0) };
  };
  const cone = push(mk('cone'));
  assert.ok(cone.moved > 1.5 && cone.ss.s > 104 && cone.ss.damage === 0, 'a cone is knocked aside without slowing the truck');
  const crate = push(mk('crate'), 0.35);
  assert.ok(crate.moved > 1 && crate.b.active, 'a crate is pushed along');
  assert.ok(crate.moved < cone.moved + 30);
  const smash = push(mk('crate'), 1, 6);
  const fast = new DriveSession(tr, jeep(), { layer: emptyLayer({ bodies: [{ ...mk('crate'), x: at(tr, 160).x, z: at(tr, 160).z, s: 160 }] }) });
  place(fast, 88);
  const fev = run(fast, 9, { gas: 1 });
  assert.ok(fev.some((e) => e.type === 'break' && e.kind === 'crate') && !fast.hazards.bodies[0].active, 'hit fast, a crate breaks');
  void smash;
  const twig = push(mk('branch'), 0.4);
  assert.ok(twig.ev.some((e) => e.type === 'break' && e.kind === 'branch') && !twig.b.active && twig.ss.damage === 0, 'branches snap under the truck');
  // mass decides: a small rock is shoved, a big one stays put and stops the truck
  const small = push(mk('rock', { r: 0.3 }), 0.5, 8), big = push(mk('rock', { r: 0.8 }), 0.5, 8);
  assert.ok(small.b.m < 300 && big.b.m > 3000);
  assert.ok(small.moved > 1, `a small rock should be pushed (moved ${small.moved.toFixed(2)} m)`);
  assert.ok(big.moved < 1.0 && big.moved < small.moved / 2 && big.ss.s < 100.5, `a big rock at rest should hold (moved ${big.moved.toFixed(2)} m, s=${big.ss.s.toFixed(1)})`);
  for (const k of Object.keys(BODY_KINDS)) assert.ok(BODY_KINDS[k].r > 0);
  for (const k of Object.keys(SPECIES)) assert.ok(SPECIES[k].run > SPECIES[k].walk && SPECIES[k].m > 0);
  tr.setLayer(null);
});

test('rockfall: rocks come down the bank onto the road and settle', () => {
  const f = find('rockfall', ['tour-mountain', 'volcano-climb', 'black-rock'], ['medium', 'hard']);
  assert.ok(f, 'expected a rockfall');
  const ss = new DriveSession(f.def.build(), buildParams(f.def.bot.vehicle, f.def.bot.ups, f.def.bot.gear), { obstacles: { difficulty: f.tier } });
  const hz = ss.hazards, tr = ss.track, t = hz.triggers.find((x) => x.type === 'rockfall');
  const rocks = t.bodies.map((id) => hz.bodies[id]);
  assert.ok(rocks.every((b) => !b.active), 'rocks are hidden until the fall starts');
  place(ss, t.s + 1);
  const ev = run(ss, 0.5);
  assert.ok(ev.some((e) => e.type === 'hazard' && (e.kind === 'rockfall' || e.kind === 'landslide')), 'warning event');
  const lateral = (b) => { const i = tr.locateMain(b.x, b.z, tr._idxS(b.s)); return { d: Math.abs((b.x - tr.PX[i]) * tr.TZ[i] - (b.z - tr.PZ[i]) * tr.TX[i]), hw: tr.HW[i] }; };
  const start = rocks.map((b) => lateral(b).d);
  let reached = 0;
  for (let i = 0; i < 60 * 14; i++) { ss.update(1 / 60, {}); for (const b of rocks) { const l = lateral(b); if (l.d < l.hw) b._on = true; } }
  reached = rocks.filter((b) => b._on).length;
  assert.ok(reached >= 1, 'at least one rock should reach the road');
  assert.ok(rocks.every((b, k) => lateral(b).d < start[k] + 0.5 || b._on), 'rocks roll downhill towards the road');
  run(ss, 25);
  assert.ok(rocks.every((b) => !b.awake), 'rocks come to rest');
  tr.setLayer(null);
});

test('rolling boulder: comes down the trail in its lane and hurts', () => {
  const f = find('rollingBoulder', ['mountain-climb', 'rocky-entrance', 'tour-mountain'], ['hard', 'extreme']);
  assert.ok(f, 'expected a rolling boulder');
  const ss = new DriveSession(f.def.build(), buildParams(f.def.bot.vehicle, f.def.bot.ups, f.def.bot.gear), { obstacles: { difficulty: f.tier } });
  const hz = ss.hazards, tr = ss.track, t = hz.triggers.find((x) => x.type === 'boulder');
  const b = hz.bodies[t.bodies[0]];
  // parked in the boulder's own lane: it must arrive and hit
  place(ss, t.s + 1);
  const lane0 = b.def.lane;
  const p = tr.roadPose(t.s + 12, lane0);
  ss.vehicle.reset(p.x, p.y, p.z, p.heading);
  const s0 = b.s;
  let hit = 0, minLat = 1e9, maxLat = -1e9;
  for (let i = 0; i < 60 * 30; i++) {
    ss.update(1 / 60, { hand: true });
    for (const e of ss.takeEvents()) if (e.type === 'impact') hit = Math.max(hit, e.v);
    if (b.awake && b.active) { const k = tr.locateMain(b.x, b.z, b.idx); const d = (b.x - tr.PX[k]) * tr.TZ[k] - (b.z - tr.PZ[k]) * tr.TX[k]; if (tr.S[k] > t.s + 16) { minLat = Math.min(minLat, d); maxLat = Math.max(maxLat, d); } }
  }
  assert.ok(tr.S[tr.locateMain(b.x, b.z, b.idx)] < s0 - 20 || hit > 0, 'the boulder rolls down the trail');
  assert.ok(Math.abs(minLat - lane0) < 1.6 && Math.abs(maxLat - lane0) < 1.6, `it keeps to its lane (${minLat.toFixed(1)}..${maxLat.toFixed(1)} vs ${lane0.toFixed(1)})`);
  assert.ok(hit > 3.2 && ss.damage > 3, `being hit must damage the truck (impact ${hit.toFixed(1)}, damage ${ss.damage.toFixed(0)})`);
  // the recommended line is out of its way
  assert.ok(Math.abs(tr.lineOffset(t.s + 40) - lane0) > b.r + 1.0, 'the clear line is outside the boulder lane');
  tr.setLayer(null);
});

test('falling tree: stands, falls when the truck comes, then blocks its side of the road', () => {
  const f = find('treefall', ['jungle-entry', 'tour-forest', 'deep-jungle'], ['medium', 'hard']);
  assert.ok(f, 'expected a falling tree');
  const ss = new DriveSession(f.def.build(), buildParams(f.def.bot.vehicle, f.def.bot.ups, f.def.bot.gear), { obstacles: { difficulty: f.tier } });
  const hz = ss.hazards, tr = ss.track, t = hz.trees[0];
  assert.equal(t.state, 'stand');
  assert.ok(tr.bumpAt(t.log.x, t.log.z) < 0.05, 'nothing on the road before it falls');
  place(ss, t.s - 70);
  const bot = new BotDriver(ss);
  let fell = false, under = false, tFell = 0;
  for (let i = 0; i < 60 * 90 && ss.s < t.s + 25; i++) {
    ss.update(1 / 60, bot.input(1 / 60));
    for (const e of ss.takeEvents()) if (e.type === 'hazard' && e.kind === 'treedown') { fell = true; under = e.under; tFell = ss.s; }
  }
  assert.ok(fell && t.state === 'down', 'the tree comes down');
  assert.ok(!under && tFell < t.s - 3, 'it lands in front of the truck, not on it');
  assert.ok(tr.bumpAt(t.log.x, t.log.z) > 0.35, 'the trunk is now a real obstacle');
  assert.ok(ss.s >= t.s + 25, 'and there is still a way past');
  tr.setLayer(null);
});

test('animals: cross when it is safe, wait for traffic, and are never run down by a careful driver', () => {
  const f = find('herd', ['jungle-entry', 'tour-swamp', 'forest-entry'], ['easy', 'medium']);
  assert.ok(f, 'expected a herd');
  const mk = () => new DriveSession(f.def.build(), buildParams(f.def.bot.vehicle, f.def.bot.ups, f.def.bot.gear), { obstacles: { difficulty: f.tier } });
  let ss = mk();
  let hz = ss.hazards, tr = ss.track, t = hz.triggers.find((x) => x.type === 'herd');
  const herd = () => t.bodies.map((id) => hz.bodies[id]);
  const lat = (b) => { const i = tr.locateMain(b.x, b.z, tr._idxS(b.s)); return { d: (b.x - tr.PX[i]) * tr.TZ[i] - (b.z - tr.PZ[i]) * tr.TX[i], hw: tr.HW[i] }; };
  assert.ok(herd().every((b) => b.state === 'idle' && Math.abs(lat(b).d) > lat(b).hw + 4), 'the herd starts off the road');
  // truck parked well back: they all cross to the far side
  place(ss, t.s + 1);
  run(ss, 70, { hand: true });
  assert.ok(herd().every((b) => b.state === 'graze' && lat(b).d * -b.def.side > lat(b).hw), 'the whole herd crosses');
  assert.equal(hz.strikes, 0);
  // truck driven through by the test driver: it stops for them and nobody gets hit
  ss = mk(); hz = ss.hazards; tr = ss.track; t = hz.triggers.find((x) => x.type === 'herd');
  place(ss, t.s - 20);
  const bot = new BotDriver(ss);
  const zone = hz.layer.challenges.find((c) => c.type === 'herd' && c.s0 <= t.s && c.s1 >= t.s);
  for (let i = 0; i < 60 * 150 && ss.s < zone.s1 + 5; i++) { ss.update(1 / 60, bot.input(1 / 60)); ss.takeEvents(); }
  assert.ok(ss.s >= zone.s1 + 5, 'the truck gets through');
  assert.equal(hz.strikes, 0, 'no animal is hit');
  // ploughing in flat out is the driver's fault: a strike is recorded
  ss = mk(); hz = ss.hazards; tr = ss.track; t = hz.triggers.find((x) => x.type === 'herd');
  place(ss, t.s + 1);
  run(ss, 6, { hand: true });
  const b = herd().find((x) => x.state === 'cross') || herd()[0];
  const i = tr.locateMain(b.x, b.z, tr._idxS(b.s));
  ss.vehicle.reset(b.x - tr.TX[i] * 4, tr.heightAt(b.x - tr.TX[i] * 4, b.z - tr.TZ[i] * 4), b.z - tr.TZ[i] * 4, Math.atan2(tr.TX[i], tr.TZ[i]));
  ss.vehicle.v[0] = tr.TX[i] * 14; ss.vehicle.v[2] = tr.TZ[i] * 14;
  const ev = run(ss, 1.2, { gas: 1 });
  assert.ok(hz.strikes >= 1 && ev.some((e) => e.type === 'animalHit'), 'hitting an animal is recorded');
  tr.setLayer(null);
});

test('zones: crosswind pushes the truck, a squall drops grip and visibility', () => {
  const g = find('gust', ['lava-ridge', 'tour-snow', 'tour-desert'], ['medium', 'hard']);
  assert.ok(g, 'expected a crosswind zone');
  let ss = new DriveSession(g.def.build(), buildParams(g.def.bot.vehicle, g.def.bot.ups, g.def.bot.gear), { obstacles: { difficulty: g.tier } });
  let t = ss.hazards.triggers.find((x) => x.type === 'gust');
  place(ss, (t.s + t.s1) / 2);
  let peak = 0;
  for (let i = 0; i < 60 * 8; i++) { ss.update(1 / 60, { hand: true }); peak = Math.max(peak, Math.abs(ss.hazards.wind)); }
  assert.ok(peak > 0.5 && Math.sign(ss.hazards.wind || t.dir) === t.dir, 'wind blows inside the zone');
  place(ss, t.s - 30);
  ss.update(1 / 60, {});
  assert.equal(ss.hazards.wind, 0, 'and not outside it');
  ss.track.setLayer(null);

  const q = find('squall', ['jungle-entry', 'tour-desert', 'sand-dunes', 'forest-entry'], ['medium', 'hard', 'extreme']);
  assert.ok(q, 'expected a squall');
  ss = new DriveSession(q.def.build(), buildParams(q.def.bot.vehicle, q.def.bot.ups, q.def.bot.gear), { obstacles: { difficulty: q.tier } });
  t = ss.hazards.triggers.find((x) => x.type === 'squall');
  place(ss, t.s - 40);
  run(ss, 1);
  const before = { grip: ss.weather.grip, fog: ss.weather.fog };
  place(ss, (t.s + t.s1) / 2);
  run(ss, 8, { hand: true });
  assert.ok(ss.weather.fog < before.fog - 0.1 || ss.weather.grip < before.grip - 0.05, 'the squall closes in');
  place(ss, t.s1 + 60);
  run(ss, 10, { hand: true });
  assert.ok(Math.abs(ss.weather.fog - before.fog) < 0.08, 'and clears again');
  ss.track.setLayer(null);
});

test('rules: clearing pays (coins + fuel), recovering forfeits and returns to the entrance, results survive a resume', () => {
  const def = TRACKS[0];
  const mk = (o = {}) => new DriveSession(def.build(), buildParams(def.bot.vehicle, def.bot.ups, def.bot.gear), { obstacles: true, ...o });
  let ss = mk();
  assert.equal(ss.hazards.layer.cfg.difficulty, 'medium', 'Standard difficulty uses the medium tier');
  assert.equal(mk({ difficulty: 'hardcore' }).hazards.layer.cfg.difficulty, 'hard');
  assert.equal(new DriveSession(def.build(), jeep()).hazards, null, 'no layer unless asked for');
  ss = mk();
  const C = ss.hazards.layer.challenges;
  // recover inside the first challenge: back to its entrance, bonus gone
  place(ss, C[0].s0 + 6);
  run(ss, 0.2);
  assert.equal(ss.hazards.cur, 0);
  ss.recover();
  assert.ok(Math.abs(ss.track.S[ss.mainIdx] - (C[0].s0 - 8)) < 3, 'recovery point is the challenge entrance');
  assert.equal(ss.hazards.summary().cleared, 0);
  assert.equal(ss.hazards.ch[0].st, 4);
  const p = ss.track.roadPose(C[0].s0 - 8);
  assert.ok(Math.abs(ss.track.bumpAt(p.x, p.z)) < 0.05, 'the recovery point is clear ground');

  // a full run by the test driver
  ss = mk();
  ss.fuel = ss.params.fuelCap * 0.5;
  let topUps = 0, cleared = 0;
  const bot = new BotDriver(ss);
  let snap = null;
  for (let i = 0; i < 60 * 2400 && !ss.finished; i++) {
    ss.update(1 / 60, bot.input(1 / 60));
    for (const e of ss.takeEvents()) {
      if (e.type === 'challengeDone') { cleared++; if (e.fuel > 0) topUps++; }
      if (e.type === 'checkpoint' && e.index === 2) snap = JSON.parse(JSON.stringify(ss.snapshot()));
    }
  }
  assert.ok(ss.finished, 'the test driver finishes Forest Entry with obstacles on');
  const sum = ss.hazards.summary();
  assert.equal(sum.total, C.length);
  assert.ok(sum.cleared === cleared && sum.cleared >= sum.total - 1 && sum.clean >= 1 && topUps >= 1, JSON.stringify(sum));
  assert.equal(sum.strikes, 0);
  // rewards
  const cr = challengeRewards(def.reward, sum, 1);
  assert.ok(cr.total > 0 && cr.total < def.reward, `challenge coins ${cr.total} should matter without swamping the track reward ${def.reward}`);
  assert.ok(challengeRewards(def.reward, { ...sum, strikes: 3 }, 1).total < cr.total);
  const save = defaultSave();
  const res = applyResult(save, def.id, { time: 900, medal: 0, stars: 1, objectives: [], recoveries: 0, damage: 0, cachesFound: [], cacheRewards: [], relicsFound: [], rewardMult: 1, difficulty: 'Standard', difficultyId: 'standard', distance: 1, driveTime: 1, challenges: sum });
  assert.ok(res.lines.some((l) => /Obstacle challenges/.test(l.text)));
  assert.equal(save.stats.challenges, sum.cleared);
  // resume from the second checkpoint: earlier results are kept, events behind the truck are spent
  assert.ok(snap && snap.hz && snap.hz.ch.length === C.length);
  const r = mk({ resume: snap });
  const done = snap.hz.ch.filter((v) => v === 2 || v === 3).length;
  assert.ok(r.resumed && done >= 1 && r.hazards.summary().cleared === done);
  assert.ok(r.hazards.triggers.every((t) => (t.s1 || t.s) >= r.cpS || t.fired));
  ss.track.setLayer(null);
});

test('the test driver finishes with obstacles on every tier (sample of regions)', () => {
  for (const [id, tier] of [['fallen-forest', 'hard'], ['tour-mountain', 'extreme'], ['jungle-entry', 'extreme'], ['tour-desert', 'easy']]) {
    const def = getTrackDef(id);
    const ss = new DriveSession(def.build(), buildParams(def.bot.vehicle, def.bot.ups, def.bot.gear), { obstacles: { difficulty: tier } });
    const res = botRun(ss, 3000);
    assert.ok(res.finished, `${id} on ${tier}: stopped at ${res.s.toFixed(0)} m`);
    assert.ok(res.recoveries <= 3, `${id} on ${tier}: ${res.recoveries} recoveries`);
    assert.equal(ss.hazards.summary().strikes, 0, `${id} on ${tier}: animals hit`);
    ss.track.setLayer(null);
  }
});
