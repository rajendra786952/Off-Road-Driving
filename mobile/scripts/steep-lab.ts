// A steep descent on an otherwise quiet road: does the throttle alone get through?
//   npx tsx scripts/steep-lab.ts [carId] [depth] [verbose]
import { GameWorld } from '../src/core/world';
import { botControls, newBot } from '../src/core/bot';
import { LEVELS } from '../src/data/levels';
import { getVehicle, defaultUpgrades } from '../src/data/vehicles';
import type { Feature } from '../src/core/features';
import { BLEND } from '../src/core/terrain';
import { STEEP_VALLEY } from '../src/core/stuntshape';

const [carId = 'mountain-jeep', depthArg = '250', verbose = ''] = process.argv.slice(2);
const depth = Number(depthArg);
const g = Math.min(1, (depth - 150) / 190);
const a = 3300;
const n = Math.round((depth / (0.33 + 0.17 * g)) / 40) * 40;
const b = a + n + STEEP_VALLEY + Math.round(depth / (0.5 + 0.12 * g) / 40) * 40;
const f: Feature = { id: 1, type: 'steep', n, a, b, h: depth, seed: 1, x0: a - 300 - BLEND, x1: b + 420 + BLEND };

for (const mode of ['smart', 'gas-only', 'half-throttle']) {
  const w = new GameWorld({ ...LEVELS[3], length: 12000 }, getVehicle(carId), defaultUpgrades(), () => {}, [f]);
  const bot = newBot(1, true, true);
  let maxV = 0;
  let vMin = 99;
  for (let i = 0; i < 60 * 60; i++) {
    let c = botControls(w, bot);
    if (mode === 'gas-only') c = { gas: true, brake: false };
    if (mode === 'half-throttle') c = { gas: i % 2 === 0, brake: false };
    w.step(c.gas, c.brake, c.front, c.back);
    const vx = w.vehicle.chassis.velocity.x;
    if (w.vehicle.x > a - 100 && w.vehicle.x < b + 300) {
      maxV = Math.max(maxV, vx);
      vMin = Math.min(vMin, vx);
    }
    if (verbose && w.vehicle.x > a - 100 && w.vehicle.x < b + 300 && i % 8 === 0) console.log(`  x=${w.vehicle.x.toFixed(0)} y=${w.vehicle.y.toFixed(0)} vx=${vx.toFixed(1)} g=${w.vehicle.groundedWheels()} ${c.gas ? 'G' : '-'}${c.brake ? 'B' : '-'}`);
    if (w.state === 'ending' || w.vehicle.x > f.x1 + 100) break;
  }
  console.log(`${mode.padEnd(14)} ${carId} depth ${depth}: ${w.state === 'ending' ? 'ENDED ' + w.endReason : 'passed'} at x=${w.vehicle.x.toFixed(0)} (zone ${a}..${b}) maxV ${maxV.toFixed(1)} minV ${vMin.toFixed(1)} damage ${w.stunts.damage}`);
}
