// Can a player win by holding the accelerator down? Plays levels with the throttle
// pinned (no brake, no air control) and, for comparison, with the full test driver.
//   npx tsx scripts/gas-only.ts            a spread of levels
//   npx tsx scripts/gas-only.ts 30 45 60   chosen levels
import { GameWorld } from '../src/core/world';
import { runBot } from '../src/core/bot';
import { LEVELS } from '../src/data/levels';
import { VEHICLES } from '../src/data/vehicles';
import type { Upgrades } from '../src/data/vehicles';

export function expectedSetup(levelIndex: number) {
  const car = VEHICLES[Math.min(VEHICLES.length - 1, Math.floor(levelIndex * 0.6))];
  const lv = 1 + Math.min(4, Math.floor(levelIndex / 20));
  const ups: Upgrades = { engine: lv, tires: lv, suspension: lv, brakes: lv, fuel: lv };
  return { car, ups };
}

/** Throttle held down for the whole run; the player may still restart from checkpoints. */
export function runGasOnly(w: GameWorld, maxSteps = 60 * 60 * 12) {
  let continues = 0;
  for (let i = 0; i < maxSteps; i++) {
    w.step(true, false);
    if (w.state !== 'ending') continue;
    if (w.endReason === 'win' || !w.continueFromCheckpoint()) break;
    continues++;
  }
  return { win: w.endReason === 'win', reason: w.endReason, progress: w.result().progress, continues, damage: w.stunts.damage };
}

if (process.argv[1]?.endsWith('gas-only.ts')) {
  const args = process.argv.slice(2).map(Number).filter(Boolean);
  const ids = args.length ? args : [6, 11, 15, 20, 26, 30, 36, 42, 50, 60, 70, 80, 90, 100];
  let gasWins = 0;
  let smartWins = 0;
  for (const id of ids) {
    const { car, ups } = expectedSetup(id - 1);
    const g = runGasOnly(new GameWorld(LEVELS[id - 1], car, ups));
    const s = runBot(new GameWorld(LEVELS[id - 1], car, ups));
    if (g.win) gasWins++;
    if (s.win) smartWins++;
    console.log(
      `L${String(id).padStart(3)} ${car.id.padEnd(14)} throttle only: ${g.win ? 'WON ' : 'LOST'} ${(g.progress * 100).toFixed(0).padStart(3)}% (${g.reason ?? 'win'}, ${g.continues} restarts)   test driver: ${s.win ? 'won' : 'lost'} ${(s.progress * 100).toFixed(0)}%`,
    );
  }
  console.log(`\nthrottle only won ${gasWins} of ${ids.length}; the test driver won ${smartWins} of ${ids.length}`);
}
