// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { AdFrequencyManager, type FrequencyRules } from '../src/ads/AdFrequencyManager';
import { TEST_UNITS, isTestUnitId, isValidUnitId, resolveUnitId } from '../src/ads/units';
import {
  adUnlockableLevel, defaultSave, freeCoinsAmount, grantCarAd, grantCoins, grantLevelAd, highestUnlocked, isLevelUnlocked, migrateSave, recordRun,
} from '../src/state/save';
import { VEHICLES, adUnlockCost } from '../src/data/vehicles';
import { GameWorld } from '../src/core/world';
import { getLevel } from '../src/data/levels';
import { getVehicle, defaultUpgrades } from '../src/data/vehicles';
import { botControls, newBot } from '../src/core/bot';

const RULES: FrequencyRules = { everyNLevels: 3, minIntervalSec: 120, startGraceSec: 60, menuReturnAfterRuns: 2, maxPerSession: 3 };

function clocked() {
  let t = 1_000_000;
  const f = new AdFrequencyManager(RULES, () => t);
  return { f, wait: (sec: number) => (t += sec * 1000) };
}

test('interstitial: nothing in the first minute, then only every third completed level', () => {
  const { f, wait } = clocked();
  for (let i = 0; i < 3; i++) f.onLevelCompleted();
  assert.equal(f.shouldShowInterstitial('levelComplete'), false, 'start-up grace period');
  wait(61);
  assert.equal(f.shouldShowInterstitial('levelComplete'), true);
  f.markInterstitialShown();

  wait(500);
  f.onLevelCompleted();
  assert.equal(f.shouldShowInterstitial('levelComplete'), false, '1 level since the last ad');
  f.onLevelCompleted();
  assert.equal(f.shouldShowInterstitial('levelComplete'), false, '2 levels');
  f.onLevelCompleted();
  assert.equal(f.shouldShowInterstitial('levelComplete'), true, '3 levels');
});

test('interstitial: never two full-screen ads within the minimum interval', () => {
  const { f, wait } = clocked();
  wait(100);
  for (let i = 0; i < 3; i++) f.onLevelCompleted();
  f.markInterstitialShown();
  for (let i = 0; i < 6; i++) f.onLevelCompleted();
  wait(119);
  assert.equal(f.shouldShowInterstitial('levelComplete'), false);
  wait(2);
  assert.equal(f.shouldShowInterstitial('levelComplete'), true);
});

test('interstitial: a rewarded ad the player chose resets the interval', () => {
  const { f, wait } = clocked();
  wait(300);
  for (let i = 0; i < 3; i++) f.onLevelCompleted();
  f.markRewardedShown();
  assert.equal(f.shouldShowInterstitial('levelComplete'), false, 'not straight after a rewarded ad');
  wait(121);
  assert.equal(f.shouldShowInterstitial('levelComplete'), true);
});

test('interstitial: returning to the menu needs two runs without an ad, and there is a session cap', () => {
  const { f, wait } = clocked();
  wait(300);
  f.onRunEnded();
  assert.equal(f.shouldShowInterstitial('menuReturn'), false);
  f.onRunEnded();
  assert.equal(f.shouldShowInterstitial('menuReturn'), true);
  for (let n = 0; n < RULES.maxPerSession; n++) {
    f.markInterstitialShown();
    wait(200);
    f.onRunEnded();
    f.onRunEnded();
  }
  assert.equal(f.interstitialsShown, RULES.maxPerSession);
  assert.equal(f.shouldShowInterstitial('menuReturn'), false, 'session cap reached');
});

test('ad units: test units unless a well-formed production ID is supplied and allowed', () => {
  const prod = 'ca-app-pub-1234567890123456/1234567890';
  assert.equal(resolveUnitId('rewarded', 'android', prod, false), prod);
  assert.equal(resolveUnitId('rewarded', 'android', prod, true), TEST_UNITS.android.rewarded, 'development always uses test ads');
  assert.equal(resolveUnitId('banner', 'ios', undefined, false), TEST_UNITS.ios.banner, 'missing ID falls back to a test unit');
  assert.equal(resolveUnitId('banner', 'ios', 'ca-app-pub-1234567890123456~1234567890', false), TEST_UNITS.ios.banner, 'an app ID is not a unit ID');
  assert.equal(isValidUnitId('  ' + prod + ' '), true);
  assert.equal(isValidUnitId('nonsense'), false);
  for (const os of ['android', 'ios'] as const) for (const id of Object.values(TEST_UNITS[os])) assert.ok(isValidUnitId(id) && isTestUnitId(id));
  assert.equal(isTestUnitId(prod), false);
});

test('reward: coins are added to the same save and counted', () => {
  const save = defaultSave();
  const amount = freeCoinsAmount(save);
  assert.ok(amount >= 400);
  const next = grantCoins(save, amount)!;
  assert.equal(next.coins, amount);
  assert.equal(next.ads.watched, 1);
  assert.equal(grantCoins(save, 0), null);
  assert.equal(grantCoins(save, -5), null);
  assert.deepEqual(next.levels, save.levels, 'progress untouched');
});

test('reward: ten vehicles can be unlocked with ads, each after exactly three', () => {
  const adCars = VEHICLES.filter((v) => adUnlockCost(v) > 0);
  assert.equal(adCars.length, 10);
  assert.equal(new Set(adCars.map((v) => v.style)).size, 10, 'one per body style');
  const car = adCars[0];
  let save = defaultSave();
  let r = grantCarAd(save, car.id)!;
  assert.equal(r.unlocked, false);
  save = r.save;
  assert.equal(save.unlockedVehicles.includes(car.id), false);
  r = grantCarAd(save, car.id)!;
  r = grantCarAd(r.save, car.id)!;
  assert.equal(r.unlocked, true);
  assert.ok(r.save.unlockedVehicles.includes(car.id));
  assert.equal(r.save.selectedVehicle, car.id);
  assert.equal(r.save.coins, 0, 'no coins spent');
  assert.equal(grantCarAd(r.save, car.id), null, 'an owned car earns nothing more');
  assert.equal(grantCarAd(save, 'monster-truck'), null, 'not an ad-unlockable car');
  assert.equal(grantCarAd(save, 'no-such-car'), null);
});

test('reward: an ad opens only the first locked level, once', () => {
  let save = defaultSave();
  assert.equal(adUnlockableLevel(save), 2);
  assert.equal(grantLevelAd(save, 3), null, 'cannot jump ahead');
  save = grantLevelAd(save, 2)!;
  assert.equal(isLevelUnlocked(save, 2), true);
  assert.equal(highestUnlocked(save), 2);
  assert.equal(grantLevelAd(save, 2), null, 'already open');
  assert.equal(adUnlockableLevel(save), 0, 'one skipped level at a time');
  assert.equal(grantLevelAd(save, 3), null);
  // finishing levels still works as before and stacks with the ad unlock
  const win = { reason: 'win' as const, win: true, stars: 3, coins: 10, totalCoins: 10, coinValue: 50, stuntBonus: 0, progress: 1, distance: 100 };
  save = recordRun(save, 2, win).save;
  assert.equal(isLevelUnlocked(save, 3), true);
  assert.equal(adUnlockableLevel(save), 4, 'after finishing the skipped level the next one can be skipped');
});

test('reward: ad progress survives saving and loading, and old saves still load', () => {
  let save = defaultSave();
  save = grantLevelAd(save, 2)!;
  save = grantCarAd(save, VEHICLES.find((v) => adUnlockCost(v) > 0)!.id)!.save;
  assert.deepEqual(migrateSave(JSON.parse(JSON.stringify(save))), save);

  const old = JSON.parse(JSON.stringify(defaultSave()));
  delete old.ads; // a save written before ads existed
  old.coins = 777;
  old.levels = { 1: { stars: 2, bestCoins: 40 } };
  const m = migrateSave(old);
  assert.equal(m.coins, 777);
  assert.equal(m.levels[1].stars, 2);
  assert.deepEqual(m.ads, { cars: {}, levels: [], watched: 0 });
  assert.deepEqual(migrateSave({ ads: { cars: { 'monster-truck': 2, junk: 9 }, levels: [1, 5, 5, 'x'], watched: -3 } }).ads, { cars: {}, levels: [5], watched: 0 });
});

test('extra life: offered once, only after the free continues are used', () => {
  const w = new GameWorld(getLevel(3), getVehicle('mountain-jeep'), defaultUpgrades());
  const bot = newBot();
  for (let i = 0; i < 4000 && !w.checkpoint; i++) {
    const c = botControls(w, bot);
    w.step(c.gas, c.brake);
  }
  assert.ok(w.checkpoint, 'reached a checkpoint');
  const coins = w.runCoins;
  const die = () => {
    w.fuel = 0;
    for (let i = 0; i < 2000 && w.state === 'playing'; i++) w.step(false, false);
    assert.equal(w.state, 'ending');
  };
  die();
  assert.equal(w.canRevive(), false, 'free continues come first');
  assert.equal(w.revive(), false);
  while (w.canContinue()) {
    assert.equal(w.continueFromCheckpoint(), true);
    die();
  }
  assert.equal(w.continuesLeft, 0);
  assert.equal(w.canRevive(), true);
  assert.equal(w.revive(), true);
  assert.equal(w.state, 'playing');
  assert.ok(w.fuel > 0);
  assert.ok(w.runCoins >= coins, 'coins collected so far are kept');
  die();
  assert.equal(w.canRevive(), false, 'only one extra life per run');
  assert.equal(w.revive(), false);
});
