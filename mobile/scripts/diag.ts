// Where does the test driver lose time or die? Tallies by obstacle type.
//   npx tsx scripts/diag.ts [from] [to] [carId]
import { GameWorld } from '../src/core/world';
import { botControls, newBot } from '../src/core/bot';
import { LEVELS } from '../src/data/levels';
import { getVehicle, defaultUpgrades } from '../src/data/vehicles';
const [from = '1', to = '40', carId = 'mountain-jeep'] = process.argv.slice(2);
const time: Record<string, number> = {}; const visits: Record<string, number> = {}; const deaths: Record<string, number> = {}; const worst: Record<string, string> = {};
for (let id = Number(from); id <= Number(to); id++) {
  const w = new GameWorld(LEVELS[id - 1], getVehicle(carId), defaultUpgrades());
  let bot = newBot(); const spent = new Map<number, number>();
  const at = (x: number) => w.features.find((f) => f.type !== 'checkpoint' && x > f.x0 - 150 && x < f.x1 + 150);
  for (let i = 0; i < 60 * 600; i++) {
    const c = botControls(w, bot); w.step(c.gas, c.brake, c.front, c.back);
    const f = at(w.vehicle.x); if (f) spent.set(f.id, (spent.get(f.id) ?? 0) + 1);
    if (w.state === 'ending') {
      if (w.endReason === 'win') break;
      const key = `${f ? f.type : 'open'}:${w.endReason}`; deaths[key] = (deaths[key] ?? 0) + 1; worst[key] = `L${id} x=${w.vehicle.x.toFixed(0)}`;
      if (!w.continueFromCheckpoint()) break; bot = newBot();
    }
  }
  for (const [fid, steps] of spent) { const f = w.features.find((q) => q.id === fid)!; const len = f.x1 - f.x0 + 300; const excess = steps - len / 10;
    time[f.type] = (time[f.type] ?? 0) + Math.max(0, excess) / 60; visits[f.type] = (visits[f.type] ?? 0) + 1;
    if (excess > 400) worst[f.type] = `L${id} x=${f.x0.toFixed(0)} ${(steps / 60).toFixed(0)}s`; }
}
console.log('seconds lost per visit (vs cruising at 10 px/step):');
for (const k of Object.keys(time).sort((a, b) => time[b] / visits[b] - time[a] / visits[a])) console.log(`  ${k.padEnd(10)} ${(time[k] / visits[k]).toFixed(1).padStart(6)}s over ${visits[k]} visits  ${worst[k] ?? ''}`);
console.log('deaths:'); for (const k of Object.keys(deaths).sort((a, b) => deaths[b] - deaths[a])) console.log(`  ${k.padEnd(16)} ${deaths[k]}  e.g. ${worst[k]}`);
