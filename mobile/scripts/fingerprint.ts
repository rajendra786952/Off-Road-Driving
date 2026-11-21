// Drives a few levels with the test driver and prints where the car ended up, to the last
// decimal.  npx tsx scripts/fingerprint.ts
// The physics is deterministic, so an optimisation that claims to change nothing must print
// exactly the same lines before and after.
import { GameWorld } from '../src/core/world';
import { botControls, newBot } from '../src/core/bot';
import { LEVELS } from '../src/data/levels';
import { getVehicle, defaultUpgrades } from '../src/data/vehicles';

for (const id of [1, 17, 33, 48, 60, 77, 91, 100]) {
  let events = 0;
  const w = new GameWorld(LEVELS[id - 1], getVehicle('mountain-jeep'), defaultUpgrades(), () => events++);
  let bot = newBot();
  let steps = 0;
  for (; steps < 9000; steps++) {
    const c = botControls(w, bot);
    w.step(c.gas, c.brake);
    if (w.state === 'ending') {
      if (w.endReason === 'win' || !w.continueFromCheckpoint()) break;
      bot = newBot();
    }
  }
  const v = w.vehicle;
  console.log(
    `level ${String(id).padStart(3)}: steps ${steps} end ${w.endReason} x ${v.x.toFixed(6)} y ${v.y.toFixed(6)} angle ${v.angle.toFixed(6)} ` +
      `fuel ${w.fuel.toFixed(6)} coins ${w.runCoins.toFixed(3)} events ${events} props ${w.props.length} pickups ${w.pickups.length}`,
  );
}
