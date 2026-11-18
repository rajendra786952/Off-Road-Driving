// node scripts/pars.mjs  - run the test driver on every track and write the
// gold par times into src/drive/tracks/meta.js. The test driver is deliberately careful (it never
// tops 35 km/h), so gold is set at 82% of its time: it finishes with silver, gold needs a committed human.
import fs from 'node:fs';
import { TRACKS } from '../src/drive/tracks/index.js';
import { DriveSession } from '../src/drive/core/session.js';
import { botRun } from '../src/drive/core/bot.js';
import { buildParams } from '../src/drive/core/specs.js';

const file = new URL('../src/drive/tracks/meta.js', import.meta.url);
let src = fs.readFileSync(file, 'utf8');
for (const def of TRACKS) {
  const ss = new DriveSession(def.build(), buildParams(def.bot.vehicle, def.bot.ups, def.bot.gear));
  const res = botRun(ss, 3000);
  if (!res.finished) { console.log(`${def.id}: bot FAILED - par unchanged`); continue; }
  const gold = Math.ceil((res.total * 0.82) / 10) * 10;
  const re = new RegExp(`(id: '${def.id}'[^\\n]*par: P\\()\\d+(\\))`);
  if (!re.test(src)) { console.log(`${def.id}: no par entry found`); continue; }
  src = src.replace(re, `$1${gold}$2`);
  console.log(`${def.id.padEnd(20)} bot ${res.total.toFixed(0)}s -> gold ${gold}s  fuel left ${(res.fuel * 100).toFixed(0)}%`);
}
fs.writeFileSync(file, src);
