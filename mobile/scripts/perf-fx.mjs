// Which of the new scenery layers cost the most? Times the renderer with each one switched off in turn.
// Software GL in headless Chrome is fill-rate bound, like a weak phone GPU, so the differences are the useful part.
//   node scripts/perf-fx.mjs [level]      (web build must be running on :8090)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9343;
const level = Number(process.argv[2] || 45);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-fx-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--enable-unsafe-swiftshader', '--window-size=1280,720', 'about:blank'], { stdio: 'ignore' });
try {
  let wsUrl;
  for (let i = 0; i < 60 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch { /* starting */ } if (!wsUrl) await sleep(250); }
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const waiting = new Map();
  ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); } };
  const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id; waiting.set(n, (msg) => (msg.error ? rej(new Error(msg.error.message)) : res(msg.result))); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value; };
  await send('Page.navigate', { url: process.env.APP_URL || 'http://localhost:8090' });
  for (let i = 0; i < 600; i++) { await sleep(500); if (await ev('!!globalThis.__ttNav').catch(() => false)) break; }
  await ev(`globalThis.__ttNav.startLevel(${level})`);
  for (let i = 0; i < 200 && !(await ev('!!globalThis.__tt && !!globalThis.__tt.world')); i++) await sleep(150);
  await sleep(500);
  await ev('globalThis.__tt.drive(700)');
  const run = async (label, off) => {
    await ev(`(() => { const r = globalThis.__tt.renderer; r.__keep = r.__keep || { drawForeground: r.drawForeground, drawVignette: r.drawVignette, drawLayer: r.drawLayer, drawSky: r.drawSky }; Object.assign(r, r.__keep); r.lite = false; ${off}; return 1; })()`);
    const t = await ev('globalThis.__tt.bench(120)');
    console.log(`${label.padEnd(26)} median ${t.median.toFixed(1)} ms   p95 ${t.p95.toFixed(1)} ms`);
  };
  await run('everything', '');
  await run('without vignette', 'r.drawForeground = () => {}');
  await run('without foreground', 'r.drawForeground = () => {}');
  await run('without 3 scenery layers', 'r.drawLayer = () => {}');
  await run('lite mode (auto at 30 fps)', 'r.lite = true');
  await run('without sky + layers', 'r.drawSky = () => {}; r.drawLayer = () => {}');
  ws.close();
} finally {
  chrome.kill();
  for (let i = 0; i < 10; i++) { await sleep(500); try { fs.rmSync(profile, { recursive: true, force: true }); break; } catch { /* locked */ } }
}
