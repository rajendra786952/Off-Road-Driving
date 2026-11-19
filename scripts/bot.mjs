// Headless test drive:  node scripts/bot.mjs [trackId|all] [--trace]
// Runs the bot driver over tracks with the real physics + rules and prints
// completion time, recoveries, damage and fuel. Also validates route geometry.
import { TRACKS, getTrackDef } from '../src/drive/tracks/index.js';
import { DriveSession } from '../src/drive/core/session.js';
import { botRun } from '../src/drive/core/bot.js';
import { buildParams } from '../src/drive/core/specs.js';
import { fmtTime } from '../src/drive/core/session.js';
import { validateTrack } from '../src/drive/core/validate.js';

const arg = process.argv[2] || 'all';
const trace = process.argv.includes('--trace');
// --obstacles[=easy|medium|hard|extreme] drives with the generated obstacle layer (medium by default)
const obArg = process.argv.find((a) => a.startsWith('--obstacles'));
const obstacles = obArg ? { difficulty: obArg.split('=')[1] || 'medium' } : undefined;
const defs = arg === 'all' ? TRACKS : [getTrackDef(arg)];
let totalTime = 0;
for (const def of defs) {
  const t0 = Date.now();
  const track = def.build();
  const problems = validateTrack(track);
  const setup = process.argv.includes('--stock') ? { vehicle: 'mountain-jeep', ups: {}, gear: {} } : def.bot;
  const params = buildParams(setup.vehicle, setup.ups, setup.gear);
  const ss = new DriveSession(track, params, { obstacles });
  let next = 0;
  const res = botRun(ss, 3000, trace ? (t, s, bot) => {
    if (t >= next) {
      next += 5;
      const v = s.vehicle;
      console.log(`  t=${t.toFixed(0)} s=${s.s.toFixed(0)} v=${v.speed.toFixed(1)} y=${v.p[1].toFixed(1)} up=${v.upY.toFixed(2)} surf=${v.wheels[0].surface.name} mode=${bot.mode} rec=${s.recoveries} dmg=${s.damage.toFixed(0)}`);
    }
  } : null);
  totalTime += res.total;
  console.log(
    `${String(def.n).padStart(2)} ${def.id.padEnd(20)} ${res.finished ? 'FINISHED' : 'FAILED @' + res.s.toFixed(0)} ` +
    `len=${(res.length / 1000).toFixed(2)}km time=${fmtTime(res.time)} (+pen ${fmtTime(res.total)}) rec=${res.recoveries} dmg=${res.damage.toFixed(0)}% ` +
    `fuel=${(res.fuel * 100).toFixed(0)}%${ss.hazards ? (({ cleared, clean, total, strikes }) => ` ch=${cleared}/${total} clean=${clean} strikes=${strikes}`)(ss.hazards.summary()) : ''} avg=${(res.avgSpeed * 3.6).toFixed(0)}km/h max=${(res.maxSpeed * 3.6).toFixed(0)}km/h cps=${ss.cpNext}/${track.checkpoints.length} ` +
    `[${((Date.now() - t0) / 1000).toFixed(1)}s]${problems.length ? '\n   ! ' + problems.join('\n   ! ') : ''}`
  );
}
console.log(`total bot time ${fmtTime(totalTime)} over ${defs.length} track(s)`);
