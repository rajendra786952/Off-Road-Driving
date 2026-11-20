// How long does one physics step take?  npx tsx scripts/perf.ts [level] [steps]
// Prints the average cost per step, how much of it is the physics engine itself,
// and how many bodies the engine carries, so a change to streaming distances or
// solver settings can be judged by a number.
import Matter from 'matter-js';
import { GameWorld } from '../src/core/world';
import { botControls, newBot } from '../src/core/bot';
import { LEVELS } from '../src/data/levels';
import { getVehicle, defaultUpgrades } from '../src/data/vehicles';

let engineMs = 0;
const realUpdate = Matter.Engine.update;
Matter.Engine.update = function timed(...args: Parameters<typeof realUpdate>) {
  const t = performance.now();
  const r = realUpdate.apply(Matter.Engine, args);
  engineMs += performance.now() - t;
  return r;
};

const [lv = '60', n = '6000'] = process.argv.slice(2);
for (const id of [1, Number(lv), 100]) {
  const w = new GameWorld(LEVELS[id - 1], getVehicle('mountain-jeep'), defaultUpgrades());
  let bot = newBot();
  let bodies = 0;
  let steps = 0;
  let botMs = 0;
  engineMs = 0;
  const t0 = performance.now();
  for (let i = 0; i < Number(n); i++) {
    const tb = performance.now();
    const c = botControls(w, bot);
    botMs += performance.now() - tb;
    w.step(c.gas, c.brake);
    bodies += w.engine.world.bodies.length;
    steps++;
    if (w.state === 'ending') {
      if (w.endReason === 'win' || !w.continueFromCheckpoint()) break;
      bot = newBot();
    }
  }
  const ms = performance.now() - t0 - botMs;
  console.log(
    `level ${String(id).padStart(3)}: ${(ms / steps).toFixed(4)} ms/step ` +
      `(engine ${(engineMs / steps).toFixed(4)}, game rules ${((ms - engineMs) / steps).toFixed(4)}), ${(bodies / steps).toFixed(0)} bodies`,
  );
}
