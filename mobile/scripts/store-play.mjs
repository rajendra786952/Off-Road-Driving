// Builds the Google Play phone screenshots from the real game (browser build, same renderer and UI as the app).
//   1. npm run web -- --port 8090      (another terminal; Node 22+)
//   2. node scripts/store-play.mjs [only-step]      steps: capture | compose
// capture: plays levels with the built-in test driver and takes real screenshots (HUD included) into docs/store/graphics/play/raw
// compose: dresses them with a headline: landscape 1920x1080 and portrait 1080x1920 into docs/store/graphics/play/
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs/store/graphics/play');
const raw = path.join(out, 'raw');
const URL_APP = process.env.APP_URL || 'http://localhost:8090';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9337;
const only = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The scenes. `drive` says how far the test driver plays before the picture. */
const SCENES = [
  { key: '01-hero', level: 33, car: 'mountain-jeep', drive: 'feat=hill+120' },
  { key: '02-hills', level: 46, car: 'mountain-jeep', drive: 'feat=steep+60' },
  { key: '03-obstacles', level: 53, car: 'mountain-jeep', drive: 'feat=bridge+150' },
  { key: '04-stunts', level: 47, car: 'rally-buggy', drive: 'air' },
];
const WORLD_LEVELS = [5, 15, 25, 35, 45, 55, 65, 75, 85, 95];

async function withChrome(fn) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'store-play-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--window-size=1280,720', 'about:blank'], { stdio: 'ignore' });
  try {
    let wsUrl;
    for (let i = 0; i < 60 && !wsUrl; i++) {
      try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch { /* starting */ }
      if (!wsUrl) await sleep(250);
    }
    if (!wsUrl) throw new Error('Chrome did not start');
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0;
    const waiting = new Map();
    ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); } };
    const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id; waiting.set(n, (msg) => (msg.error ? rej(new Error(method + ': ' + msg.error.message)) : res(msg.result))); ws.send(JSON.stringify({ id: n, method, params })); });
    const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value; };
    await fn({ send, ev });
    ws.close();
  } finally {
    chrome.kill();
    for (let i = 0; i < 10; i++) { await sleep(500); try { fs.rmSync(profile, { recursive: true, force: true }); break; } catch { /* locked */ } }
  }
}

const HIDE_AD_BOX = "(() => { for (const el of document.querySelectorAll('div')) { if (el.children.length === 0 && el.textContent.startsWith('Ad banner placeholder')) { let box = el; while (box.parentElement && box.parentElement.textContent === el.textContent) box = box.parentElement; box.style.display = 'none'; } } return 1; })()";

async function capture() {
  fs.mkdirSync(raw, { recursive: true });
  await withChrome(async ({ send, ev }) => {
    await send('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 3, mobile: false });
    await send('Page.navigate', { url: URL_APP });
    for (let i = 0; i < 600; i++) { await sleep(500); if (await ev('!!globalThis.__ttNav').catch(() => false)) break; }
    const shot = async (name) => {
      await ev(HIDE_AD_BOX);
      await sleep(250);
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(raw, name + '.png'), Buffer.from(data, 'base64'));
      console.log('raw/' + name + '.png');
    };
    for (let i = 0; i < 100 && !(await ev('globalThis.__ttNav.getState().loaded')); i++) await sleep(100);
    // a player part-way through the game: all worlds open, 3 stars on the first levels, coins to spend
    const stars = {};
    for (let i = 1; i <= 66; i++) stars[i] = { stars: i <= 44 ? 3 : i <= 58 ? (i % 3 ? 3 : 2) : i <= 65 ? (i % 2 ? 1 : 2) : 1, bestCoins: 20 };
    const owned = ['mountain-jeep', 'rally-buggy', 'suv-3', 'muscle-2', 'pickup-2', 'monster-2', 'van-1', 'sports-1', 'truck-1', 'buggy-1', 'jeep-2', 'hatch-1'];
    const upg = { 'rally-buggy': { engine: 5, tires: 4, suspension: 4, brakes: 3, fuel: 3 }, 'mountain-jeep': { engine: 3, tires: 2, suspension: 2, brakes: 2, fuel: 2 } };
    const setSave = (extra = {}) => ev(`(() => { const n = globalThis.__ttNav; const s = n.getState().save; n.commitSave({ ...s, coins: 18400, levels: ${JSON.stringify(stars)}, unlockedVehicles: [...new Set([...s.unlockedVehicles, ...${JSON.stringify(owned)}])], upgrades: ${JSON.stringify(upg)}, ...${JSON.stringify(extra)} }); return 1; })()`);
    await setSave();

    const playTo = async (key, level, car, drive) => {
      await ev(`(() => { const n = globalThis.__ttNav; const s = n.getState().save; n.commitSave({ ...s, selectedVehicle: ${JSON.stringify(car)} }); n.startLevel(${level}); return 1; })()`);
      for (let i = 0; i < 200 && !(await ev('!!globalThis.__tt && !!globalThis.__tt.world')); i++) await sleep(150);
      await sleep(600);
      if (drive === 'air') {
        // fly until the car is high in the air and turning over
        await ev(`(() => { const t = globalThis.__tt; const f = t.world.features.find((x) => x.type === 'stunt' && x.a > 600); const goal = f ? f.a - 300 : 2000; for (let i = 0; i < 1500 && t.world.vehicle.x < goal; i++) t.drive(30); return 1; })()`);
        for (let i = 0; i < 160; i++) {
          const rot = await ev(`(() => { const t = globalThis.__tt; t.drive(3); return [t.world.stunts.airSteps, Math.abs(t.world.stunts.rotation)]; })()`);
          if (rot[0] > 26 && rot[1] > 1.5) break;
        }
      } else {
        await ev(`(() => { const t = globalThis.__tt; const [type, off] = ${JSON.stringify(drive.slice(5))}.split('+'); const f = t.world.features.find((x) => x.type === type && x.a > 600); const goal = f ? f.a - 260 + Number(off || 0) : 3000; for (let i = 0; i < 1500 && t.world.state === 'playing' && t.world.vehicle.x < goal; i++) t.drive(30); return 1; })()`);
      }
      await ev('(() => { const t = globalThis.__tt; t.world.step = () => {}; return 1; })()');
      await sleep(900); // the camera glides to the car
      // where the car is in the 1920 x 1080 picture (the game draws at 960 x 540 points, scale = camera zoom)
      meta[key] = await ev('(() => { const t = globalThis.__tt, r = t.renderer, v = t.world.vehicle; return { cx: Math.round((v.x - r.camX) * r.zoom * 2), cy: Math.round((v.y - r.camY) * r.zoom * 2) }; })()');
    };
    const meta = {};
    for (const sc of SCENES) {
      if (only && !sc.key.includes(only)) continue;
      await playTo(sc.key, sc.level, sc.car, sc.drive);
      await shot(sc.key);
    }
    if (!only || only === 'feature') {
      // the feature graphic's background: the renderer's own picture, no HUD, drawn at 2048 x 1000
      await playTo('feature', 83, 'mountain-jeep', 'feat=ramp+0');
      const png = await ev('(() => { const t = globalThis.__tt; t.renderer.resetCamera(); for (let i = 0; i < 40; i++) t.renderer.update(16.7, 2048, 1000); return t.snapshot(2048, 1000, 40000); })()');
      fs.writeFileSync(path.join(raw, 'feature-base.png'), Buffer.from(png, 'base64'));
      console.log('raw/feature-base.png');
    }
    if (!only || only === 'worlds') {
      for (let i = 0; i < WORLD_LEVELS.length; i++) {
        await playTo(`world-${i + 1}`, WORLD_LEVELS[i], 'mountain-jeep', 'feat=checkpoint+40');
        const png = await ev('(() => { const t = globalThis.__tt; t.renderer.resetCamera(); for (let i = 0; i < 40; i++) t.renderer.update(16.7, 1280, 720); return t.snapshot(1280, 720, 40000); })()');
        fs.writeFileSync(path.join(raw, `world-${String(i + 1).padStart(2, '0')}.png`), Buffer.from(png, 'base64'));
        console.log(`raw/world-${String(i + 1).padStart(2, '0')}.png`);
      }
    }
    if (Object.keys(meta).length) fs.writeFileSync(path.join(raw, 'meta.json'), JSON.stringify({ ...(fs.existsSync(path.join(raw, 'meta.json')) ? JSON.parse(fs.readFileSync(path.join(raw, 'meta.json'), 'utf8')) : {}), ...meta }, null, 1));
    if (!only || only === 'menus') {
      await setSave({ selectedVehicle: 'rally-buggy' });
      await ev("globalThis.__ttNav.navigate({ name: 'garage' })");
      await sleep(4000);
      await shot('garage-stats');
      const click = async (text) => {
        const p = await ev(`(() => { for (const el of document.querySelectorAll('div,span')) { if (el.children.length === 0 && el.textContent.trim().toUpperCase().startsWith(${JSON.stringify(text)})) { const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; } } return null; })()`);
        if (!p) throw new Error('no ' + text);
        for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: p[0], y: p[1], button: 'left', clickCount: 1 });
        await sleep(900);
      };
      await click('UPGRADES');
      await shot('garage-upgrades');
      await click('PAINT');
      await shot('garage-paint');
      await ev("globalThis.__ttNav.navigate({ name: 'levels' })");
      await sleep(2500);
      await shot('levels');
      await click('7. MUD');
      await shot('levels-marsh');
      await ev("globalThis.__ttNav.navigate({ name: 'home' })");
      await sleep(2500);
      await shot('home');
      // the cars drawn by the game's own artwork: every fourth of the 100, on a dark sheet
      const sheet = await ev('globalThis.__ttNav.carSheet(0, 4, 4, 6)');
      fs.writeFileSync(path.join(raw, 'cars.png'), Buffer.from(sheet, 'base64'));
      console.log('raw/cars.png');
    }
  });
}

if (!only || only !== 'compose') await capture();
