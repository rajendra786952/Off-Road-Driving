// Plays levels with the test driver and prints every stunt landing it makes.
//   npx tsx scripts/stunt-report.ts <levelId> [carId] [flips=1|0] [brakes=1|0]
import { GameWorld } from '../src/core/world';
import { botControls, newBot } from '../src/core/bot';
import { LEVELS } from '../src/data/levels';
import { getVehicle, defaultUpgrades } from '../src/data/vehicles';

const [levelId = '7', carId = 'mountain-jeep', flips = '1', brakes = '1', gasOnly = '0'] = process.argv.slice(2);
const level = LEVELS[Number(levelId) - 1];
const log: string[] = [];
let w!: GameWorld;
w = new GameWorld(level, getVehicle(carId), defaultUpgrades(), (e) => {
  if (e.type === 'stunt' || e.type === 'damage' || e.type === 'end' || e.type === 'checkpoint') log.push(`x=${w.vehicle.x.toFixed(0)} ${JSON.stringify(e)}`);
});
const bot = newBot(1, flips === '1', brakes === '1');
for (let i = 0; i < 60 * 600; i++) {
  const c = gasOnly === '1' ? { gas: true, brake: false } : botControls(w, bot);
  w.step(c.gas, c.brake, c.front, c.back);
  if (w.state === 'ending') {
    if (w.endReason === 'win' || !w.continueFromCheckpoint()) break;
  }
}
console.log(log.join('\n'));
const r = w.result();
console.log(`L${levelId} ${carId}: ${r.reason} progress ${(r.progress * 100).toFixed(0)}% score ${r.stuntScore} front ${r.frontFlips} back ${r.backFlips} damage ${w.stunts.damage}`);
