// DOM HUD + touch / keyboard controls for the 3D drive mode.
// DOM (not canvas) so multi-touch, hit areas and text stay crisp on any screen.
import { fmtTime } from './core/session.js';

const CSS = `
.tt3d{position:fixed;inset:0;z-index:20;background:#0b1217;touch-action:none;user-select:none;-webkit-user-select:none;font-family:Arial,Helvetica,sans-serif;color:#fff;overflow:hidden}
.tt3d canvas.view{position:absolute;inset:0;width:100%;height:100%;display:block}
.tt3d .hud{position:absolute;inset:0;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}
.tt3d .hud>*{pointer-events:none}
.tt3d .btn{pointer-events:auto;position:absolute;display:flex;align-items:center;justify-content:center;border-radius:14px;background:rgba(14,26,34,.55);border:2px solid rgba(255,255,255,.35);font-weight:bold;color:#fff;text-shadow:0 1px 2px #000;-webkit-tap-highlight-color:transparent}
.tt3d .btn.on{background:rgba(255,210,63,.85);color:#1b1b1b;text-shadow:none;border-color:#fff}
.tt3d .btn.down{background:rgba(255,255,255,.4)}
.tt3d .btn.off{opacity:.3}
.tt3d .steer{bottom:3.5vh;width:15vh;height:15vh;font-size:7vh;border-radius:50%}
.tt3d .pedal{bottom:3.5vh;width:14vh;border-radius:16px;font-size:2.6vh;flex-direction:column;overflow:hidden}
.tt3d .pedal .fill{position:absolute;left:0;right:0;bottom:0;background:rgba(85,194,106,.55);height:0}
.tt3d .pedal span{position:relative}
.tt3d .small{width:10vh;height:8.5vh;font-size:2.1vh;line-height:1.1;text-align:center}
.tt3d .top{position:absolute;left:36vh;right:24vh;top:1.2vh;display:flex;justify-content:center;flex-wrap:wrap;gap:2.2vh;font-size:2.7vh;font-weight:bold;text-shadow:0 1px 3px #000}
.tt3d .top b{color:#ffd23f}
.tt3d .prog{position:absolute;left:50%;top:9.6vh;width:36vw;margin-left:-18vw;height:1vh;background:rgba(14,26,34,.7);border-radius:1vh}
.tt3d .prog i{display:block;height:100%;width:0;background:#ffd23f;border-radius:1vh}
.tt3d .prog u{position:absolute;top:-.5vh;width:.5vh;height:2vh;background:#fff;border-radius:.3vh}
.tt3d .prog u.done{background:#55c26a}
.tt3d .dash{position:absolute;left:calc(50% + 2vh);bottom:1.6vh;transform:translateX(-50%) scale(var(--ds,1));transform-origin:bottom center;display:flex;align-items:flex-end;gap:2vh;text-shadow:0 1px 3px #000}
.tt3d .speed{font-size:6.2vh;font-weight:bold;line-height:1;text-align:right;min-width:11vh}
.tt3d .speed small{font-size:1.9vh;display:block;font-weight:normal;opacity:.85}
.tt3d .bars{display:flex;flex-direction:column;gap:.7vh;width:22vh;font-size:1.7vh}
.tt3d .bar{height:1.5vh;background:rgba(14,26,34,.75);border-radius:.8vh;overflow:hidden}
.tt3d .bar i{display:block;height:100%;width:50%;background:#55c26a}
.tt3d .incl{width:9vh;height:9vh}
.tt3d .info{font-size:1.8vh;line-height:1.35;min-width:13vh}
.tt3d .map{position:absolute;right:1.4vh;top:1.4vh;width:21vh;height:21vh;border-radius:1.4vh;background:rgba(14,26,34,.5);border:1px solid rgba(255,255,255,.25)}
.tt3d .toast{position:absolute;left:50%;top:13vh;transform:translateX(-50%);max-width:62vw;text-align:center;font-size:2.5vh;font-weight:bold;background:rgba(14,26,34,.72);padding:1vh 2vh;border-radius:1.2vh;opacity:0;transition:opacity .35s;text-shadow:0 1px 2px #000}
.tt3d .toast.show{opacity:1}
.tt3d .warn{position:absolute;left:50%;top:24vh;transform:translateX(-50%);font-size:3vh;font-weight:bold;color:#ff7b72;text-shadow:0 2px 4px #000;display:none;text-align:center}
.tt3d .panel{pointer-events:auto;position:absolute;inset:0;background:rgba(6,12,16,.72);display:flex;align-items:center;justify-content:center}
.tt3d .card{background:#16242e;border:2px solid #2f4656;border-radius:2vh;padding:2.4vh 3.4vh;min-width:46vh;max-width:84vw;max-height:92vh;overflow:auto;text-align:center}
.tt3d .card h2{margin:0 0 1.2vh;font-size:4.4vh;color:#ffd23f}
.tt3d .card p{margin:.6vh 0;font-size:2.4vh}
.tt3d .card .row{display:flex;gap:1.4vh;justify-content:center;flex-wrap:wrap;margin-top:1.8vh}
.tt3d .card button{font:bold 2.6vh Arial;color:#fff;border:0;border-radius:1.2vh;padding:1.5vh 2.6vh;min-width:17vh;background:#3a4a56}
.tt3d .card button.go{background:#2f9e55}.tt3d .card button.alt{background:#2f6fa8}.tt3d .card button.bad{background:#7a2a2a}
.tt3d .card .obj{text-align:left;font-size:2.3vh;margin:.5vh auto;max-width:56vh}
.tt3d .card .obj.ok{color:#8dff9b}.tt3d .card .obj.no{color:#9aa9b3}
.tt3d .card .medal{font-size:6vh;letter-spacing:.6vh;color:#ffd23f}
.tt3d .load{position:absolute;inset:0;background:#0b1217;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:3vh;gap:1.6vh;pointer-events:auto}
.tt3d .load .lb{width:40vw;height:1.2vh;background:#22323d;border-radius:1vh;overflow:hidden}
.tt3d .load .lb i{display:block;height:100%;width:0;background:#ffd23f}
.tt3d .keys .steer,.tt3d .keys .pedal{opacity:.0;pointer-events:none}
.tt3d .steerpad{left:3vh;bottom:3.5vh;width:33vh;height:15vh;border-radius:8vh;touch-action:none}
.tt3d .steerpad i{position:absolute;top:50%;left:50%;width:11vh;height:11vh;margin:-5.5vh 0 0 -5.5vh;border-radius:50%;background:rgba(255,255,255,.55);border:2px solid #fff;pointer-events:none}
.tt3d .steerpad:before{content:'';position:absolute;left:50%;top:22%;bottom:22%;width:2px;background:rgba(255,255,255,.35)}
.tt3d .coach{position:absolute;left:50%;bottom:27vh;transform:translateX(-50%);max-width:70vw;text-align:center;font-size:2.6vh;font-weight:bold;background:rgba(20,60,90,.86);border:2px solid #8fd0ff;padding:1.2vh 2.4vh;border-radius:1.4vh;display:none;text-shadow:0 1px 2px #000}
.tt3d .coach small{display:block;font-weight:normal;font-size:1.9vh;opacity:.85;margin-top:.4vh}
`;

// vh / vw -> CSS variables set from the overlay's measured size
const units = (s) => s.replace(/(-?\d*\.?\d+)vh/g, 'calc($1 * var(--u))').replace(/(-?\d*\.?\d+)vw/g, 'calc($1 * var(--w))');
let styleEl = null;
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

export class Hud {
  constructor(root, opts) {
    if (!styleEl) { styleEl = el('style'); styleEl.textContent = units(CSS); document.head.appendChild(styleEl); }
    this.root = root;
    this.opts = opts;
    this.input = { gas: 0, brake: 0, steerL: 0, steerR: 0, steerA: 0, hand: false, low: false, lock: false, winch: false };
    this.pad = { prev: [], look: 0, active: false };      // gamepad state
    this.steerMode = opts.steerMode || 'buttons';
    this.keys = {};
    this.actions = {};
    const hud = (this.hud = el('div', 'hud'));
    root.appendChild(hud);

    const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.touch = touch;

    // ---- top info
    this.top = el('div', 'top');
    this.tTime = el('span'); this.tCp = el('span'); this.tDist = el('span');
    this.top.append(this.tTime, this.tCp, this.tDist);
    this.prog = el('div', 'prog', '<i></i>');
    this.toastEl = el('div', 'toast');
    this.warnEl = el('div', 'warn');
    this.map = el('canvas', 'map');
    this.coachEl = el('div', 'coach');
    hud.append(this.top, this.prog, this.toastEl, this.warnEl, this.map, this.coachEl);

    // ---- dashboard
    const dash = el('div', 'dash');
    this.incl = el('canvas', 'incl'); this.incl.width = this.incl.height = 120;
    this.speedEl = el('div', 'speed', '0<small>km/h</small>');
    const bars = el('div', 'bars');
    this.rpmBar = el('div', 'bar', '<i style="background:#ffd23f"></i>');
    this.fuelBar = el('div', 'bar', '<i></i>');
    this.dmgBar = el('div', 'bar', '<i style="background:#e0463c;width:0"></i>');
    this.lbRpm = el('div', '', 'RPM'); this.lbFuel = el('div', '', 'FUEL'); this.lbDmg = el('div', '', 'DAMAGE');
    bars.append(this.lbRpm, this.rpmBar, this.lbFuel, this.fuelBar, this.lbDmg, this.dmgBar);
    if (opts.cargo) {
      this.cargoBar = el('div', 'bar', '<i style="background:#8fd0ff;width:100%"></i>');
      bars.append(el('div', '', 'CARGO'), this.cargoBar);
    }
    if (opts.hot) {
      this.heatBar = el('div', 'bar', '<i style="background:#f0b429;width:35%"></i>');
      bars.append(el('div', '', 'TEMP'), this.heatBar);
    }
    this.info = el('div', 'info');
    dash.append(this.incl, this.speedEl, bars, this.info);
    hud.append(dash);

    // ---- buttons
    const hold = (b, on, off) => {
      const down = (e) => { e.preventDefault(); b.setPointerCapture && b.setPointerCapture(e.pointerId); b.classList.add('down'); on(e); };
      const up = (e) => { e.preventDefault(); b.classList.remove('down'); off(e); };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    const mk = (cls, html, style) => {
      const b = el('div', 'btn ' + cls, html);
      for (const k in style) b.style[k] = units(style[k]);
      hud.appendChild(b);
      return b;
    };
    if (this.steerMode === 'slider') {
      // analog pad: slide left / right, release to centre
      const pad = mk('steerpad', '<i></i>', {});
      const knob = pad.querySelector('i');
      const set = (e) => {
        const r = pad.getBoundingClientRect();
        const v = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2.3));
        // a little dead zone and a gentle curve make small corrections easy
        const a = Math.abs(v) < 0.06 ? 0 : Math.sign(v) * Math.pow((Math.abs(v) - 0.06) / 0.94, 1.35);
        this.input.steerA = -a;
        knob.style.transform = `translateX(${v * r.width * 0.33}px)`;
      };
      pad.addEventListener('pointermove', (e) => { if (pad.classList.contains('down')) set(e); });
      hold(pad, set, () => { this.input.steerA = 0; knob.style.transform = ''; });
    } else if (this.steerMode === 'tilt') {
      // tilt the phone like a steering wheel (landscape). Falls back to the buttons if there is no sensor.
      this.onTilt = (e) => {
        if (e.beta === null || e.gamma === null) return;
        const ang = (screen.orientation && screen.orientation.angle) || 0;
        const roll = ang === 90 ? -e.beta : ang === 270 || ang === -90 ? e.beta : -e.gamma;
        const v = Math.max(-1, Math.min(1, roll / 24));
        this.input.steerA = Math.abs(v) < 0.05 ? 0 : v;
        this.tiltSeen = true;
      };
      window.addEventListener('deviceorientation', this.onTilt);
    }
    if (this.steerMode !== 'slider') {
      const L = mk('steer', '&#9664;', { left: '3vh' });
      const R = mk('steer', '&#9654;', { left: '21vh' });
      hold(L, () => { this.input.steerL = 1; }, () => { this.input.steerL = 0; });
      hold(R, () => { this.input.steerR = 1; }, () => { this.input.steerR = 0; });
      if (this.steerMode === 'tilt') { L.style.opacity = R.style.opacity = '0.45'; }
    }

    const gas = mk('pedal', '<i class="fill"></i><span>GAS</span>', { right: '3vh', height: '30vh' });
    const brake = mk('pedal', '<span>BRAKE<br>/ REV</span>', { right: '20vh', height: '19vh' });
    const gasFill = gas.querySelector('.fill');
    const gasFrom = (e) => {
      const r = gas.getBoundingClientRect();
      const t = 1 - (e.clientY - r.top) / r.height;   // 0 bottom .. 1 top
      const v = Math.max(0.3, Math.min(1, 0.25 + t * 1.0));
      this.input.gas = v;
      gasFill.style.height = `${v * 100}%`;
    };
    gas.addEventListener('pointermove', (e) => { if (this.input.gas > 0) gasFrom(e); });
    hold(gas, gasFrom, () => { this.input.gas = 0; gasFill.style.height = '0'; });
    hold(brake, () => { this.input.brake = 1; }, () => { this.input.brake = 0; });

    const small = (label, style, key) => {
      const b = mk('small', label, style);
      if (key) b.dataset.key = key;
      return b;
    };
    const hb = small('HAND<br>BRAKE', { left: '3vh', bottom: '21vh' });
    hold(hb, () => { this.input.hand = true; }, () => { this.input.hand = false; });
    this.bLow = small('4L<br>LOW', { left: '14.5vh', bottom: '21vh' });
    this.bLock = small('DIFF<br>LOCK', { left: '26vh', bottom: '21vh' });
    this.bWinch = small('WINCH', { right: '20vh', bottom: '24.5vh', width: '14vh' });
    this.bRecover = small('RECOVER', { left: '20.6vh', top: '1.4vh', width: '13vh', height: '7vh' });
    this.bCam = small('CAM', { left: '10.6vh', top: '1.4vh', width: '9vh', height: '7vh' });
    this.bPause = small('II', { left: '1.4vh', top: '1.4vh', width: '8vh', height: '7vh', fontSize: '3vh' });
    const tap = (b, fn) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); fn(); });
    tap(this.bLow, () => this.toggle('low'));
    tap(this.bLock, () => this.toggle('lock'));
    hold(this.bWinch, () => { this.input.winch = true; }, () => { this.input.winch = false; });
    tap(this.bRecover, () => this.fire('recover'));
    tap(this.bCam, () => this.fire('camera'));
    tap(this.bPause, () => this.fire('pause'));
    if (!opts.difflock) this.bLock.classList.add('off');
    if (!opts.winch) this.bWinch.classList.add('off');

    // ---- keyboard
    this.onKey = (e) => {
      const d = e.type === 'keydown';
      const k = e.code;
      if (d && !this.keys[k]) {
        if (k === 'KeyL' || k === 'ShiftLeft') this.toggle('low');
        if (k === 'KeyX') this.toggle('lock');
        if (k === 'KeyR') this.fire('recover');
        if (k === 'KeyC') this.fire('camera');
        if (k === 'KeyP' || k === 'Escape') this.fire('pause');
      }
      this.keys[k] = d;
      if (k.startsWith('Arrow') || k === 'Space') e.preventDefault();
    };
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);

    this.toastTimer = 0;
    this.frame = 0;
    this.layout();
  }

  /** Call on resize: updates the CSS size units. */
  layout() {
    const w = this.root.clientWidth || window.innerWidth, h = this.root.clientHeight || window.innerHeight;
    this.root.style.setProperty('--u', `${h / 100}px`);
    this.root.style.setProperty('--w', `${w / 100}px`);
    // shrink the centre dashboard on narrow (4:3) screens so it never touches the pedals
    this.root.style.setProperty('--ds', String(Math.min(1, Math.max(0.6, (w / h - 0.75) / 0.9))));
  }

  on(name, fn) { this.actions[name] = fn; }
  fire(name) { if (this.actions[name]) this.actions[name](); }
  toggle(name) {
    if (name === 'lock' && !this.opts.difflock) { this.toast('Diff locks not installed - buy them in the garage'); return; }
    this.input[name] = !this.input[name];
    (name === 'low' ? this.bLow : this.bLock).classList.toggle('on', this.input[name]);
  }

  /** Poll the first connected gamepad: stick steers, triggers are the pedals, face buttons the tools. */
  _gamepad() {
    const out = { steer: 0, gas: 0, brake: 0, hand: false, winch: false };
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    this.pad.active = !!gp;
    if (!gp) { this.pad.look = 0; return out; }
    const ax = (i) => { const v = gp.axes[i] || 0; return Math.abs(v) < 0.12 ? 0 : (v - Math.sign(v) * 0.12) / 0.88; };
    const bt = (i) => (gp.buttons[i] ? gp.buttons[i].value || (gp.buttons[i].pressed ? 1 : 0) : 0);
    out.steer = -ax(0);
    out.gas = bt(7); out.brake = bt(6);
    out.hand = bt(0) > 0.5; out.winch = bt(1) > 0.5;
    this.pad.look = ax(2);
    const edge = (i, fn) => { const d = bt(i) > 0.5; if (d && !this.pad.prev[i]) fn(); this.pad.prev[i] = d; };
    edge(2, () => this.toggle('low'));
    edge(3, () => this.toggle('lock'));
    edge(4, () => this.fire('recover'));
    edge(5, () => this.fire('camera'));
    edge(9, () => this.fire('pause'));
    return out;
  }

  /** Camera look input -1..1 (keys Q / E, or the right stick). + = look left. */
  look() { return (this.keys.KeyQ ? 1 : 0) - (this.keys.KeyE ? 1 : 0) - this.pad.look; }

  /** Show (or hide with null) the coach box. */
  coach(title, sub) {
    if (!title) { this.coachEl.style.display = 'none'; return; }
    this.coachEl.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
    this.coachEl.style.display = 'block';
  }

  /** Combined touch + keyboard + gamepad state. */
  read() {
    const k = this.keys, i = this.input;
    const gp = this._gamepad();
    const kGas = k.ArrowUp || k.KeyW ? (k.ControlLeft ? 0.5 : 1) : 0;
    const kBrake = k.ArrowDown || k.KeyS ? 1 : 0;
    const left = Math.max(i.steerL, k.ArrowLeft || k.KeyA ? 1 : 0);
    const right = Math.max(i.steerR, k.ArrowRight || k.KeyD ? 1 : 0);
    return {
      gas: Math.max(i.gas, kGas, gp.gas), brake: Math.max(i.brake, kBrake, gp.brake),
      steer: Math.max(-1, Math.min(1, left - right + i.steerA + gp.steer)),
      hand: i.hand || !!k.Space || gp.hand, low: i.low, lock: i.lock, winch: i.winch || !!k.KeyF || gp.winch
    };
  }

  toast(text, ms = 3200) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  /** Pre-render the route overview. */
  initMap(track) {
    const c = this.map;
    const size = 220;
    c.width = c.height = size;
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (let i = 0; i < track.nMain; i++) {
      minX = Math.min(minX, track.PX[i]); maxX = Math.max(maxX, track.PX[i]);
      minZ = Math.min(minZ, track.PZ[i]); maxZ = Math.max(maxZ, track.PZ[i]);
    }
    const span = Math.max(maxX - minX, maxZ - minZ) + 60;
    const sc = size / span;
    const ox = (minX + maxX) / 2, oz = (minZ + maxZ) / 2;
    this.mapT = (x, z) => [size / 2 - (x - ox) * sc, size / 2 - (z - oz) * sc];
    const bg = document.createElement('canvas');
    bg.width = bg.height = size;
    const g = bg.getContext('2d');
    const line = (a, b, color, w) => {
      g.strokeStyle = color; g.lineWidth = w; g.lineJoin = 'round'; g.beginPath();
      for (let i = a; i <= b; i += 2) { const [x, y] = this.mapT(track.PX[i], track.PZ[i]); if (i === a) g.moveTo(x, y); else g.lineTo(x, y); }
      g.stroke();
    };
    for (let c2 = 1; c2 < track.chainStart.length; c2++) line(track.chainStart[c2], track.chainEnd[c2], 'rgba(255,255,255,.45)', 1.5);
    line(0, track.nMain - 1, 'rgba(0,0,0,.6)', 5);
    line(0, track.nMain - 1, '#ffffff', 2.4);
    this.mapBg = bg;
    this.mapCps = track.checkpoints.map((cp) => { const p = track.roadPose(cp.s); return this.mapT(p.x, p.z); });
    const f = track.roadPose(track.finishS);
    this.mapFinish = this.mapT(f.x, f.z);
    // progress bar ticks
    track.checkpoints.forEach((cp) => {
      const u = el('u');
      u.style.left = `${(cp.s / track.finishS) * 100}%`;
      this.prog.appendChild(u);
    });
    this.ticks = [...this.prog.querySelectorAll('u')];
  }

  update(ss, extra) {
    this.frame++;
    const veh = ss.vehicle;
    if (this.frame % 3 === 0) {
      const kmh = Math.abs(veh.speed) * 3.6;
      this.speedEl.firstChild.nodeValue = String(Math.round(kmh));
      this.tTime.innerHTML = `<b>${fmtTime(ss.totalTime)}</b>`;
      this.tCp.innerHTML = `CP <b>${ss.cpNext}/${ss.track.checkpoints.length}</b>`;
      const rem = ss.remaining;
      this.tDist.innerHTML = `<b>${rem >= 1000 ? (rem / 1000).toFixed(2) + ' km' : Math.round(rem) + ' m'}</b> to go`;
      this.prog.firstChild.style.width = `${ss.progress * 100}%`;
      this.ticks.forEach((t, i) => t.classList.toggle('done', i < ss.cpNext));
      this.rpmBar.firstChild.style.width = `${Math.min(100, veh.rpm01 * 100)}%`;
      const fuel = ss.fuel / ss.params.fuelCap;
      this.fuelBar.firstChild.style.width = `${fuel * 100}%`;
      this.fuelBar.firstChild.style.background = fuel < 0.2 ? '#e0463c' : fuel < 0.4 ? '#f0b429' : '#55c26a';
      this.dmgBar.firstChild.style.width = `${ss.damage}%`;
      if (this.heatBar) {
        this.heatBar.firstChild.style.width = `${ss.heat * 100}%`;
        this.heatBar.firstChild.style.background = ss.overheated ? '#e0463c' : ss.heat > 0.8 ? '#f07a29' : '#f0b429';
      }
      const gear = veh.speed < -0.3 ? 'R' : (veh.low ? 'L' : 'H') + veh.gear;
      this.info.innerHTML = `${gear} &nbsp; ${veh.wheels[0].surface.name.toUpperCase()}<br>${extra.weather}${veh.lock ? '<br>LOCKED' : ''}`;
      this.bWinch.classList.toggle('on', !!veh.winchAnchor && this.opts.winch && !this.input.winch);

      if (this.cargoBar) {
        this.cargoBar.firstChild.style.width = `${ss.cargo}%`;
        this.cargoBar.firstChild.style.background = ss.cargo < 40 ? '#e0463c' : ss.cargo < 70 ? '#f0b429' : '#8fd0ff';
      }
      let warn = '';
      if (veh.upY < 0.35) warn = 'ROLLED OVER<br>press RECOVER';
      else if (ss.fuel <= 0) warn = 'OUT OF FUEL<br>press RECOVER for a tow';
      else if (ss.overheated) warn = 'OVERHEATED - ease off the throttle';
      else if (ss.damage >= 100) warn = 'ENGINE DAMAGED - limp mode until next checkpoint';
      else if (ss.flats.some(Boolean)) warn = 'PUNCTURE - less grip until the next checkpoint';
      else if (ss.brakeHeat > 0.8) warn = 'BRAKES FADING - ease off, use low range downhill';
      else if (ss.heat > 0.88) warn = 'ENGINE HOT';
      else if (ss.offRoute) warn = 'OFF ROUTE';
      else if (ss.stuckTime > 4) warn = this.opts.winch && veh.winchAnchor ? 'STUCK - hold WINCH' : 'STUCK - ease off, reverse, or RECOVER';
      else if (fuel < 0.15) warn = 'LOW FUEL';
      this.warnEl.style.display = warn ? 'block' : 'none';
      if (warn) this.warnEl.innerHTML = warn;
    }
    if (this.frame % 4 === 0) this.drawIncl(veh);
    if (this.frame % 6 === 0) this.drawMap(ss);
  }

  drawIncl(veh) {
    const g = this.incl.getContext('2d');
    g.clearRect(0, 0, 120, 120);
    g.save();
    g.translate(60, 60);
    g.beginPath(); g.arc(0, 0, 56, 0, 6.3); g.fillStyle = 'rgba(14,26,34,.6)'; g.fill();
    g.clip();
    g.rotate(-veh.roll);
    const off = Math.max(-50, Math.min(50, veh.pitch * 90));
    g.fillStyle = 'rgba(123,90,60,.9)';
    g.fillRect(-90, off, 180, 120);
    g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-90, off); g.lineTo(90, off); g.stroke();
    g.restore();
    const danger = Math.abs(veh.roll) > 0.42 || Math.abs(veh.pitch) > 0.5;
    g.strokeStyle = danger ? '#ff5b4f' : '#ffd23f'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(34, 60); g.lineTo(52, 60); g.moveTo(68, 60); g.lineTo(86, 60); g.moveTo(60, 60); g.arc(60, 60, 3, 0, 6.3); g.stroke();
    g.fillStyle = '#fff'; g.font = 'bold 15px Arial'; g.textAlign = 'center';
    g.fillText(`${Math.round(Math.abs(veh.roll) * 57.3)}° / ${Math.round(veh.pitch * 57.3)}°`, 60, 112);
  }

  drawMap(ss) {
    const g = this.map.getContext('2d');
    const s = this.map.width;
    g.clearRect(0, 0, s, s);
    g.drawImage(this.mapBg, 0, 0);
    this.mapCps.forEach(([x, y], i) => {
      g.fillStyle = i < ss.cpNext ? '#55c26a' : i === ss.cpNext ? '#ffd23f' : '#c8771a';
      g.beginPath(); g.arc(x, y, i === ss.cpNext ? 6 : 4, 0, 6.3); g.fill();
    });
    g.fillStyle = '#fff'; g.fillRect(this.mapFinish[0] - 4, this.mapFinish[1] - 4, 8, 8);
    g.fillStyle = '#111'; g.fillRect(this.mapFinish[0] - 4, this.mapFinish[1] - 4, 4, 4); g.fillRect(this.mapFinish[0], this.mapFinish[1], 4, 4);
    for (const c of ss.caches) {
      if (!c.found) continue;
      const [x, y] = this.mapT(c.x, c.z);
      g.fillStyle = '#ffd23f'; g.fillRect(x - 3, y - 3, 6, 6);
    }
    const veh = ss.vehicle;
    const [x, y] = this.mapT(veh.p[0], veh.p[2]);
    g.save(); g.translate(x, y); g.rotate(-veh.heading);
    g.fillStyle = '#ff4136'; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(-6, 7); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }

  /** Modal panel. buttons = [{label, cls, fn}] */
  panel(title, bodyHtml, buttons) {
    this.closePanel();
    const p = el('div', 'panel');
    const card = el('div', 'card', `<h2>${title}</h2>${bodyHtml}`);
    const row = el('div', 'row');
    for (const b of buttons) {
      const btn = el('button', b.cls || '', b.label);
      btn.addEventListener('click', (e) => { e.preventDefault(); b.fn(); });
      row.appendChild(btn);
    }
    card.appendChild(row);
    p.appendChild(card);
    this.root.appendChild(p);
    this.panelEl = p;
  }
  closePanel() { if (this.panelEl) { this.panelEl.remove(); this.panelEl = null; } }

  loading(text, frac) {
    if (!this.loadEl) { this.loadEl = el('div', 'load', '<div class="lt"></div><div class="lb"><i></i></div>'); this.root.appendChild(this.loadEl); }
    this.layout();
    this.loadEl.querySelector('.lt').textContent = text;
    this.loadEl.querySelector('i').style.width = `${frac * 100}%`;
  }
  loaded() { if (this.loadEl) { this.loadEl.remove(); this.loadEl = null; } }

  dispose() {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    if (this.onTilt) window.removeEventListener('deviceorientation', this.onTilt);
    clearTimeout(this.toastTimer);
  }
}
