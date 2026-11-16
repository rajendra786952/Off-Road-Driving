import test from 'node:test';
import assert from 'node:assert/strict';

import { createTerrainProfile, SEGMENT, BASE_Y } from '../src/game/core/terrainMath.js';
import { pickupsForCell, countCoins, CELL } from '../src/game/core/pickups.js';
import { migrateSave, defaultSave, upgradeCost, MAX_UPGRADE } from '../src/game/core/saveModel.js';
import { LEVELS, getLevelCoinTotal, makeEndlessConfig, starsForRatio } from '../src/game/config/levels.js';
import { VEHICLES, computeStats, displayStats } from '../src/game/config/vehicles.js';
import { CHUNK_SIZE } from '../src/game/config/constants.js';

test('chunk size is exactly two pickup cells', () => {
  assert.equal(CHUNK_SIZE, CELL * 2);
  assert.equal(CHUNK_SIZE % SEGMENT, 0);
});

test('terrain is deterministic and starts flat', () => {
  const a = createTerrainProfile(LEVELS[3].terrain);
  const b = createTerrainProfile(LEVELS[3].terrain);
  for (let x = -300; x < 9000; x += 123) assert.equal(a.heightAt(x), b.heightAt(x));
  for (let x = -500; x <= 0; x += 20) assert.equal(a.heightAt(x), BASE_Y);
});

test('terrain stays in a sane band and slopes are climbable', () => {
  for (const lvl of [...LEVELS, makeEndlessConfig()]) {
    const t = createTerrainProfile(lvl.terrain);
    let maxSlope = 0;
    for (let x = 0; x < 40000; x += SEGMENT) {
      const y = t.heightAt(x);
      assert.ok(y > BASE_Y - 420 && y < BASE_Y + 420, `height out of band at ${x}: ${y}`);
      maxSlope = Math.max(maxSlope, Math.abs(t.heightAt(x + SEGMENT) - y) / SEGMENT);
    }
    assert.ok(maxSlope < 0.95, `${lvl.name} max slope ${maxSlope.toFixed(2)} too steep`);
  }
});

test('surfaceY interpolates the physics samples', () => {
  const t = createTerrainProfile(LEVELS[0].terrain);
  const x = 1234;
  const i = Math.floor(x / SEGMENT);
  assert.equal(t.surfaceY(i * SEGMENT), t.heightAt(i * SEGMENT));
  const mid = t.surfaceY(i * SEGMENT + SEGMENT / 2);
  assert.ok(Math.abs(mid - (t.heightAt(i * SEGMENT) + t.heightAt((i + 1) * SEGMENT)) / 2) < 1e-9);
});

test('pickups are deterministic, ordered, and cell 0 is empty', () => {
  const cfg = LEVELS[2].pickups;
  assert.deepEqual(pickupsForCell(cfg, 0, () => 400), []);
  assert.deepEqual(pickupsForCell(cfg, 5, () => 400), pickupsForCell(cfg, 5, () => 400));
});

test('every level has coins and regular fuel cans', () => {
  for (const lvl of LEVELS) {
    assert.ok(getLevelCoinTotal(lvl) > 15, `${lvl.name} has too few coins`);
    const cells = Math.floor(lvl.length / CELL);
    const fuelCells = [];
    for (let k = 1; k <= cells; k++) {
      if (pickupsForCell(lvl.pickups, k, () => 0).some((p) => p.type === 'fuel')) fuelCells.push(k);
    }
    assert.ok(fuelCells.length >= 1, `${lvl.name} has no fuel cans`);
    // gap between cans never exceeds the configured interval
    for (let i = 1; i < fuelCells.length; i++) assert.ok(fuelCells[i] - fuelCells[i - 1] <= lvl.pickups.fuelInterval);
  }
});

test('coin count matches generated coins', () => {
  const lvl = LEVELS[4];
  let n = 0;
  for (let k = 1; k <= Math.floor((lvl.length - 120) / CELL); k++)
    for (const p of pickupsForCell(lvl.pickups, k, () => 0)) if (p.type === 'coin' && p.x < lvl.length - 80) n++;
  assert.equal(n, countCoins(lvl.pickups, lvl.length));
});

test('star thresholds', () => {
  assert.equal(starsForRatio(0), 1);
  assert.equal(starsForRatio(0.6), 2);
  assert.equal(starsForRatio(0.95), 3);
});

test('save migration: empty, v1 flat upgrades, corrupt values', () => {
  assert.deepEqual(migrateSave(null), defaultSave());

  const v1 = {
    coins: 321.9, bestDistance: 50,
    unlockedVehicles: ['mountain-jeep', 'ghost'],
    upgrades: { engine: 3, suspension: 2, tires: 1, fuel: 99 },
    completedLevels: [1, 2]
  };
  const s = migrateSave(v1);
  assert.equal(s.version, 3);
  assert.equal(s.coins, 321);
  assert.equal(s.upgrades['mountain-jeep'].engine, 3);
  assert.equal(s.upgrades['mountain-jeep'].fuel, MAX_UPGRADE);
  assert.equal(s.upgrades['desert-pickup'].engine, 1);
  assert.deepEqual(s.unlockedVehicles, ['mountain-jeep']);
  assert.equal(s.levels[2].stars, 1);

  const bad = migrateSave({ coins: 'abc', selectedVehicle: 'rally-buggy', upgrades: { 'rally-buggy': { engine: -5 } } });
  assert.equal(bad.coins, 0);
  assert.equal(bad.selectedVehicle, 'mountain-jeep'); // not unlocked
  assert.equal(bad.upgrades['rally-buggy'].engine, 1);
});

test('upgrade costs increase', () => {
  for (const key of ['engine', 'tires', 'suspension', 'fuel']) {
    let prev = 0;
    for (let l = 1; l < MAX_UPGRADE; l++) {
      const c = upgradeCost(key, l);
      assert.ok(c > prev);
      prev = c;
    }
  }
});

test('vehicle stats scale with upgrades and stay stable', () => {
  for (const v of VEHICLES) {
    const base = computeStats(v, { engine: 1, tires: 1, suspension: 1, fuel: 1 });
    const max = computeStats(v, { engine: 5, tires: 5, suspension: 5, fuel: 5 });
    assert.ok(max.accel > base.accel && max.maxWheelSpeed > base.maxWheelSpeed);
    assert.ok(max.grip > base.grip && max.fuelCapacity > base.fuelCapacity);
    assert.ok(max.stiffness <= 0.6);
    for (const val of Object.values(displayStats(v, { engine: 5, tires: 5, suspension: 5, fuel: 5 }))) {
      assert.ok(val >= 0 && val <= 1);
    }
  }
});
