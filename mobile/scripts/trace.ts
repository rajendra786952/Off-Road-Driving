// Debug helper: npx tsx scripts/trace.ts <level> [carId] [everyNSteps] [maxSteps]
import { GameWorld } from '../src/core/world';
import { botControls, newBot } from '../src/core/bot';
import { LEVELS, getFeatures } from '../src/data/levels';
import { getVehicle, defaultUpgrades } from '../src/data/vehicles';

const [lv = '1', carId = 'mountain-jeep', every = '60', max = '3000', up = '1'] = process.argv.slice(2);
const u = Number(up);
const level = LEVELS[Number(lv) - 1];
console.log(getFeatures(level).map((f) => `${f.type}@${f.x0.toFixed(0)}-${f.x1.toFixed(0)} a=${f.a.toFixed(0)} b=${f.b.toFixed(0)} h=${f.h.toFixed(0)} n=${f.n.toFixed(0)}`).join('\n'));
const w = new GameWorld(level, getVehicle(carId), u > 1 ? { engine: u, tires: u, suspension: u, brakes: u, fuel: u } : defaultUpgrades(), (e) => {
  if (e.type !== 'dust' && e.type !== 'coin') console.log('   event', JSON.stringify(e));
});
const bot = newBot();
for (let i = 0; i < Number(max); i++) {
  const c = botControls(w, bot);
  w.step(c.gas, c.brake, c.front, c.back);
  const v = w.vehicle;
  if (i % Number(every) === 0) {
    console.log(
      `${i} x=${v.x.toFixed(0)} y=${v.y.toFixed(0)} gy=${w.groundY(v.x).toFixed(0)} vx=${v.chassis.velocity.x.toFixed(2)} vy=${v.chassis.velocity.y.toFixed(2)} ang=${v.angle.toFixed(2)} ` +
        `g=${v.groundedWheels()} gas=${+c.gas} br=${+c.brake} fuel=${w.fuel.toFixed(0)} props=${w.props.length}`,
    );
  }
  if (w.state === 'ending') {
    console.log('END', w.endReason, 'x', v.x.toFixed(0));
    break;
  }
}
