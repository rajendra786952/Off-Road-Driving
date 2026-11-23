// Captures the menu screens (home, garage) of the browser build for the Play Store listing.
//   1. npm run web -- --port 8090      (in another terminal)
//   2. node scripts/store-screens.mjs
// It drives a headless Chrome over its debugging port, so the pictures are taken at the exact
// pixel size asked for. Output: docs/store/graphics/ and docs/store/graphics/1024x500/.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs/store/graphics');
const URL_APP = process.env.APP_URL || 'http://localhost:8090';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'store-screens-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars',
  '--enable-unsafe-swiftshader', '--window-size=1920,1080', 'about:blank',
], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome is still starting
    }
    await sleep(250);
  }
  throw new Error('Chrome did not start');
}

try {
  const ws = new WebSocket(await target());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const n = ++id;
    waiting.set(n, (msg) => (msg.error ? rej(new Error(method + ': ' + msg.error.message)) : res(msg.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;
  // The browser build shows a grey box where the phone build shows a real ad. It is not part of the game: hide it.
  const HIDE_AD_BOX = "(() => { let n = 0; for (const el of document.querySelectorAll('div')) { if (el.children.length === 0 && el.textContent.startsWith('Ad banner placeholder')) { let box = el; while (box.parentElement && box.parentElement.textContent === el.textContent) box = box.parentElement; box.style.display = 'none'; n++; } } return n; })()";
  const shot = async (file) => {
    await evaluate(HIDE_AD_BOX);
    await sleep(400);
    const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 98 });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    console.log(path.relative(root, file));
  };

  // [layout width, layout height, pixels per layout point, output folder, file suffix]
  const sizes = [
    [960, 540, 2, out, ''],
    [1024, 500, 1, path.join(out, '1024x500'), '-1024x500'],
  ];
  for (const [w, h, scale, dir, suffix] of sizes) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: scale, mobile: false });
    await send('Page.navigate', { url: URL_APP });
    let ready = false;
    for (let i = 0; i < 480 && !ready; i++) {
      await sleep(500);
      ready = await evaluate('!!globalThis.__ttNav').catch(() => false);
    }
    if (!ready) throw new Error('the game did not load (is the web server running on ' + URL_APP + '?)');
    // a player a little way into the game: some coins, the first worlds done
    await evaluate("(() => { const n = globalThis.__ttNav, s = n.getState().save; n.commitSave({ ...s, coins: 12500 }); return 1; })()");
    await evaluate("globalThis.__ttNav.navigate({ name: 'home' })");
    await sleep(2500);
    await shot(path.join(dir, `screen-home${suffix}.jpg`));
    await evaluate("globalThis.__ttNav.navigate({ name: 'garage' })");
    await sleep(4000); // the garage draws its car pictures after it opens
    await shot(path.join(dir, `screen-garage${suffix}.jpg`));
  }
  ws.close();
} finally {
  chrome.kill();
  // Chrome lets go of its profile folder a moment after it exits; a leftover temp folder is harmless
  for (let i = 0; i < 10; i++) {
    await sleep(500);
    try { fs.rmSync(profile, { recursive: true, force: true }); break; } catch { /* still locked */ }
  }
}
