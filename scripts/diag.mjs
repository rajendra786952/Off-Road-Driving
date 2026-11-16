// node scripts/diag.mjs <trackId> [maxRecoveries]  - print what happens around each bot failure
import { getTrackDef } from '../src/drive/tracks/index.js';
import { DriveSession } from '../src/drive/core/session.js';
import { BotDriver } from '../src/drive/core/bot.js';
import { buildParams } from '../src/drive/core/specs.js';
const def = getTrackDef(process.argv[2]);
const maxRec = +(process.argv[3] || 3);
const track = def.build();
const ss = new DriveSession(track, buildParams(def.bot.vehicle, def.bot.ups, def.bot.gear));
const bot = new BotDriver(ss);
const hist = [];
const tally = { impact: 0, n: 0, total: 0 };
const where = [];
const dmgAt = {};
let t = 0, rec = 0;
while (!ss.finished && t < 3000 && rec < maxRec) {
  const inp = bot.input(1 / 60);
  const d0 = ss.damage;
  ss.update(1 / 60, inp);
  for (const e of ss.takeEvents()) { if (e.type === 'impact') { tally.impact += e.dmg; tally.n++; where.push(ss.s.toFixed(0) + ':' + e.v.toFixed(1)); } }
  if (ss.damage > d0) { tally.total += ss.damage - d0; const k = Math.floor(ss.s / 100) * 100; dmgAt[k] = (dmgAt[k] || 0) + ss.damage - d0; }
  t += 1 / 60;
  if (Math.round(t * 60) % 30 === 0) {
    const v = ss.vehicle;
    const sh = track.roadShape(ss.mainIdx, 3);
    hist.push(`t=${t.toFixed(0)} s=${ss.s.toFixed(1)} d=${ss.d.toFixed(1)} v=${v.speed.toFixed(1)} up=${v.upY.toFixed(2)} pit=${(v.pitch * 57).toFixed(0)} roll=${(v.roll * 57).toFixed(0)} grade=${(sh.grade * 100).toFixed(0)}% surf=${v.wheels.map((w) => (w.grounded ? w.surface.name.slice(0, 4) : '-')).join(',')} slip=${v.wheels.map((w) => w.slip.toFixed(1)).join(',')} dig=${Math.max(...v.wheels.map((w) => w.dig)).toFixed(2)} belly=${v.bellyDrag.toFixed(2)} gas=${inp.gas.toFixed(2)} br=${inp.brake.toFixed(1)} low=${+inp.low} mode=${bot.mode} wat=${v.waterDepth.toFixed(2)} dmg=${ss.damage.toFixed(0)}`);
    if (hist.length > 16) hist.shift();
  }
  if (ss.recoveries > rec) { rec = ss.recoveries; console.log(`--- recovery #${rec} ---\n` + hist.join('\n')); hist.length = 0; }
}
console.log(ss.finished ? 'finished' : 'stopped', t.toFixed(0), 'fuel', (ss.fuel / ss.params.fuelCap).toFixed(2), 'damage gained', tally.total.toFixed(0), 'from body impacts', tally.impact.toFixed(0), 'n', tally.n, where.slice(0, 20).join(' '), ' | damage by 100m:', Object.entries(dmgAt).map(([k, v]) => k + ':' + v.toFixed(0)).join(' '));
