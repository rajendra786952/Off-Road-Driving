// Makes the Google Play promo video from the real game (browser build, same renderer as the app).
//   1. npm run web -- --port 8090      (another terminal; Node 22+)
//   2. FFMPEG=path/to/ffmpeg node scripts/store-video.mjs        (ffmpeg: e.g. the ffmpeg-static npm package)
// The built-in test driver plays each scene; every video frame is two physics steps drawn by the game's renderer
// (no HUD), so the clip is smooth however slow this machine is. ffmpeg adds the captions and the game's music.
// Output: docs/store/graphics/play/promo-1920x1080.mp4   (upload to YouTube, paste the link in Play Console)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFile = path.join(root, 'docs/store/graphics/play/promo-1920x1080.mp4');
const URL_APP = process.env.APP_URL || 'http://localhost:8090';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FONT = (process.env.FONT || 'C:/Windows/Fonts/ariblk.ttf').replace(':', '\\:');
const PORT = 9341;
const W = 1920;
const H = 1080;
const FPS = 30;
const only = process.argv[2]; // a scene number (1-based) for a quick test
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** from: where recording starts (a feature type, offset in px before it; or 'start'). secs: length of the scene. */
const SCENES = [
  { level: 3, car: 'mountain-jeep', from: 'start', secs: 4.5, l1: 'CONQUER', l2: 'THE OFFROAD' },
  { level: 53, car: 'mountain-jeep', from: ['bridge', 500], secs: 4.5, l1: 'CROSS', l2: 'ROPE BRIDGES' },
  { level: 47, car: 'rally-buggy', from: ['stunt', 700], secs: 5, l1: 'LAND', l2: 'AMAZING STUNTS' },
  { level: 75, car: 'mountain-jeep', from: ['ramp', 600], secs: 4, l1: 'EXPLORE', l2: '10 WORLDS' },
  { level: 95, car: 'monster-2', from: ['stunt', 700], secs: 4.5, l1: 'DRIVE', l2: '100 VEHICLES' },
  { level: 83, car: 'mountain-jeep', from: ['ramp', 600], secs: 4.5, l1: 'OFFROAD', l2: 'RACING 4X4', end: true },
];

async function main() {
  const scenes = only ? [SCENES[Number(only) - 1]] : SCENES;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'store-video-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--window-size=1280,720', 'about:blank'], { stdio: 'ignore' });

  // captions: two headline lines in the first part of each scene; the last scene keeps the game's name, centred
  const esc = (s) => s.replace(/'/g, '').replace(/:/g, '\\:');
  const filters = [];
  let t0 = 0;
  for (const s of scenes) {
    const a = (t0 + 0.25).toFixed(2);
    const b = (t0 + (s.end ? s.secs : Math.min(3, s.secs - 0.4))).toFixed(2);
    const base = `fontfile='${FONT}':borderw=6:bordercolor=0x10161d:shadowx=0:shadowy=6:shadowcolor=0x000000@0.5:enable='between(t,${a},${b})'`;
    if (s.end) {
      filters.push(`drawtext=${base}:text='${esc(s.l1)}':fontsize=150:fontcolor=white:x=(w-text_w)/2:y=150`);
      filters.push(`drawtext=${base}:text='${esc(s.l2)}':fontsize=150:fontcolor=0xffd23f:x=(w-text_w)/2:y=310`);
    } else {
      filters.push(`drawtext=${base}:text='${esc(s.l1)}':fontsize=96:fontcolor=white:x=80:y=90`);
      filters.push(`drawtext=${base}:text='${esc(s.l2)}':fontsize=96:fontcolor=0xffd23f:x=80:y=196`);
    }
    t0 += s.secs;
  }
  const total = t0;
  filters.push(`fade=t=in:st=0:d=0.4`, `fade=t=out:st=${(total - 0.6).toFixed(2)}:d=0.6`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const ff = spawn(FFMPEG, [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-stream_loop', '-1', '-i', path.join(root, 'assets/audio/music.wav'),
    '-vf', filters.join(','),
    '-af', `volume=0.8,afade=t=in:st=0:d=0.5,afade=t=out:st=${(total - 1).toFixed(2)}:d=1`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '160k', '-t', total.toFixed(2), '-movflags', '+faststart', outFile,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const ffDone = new Promise((res, rej) => ff.on('exit', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)))));
  const frame = (buf) => new Promise((res) => (ff.stdin.write(buf) ? res() : ff.stdin.once('drain', res)));

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
    const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 600)); return r.result.value; };
    await send('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });

    let n = 0;
    for (const s of scenes) {
      // a fresh page per scene: the game's own frame loop is stopped below and never comes back
      await send('Page.navigate', { url: URL_APP });
      for (let i = 0; i < 600; i++) { await sleep(500); if (await ev('!!globalThis.__ttNav && globalThis.__ttNav.getState().loaded').catch(() => false)) break; }
      await ev(`(() => { delete globalThis.__tt; const n = globalThis.__ttNav; const s = n.getState().save; n.commitSave({ ...s, selectedVehicle: ${JSON.stringify(s.car)}, unlockedVehicles: [...new Set([...s.unlockedVehicles, ${JSON.stringify(s.car)}])] }); n.startLevel(${s.level}); return 1; })()`);
      for (let i = 0; i < 200 && !(await ev('!!globalThis.__tt && !!globalThis.__tt.world')); i++) await sleep(150);
      await sleep(500);
      // stop the game's loop (only this script steps and draws from here), then drive to where the scene starts
      const info = await ev(`(() => {
        window.requestAnimationFrame = () => 0;
        const t = globalThis.__tt;
        const from = ${JSON.stringify(s.from)};
        if (from !== 'start') {
          const f = t.world.features.find((x) => x.type === from[0] && x.a > 900);
          const goal = f ? f.a - from[1] : 1500;
          for (let i = 0; i < 2000 && t.world.state === 'playing' && t.world.vehicle.x < goal; i++) t.drive(30);
        } else t.drive(20);
        t.renderer.resetCamera();
        for (let i = 0; i < 40; i++) t.renderer.update(16.7, ${W}, ${H});
        return { x: Math.round(t.world.vehicle.x), state: t.world.state, types: [...new Set(t.world.features.map((x) => x.type))].join(',') };
      })()`);
      console.log(`scene ${s.l1} ${s.l2}: level ${s.level}, starts at x=${info.x} (${info.state})  [${info.types}]`);
      const frames = Math.round(s.secs * FPS);
      for (let i = 0; i < frames; i++, n++) {
        const png = await ev(`(() => { const t = globalThis.__tt; t.drive(2); t.renderer.update(16.7, ${W}, ${H}); return t.snapshot(${W}, ${H}, ${Math.round((n * 1000) / FPS)}); })()`);
        await frame(Buffer.from(png, 'base64'));
        if (i % 30 === 0) process.stdout.write(`  ${i}/${frames}\r`);
      }
      console.log(`  state at end: ${await ev('globalThis.__tt.world.state')}        `);
    }
    ws.close();
  } finally {
    ff.stdin.end();
    chrome.kill();
    for (let i = 0; i < 10; i++) { await sleep(500); try { fs.rmSync(profile, { recursive: true, force: true }); break; } catch { /* locked */ } }
  }
  await ffDone;
  console.log(path.relative(root, outFile), (fs.statSync(outFile).size / 1e6).toFixed(1) + ' MB');
}
main().catch((e) => { console.error(e); process.exit(1); });
