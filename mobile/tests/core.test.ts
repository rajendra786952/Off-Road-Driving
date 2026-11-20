// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, LEVEL_COUNT, getFeatures, getLevel, starsForRatio } from '../src/data/levels';
import { THEMES, THEME_ORDER } from '../src/data/themes';
import { VEHICLES, VEHICLE_COUNT, computeStats, defaultUpgrades, displayStats, getVehicle, upgradeCost, UPGRADE_KEYS, MAX_UPGRADE } from '../src/data/vehicles';
import { FEATURE_UNLOCK, type FeatureType } from '../src/core/features';
import { createTerrainProfile } from '../src/core/terrain';
import { countCoins, pickupsForCell } from '../src/core/pickups';
import { GameWorld } from '../src/core/world';
import { runBot } from '../src/core/bot';
import { MAX_CONTINUES, SPAWN_X } from '../src/core/constants';
import { buyUpgrade, buyVehicle, choosePaint, defaultSave, highestUnlocked, isLevelUnlocked, migrateSave, recordRun, selectVehicle } from '../src/state/save';

test('there are 100 distinct levels in 10 environments', () => {
  assert.equal(LEVELS.length, 100);
  assert.equal(LEVEL_COUNT, 100);
  assert.equal(new Set(LEVELS.map((l) => l.name)).size, 100, 'names are unique');
  assert.equal(new Set(LEVELS.map((l) => l.terrain.seed)).size, 100, 'terrain seeds are unique');
  assert.equal(THEME_ORDER.length, 10);
  for (const id of THEME_ORDER) assert.equal(LEVELS.filter((l) => l.theme === id).length, 10);
  LEVELS.forEach((l, i) => assert.equal(l.id, i + 1));
});

test('difficulty ramps up', () => {
  const first = LEVELS[0];
  const last = LEVELS[99];
  assert.ok(last.length > first.length * 3);
  assert.ok(last.terrain.hill > first.terrain.hill);
  assert.ok(last.terrain.bumps > first.terrain.bumps);
  assert.ok(last.bonus > first.bonus);
  assert.equal(getFeatures(first).filter((f) => f.type !== 'checkpoint').length, 0, 'level 1 is an open road');
  assert.ok(getFeatures(last).length > 25);
});

test('every obstacle type appears, and none before its unlock level', () => {
  const seen = new Set<FeatureType>();
  const unlock = new Map(FEATURE_UNLOCK);
  for (const level of LEVELS) {
    for (const f of getFeatures(level)) {
      seen.add(f.type);
      if (f.type !== 'checkpoint') assert.ok(level.id - 1 >= unlock.get(f.type)!, `${f.type} on level ${level.id}`);
    }
    assert.ok(getFeatures(level).some((f) => f.type === 'checkpoint'), `level ${level.id} has a checkpoint`);
  }
  for (const [type] of FEATURE_UNLOCK) assert.ok(seen.has(type), `${type} is used`);
});

test('obstacle zones never overlap and stay inside the track', () => {
  for (const level of LEVELS) {
    const fs = getFeatures(level).filter((f) => f.type !== 'checkpoint');
    for (let i = 0; i < fs.length; i++) {
      assert.ok(fs[i].x0 > 1000, 'clear of the start');
      assert.ok(fs[i].x1 < level.length - 900, 'clear of the finish');
      if (i) assert.ok(fs[i].x0 >= fs[i - 1].x1, `level ${level.id}: ${fs[i - 1].type} overlaps ${fs[i].type}`);
    }
  }
});

test('terrain is continuous outside holes and flat at the start', () => {
  for (const id of [1, 37, 64, 100]) {
    const level = getLevel(id);
    const features = getFeatures(level);
    const p = createTerrainProfile(level.terrain, features);
    assert.ok(Math.abs(p.surfaceY(SPAWN_X) - 400) < 30);
    for (let x = 0; x < level.length; x += 40) {
      const inHole = features.some((f) => ['gap', 'bridge', 'platform', 'ramp'].includes(f.type) && x >= f.a - 80 && x <= f.b + 80);
      if (!inHole) assert.ok(Math.abs(p.heightAt(x + 40) - p.heightAt(x)) < 90, `level ${id}: step at x=${x}`);
      assert.ok(Number.isFinite(p.heightAt(x)));
    }
  }
});

test('pickups are deterministic and fuel cans are reachable', () => {
  for (const id of [5, 50, 95]) {
    const level = getLevel(id);
    const features = getFeatures(level);
    const p = createTerrainProfile(level.terrain, features);
    let coins = 0;
    for (let k = 1; k * 600 < level.length; k++) {
      const a = pickupsForCell(level.pickups, k, p.surfaceY, features);
      assert.deepEqual(a, pickupsForCell(level.pickups, k, p.surfaceY, features));
      for (const s of a) {
        if (s.type === 'coin' && s.x < level.length - 80) coins++;
        if (s.type === 'fuel') assert.ok(s.y > p.surfaceY(s.x) - 60 && s.y < p.surfaceY(s.x), 'fuel can sits on the ground');
      }
    }
    assert.equal(coins, countCoins(level.pickups, level.length));
  }
  assert.equal(starsForRatio(1), 3);
  assert.equal(starsForRatio(0.7), 2);
  assert.equal(starsForRatio(0.1), 1);
});

test('there are 100 distinct vehicles with the original four unchanged', () => {
  assert.equal(VEHICLES.length, 100);
  assert.equal(VEHICLE_COUNT, 100);
  assert.equal(new Set(VEHICLES.map((v) => v.id)).size, 100);
  assert.equal(new Set(VEHICLES.map((v) => v.name)).size, 100);
  assert.equal(new Set(VEHICLES.map((v) => `${v.colors.main}${v.colors.accent}${v.style}`)).size, 100, 'every car has its own look');
  assert.equal(new Set(VEHICLES.map((v) => v.style)).size, 10);
  const jeep = getVehicle('mountain-jeep');
  assert.equal(jeep.price, 0);
  assert.deepEqual(jeep.power, { accel: 0.024, maxWheelSpeed: 0.38, reaction: 0.00095, driveForce: 0.0085 });
  assert.equal(getVehicle('desert-pickup').price, 1800);
  assert.equal(getVehicle('rally-buggy').price, 3500);
  assert.equal(getVehicle('monster-truck').price, 4500);
  assert.equal(computeStats(jeep, defaultUpgrades()).brakeGrip, 0.88);
  assert.equal(computeStats(jeep, defaultUpgrades()).airTorque, 0.0016);
  for (let i = 1; i < VEHICLES.length; i++) assert.ok(VEHICLES[i].price >= VEHICLES[i - 1].price, 'sorted by price');
});

test('vehicles differ in speed, acceleration, handling, braking and suspension', () => {
  for (const stat of ['Speed', 'Acceleration', 'Handling', 'Braking', 'Suspension'] as const) {
    const values = new Set(VEHICLES.map((v) => displayStats(v, defaultUpgrades())[stat].toFixed(3)));
    assert.ok(values.size >= 10, `${stat} has ${values.size} distinct values`);
  }
  const v = VEHICLES[40];
  const maxed = { engine: MAX_UPGRADE, tires: MAX_UPGRADE, suspension: MAX_UPGRADE, brakes: MAX_UPGRADE, fuel: MAX_UPGRADE };
  const a = computeStats(v, defaultUpgrades());
  const b = computeStats(v, maxed);
  assert.ok(b.accel > a.accel && b.grip > a.grip && b.stiffness > a.stiffness && b.brakeGrip < a.brakeGrip && b.fuelCapacity > a.fuelCapacity);
  for (const k of UPGRADE_KEYS) assert.ok(upgradeCost(k, 2) > upgradeCost(k, 1));
});

test('save: economy and progression rules', () => {
  let save = defaultSave();
  assert.equal(isLevelUnlocked(save, 1), true);
  assert.equal(isLevelUnlocked(save, 2), false);
  assert.equal(buyVehicle(save, 'desert-pickup'), null, 'cannot buy without coins');

  const win = { reason: 'win' as const, win: true, stars: 2, coins: 60, totalCoins: 90, coinValue: 300, stuntBonus: 0, progress: 1, distance: 800 };
  let r = recordRun(save, 1, win);
  assert.equal(r.reward.bonus, LEVELS[0].bonus);
  assert.equal(r.reward.firstTime, true);
  assert.equal(r.reward.unlockedNext, true);
  save = r.save;
  assert.equal(save.coins, 300 + LEVELS[0].bonus);
  assert.equal(isLevelUnlocked(save, 2), true);
  assert.equal(highestUnlocked(save), 2);

  r = recordRun(save, 1, { ...win, stars: 1 });
  assert.equal(r.reward.bonus, Math.round(LEVELS[0].bonus * 0.25), 'replay pays a quarter');
  assert.equal(r.save.levels[1].stars, 2, 'best stars are kept');

  const lost = recordRun(save, 2, { ...win, reason: 'crash', win: false, stars: 0 });
  assert.equal(lost.reward.total, 300, 'a crash keeps the coins collected');
  assert.equal(isLevelUnlocked(lost.save, 3), false);

  save = { ...save, coins: 5000 };
  const bought = buyVehicle(save, 'desert-pickup')!;
  assert.equal(bought.coins, 3200);
  assert.equal(bought.selectedVehicle, 'desert-pickup');
  assert.equal(buyVehicle(bought, 'desert-pickup'), null, 'cannot buy twice');
  assert.equal(selectVehicle(bought, 'monster-truck'), null, 'cannot select a locked car');
  const up = buyUpgrade(bought, 'desert-pickup', 'engine')!;
  assert.equal(up.upgrades['desert-pickup'].engine, 2);
  assert.equal(up.coins, 3200 - upgradeCost('engine', 1));
  const painted = choosePaint(up, 'desert-pickup', 'sand')!;
  assert.equal(painted.paint['desert-pickup'].sel, 'sand');
  assert.equal(painted.coins, up.coins - 1500);
  assert.equal(choosePaint(painted, 'desert-pickup', 'stock')!.coins, painted.coins, 'owned paint is free to switch');
});

test('save: migration survives garbage', () => {
  assert.deepEqual(migrateSave(null), defaultSave());
  assert.deepEqual(migrateSave('nonsense'), defaultSave());
  const m = migrateSave({ coins: -5, unlockedVehicles: ['nope', 'rally-buggy'], selectedVehicle: 'nope', levels: { 3: { stars: 9 }, 999: { stars: 3 } }, upgrades: { 'rally-buggy': { engine: 99 } } });
  assert.equal(m.coins, 0);
  assert.deepEqual(m.unlockedVehicles, ['mountain-jeep', 'rally-buggy']);
  assert.equal(m.selectedVehicle, 'mountain-jeep');
  assert.equal(m.levels[3].stars, 3);
  assert.equal(m.levels[999], undefined);
  assert.equal(m.upgrades['rally-buggy'].engine, MAX_UPGRADE);
  const round = migrateSave(JSON.parse(JSON.stringify(m)));
  assert.deepEqual(round, m);
});

test('physics: the car settles on its wheels and drives forward', () => {
  const w = new GameWorld(getLevel(1), getVehicle('mountain-jeep'), defaultUpgrades());
  for (let i = 0; i < 90; i++) w.step(false, false);
  assert.equal(w.state, 'playing');
  assert.equal(w.vehicle.groundedWheels(), 2);
  assert.ok(Math.abs(w.vehicle.angle) < 0.2);
  const x0 = w.vehicle.x;
  const fuel0 = w.fuel;
  for (let i = 0; i < 120; i++) w.step(true, false);
  assert.ok(w.vehicle.x > x0 + 300, 'gas moves the car');
  assert.ok(w.fuel < fuel0, 'gas burns fuel');
  const v = w.speed;
  for (let i = 0; i < 40; i++) w.step(false, true);
  assert.ok(w.speed < v * 0.6, 'brake slows the car');
  for (let i = 0; i < 400 && w.state === 'playing'; i++) w.step(false, true);
  assert.ok(w.vehicle.x < x0 + 2000 && w.speed <= 0.5, 'holding brake stops, then reverses');
});

test('physics: runs are deterministic', () => {
  const run = () => {
    const w = new GameWorld(getLevel(12), getVehicle('rally-buggy'), defaultUpgrades());
    for (let i = 0; i < 900; i++) w.step(i % 50 < 38, false);
    return [w.vehicle.x, w.vehicle.y, w.fuel, w.runCoins];
  };
  assert.deepEqual(run(), run());
});

test('rules: running out of fuel ends the run, checkpoints allow a limited restart', () => {
  const events: string[] = [];
  const w = new GameWorld(getLevel(3), getVehicle('mountain-jeep'), defaultUpgrades(), (e) => events.push(e.type));
  const r = runBot(w);
  assert.ok(r.win, 'the test driver finishes level 3');
  assert.ok(events.includes('checkpoint') && events.includes('coin') && events.includes('fuel') && events.includes('end'));
  assert.ok(w.result().stars >= 1);

  const dry = new GameWorld(getLevel(1), getVehicle('mountain-jeep'), defaultUpgrades());
  dry.fuel = 0.5;
  for (let i = 0; i < 1500 && dry.state === 'playing'; i++) dry.step(true, false);
  assert.equal(dry.endReason, 'fuel');
  assert.equal(dry.canContinue(), false, 'no checkpoint reached yet');
  assert.equal(dry.continuesLeft, MAX_CONTINUES);
});

test('every environment has a complete palette', () => {
  for (const id of THEME_ORDER) {
    const th = THEMES[id];
    for (const key of ['skyTop', 'skyBottom', 'dirt', 'grass', 'rock', 'water', 'mud'] as const) assert.match(th[key], /^#[0-9a-f]{6}$/);
    assert.ok(th.decor.length >= 6 && th.friction > 0.5);
  }
});
