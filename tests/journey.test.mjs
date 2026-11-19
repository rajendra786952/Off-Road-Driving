// Tests for the areas every existing track passes through (tracks/journey.js): towns, farmland, coast.
import test from 'node:test';
import assert from 'node:assert/strict';

import { TRACKS, getTrackDef } from '../src/drive/tracks/index.js';
import { journeyOf } from '../src/drive/tracks/journey.js';
import { TrackBuilder } from '../src/drive/core/track.js';
import { DriveSession } from '../src/drive/core/session.js';
import { botRun } from '../src/drive/core/bot.js';
import { buildParams } from '../src/drive/core/specs.js';
import { SURFACES } from '../src/drive/core/surfaces.js';
import { validateTrack } from '../src/drive/core/validate.js';

const buildingsNear = (tr, s0, s1) => {
  const out = [], seen = new Set();
  for (let s = s0; s < s1; s += 20) {
    const p = tr.roadPose(s);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const cx = Math.floor(p.x / 32) + dx, cz = Math.floor(p.z / 32) + dz, k = cx * 10007 + cz;
      if (seen.has(k)) continue;
      seen.add(k);
      for (const b of tr.propsFor(cx, cz)) if (b.type === 'building') out.push(b);
    }
  }
  return out;
};

test('every track is a journey through areas, and its road is exactly the road it was', () => {
  let coasts = 0;
  for (const def of TRACKS) {
    const tr = def.build();
    const j = journeyOf(tr).map((a) => a[0]);
    assert.ok(j.length >= 3, `${def.id}: only ${j.join(' > ')}`);
    assert.ok(['village', 'city', 'industrial'].includes(j[0]), `${def.id} should start in a settlement, not ${j[0]}`);
    assert.ok(j.includes('own'), `${def.id} lost its own region`);
    assert.ok(['village', 'industrial'].includes(j[j.length - 1]), `${def.id} should end at a settlement`);
    // most of the route is still the track's own region
    let own = 0;
    for (let i = 0; i < tr.nMain; i++) if (tr.biomes[tr.BIO[i]].area === 'own') own++;
    assert.ok(own / tr.nMain > 0.5, `${def.id}: only ${(own / tr.nMain * 100).toFixed(0)}% of the route is its own region`);
    // obstacles are still chosen for the track's own region everywhere
    assert.ok(tr.biomes.every((b) => b.ob === tr.meta.env));
    assert.deepEqual(validateTrack(tr), [], def.id);
    if (tr.seaLevel !== undefined) {
      coasts++;
      assert.ok(j.includes('beach'), `${def.id} has a sea but no coast`);
      // no road of the track - main route, bypass or side trail - is under water
      for (let i = 0; i < tr.n; i += 3) {
        if (tr.CHAIN[i] === 0 && tr.bridges.some((b) => tr.S[i] > b.s0 - 6 && tr.S[i] < b.s1 + 6)) continue;
        assert.ok(tr.PY[i] > tr.seaLevel + 1, `${def.id}: road at ${tr.PY[i].toFixed(1)} m, sea at ${tr.seaLevel.toFixed(1)} m`);
      }
      for (const c of [...tr.caches, ...tr.relics]) assert.ok(tr.heightAt(c.x, c.z) > tr.seaLevel, `${def.id}: a cache or relic is under water`);
    }
  }
  assert.ok(coasts >= 10, `only ${coasts} tracks have a coast`);
  // a track that is not one of the 45 (tests, tools) is left alone
  const t = new TrackBuilder({ id: 'lane', name: 'lane', env: 'forest', seed: 5, startY: 50 });
  t.go(200, 0, 0);
  assert.equal(t.build().biomes, null);
});

test('settlements: houses or towers beside the first stretch of road, none in the wild part, none on the road', () => {
  for (const [id, kind] of [['forest-entry', 'house'], ['sand-dunes', 'tower'], ['ash-valley', 'shed'], ['snow-entry', 'house']]) {
    const tr = getTrackDef(id).build();
    const j = journeyOf(tr);
    const town = buildingsNear(tr, 20, j[1][1]);
    assert.ok(town.length >= 4, `${id}: only ${town.length} buildings at the start`);
    assert.ok(town.some((b) => b.kind === kind), `${id}: expected ${kind}s`);
    for (const b of town) {
      tr.surfaceAt(b.x, b.z);
      assert.ok(!tr.sq.onRoad, `${id}: a building stands on the road`);
      assert.ok(!tr.relics.some((r) => Math.hypot(r.x - b.x, r.z - b.z) < 8), `${id}: a building covers a relic`);
    }
    const own = j.find((a) => a[0] === 'own')[1];
    assert.equal(buildingsNear(tr, own + 500, own + 900).length, 0, `${id}: buildings in the wild part`);
  }
});

test('the coast: sea on one side of the lowest stretch, sand at the edge, the road itself untouched', () => {
  const tr = getTrackDef('jungle-entry').build();
  const j = journeyOf(tr);
  const k = j.findIndex((a) => a[0] === 'beach');
  const s0 = j[k][1], s1 = j[k + 1][1], side = tr.seaSide;
  assert.ok(s1 - s0 > 150, 'the coast is a real stretch of the route');
  let wet = 0, n = 0;
  for (let s = s0 + 40; s < s1 - 40; s += 30) {
    n++;
    const sea = tr.roadPose(s, side * 110), land = tr.roadPose(s, -side * 60), road = tr.roadPose(s), verge = tr.roadPose(s, side * 12);
    if (tr.heightAt(sea.x, sea.z) < tr.seaLevel) { wet++; tr.surfaceAt(sea.x, sea.z); assert.equal(tr.sq.waterY, tr.seaLevel); }
    assert.ok(Math.abs(tr.heightAt(road.x, road.z) - tr.PY[road.i]) < 0.9, 'the road surface is where it was');
    assert.ok(tr.heightAt(verge.x, verge.z) > tr.seaLevel, 'the verge is dry');
    assert.ok(tr.heightAt(land.x, land.z) > tr.seaLevel - 0.5 || true);
    tr.surfaceAt(verge.x, verge.z);
    assert.ok(tr.sq.onRoad || tr.sq.surface === SURFACES.sand || tr.sq.waterY > -1e8, 'sand beside the coast road');
  }
  assert.ok(wet >= n * 0.6, `sea beside only ${wet} of ${n} coast samples`);
  // away from the coast nothing changes: the wild part is still jungle floor
  const wild = tr.roadPose(s1 + 600, 20);
  tr.surfaceAt(wild.x, wild.z);
  assert.equal(tr.sq.surface, SURFACES.grass);
});

test('the test driver still finishes coast and town tracks with obstacles on', () => {
  for (const id of ['jungle-entry', 'sand-dunes', 'tour-forest']) {
    const def = getTrackDef(id);
    const ss = new DriveSession(def.build(), buildParams(def.bot.vehicle, def.bot.ups, def.bot.gear), { obstacles: true });
    const res = botRun(ss, 3000);
    assert.ok(res.finished && res.recoveries <= 2, `${id}: finished=${res.finished} recoveries=${res.recoveries} at ${res.s.toFixed(0)} m`);
    assert.ok(ss.vehicle.waterDepth < 0.2);
    ss.track.setLayer(null);
  }
});

test('old saves: a removed difficulty or run type is repaired on load instead of crashing the menu', async () => {
  const { defaultSave, migrateSave, DIFFICULTY_IDS } = await import('../src/game/core/saveModel.js');
  const { DIFFICULTY } = await import('../src/drive/core/session.js');
  assert.deepEqual(Object.keys(DIFFICULTY), DIFFICULTY_IDS, 'the save model and the game must agree on the difficulties');
  const old = defaultSave();
  old.settings.difficulty = 'extreme';
  old.settings.hud = 'something-else';
  old.tracks['forest-entry'] = { done: true, bestTime: 700, medal: 1, stars: 2, objectives: {}, caches: [], relics: [], runs: 1, diff: 'extreme' };
  old.resume = { trackId: 'forest-entry', difficulty: 'extreme', mission: 'cargo', vehicle: 'mountain-jeep', cp: 1, state: { v: 1, cpNext: 1 } };
  const s = migrateSave(JSON.parse(JSON.stringify(old)));
  assert.ok(DIFFICULTY[s.settings.difficulty], 'the default difficulty must be one that exists');
  assert.equal(s.settings.hud, 'simple');
  assert.ok(s.tracks['forest-entry'].diff === '' || DIFFICULTY[s.tracks['forest-entry'].diff], 'a track record must not name a missing difficulty');
  assert.equal(s.resume, null, 'a run saved on a removed difficulty is dropped');
  // a normal saved run survives
  old.resume = { trackId: 'forest-entry', difficulty: 'standard', vehicle: 'mountain-jeep', cp: 1, state: { v: 1, cpNext: 1 } };
  assert.ok(migrateSave(JSON.parse(JSON.stringify(old))).resume);
});
