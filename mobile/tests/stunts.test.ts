// Stunt physics and rules. Run with: npm test
// The flips below are flown by the test driver with the same two pedals a player has.
import test from 'node:test';
import assert from 'node:assert/strict';
import Matter from 'matter-js';
import { GameWorld, type GameEvent } from '../src/core/world';
import { botControls, newBot, runBot } from '../src/core/bot';
import { expectedSetup, runGasOnly } from '../scripts/gas-only';
import { LEVELS, getFeatures } from '../src/data/levels';
import { defaultUpgrades, getVehicle, computeStats, VEHICLES } from '../src/data/vehicles';
import { BLEND } from '../src/core/terrain';
import { COLLAPSE_FROM, type Feature } from '../src/core/features';
import { STUNT_KIND, STEEP_VALLEY, landingLength, runUpLength, stuntRamps } from '../src/core/stuntshape';
import { StuntTracker, flipPoints, gradeLimits, STUNT_POINTS, type StuntSample } from '../src/core/stunts';

const TAU = Math.PI * 2;
const SIZES: Record<number, [number, number, number]> = { 1: [330, 80, 380], 2: [240, 58, 320], 3: [1150, 82, 205], 4: [300, 75, 480], 5: [320, 68, 480], 6: [340, 78, 300], 7: [1280, 82, 205] };

function stuntFeature(kind: number, scale = 1, a = 3000): Feature {
  const [len, h, d] = SIZES[kind];
  return { id: 1, type: 'stunt', n: kind, a, b: a + len, h: h * scale, d: d * scale, seed: 1, x0: a - runUpLength(kind) - BLEND, x1: a + len + landingLength(kind) + BLEND };
}

const flat = { ...LEVELS[0], length: 9000 };

interface Flight {
  w: GameWorld;
  events: GameEvent[];
  maxAir: number;
  maxRotation: number;
  /** stunt points seen at any moment the car was in the air */
  pointsInAir: number[];
  takeoffX: number;
  landX: number;
}

/** Fly one ramp with the test driver (bold: it commits to a flip whenever there is time). */
function fly(carId: string, f: Feature, opts: { flips?: boolean; margin?: number; speed?: number } = {}): Flight {
  const events: GameEvent[] = [];
  const w = new GameWorld(flat, getVehicle(carId), defaultUpgrades(), (e) => events.push(e), [f]);
  const bot = newBot(1, opts.flips ?? true, true, opts.margin ?? 1.05);
  const out: Flight = { w, events, maxAir: 0, maxRotation: 0, pointsInAir: [], takeoffX: 0, landX: 0 };
  let wasAir = 0;
  for (let i = 0; i < 60 * 40; i++) {
    let c = botControls(w, bot);
    if (opts.speed !== undefined && w.vehicle.x < f.a + 150) c = { gas: w.vehicle.chassis.velocity.x < opts.speed, brake: w.vehicle.chassis.velocity.x > opts.speed + 1 };
    w.step(c.gas, c.brake, c.front, c.back);
    const air = w.stunts.airSteps;
    out.maxAir = Math.max(out.maxAir, air);
    out.maxRotation = Math.max(out.maxRotation, Math.abs(w.stunts.rotation));
    if (air > 0) out.pointsInAir.push(w.stunts.points);
    if (air > 10 && wasAir <= 10) out.takeoffX = w.vehicle.x;
    if (air === 0 && wasAir > 25) out.landX = w.vehicle.x;
    wasAir = air;
    if (w.state === 'ending' || w.vehicle.x > f.x1 + 600) break;
  }
  return out;
}

/** The car lifted far off the ground, to test the air controls without a ramp. */
function inAir(carId: string, angle = 0) {
  const w = new GameWorld(flat, getVehicle(carId), defaultUpgrades());
  for (let i = 0; i < 60; i++) w.step(false, false);
  const v = w.vehicle;
  for (const b of [v.chassis, ...v.wheels]) Matter.Body.setPosition(b, { x: b.position.x, y: b.position.y - 1500 });
  if (angle) {
    Matter.Body.setAngle(v.chassis, angle);
    for (const b of v.wheels) {
      const dx = b.position.x - v.chassis.position.x;
      const dy = b.position.y - v.chassis.position.y;
      Matter.Body.setPosition(b, { x: v.chassis.position.x + dx * Math.cos(angle) - dy * Math.sin(angle), y: v.chassis.position.y + dx * Math.sin(angle) + dy * Math.cos(angle) });
    }
  }
  return w;
}

function spinAfter(w: GameWorld, steps: number, front: boolean, back: boolean, gas = false, brake = false): number {
  const a0 = w.vehicle.angle;
  for (let i = 0; i < steps; i++) w.step(gas, brake, front, back);
  return w.vehicle.angle - a0;
}

// ---------------------------------------------------------------- 1. + 2. flips are real rotation

test('front flip: a ramp, the FRONT FLIP button in the air, one full turn of the real body, a clean landing', () => {
  const r = fly('mountain-jeep', stuntFeature(STUNT_KIND.large));
  assert.ok(r.maxRotation > TAU * 0.85, `the body turned ${(r.maxRotation / TAU).toFixed(2)} times`);
  assert.equal(r.w.stunts.frontFlips, 1);
  assert.equal(r.w.stunts.backFlips, 0);
  assert.ok(r.w.stunts.points >= STUNT_POINTS.flips[1] + STUNT_POINTS.perfectLanding, 'a flip and a perfect landing');
  assert.equal(r.w.state, 'playing');
  assert.ok(r.events.some((e) => e.type === 'stunt' && /FRONT FLIP/.test(e.text) && e.grade === 'perfect'));
});

test('back flip: the BACK FLIP button rotates the other way and is counted separately', () => {
  const r = fly('rally-buggy', stuntFeature(STUNT_KIND.steep, 1.15));
  assert.ok(r.w.stunts.backFlips >= 1, 'a back flip was landed');
  assert.equal(r.w.stunts.frontFlips, 0);
  assert.ok(r.events.some((e) => e.type === 'stunt' && /BACK FLIP/.test(e.text)));
});

test('a long drop gives enough air for a double flip (1,200 points before the landing bonus)', () => {
  const r = fly('rally-buggy', stuntFeature(STUNT_KIND.mountain));
  assert.equal(r.w.stunts.frontFlips, 2);
  assert.ok(r.events.some((e) => e.type === 'stunt' && /DOUBLE FRONT FLIP/.test(e.text)));
  assert.ok(r.w.stunts.points >= STUNT_POINTS.flips[2]);
});

test('every ramp kind can be driven and landed without flipping', () => {
  for (const kind of Object.values(STUNT_KIND)) {
    const r = fly('mountain-jeep', stuntFeature(kind), { flips: false });
    assert.equal(r.w.state, 'playing', `kind ${kind}: ${r.w.endReason}`);
    assert.ok(r.maxAir >= 25, `kind ${kind} gives air time (${r.maxAir} steps)`);
  }
});

// ---------------------------------------------------------------- 3. air control

test('air control rotates the body smoothly: no instant 360, gravity keeps pulling', () => {
  const w = inAir('mountain-jeep');
  const y0 = w.vehicle.y;
  const first = spinAfter(w, 3, true, false);
  assert.ok(first > 0 && first < 0.3, `3 steps of brake turned it ${first.toFixed(3)} rad`);
  const more = spinAfter(w, 17, true, false);
  assert.ok(first + more < Math.PI, 'a half turn takes longer than 20 steps');
  assert.ok(w.vehicle.y > y0, 'the car keeps falling while it turns');
  const nose = inAir('mountain-jeep');
  assert.ok(spinAfter(nose, 20, false, true) < 0, 'BACK FLIP lifts the nose (turns backwards)');
});

test('air control works only in the air: on the ground the pedals do not spin the body', () => {
  const ground = new GameWorld(flat, getVehicle('mountain-jeep'), defaultUpgrades());
  for (let i = 0; i < 90; i++) ground.step(false, false);
  assert.equal(ground.vehicle.groundedWheels(), 2);
  const turned = Math.abs(spinAfter(ground, 8, true, false));
  const air = inAir('mountain-jeep');
  const airTurn = Math.abs(spinAfter(air, 8, true, false));
  assert.ok(turned < 0.05, `on the ground the body turned only ${turned.toFixed(3)} rad`);
  assert.ok(airTurn > 0.25, `in the air it turned ${airTurn.toFixed(3)} rad`);
});

// ---------------------------------------------------------------- 6. vehicles differ

test('vehicles rotate differently: light buggies turn fast, heavy trucks slowly', () => {
  const turn = (id: string) => Math.abs(spinAfter(inAir(id), 24, true, false));
  const buggy = turn('rally-buggy');
  const jeep = turn('mountain-jeep');
  const pickup = turn('desert-pickup');
  const monster = turn('monster-truck');
  assert.ok(buggy > jeep, `buggy ${buggy.toFixed(2)} > jeep ${jeep.toFixed(2)}`);
  assert.ok(jeep > monster, `jeep ${jeep.toFixed(2)} > monster ${monster.toFixed(2)}`);
  assert.ok(jeep >= pickup * 0.95 && pickup > monster, `pickup ${pickup.toFixed(2)} sits between`);
  const stats = (id: string) => computeStats(getVehicle(id), defaultUpgrades());
  assert.ok(stats('rally-buggy').airTorque > stats('mountain-jeep').airTorque);
  assert.ok(stats('monster-truck').stability < stats('mountain-jeep').stability, 'the monster truck is harder to land');
  assert.ok(stats('suv-0').stability > stats('mountain-jeep').stability, 'the SUV lands more steadily');
  assert.equal(new Set(VEHICLES.map((v) => computeStats(v, defaultUpgrades()).airTorque.toFixed(6))).size >= 40, true, 'cars differ across the whole garage');
});

// ---------------------------------------------------------------- 3. momentum

test('momentum decides jump distance: a faster run-up flies further', () => {
  const slow = fly('mountain-jeep', stuntFeature(STUNT_KIND.large), { flips: false, speed: 7 });
  const fast = fly('mountain-jeep', stuntFeature(STUNT_KIND.large), { flips: false, speed: 12 });
  const dSlow = slow.landX - slow.takeoffX;
  const dFast = fast.landX - fast.takeoffX;
  assert.ok(slow.maxAir > 10 && fast.maxAir > 10, 'both left the ramp');
  assert.ok(dFast > dSlow * 1.15, `fast ${dFast.toFixed(0)} px vs slow ${dSlow.toFixed(0)} px`);
});

// ---------------------------------------------------------------- 4. braking

test('braking shortens the stopping distance, and better brakes stop sooner', () => {
  const stopDistance = (brakes: number, brake: boolean) => {
    const w = new GameWorld(flat, getVehicle('mountain-jeep'), { ...defaultUpgrades(), brakes });
    for (let i = 0; i < 160; i++) w.step(true, false);
    const x0 = w.vehicle.x;
    const v0 = w.speed;
    assert.ok(v0 > 7, 'running at speed');
    for (let i = 0; i < 240 && w.speed > 0.5; i++) w.step(false, brake);
    return w.vehicle.x - x0;
  };
  const coast = stopDistance(1, false);
  const braked = stopDistance(1, true);
  const upgraded = stopDistance(8, true);
  assert.ok(braked < coast * 0.5, `braking ${braked.toFixed(0)} px vs coasting ${coast.toFixed(0)} px`);
  assert.ok(upgraded < braked, `upgraded brakes ${upgraded.toFixed(0)} px vs stock ${braked.toFixed(0)} px`);
});

// ---------------------------------------------------------------- 7. + 8. landings and rewards

test('a bad landing hurts: the car is damaged or wrecked, and it earns nothing', () => {
  // dropped nose first from a height
  const w = inAir('mountain-jeep', 1.35);
  for (let i = 0; i < 400 && w.state === 'playing'; i++) w.step(false, false);
  assert.ok(w.state === 'ending' || w.stunts.damage > 0, `state ${w.state}, damage ${w.stunts.damage}`);
  assert.equal(w.stunts.points, 0);
  // flat landing from the same height pays nothing for a plain drop and costs only a little
  const good = inAir('mountain-jeep', 0);
  for (let i = 0; i < 400 && good.state === 'playing'; i++) good.step(false, false);
  assert.ok(good.stunts.damage < w.stunts.damage || w.state === 'ending');
});

test('stunt points are paid only when the car lands, and a failed landing does not pay the full reward', () => {
  const r = fly('mountain-jeep', stuntFeature(STUNT_KIND.large));
  const before = r.pointsInAir[0] ?? 0;
  assert.ok(r.pointsInAir.every((p) => p === before), 'no points while the car was in the air');
  assert.ok(r.w.stunts.points > before, 'paid after the landing');

  const t = new StuntTracker();
  const air = (angle: number): StuntSample => ({ angle, slope: 0, vx: 8, vy: 4, rearGrounded: false, frontGrounded: false, stability: 1, harsh: 1 });
  const land = (angle: number): StuntSample => ({ ...air(angle), rearGrounded: true, frontGrounded: true });
  // one full front flip, then land flat
  const run = (finalAngle: number) => {
    const tr = new StuntTracker();
    for (let i = 0; i < 60; i++) tr.update(air((i / 59) * TAU));
    let result = null;
    for (let i = 0; i < 20 && !result; i++) result = tr.update(land(finalAngle));
    return { tr, result };
  };
  const clean = run(TAU);
  assert.equal(clean.result?.grade, 'perfect');
  assert.equal(clean.tr.points, STUNT_POINTS.flips[1] + STUNT_POINTS.perfectLanding);
  const roof = run(TAU + Math.PI); // landed on its roof
  assert.equal(roof.result?.grade, 'crash');
  assert.equal(roof.tr.points, 0, 'a roof landing earns nothing');
  assert.ok(roof.tr.damage > 40);
  const rough = run(TAU + 0.7);
  assert.equal(rough.result?.grade, 'rough');
  assert.ok(rough.tr.points > 0 && rough.tr.points < flipPoints(1), 'a rough landing pays less than the full reward');
  assert.ok(gradeLimits(0.72).good < gradeLimits(1.25).good, 'a monster truck has less room for error');
  assert.equal(t.points, 0);
});

test('scoring table: double flips, combos and the multiplier', () => {
  assert.equal(flipPoints(1), 500);
  assert.equal(flipPoints(2), 1200);
  assert.ok(flipPoints(3) > flipPoints(2));
  const t = new StuntTracker();
  const air = (a: number): StuntSample => ({ angle: a, slope: 0, vx: 8, vy: 4, rearGrounded: false, frontGrounded: false, stability: 1, harsh: 1 });
  const jump = (dir: 1 | -1) => {
    for (let i = 0; i < 60; i++) t.update(air((dir * i * TAU) / 59));
    let r = null;
    for (let i = 0; i < 20 && !r; i++) r = t.update({ ...air(dir * TAU), rearGrounded: true, frontGrounded: true });
    return r!;
  };
  const a = jump(1); // front flip
  assert.equal(a.points, 500);
  assert.equal(t.frontFlips, 1);
  const b = jump(-1); // back flip in the same chain: multiplier 1.5 and the front + back combo
  assert.equal(b.points, 750);
  assert.equal(b.comboBonus, STUNT_POINTS.frontBackCombo);
  assert.equal(t.backFlips, 1);
  assert.equal(t.multiplier, 1.5);
  const c = jump(1);
  assert.equal(c.multiplier, 2);
  assert.equal(c.points, 1000);
  assert.equal(c.comboBonus, 0, 'the combo bonus is paid once per chain');
});

// ---------------------------------------------------------------- 5. tracks need both pedals

test('a steep descent needs the brake: the throttle alone wrecks the car, the driver who brakes gets through', () => {
  const depth = 340;
  const a = 3300;
  const n = Math.round(depth / 0.5 / 40) * 40;
  const f: Feature = { id: 1, type: 'steep', n, a, b: a + n + STEEP_VALLEY + Math.round(depth / 0.58 / 40) * 40, h: depth, seed: 1, x0: a - 300 - BLEND, x1: a + n + STEEP_VALLEY + 900 + BLEND };
  const drive = (mode: 'gas' | 'smart') => {
    const w = new GameWorld({ ...LEVELS[3], length: 12000 }, getVehicle('mountain-jeep'), defaultUpgrades(), () => {}, [f]);
    const bot = newBot(1, true, true);
    for (let i = 0; i < 60 * 60 && w.state === 'playing' && w.vehicle.x < f.x1; i++) {
      const c = mode === 'gas' ? { gas: true, brake: false } : botControls(w, bot);
      w.step(c.gas, c.brake, c.front, c.back);
    }
    return w;
  };
  const gas = drive('gas');
  const smart = drive('smart');
  assert.equal(smart.state, 'playing', 'braking down the slope gets through');
  assert.ok(smart.stunts.damage < 20);
  assert.ok(gas.state === 'ending' || gas.stunts.damage >= 40, `throttle only: ${gas.state}, damage ${gas.stunts.damage}`);
});

test('a collapsing bridge gives way under a car that crawls, and holds one that keeps moving', () => {
  const idx = LEVELS.findIndex((l, i) => i >= COLLAPSE_FROM && getFeatures(l).some((f) => f.type === 'bridge' && f.n === 1));
  assert.ok(idx >= COLLAPSE_FROM, 'collapsing bridges exist from level ' + (COLLAPSE_FROM + 1));
  assert.equal(getFeatures(LEVELS[COLLAPSE_FROM - 1]).some((f) => f.type === 'bridge' && f.n === 1), false);
  const f: Feature = { id: 1, type: 'bridge', n: 1, a: 3200, b: 3640, h: 0, seed: 1, x0: 3200 - 120 - BLEND, x1: 3640 + 120 + BLEND };
  const cross = (target: number) => {
    const w = new GameWorld(flat, getVehicle('mountain-jeep'), defaultUpgrades(), () => {}, [f]);
    const bot = newBot();
    for (let i = 0; i < 60 * 70 && w.state === 'playing' && w.vehicle.x < f.b + 200; i++) {
      const vx = w.vehicle.chassis.velocity.x;
      const crawl = w.vehicle.x > f.a - 30 && w.vehicle.x < f.b - 120;
      const c = crawl ? { gas: vx < target, brake: vx > target + 1 } : botControls(w, bot);
      w.step(c.gas, c.brake, c.front, c.back);
    }
    return w;
  };
  assert.equal(cross(10).state, 'playing');
  assert.equal(cross(1.5).endReason, 'fell');
});

// ---------------------------------------------------------------- 10. progression

test('levels introduce flips, steep slopes, ramp combinations and collapsing bridges in order', () => {
  const kindsOn = (from: number, to: number) => {
    const kinds = new Set<number>();
    for (let i = from; i < to; i++) for (const f of getFeatures(LEVELS[i])) if (f.type === 'stunt') kinds.add(f.n);
    return kinds;
  };
  assert.equal(kindsOn(0, 5).size, 0, 'levels 1-5 have no stunt ramps');
  assert.deepEqual([...kindsOn(5, 10)].sort(), [STUNT_KIND.large, STUNT_KIND.steep], 'levels 6-10 teach front and back flips');
  assert.ok(kindsOn(20, 30).has(STUNT_KIND.double) && kindsOn(20, 30).has(STUNT_KIND.uneven), 'levels 21-30 add double and uneven ramps');
  assert.ok(kindsOn(30, 50).has(STUNT_KIND.downhill) && kindsOn(30, 50).has(STUNT_KIND.mountain) && kindsOn(30, 50).has(STUNT_KIND.combo));
  const steepIn = (from: number, to: number) => LEVELS.slice(from, to).filter((l) => getFeatures(l).some((f) => f.type === 'steep')).length;
  assert.ok(steepIn(1, 5) >= 1, 'braking is taught early');
  assert.ok(steepIn(10, 20) >= 7, 'levels 11-20 are about steep slopes and controlled braking');
  // each level from 6 on has a stunt, and from 11 on a steep descent as well
  for (let i = 5; i < 100; i++) {
    const fs = getFeatures(LEVELS[i]);
    assert.ok(fs.some((f) => f.type === 'stunt' || f.type === 'ramp'), `level ${i + 1} has a jump`);
  }
  // layouts differ from level to level
  const sig = new Set(LEVELS.map((l) => getFeatures(l).map((f) => f.type + f.n).join(',')));
  assert.equal(sig.size, 100);
  // the generated ramps stay inside what their shapes allow
  for (const l of LEVELS) for (const f of getFeatures(l)) if (f.type === 'stunt') for (const r of stuntRamps(f)) assert.ok(r.a >= f.x0 && r.b <= f.x1);
});

// ---------------------------------------------------------------- 5. + 9. + 10. whole levels

test('holding the throttle cannot finish the advanced levels, while skilled driving can', () => {
  const ids = [33, 45, 55, 70, 85, 100];
  let gasWins = 0;
  for (const id of ids) {
    const { car, ups } = expectedSetup(id - 1);
    const gas = runGasOnly(new GameWorld(LEVELS[id - 1], car, ups));
    if (gas.win) gasWins++;
    const smart = runBot(new GameWorld(LEVELS[id - 1], car, ups));
    assert.ok(smart.win, `level ${id} can be finished with brake and air control (${smart.reason} at ${(smart.progress * 100).toFixed(0)}%)`);
  }
  assert.ok(gasWins <= 1, `throttle only won ${gasWins} of ${ids.length}`);
});

test('tutorial levels stay forgiving: levels 1-5 can be won with the throttle and a few brake taps', () => {
  for (const id of [1, 2, 3]) {
    const { car, ups } = expectedSetup(id - 1);
    assert.ok(runBot(new GameWorld(LEVELS[id - 1], car, ups)).win, `level ${id}`);
  }
});

test('flip buttons rotate the car in the air only, and flips pay coins at the finish line', () => {
  const press = (w: GameWorld, front: boolean, back: boolean, n: number) => {
    const a0 = w.vehicle.angle;
    for (let i = 0; i < n; i++) w.step(false, false, front, back);
    return w.vehicle.angle - a0;
  };
  assert.ok(press(inAir('mountain-jeep'), true, false, 12) > 0.2, 'FRONT FLIP turns the nose down');
  assert.ok(Math.abs(spinAfter(inAir('mountain-jeep'), 20, false, false, true, true)) < 0.01, 'gas and brake do not spin the car in the air');
  assert.ok(press(inAir('mountain-jeep'), false, true, 12) < -0.2, 'BACK FLIP lifts the nose');
  const ground = new GameWorld(flat, getVehicle('mountain-jeep'), defaultUpgrades());
  for (let i = 0; i < 90; i++) ground.step(false, false);
  const x0 = ground.vehicle.x;
  assert.ok(Math.abs(press(ground, true, false, 8)) < 0.05, 'no effect on the ground');
  assert.ok(Math.abs(ground.vehicle.x - x0) < 5, 'and it never drives the car');

  const r = fly('mountain-jeep', stuntFeature(STUNT_KIND.large));
  r.w.stunts.frontFlips = 2;
  assert.equal(r.w.result().flipBonus, 0, 'nothing until the track is finished');
  (r.w as unknown as { endReason: string }).endReason = 'win';
  assert.equal(r.w.result().flipBonus, (2 + r.w.stunts.backFlips) * 30);
});

test('after the finish line the car stops and never reverses', () => {
  const { car, ups } = expectedSetup(0);
  const w = new GameWorld(LEVELS[0], car, ups);
  const bot = newBot();
  for (let i = 0; i < 60 * 120 && w.state === 'playing'; i++) {
    const c = botControls(w, bot);
    w.step(c.gas, c.brake, c.front, c.back);
  }
  assert.equal(w.endReason, 'win');
  let furthest = w.vehicle.x;
  for (let i = 0; i < 60 * 6; i++) {
    w.step(false, false);
    furthest = Math.max(furthest, w.vehicle.x);
  }
  assert.ok(w.vehicle.x > furthest - 4, 'it did not roll or drive backwards (' + (furthest - w.vehicle.x).toFixed(1) + ' px)');
  assert.ok(Math.abs(w.speed) < 0.5, 'and it is stopped');
});
