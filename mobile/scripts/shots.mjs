// Takes gameplay pictures of the browser build, straight from the game's own renderer (no screen capture):
// it starts a level, lets the built-in test driver play N physics steps, and saves the renderer's PNG.
//   1. npm run web -- --port 8090      (another terminal; Node 22+)
//   2. node scripts/shots.mjs outDir 1920x1080 "level:steps[:car[:paint]]" ...
// e.g.  node scripts/shots.mjs docs/store/graphics/play 1920x1080 1:600 25:900:rally-buggy
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [outDir, size, ...specs] = process.argv.slice(2);
const [W, H] = size.split('x').map(Number);
const URL_APP = process.env.APP_URL || 'http://localhost:8090';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9335;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'shots-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--enable-unsafe-swiftshader', '--window-size=1280,720', 'about:blank'], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* starting */ }
    await sleep(250);
  }
  throw new Error('Chrome did not start');
}

try {
  const ws = new WebSocket(await target());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); } };
  const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id; waiting.set(n, (msg) => (msg.error ? rej(new Error(method + ': ' + msg.error.message)) : res(msg.result))); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; };
  await send('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL_APP });
  for (let i = 0; i < 600; i++) { await sleep(500); if (await ev('!!globalThis.__ttNav').catch(() => false)) break; }
  fs.mkdirSync(outDir, { recursive: true });
  for (const spec of specs) {
    const [level, steps = '0', car, paint] = spec.split(':');
    const setup = `(() => { const n = globalThis.__ttNav; const s = n.getState().save; ${car ? `const ids = new Set(s.unlockedVehicles); ids.add(${JSON.stringify(car)}); n.commitSave({ ...s, selectedVehicle: ${JSON.stringify(car)}, unlockedVehicles: [...ids] });` : ''} n.startLevel(${Number(level)}); return 1; })()`;
    await ev(setup);
    for (let i = 0; i < 200 && !(await ev('!!globalThis.__tt && !!globalThis.__tt.world')); i++) await sleep(150);
    await sleep(300);
    // the test driver steps the physics; the camera is snapped on the first draw
    // steps can also be "feat=bridge" or "feat=ramp+120": drive until the car is that far before the first feature of the type
    const run = steps.startsWith('feat=')
      ? `{ const [type, off] = ${JSON.stringify(steps.slice(5))}.split('+'); const f = t.world.features.find((x) => x.type === type && x.a > 600); if (f) { const goal = f.a - 260 + Number(off || 0); for (let i = 0; i < 900 && t.world.state === 'playing' && t.world.vehicle.x < goal; i++) t.drive(30); } }`
      : `t.drive(${Number(steps) || 0});`;
    const b64 = await ev(`(() => { const t = globalThis.__tt; ${run} t.renderer.resetCamera(); for (let i = 0; i < 40; i++) t.renderer.update(16.7, ${W}, ${H}); return t.snapshot(${W}, ${H}, ${(Number(steps) || 3000) * 16.7}); })()`);
    const file = path.join(outDir, `l${String(level).padStart(3, '0')}-${steps.replace(/[^a-z0-9+=]/gi, '_')}${car ? '-' + car : ''}.png`);
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    console.log(file);
  }
  ws.close();
} finally {
  chrome.kill();
  for (let i = 0; i < 10; i++) { await sleep(500); try { fs.rmSync(profile, { recursive: true, force: true }); break; } catch { /* locked */ } }
}
