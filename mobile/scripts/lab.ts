// One stunt ramp on an otherwise quiet road, flown by the test driver.
//   npx tsx scripts/lab.ts <kind 1-7> [carId] [hScale] [flips=1|0] [verbose]
import { GameWorld } from '../src/core/world';
import { botControls, newBot } from '../src/core/bot';
import { LEVELS } from '../src/data/levels';
import { getVehicle, defaultUpgrades } from '../src/data/vehicles';
import type { Feature } from '../src/core/features';
import { BLEND } from '../src/core/terrain';
import { landingLength, runUpLength } from '../src/core/stuntshape';

const [kindArg = '1', carId = 'mountain-jeep', hs = '1', flips = '1', verbose = ''] = process.argv.slice(2);
const kind = Number(kindArg);
const spans: Record<number, [number, number, number]> = { 1: [330, 80, 380], 2: [240, 58, 320], 3: [1150, 82, 205], 4: [300, 75, 480], 5: [320, 68, 480], 6: [340, 78, 300], 7: [1280, 82, 205] };
const [len, h, drop] = spans[kind];
const a = 3000;
const f: Feature = { id: 1, type: 'stunt', n: kind, a, b: a + len, h: h * Number(hs), d: drop * Number(hs), seed: 1, x0: a - runUpLength(kind) - BLEND, x1: a + len + landingLength(kind) + BLEND };
const level = { ...LEVELS[0], id: 1, length: 9000 };
const log: string[] = [];
let w!: GameWorld;
w = new GameWorld(level, getVehicle(carId), { engine: Number(process.env.UPS ?? 1), tires: Number(process.env.UPS ?? 1), suspension: Number(process.env.UPS ?? 1), brakes: Number(process.env.UPS ?? 1), fuel: 1 }, (e) => {
  if (e.type === 'stunt' || e.type === 'damage' || e.type === 'end') log.push(`  x=${w.vehicle.x.toFixed(0)} ${JSON.stringify(e)}`);
}, [f]);
const bot = newBot(1, flips === "1", true, 1.05);
let maxAir = 0;
for (let i = 0; i < 60 * 40; i++) {
  const c = botControls(w, bot);
  w.step(c.gas, c.brake, c.front, c.back);
  maxAir = Math.max(maxAir, w.stunts.airSteps);
  if (verbose && w.vehicle.x > a - 100 && w.vehicle.x < f.b + 700 && i % 5 === 0) {
    const v = w.vehicle;
    console.log(`x=${v.x.toFixed(0)} y=${v.y.toFixed(0)} vx=${v.chassis.velocity.x.toFixed(1)} vy=${v.chassis.velocity.y.toFixed(1)} ang=${v.angle.toFixed(2)} om=${v.chassis.angularVelocity.toFixed(3)} g=${v.groundedWheels()} rot=${w.stunts.rotation.toFixed(2)} air=${w.stunts.airSteps} k=${bot.k}/${bot.planned} dir=${bot.dir} ${c.gas ? 'G' : '-'}${c.brake ? 'B' : '-'}`);
  }
  if (w.state === 'ending' || w.vehicle.x > f.x1 + 200) break;
}
console.log(`kind ${kind} ${carId} h=${f.h.toFixed(0)} flips=${flips}: maxAir=${maxAir} steps, score=${w.stunts.points}, front=${w.stunts.frontFlips} back=${w.stunts.backFlips}, dmg=${w.stunts.damage}, state=${w.state} ${w.endReason ?? ''}`);
console.log(log.join('\n'));
