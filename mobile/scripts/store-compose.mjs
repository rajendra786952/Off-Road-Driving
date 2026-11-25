// Dresses the real gameplay pictures from store-play.mjs (docs/store/graphics/play/raw) with a headline,
// for the Google Play listing. Nothing is drawn that is not in the game: every picture is a real screenshot
// of the game; the cards and text around them are the only additions.
//   node scripts/store-compose.mjs
// Output (JPEG, no transparency, as Play Console requires):
//   docs/store/graphics/play/landscape/*.jpg   1920 x 1080   the right shape for a landscape-only game
//   docs/store/graphics/play/portrait/*.jpg    1080 x 1920   phone-portrait version: the landscape picture in a card plus a close-up
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs/store/graphics/play');
const raw = path.join(out, 'raw');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9339;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const meta = JSON.parse(fs.readFileSync(path.join(raw, 'meta.json'), 'utf8'));
const url = (name) => pathToFileURL(path.join(raw, name + '.png')).href;

const BRAND = 'OFFROAD RACING 4X4';
/** One entry per store screenshot. kind: play = gameplay (headline sits in the sky), menu = a menu screen (headline band above it). */
const SHOTS = [
  { n: '01', slug: 'conquer-the-offroad', l1: 'CONQUER', l2: 'THE OFFROAD', sub: 'Mountains, mud, rivers and rope bridges', raw: '01-hero', kind: 'play', tint: ['#1d4f8f', '#0b1f3a'], zoom: 1.35 },
  { n: '02', slug: 'master-extreme-hills', l1: 'MASTER', l2: 'EXTREME HILLS', sub: 'Steep climbs and plunging descents', raw: '02-hills', kind: 'play', tint: ['#3b6f9e', '#10243a'], zoom: 1.35 },
  { n: '03', slug: 'overcome-every-obstacle', l1: 'OVERCOME', l2: 'EVERY OBSTACLE', sub: 'Bridges, gaps, rocks, mud and water', raw: '03-obstacles', kind: 'play', tint: ['#1c7a6a', '#0a2a26'], zoom: 1.25 },
  { n: '04', slug: 'perform-amazing-stunts', l1: 'PERFORM', l2: 'AMAZING STUNTS', sub: 'Flips, big air and combo scores', raw: '04-stunts', kind: 'play', tint: ['#4a77b0', '#12263f'], zoom: 1.5 },
  { n: '05', slug: 'explore-10-unique-worlds', l1: 'EXPLORE', l2: '10 UNIQUE WORLDS', sub: 'Each one with its own ground, grip and hazards', kind: 'worlds', tint: ['#2a6a4a', '#0a2218'] },
  { n: '06', slug: 'drive-100-vehicles', l1: 'DRIVE', l2: '100 VEHICLES', sub: 'Jeeps, buggies, monster trucks, sports cars and more', kind: 'cars', tint: ['#6a3a8a', '#1a0e26'] },
  { n: '07', slug: 'upgrade-your-ride', l1: 'UPGRADE', l2: 'YOUR RIDE', sub: 'Engine, tyres, suspension, brakes and fuel tank', raw: 'garage-upgrades', kind: 'menu', tint: ['#7a4a1a', '#24140a'] },
  { n: '08', slug: '100-levels-endless-adventure', l1: '100 LEVELS.', l2: 'ENDLESS ADVENTURE', sub: 'Earn stars, unlock new worlds, beat every track', raw: 'levels-marsh', kind: 'menu', tint: ['#2a5a6a', '#0a1e26'], cardH: 650, pills: ['3 STARS PER LEVEL', 'A NEW WORLD EVERY 10 LEVELS', 'UNLOCK AS YOU PROGRESS'] },
];
const WORLD_NAMES = ['Green Valley', 'Pine Forest', 'Desert Storm', 'Rocky Mountains', 'Snow Mountain', 'Jungle Expedition', 'Mud Marsh', 'Neon City', 'Red Canyon', 'Volcanic Wasteland'];

const FONT = "'Arial Black','Segoe UI Black','Impact',sans-serif";
const css = (W, H) => `
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:${W}px;height:${H}px;overflow:hidden;background:#0b1620;font-family:'Segoe UI','Arial',sans-serif;color:#fff}
  .abs{position:absolute}
  .h1{font-family:${FONT};font-weight:900;letter-spacing:1px;line-height:.96;text-transform:uppercase;color:#fff;
      -webkit-text-stroke:0;text-shadow:0 4px 0 rgba(0,0,0,.55),0 8px 26px rgba(0,0,0,.55)}
  .h2{color:#ffd23f}
  .sub{font-weight:700;color:#eaf2f8;text-shadow:0 2px 10px rgba(0,0,0,.7)}
  .card{border-radius:34px;overflow:hidden;box-shadow:0 22px 60px rgba(0,0,0,.55),0 0 0 6px rgba(255,255,255,.14)}
  .card img{display:block}
  .brand{font-family:${FONT};letter-spacing:6px;color:#fff;opacity:.85;text-shadow:0 2px 8px rgba(0,0,0,.6)}
  .cap{font-family:${FONT};font-size:22px;letter-spacing:1px;text-shadow:0 2px 8px rgba(0,0,0,.8)}
`;
const bgBlur = (img, tint, W, H, dark = 0.62) => `
  <div class="abs" style="inset:0;background:linear-gradient(160deg,${tint[0]},${tint[1]})"></div>
  ${img ? `<img class="abs" src="${img}" style="left:-5%;top:-5%;width:110%;height:110%;object-fit:cover;filter:blur(26px) saturate(1.25);opacity:.55">` : ''}
  <div class="abs" style="inset:0;background:linear-gradient(180deg,rgba(6,12,20,${dark}) 0%,rgba(6,12,20,.18) 38%,rgba(6,12,20,.5) 100%)"></div>`;

// ---------- landscape 1920 x 1080
function landscape(s) {
  const W = 1920;
  const H = 1080;
  if (s.kind === 'play') {
    return `<style>${css(W, H)}</style>
      <img class="abs" src="${url(s.raw)}" style="left:0;top:0;width:${W}px;height:${H}px">
      <div class="abs" style="left:0;top:0;width:${W}px;height:${H}px;background:linear-gradient(90deg,rgba(5,12,22,.55) 0%,rgba(5,12,22,0) 46%)"></div>
      <div class="abs" style="left:64px;top:190px;white-space:nowrap">
        <div class="h1" style="font-size:${s.l2.length > 12 ? 88 : 112}px">${s.l1}</div>
        <div class="h1 h2" style="font-size:${s.l2.length > 12 ? 88 : 112}px;margin-top:6px">${s.l2}</div>
        <div class="sub" style="font-size:32px;margin-top:20px">${s.sub}</div>
      </div>`;
  }
  const head = `<div class="abs" style="left:70px;top:34px;width:1300px"><div class="h1" style="font-size:76px;white-space:nowrap">${s.l1} <span class="h2">${s.l2}</span></div><div class="sub" style="font-size:30px;margin-top:10px">${s.sub}</div></div>
    <div class="abs brand" style="right:60px;top:118px;font-size:20px;letter-spacing:4px">${BRAND}</div>`;
  if (s.kind === 'menu') {
    const cw = 1560;
    const ch = s.cardH || 877;
    const pills = (s.pills || []).map((p) => `<div class="cap" style="display:inline-block;margin:0 12px;padding:14px 28px;border-radius:40px;background:rgba(255,210,63,.95);color:#1a1205;text-shadow:none;font-size:26px">${p}</div>`).join('');
    return `<style>${css(W, H)}</style>${bgBlur(url(s.raw), s.tint, W, H, 0.55)}${head}
      <div class="abs card" style="left:${(W - cw) / 2}px;top:176px;width:${cw}px;height:${ch}px"><img src="${url(s.raw)}" style="width:${cw}px;height:877px"></div>
      <div class="abs" style="left:0;right:0;top:${176 + ch + 40}px;text-align:center">${pills}</div>`;
  }
  if (s.kind === 'worlds') {
    const cw = 344;
    const chh = 380;
    const tiles = WORLD_NAMES.map((name, i) => {
      const x = 70 + (i % 5) * (cw + 26);
      const y = 190 + Math.floor(i / 5) * (chh + 28);
      return `<div class="abs card" style="left:${x}px;top:${y}px;width:${cw}px;height:${chh}px;border-radius:24px;box-shadow:0 14px 36px rgba(0,0,0,.5),0 0 0 4px rgba(255,255,255,.16)">
        <img src="${url('world-' + String(i + 1).padStart(2, '0'))}" style="width:${cw}px;height:${chh}px;object-fit:cover;object-position:12% 60%">
        <div class="abs" style="left:0;right:0;bottom:0;height:80px;background:linear-gradient(0deg,rgba(0,0,0,.78),rgba(0,0,0,0))"></div>
        <div class="abs cap" style="left:16px;bottom:12px">${i + 1}. ${name.toUpperCase()}</div></div>`;
    }).join('');
    return `<style>${css(W, H)}</style>${bgBlur(url('world-04'), s.tint, W, H, 0.7)}${head}${tiles}`;
  }
  // cars: the garage picture beside the sheet of vehicles drawn by the game
  const sheet = pathToFileURL(path.join(raw, 'cars.png')).href;
  return `<style>${css(W, H)}</style>${bgBlur(url('garage-stats'), s.tint, W, H, 0.7)}${head}
    <div class="abs card" style="left:70px;top:190px;width:1000px;height:562px"><img src="${url('garage-stats')}" style="width:1000px;height:562px"></div>
    <div class="abs card" style="left:1110px;top:190px;width:740px;height:800px;background:#17232d"><img src="${sheet}" style="width:700px;margin:78px 20px 0"></div>
    <div class="abs cap" style="left:1134px;top:208px;font-size:26px;color:#ffd23f">24 OF THE 100 VEHICLES</div>
    <div class="abs card" style="left:70px;top:786px;width:1000px;height:200px;background:rgba(10,20,30,.78);padding:26px 34px"><div class="h1" style="font-size:42px;line-height:1.1">10 body styles <span class="h2">x</span> 10 series</div><div class="sub" style="font-size:28px;margin-top:12px">Each vehicle has its own speed, grip, braking and suspension. Buy with coins you earn driving.</div></div>`;
}

// ---------- portrait 1080 x 1920
function portrait(s) {
  const W = 1080;
  const H = 1920;
  const head = `<div class="abs" style="left:0;right:0;top:96px;text-align:center"><div class="h1" style="font-size:132px">${s.l1.replace(/\.$/, '')}${s.l1.endsWith('.') ? '.' : ''}</div><div class="h1 h2" style="font-size:${s.l2.length > 15 ? 84 : s.l2.length > 11 ? 98 : 132}px;margin-top:8px">${s.l2}</div><div class="sub" style="font-size:36px;margin:26px auto 0;max-width:900px">${s.sub}</div></div>`;
  const foot = `<div class="abs brand" style="left:0;right:0;bottom:46px;text-align:center;font-size:30px">${BRAND}</div>`;
  const cardW = 1000;
  const cardH = 562;
  if (s.kind === 'play' || s.kind === 'menu') {
    const m = meta[s.raw] || { cx: 960, cy: 600 };
    const z = s.zoom || 1.2;
    const dw = 1000;
    const dh = 690;
    // detail: show the area around the car (or the middle of a menu) magnified
    const scale = (dw / 1920) * z * 1.9; // picture pixels -> card pixels
    const cx = s.kind === 'play' ? m.cx : 960;
    const cy = s.kind === 'play' ? m.cy : 540;
    const left = Math.min(0, Math.max(dw - 1920 * scale, dw / 2 - cx * scale));
    const top = Math.min(0, Math.max(dh - 1080 * scale, dh / 2 - cy * scale));
    return `<style>${css(W, H)}</style>${bgBlur(url(s.raw), s.tint, W, H)}${head}
      <div class="abs card" style="left:40px;top:540px;width:${cardW}px;height:${cardH}px"><img src="${url(s.raw)}" style="width:${cardW}px;height:${cardH}px"></div>
      <div class="abs card" style="left:40px;top:1140px;width:${dw}px;height:${dh}px"><img src="${url(s.raw)}" style="position:absolute;width:${1920 * scale}px;left:${left}px;top:${top}px"></div>${foot}`;
  }
  if (s.kind === 'worlds') {
    const cw = 490;
    const chh = 236;
    const tiles = WORLD_NAMES.map((name, i) => {
      const x = 40 + (i % 2) * (cw + 20);
      const y = 520 + Math.floor(i / 2) * (chh + 22);
      return `<div class="abs card" style="left:${x}px;top:${y}px;width:${cw}px;height:${chh}px;border-radius:24px;box-shadow:0 12px 30px rgba(0,0,0,.5),0 0 0 4px rgba(255,255,255,.16)">
        <img src="${url('world-' + String(i + 1).padStart(2, '0'))}" style="width:${cw}px;height:${chh}px;object-fit:cover;object-position:12% 60%">
        <div class="abs" style="left:0;right:0;bottom:0;height:70px;background:linear-gradient(0deg,rgba(0,0,0,.78),rgba(0,0,0,0))"></div>
        <div class="abs cap" style="left:16px;bottom:10px;font-size:20px">${i + 1}. ${name.toUpperCase()}</div></div>`;
    }).join('');
    return `<style>${css(W, H)}</style>${bgBlur(url('world-04'), s.tint, W, H, 0.7)}${head}${tiles}${foot}`;
  }
  const sheet = pathToFileURL(path.join(raw, 'cars.png')).href;
  return `<style>${css(W, H)}</style>${bgBlur(url('garage-stats'), s.tint, W, H, 0.7)}${head}
    <div class="abs card" style="left:40px;top:540px;width:${cardW}px;height:${cardH}px"><img src="${url('garage-stats')}" style="width:${cardW}px;height:${cardH}px"></div>
    <div class="abs card" style="left:40px;top:1140px;width:${cardW}px;height:690px;background:#17232d"><img src="${sheet}" style="height:590px;margin:80px auto 0;display:block"></div>
    <div class="abs cap" style="left:70px;top:1162px;font-size:28px;color:#ffd23f">24 OF THE 100 VEHICLES</div>${foot}`;
}

async function main() {
  fs.mkdirSync(path.join(out, 'landscape'), { recursive: true });
  fs.mkdirSync(path.join(out, 'portrait'), { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'store-compose-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', '--allow-file-access-from-files', '--window-size=1280,720', 'about:blank'], { stdio: 'ignore' });
  try {
    let wsUrl;
    for (let i = 0; i < 60 && !wsUrl; i++) {
      try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch { /* starting */ }
      if (!wsUrl) await sleep(250);
    }
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0;
    const waiting = new Map();
    ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); } };
    const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id; waiting.set(n, (msg) => (msg.error ? rej(new Error(method + ': ' + msg.error.message)) : res(msg.result))); ws.send(JSON.stringify({ id: n, method, params })); });
    const tmp = path.join(profile, 'page.html');
    // feature graphic, 1024 x 500
    {
      await send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 500, deviceScaleFactor: 1, mobile: false });
      const fg = `<style>${css(1024, 500)}</style><img class="abs" src="${url('feature-base')}" style="left:0;top:0;width:1024px;height:500px">
        <div class="abs" style="left:0;right:0;top:0;height:260px;background:linear-gradient(180deg,rgba(5,12,22,.45),rgba(5,12,22,0))"></div>
        <div class="abs" style="left:0;right:0;top:28px;text-align:center"><div class="h1" style="font-size:84px">OFFROAD</div><div class="h1 h2" style="font-size:84px;margin-top:2px">RACING 4X4</div></div>`;
      fs.writeFileSync(tmp, `<!doctype html><meta charset="utf-8">${fg}`);
      await send('Page.navigate', { url: pathToFileURL(tmp).href });
      await sleep(1500);
      const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 94 });
      const file = path.join(out, 'feature-graphic-1024x500.jpg');
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      console.log(path.relative(root, file));
    }
    // store icon, 512 x 512: the launcher icon itself (assets/icon.png, drawn by gen-icons.mjs), so the store page
    // and the installed app show the same picture
    {
      const file = path.join(out, 'icon-512x512.png');
      await send('Emulation.setDeviceMetricsOverride', { width: 512, height: 512, deviceScaleFactor: 1, mobile: false });
      fs.writeFileSync(tmp, `<!doctype html><meta charset="utf-8"><style>${css(512, 512)}</style><img class="abs" src="${pathToFileURL(path.join(root, 'assets/icon.png')).href}" style="left:0;top:0;width:512px;height:512px">`);
      await send('Page.navigate', { url: pathToFileURL(tmp).href });
      await sleep(1200);
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      console.log(path.relative(root, file));
    }
    // `node scripts/store-compose.mjs brand` stops here: icon and feature graphic only
    for (const [dir, make, W, H] of process.argv[2] === 'brand' ? [] : [['landscape', landscape, 1920, 1080], ['portrait', portrait, 1080, 1920]]) {
      await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
      for (const s of SHOTS) {
        fs.writeFileSync(tmp, `<!doctype html><meta charset="utf-8">${make(s)}`);
        await send('Page.navigate', { url: pathToFileURL(tmp).href });
        await sleep(1800); // the big pictures decode
        const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 93 });
        const file = path.join(out, dir, `${s.n}-${s.slug}.jpg`);
        fs.writeFileSync(file, Buffer.from(data, 'base64'));
        console.log(path.relative(root, file));
      }
    }
    ws.close();
  } finally {
    chrome.kill();
    for (let i = 0; i < 10; i++) { await sleep(500); try { fs.rmSync(profile, { recursive: true, force: true }); break; } catch { /* locked */ } }
  }
}
main();
