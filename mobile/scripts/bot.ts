// Headless test driver.
//   npx tsx scripts/bot.ts                 every level, with a car a player could own by then
//   npx tsx scripts/bot.ts levels 12 40    a range of levels
//   npx tsx scripts/bot.ts cars            every car on levels 1 and 20
//   npx tsx scripts/bot.ts starter         every level with the stock starter jeep (information only)
import { GameWorld } from '../src/core/world';
import { runBot } from '../src/core/bot';
import { LEVELS, getFeatures } from '../src/data/levels';
import { VEHICLES, getVehicle, defaultUpgrades, type Upgrades } from '../src/data/vehicles';

/** The car and upgrade level the progression expects around this level. */
export function expectedSetup(levelIndex: number) {
  const car = VEHICLES[Math.min(VEHICLES.length - 1, Math.floor(levelIndex * 0.6))];
  const lv = 1 + Math.min(4, Math.floor(levelIndex / 20));
  const ups: Upgrades = { engine: lv, tires: lv, suspension: lv, brakes: lv, fuel: lv };
  return { car, ups };
}

const [mode = 'levels', a, b] = process.argv.slice(2);

function nearFeature(level: (typeof LEVELS)[number], x: number): string {
  const f = getFeatures(level).find((q) => x > q.x0 - 100 && x < q.x1 + 100);
  return f ? `${f.type}${f.type === 'stunt' ? f.n : ''}@${Math.round(f.a)}` : 'open road';
}
let failed = 0;

if (mode === 'cars') {
  for (const levelId of [1, 20]) {
    for (const car of VEHICLES) {
      let r = runBot(new GameWorld(LEVELS[levelId - 1], car, defaultUpgrades()));
      for (const pace of [0.85, 1.15, 0.7]) if (!r.win) r = runBot(new GameWorld(LEVELS[levelId - 1], car, defaultUpgrades()), pace);
      if (!r.win) failed++;
      console.log(`${r.win ? 'ok  ' : 'FAIL'} L${levelId} ${car.id.padEnd(16)} ${car.name.padEnd(24)} ${(r.steps / 60).toFixed(0).padStart(4)}s cont ${r.continues} ${r.win ? '' : `${r.reason} at ${(r.progress * 100).toFixed(0)}%`}`);
    }
  }
} else {
  const from = a ? Number(a) : 1;
  const to = b ? Number(b) : a ? Number(a) : LEVELS.length;
  for (let id = from; id <= to; id++) {
    const level = LEVELS[id - 1];
    const setup = mode === 'starter' ? { car: getVehicle('mountain-jeep'), ups: defaultUpgrades() } : expectedSetup(id - 1);
    // like a player, the driver may retry a level at a more careful or a bolder pace
    let r = runBot(new GameWorld(level, setup.car, setup.ups));
    let tries = 1;
    for (const pace of [0.85, 1.15, 0.7]) {
      if (r.win) break;
      r = runBot(new GameWorld(level, setup.car, setup.ups), pace);
      tries++;
    }
    if (!r.win) failed++;
    const kinds = [...new Set(getFeatures(level).map((f) => f.type))].join(',');
    console.log(
      `${r.win ? 'ok  ' : 'FAIL'} L${String(id).padStart(3)} ${level.name.padEnd(18)} ${(level.length / 20).toFixed(0).padStart(5)}m ${setup.car.id.padEnd(14)} ` +
        `${(r.steps / 60).toFixed(0).padStart(4)}s try ${tries} cont ${r.continues} fuel ${r.fuel.toFixed(0).padStart(3)} stars ${r.stars} ` +
        `${r.win ? '' : `${r.reason} at x=${r.x.toFixed(0)} (${(r.progress * 100).toFixed(0)}%) in ${nearFeature(level, r.x)} `}[${kinds}]`,
    );
  }
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
