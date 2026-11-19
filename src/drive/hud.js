// DOM HUD + touch / keyboard controls for the 3D drive mode.
// DOM (not canvas) so multi-touch, hit areas and text stay crisp on any screen.
import { fmtTime } from './core/session.js';

const CSS = `
.tt3d {
  position: fixed;
  inset: 0;
  z-index: 20;
  background: #090e12;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', 'Helvetica Neue', Arial, sans-serif;
  color: #fff;
  overflow: hidden;
  letter-spacing: 0.02em;
}
.tt3d canvas.view {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}
.tt3d .hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
}
.tt3d .hud > * {
  pointer-events: none;
}

/* Glassmorphic Tactical Buttons */
.tt3d .btn {
  pointer-events: auto;
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  background: linear-gradient(145deg, rgba(22, 36, 48, 0.75) 0%, rgba(9, 17, 24, 0.88) 100%);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-top: 1px solid rgba(255, 255, 255, 0.32);
  font-weight: 800;
  letter-spacing: 0.06em;
  color: #f1f5f9;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.7);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.2), inset 0 -1px 2px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.08s ease, background 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.tt3d .btn:active, .tt3d .btn.down {
  transform: scale(0.93) translateY(2px);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.65), inset 0 2px 5px rgba(0, 0, 0, 0.6);
  background: linear-gradient(145deg, rgba(34, 56, 74, 0.9) 0%, rgba(14, 25, 35, 0.95) 100%);
  border-color: rgba(255, 210, 63, 0.7);
}
.tt3d .btn.on {
  background: linear-gradient(145deg, #ffd23f 0%, #e5a812 100%);
  color: #0b1217;
  text-shadow: none;
  border-color: #ffffff;
  box-shadow: 0 0 24px rgba(255, 210, 63, 0.65), inset 0 1px 2px rgba(255, 255, 255, 0.7);
}
.tt3d .btn.off {
  opacity: 0.28;
  filter: grayscale(0.8);
  pointer-events: none;
}

/* Steering Discs */
.tt3d .steer {
  bottom: 3.5vh;
  width: 15.5vh;
  height: 15.5vh;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, rgba(28, 48, 64, 0.85) 0%, rgba(10, 18, 25, 0.94) 100%);
  border: 2px solid rgba(255, 255, 255, 0.22);
  border-top: 2px solid rgba(255, 255, 255, 0.38);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6), inset 0 2px 4px rgba(255, 255, 255, 0.25), inset 0 -3px 6px rgba(0, 0, 0, 0.7);
}
.tt3d .steer .steer-ico {
  width: 6.5vh;
  height: 6.5vh;
  filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.8));
  transition: transform 0.1s ease;
}
.tt3d .steer.down .steer-ico {
  transform: scale(1.15);
  filter: drop-shadow(0 0 10px #ffd23f);
}

/* Pedals */
.tt3d .pedal {
  bottom: 3.5vh;
  width: 14.5vh;
  border-radius: 20px;
  font-size: 2.2vh;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.6), inset 0 1px 2px rgba(255, 255, 255, 0.25);
}
.tt3d .pedal .treads {
  position: absolute;
  inset: 1.2vh;
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
  pointer-events: none;
  opacity: 0.25;
}
.tt3d .pedal .treads i {
  display: block;
  height: 0.45vh;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 0.3vh;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}
.tt3d .pedal-content {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6vh;
}
.tt3d .pedal-txt {
  font-weight: 900;
  letter-spacing: 0.08em;
  font-size: 2.3vh;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.85);
}
.tt3d .pedal-txt small {
  font-size: 1.6vh;
  opacity: 0.85;
}
.tt3d .pedal .fill {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(to top, #10b981 0%, #34d399 100%);
  box-shadow: 0 0 24px rgba(52, 211, 153, 0.8);
  height: 0;
  transition: height 0.05s ease;
}
.tt3d .pedal-gas .pedal-ico {
  width: 4.2vh;
  height: 4.2vh;
  fill: #34d399;
  filter: drop-shadow(0 2px 6px rgba(52, 211, 153, 0.6));
}
.tt3d .pedal-brake {
  border-color: rgba(239, 68, 68, 0.35);
}
.tt3d .pedal-brake .pedal-ico {
  width: 3.8vh;
  height: 3.8vh;
  color: #f87171;
  filter: drop-shadow(0 2px 6px rgba(239, 68, 68, 0.5));
}
.tt3d .pedal-brake.down {
  background: linear-gradient(145deg, rgba(220, 38, 38, 0.88) 0%, rgba(153, 27, 27, 0.95) 100%);
  border-color: #f87171;
  box-shadow: 0 0 32px rgba(239, 68, 68, 0.75);
}

/* Auxiliary Off-road Controls */
.tt3d .small {
  font-size: 1.7vh;
  line-height: 1.15;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35vh;
  border-radius: 14px;
}
.tt3d .small .btn-ico {
  width: 2.8vh;
  height: 2.8vh;
  opacity: 0.92;
}
.tt3d .small .top-ico {
  width: 3vh;
  height: 3vh;
}
.tt3d .small .top-txt {
  font-size: 1.4vh;
  font-weight: 800;
  letter-spacing: 0.05em;
  opacity: 0.9;
}
.tt3d .badge-dot {
  width: 0.9vh;
  height: 0.9vh;
  border-radius: 50%;
  background: #475569;
  margin-bottom: 0.1vh;
  transition: all 0.2s ease;
}
.tt3d .btn.on .badge-dot {
  background: #10b981;
  box-shadow: 0 0 10px #10b981;
}
.tt3d .badge-tag {
  font-size: 2.4vh;
  font-weight: 900;
  color: #ffd23f;
  letter-spacing: -0.02em;
}
.tt3d .btn.on .badge-tag {
  color: #0b1217;
}

/* Top Progress & Telemetry Header */
.tt3d .top {
  position: absolute;
  left: 50%;
  top: 1.4vh;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 2.5vh;
  padding: 0.9vh 2.6vh;
  border-radius: 30px;
  background: linear-gradient(180deg, rgba(16, 28, 38, 0.75) 0%, rgba(8, 16, 22, 0.9) 100%);
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55), inset 0 1px 1px rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  font-size: 2.3vh;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: #e2e8f0;
}
.tt3d .top b {
  color: #ffd23f;
}
.tt3d .prog {
  position: absolute;
  left: 50%;
  top: 8.8vh;
  width: 38vw;
  margin-left: -19vw;
  height: 0.9vh;
  background: rgba(8, 16, 22, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 1vh;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.7);
}
.tt3d .prog i {
  display: block;
  height: 100%;
  width: 0;
  background: linear-gradient(90deg, #ffd23f 0%, #ffea79 100%);
  border-radius: 1vh;
  box-shadow: 0 0 10px rgba(255, 210, 63, 0.6);
}
.tt3d .prog u {
  position: absolute;
  top: -0.4vh;
  width: 0.5vh;
  height: 1.7vh;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 0.3vh;
  transition: background 0.2s;
}
.tt3d .prog u.done {
  background: #10b981;
  box-shadow: 0 0 8px #10b981;
}

/* Central Cockpit Dashboard */
.tt3d .dash {
  position: absolute;
  left: calc(50% + 2vh);
  bottom: 1.8vh;
  transform: translateX(-50%) scale(var(--ds, 1));
  transform-origin: bottom center;
  display: flex;
  align-items: center;
  gap: 2.4vh;
  padding: 1.2vh 2.6vh;
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(14, 25, 35, 0.75) 0%, rgba(7, 14, 20, 0.9) 100%);
  border: 1px solid rgba(255, 255, 255, 0.16);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.16);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}
.tt3d .speed {
  font-size: 6.8vh;
  font-weight: 900;
  line-height: 0.9;
  text-align: right;
  min-width: 12vh;
  letter-spacing: -0.04em;
  color: #ffffff;
  text-shadow: 0 0 20px rgba(255, 255, 255, 0.35);
}
.tt3d .speed small {
  font-size: 1.7vh;
  display: block;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: #94a3b8;
  margin-top: 0.4vh;
}
.tt3d .bars {
  display: flex;
  flex-direction: column;
  gap: 0.6vh;
  width: 22vh;
  font-size: 1.5vh;
  font-weight: 700;
  color: #94a3b8;
  letter-spacing: 0.06em;
}
.tt3d .bar {
  height: 1.3vh;
  background: rgba(10, 18, 26, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.8vh;
  overflow: hidden;
  padding: 1px;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.6);
}
.tt3d .bar i {
  display: block;
  height: 100%;
  width: 50%;
  border-radius: 0.6vh;
  transition: width 0.08s ease, background 0.2s ease;
}
.tt3d .incl {
  width: 9.5vh;
  height: 9.5vh;
  border-radius: 50%;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5), inset 0 0 8px rgba(0, 0, 0, 0.6);
}
.tt3d .info {
  font-size: 1.7vh;
  line-height: 1.4;
  min-width: 14vh;
  font-weight: 600;
  color: #cbd5e1;
}
.tt3d .dash-tags {
  display: flex;
  align-items: center;
  gap: 0.8vh;
  margin-bottom: 0.4vh;
}
.tt3d .tag-gear {
  font-size: 2.2vh;
  font-weight: 900;
  padding: 0.15vh 0.9vh;
  border-radius: 8px;
  background: rgba(255, 210, 63, 0.18);
  border: 1px solid #ffd23f;
  color: #ffd23f;
}
.tt3d .tag-gear.rev {
  background: rgba(239, 68, 68, 0.2);
  border-color: #ef4444;
  color: #ef4444;
}
.tt3d .tag-gear.low {
  background: rgba(245, 158, 11, 0.2);
  border-color: #f59e0b;
  color: #f59e0b;
}
.tt3d .tag-surf {
  font-size: 1.4vh;
  font-weight: 800;
  padding: 0.2vh 0.8vh;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.12);
  color: #e2e8f0;
  text-transform: uppercase;
}
.tt3d .tag-lock {
  font-size: 1.3vh;
  font-weight: 800;
  padding: 0.2vh 0.6vh;
  border-radius: 6px;
  background: rgba(16, 185, 129, 0.22);
  border: 1px solid #10b981;
  color: #10b981;
}
.tt3d .dash-meta {
  font-size: 1.4vh;
  color: #94a3b8;
}

/* Minimap Radar */
.tt3d .map {
  position: absolute;
  right: 1.6vh;
  top: 1.6vh;
  width: 22vh;
  height: 22vh;
  border-radius: 20px;
  background: radial-gradient(circle, rgba(14, 25, 35, 0.65) 0%, rgba(6, 12, 18, 0.85) 100%);
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.55), inset 0 0 20px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

/* Notification Toast & Warnings */
.tt3d .toast {
  position: absolute;
  left: 50%;
  top: 12.5vh;
  transform: translateX(-50%) translateY(-10px);
  max-width: 65vw;
  text-align: center;
  font-size: 2.4vh;
  font-weight: 800;
  background: linear-gradient(180deg, rgba(16, 28, 38, 0.88) 0%, rgba(8, 16, 22, 0.94) 100%);
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.65);
  padding: 1.2vh 2.8vh;
  border-radius: 16px;
  opacity: 0;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}
.tt3d .toast.show {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
.tt3d .warn {
  position: absolute;
  left: 50%;
  top: 23vh;
  transform: translateX(-50%);
  font-size: 2.8vh;
  font-weight: 900;
  color: #ff6b6b;
  text-shadow: 0 0 18px rgba(255, 107, 107, 0.7), 0 2px 6px #000;
  display: none;
  text-align: center;
  padding: 1vh 2.4vh;
  background: rgba(18, 6, 8, 0.78);
  border: 1px solid rgba(255, 107, 107, 0.4);
  border-radius: 14px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  animation: ttPulse 1s infinite alternate;
}
@keyframes ttPulse {
  from { opacity: 0.85; transform: translateX(-50%) scale(0.98); }
  to { opacity: 1; transform: translateX(-50%) scale(1.02); }
}

/* Modal Panels & Cards */
.tt3d .panel {
  pointer-events: auto;
  position: absolute;
  inset: 0;
  background: rgba(5, 10, 15, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
.tt3d .card {
  background: linear-gradient(165deg, rgba(22, 36, 48, 0.95) 0%, rgba(10, 18, 25, 0.98) 100%);
  border: 1px solid rgba(255, 210, 63, 0.32);
  border-radius: 24px;
  padding: 3vh 4.2vh;
  min-width: 48vh;
  max-width: 86vw;
  max-height: 92vh;
  overflow: auto;
  text-align: center;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.8), inset 0 1px 1px rgba(255, 255, 255, 0.2);
}
.tt3d .card h2 {
  margin: 0 0 1.4vh;
  font-size: 4.4vh;
  font-weight: 900;
  letter-spacing: -0.02em;
  color: #ffd23f;
  text-shadow: 0 0 20px rgba(255, 210, 63, 0.4);
}
.tt3d .card p {
  margin: 0.8vh 0;
  font-size: 2.2vh;
  color: #cbd5e1;
}
.tt3d .card .row {
  display: flex;
  gap: 1.6vh;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 2.4vh;
}
.tt3d .card button {
  font: 800 2.4vh -apple-system, sans-serif;
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 14px;
  padding: 1.5vh 2.8vh;
  min-width: 18vh;
  background: linear-gradient(145deg, #334155 0%, #1e293b 100%);
  cursor: pointer;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
  transition: all 0.15s ease;
}
.tt3d .card button:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.5);
}
.tt3d .card button.go {
  background: linear-gradient(145deg, #10b981 0%, #059669 100%);
  border-color: #34d399;
}
.tt3d .card button.alt {
  background: linear-gradient(145deg, #0284c7 0%, #0369a1 100%);
  border-color: #38bdf8;
}
.tt3d .card button.bad {
  background: linear-gradient(145deg, #dc2626 0%, #991b1b 100%);
  border-color: #f87171;
}
.tt3d .card .obj {
  text-align: left;
  font-size: 2.2vh;
  margin: 0.6vh auto;
  max-width: 58vh;
}
.tt3d .card .obj.ok {
  color: #34d399;
}
.tt3d .card .obj.no {
  color: #64748b;
}
.tt3d .card .medal {
  font-size: 6.5vh;
  letter-spacing: 0.8vh;
  color: #ffd23f;
  text-shadow: 0 0 24px rgba(255, 210, 63, 0.6);
}

/* Loading Screen with Zero-Blink Fade */
.tt3d .load {
  position: absolute;
  inset: 0;
  background: #090e12;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 3vh;
  font-weight: 800;
  letter-spacing: 0.05em;
  gap: 2vh;
  pointer-events: auto;
  z-index: 50;
  transition: opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.35s;
}
.tt3d .load.fade-out {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}
.tt3d .load .lt {
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.8);
  color: #f1f5f9;
}
.tt3d .load .lb {
  width: 42vw;
  max-width: 480px;
  height: 1vh;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 1vh;
  overflow: hidden;
  padding: 1px;
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.6);
}
.tt3d .load .lb i {
  display: block;
  height: 100%;
  width: 0;
  background: linear-gradient(90deg, #ffd23f 0%, #38ef7d 100%);
  border-radius: 1vh;
  box-shadow: 0 0 14px rgba(255, 210, 63, 0.6);
  transition: width 0.12s ease;
}

.tt3d .keys .steer, .tt3d .keys .pedal {
  opacity: 0;
  pointer-events: none;
}
.tt3d .steerpad {
  left: 3vh;
  bottom: 3.5vh;
  width: 33vh;
  height: 15vh;
  border-radius: 8vh;
  touch-action: none;
}
.tt3d .steerpad i {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 11vh;
  height: 11vh;
  margin: -5.5vh 0 0 -5.5vh;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.55);
  border: 2px solid #fff;
  pointer-events: none;
}
.tt3d .steerpad:before {
  content: '';
  position: absolute;
  left: 50%;
  top: 22%;
  bottom: 22%;
  width: 2px;
  background: rgba(255, 255, 255, 0.35);
}
.tt3d .coach {
  position: absolute;
  left: 50%;
  bottom: 27vh;
  transform: translateX(-50%);
  max-width: 70vw;
  text-align: center;
  font-size: 2.6vh;
  font-weight: bold;
  background: rgba(20, 60, 90, 0.86);
  border: 2px solid #8fd0ff;
  padding: 1.2vh 2.4vh;
  border-radius: 1.4vh;
  display: none;
  text-shadow: 0 1px 2px #000;
}
.tt3d .coach small {
  display: block;
  font-weight: normal;
  font-size: 1.9vh;
  opacity: 0.85;
  margin-top: 0.4vh;
}
`;

// vh / vw -> CSS variables set from the overlay's measured size
const units = (s) => s.replace(/(-?\d*\.?\d+)vh/g, 'calc($1 * var(--u))').replace(/(-?\d*\.?\d+)vw/g, 'calc($1 * var(--w))');
let styleEl = null;
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

export class Hud {
  constructor(root, opts) {
    if (!styleEl) {
      styleEl = el('style');
      styleEl.textContent = units(CSS);
      document.head.appendChild(styleEl);
    }
    this.root = root;
    this.opts = opts;
    this.input = { gas: 0, brake: 0, steerL: 0, steerR: 0, steerA: 0, hand: false, low: false, lock: false, winch: false };
    this.pad = { prev: [], look: 0, active: false }; // gamepad state
    this.steerMode = opts.steerMode || 'buttons';
    this.keys = {};
    this.actions = {};
    const hud = (this.hud = el('div', 'hud'));
    root.appendChild(hud);

    const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.touch = touch;

    // ---- top telemetry header
    this.top = el('div', 'top');
    this.tTime = el('span');
    this.tCp = el('span');
    this.tDist = el('span');
    this.top.append(this.tTime, this.tCp, this.tDist);
    this.prog = el('div', 'prog', '<i></i>');
    this.toastEl = el('div', 'toast');
    this.warnEl = el('div', 'warn');
    this.map = el('canvas', 'map');
    this.coachEl = el('div', 'coach');
    hud.append(this.top, this.prog, this.toastEl, this.warnEl, this.map, this.coachEl);

    // ---- dashboard
    const dash = el('div', 'dash');
    this.incl = el('canvas', 'incl');
    this.incl.width = this.incl.height = 120;
    this.speedEl = el('div', 'speed', '<span class="spd-num">0</span><small>KM/H</small>');
    this.spdVal = this.speedEl.querySelector('.spd-num');

    const bars = el('div', 'bars');
    this.rpmBar = el('div', 'bar', '<i style="background:linear-gradient(90deg,#10b981 0%,#ffd23f 75%,#ef4444 95%)"></i>');
    this.fuelBar = el('div', 'bar', '<i></i>');
    this.dmgBar = el('div', 'bar', '<i style="background:#ef4444;width:0"></i>');
    this.lbRpm = el('div', '', 'RPM');
    this.lbFuel = el('div', '', 'FUEL');
    this.lbDmg = el('div', '', 'DAMAGE');
    bars.append(this.lbRpm, this.rpmBar, this.lbFuel, this.fuelBar, this.lbDmg, this.dmgBar);

    if (opts.hot) {
      this.heatBar = el('div', 'bar', '<i style="background:#f59e0b;width:35%"></i>');
      bars.append(el('div', '', 'TEMP'), this.heatBar);
    }
    this.info = el('div', 'info');
    dash.append(this.incl, this.speedEl, bars, this.info);
    hud.append(dash);
    // simple display: speed, fuel, damage, time and the map. The tilt gauge, rev bar and gear / surface tags are for the full one.
    this.simple = !!opts.simple;
    if (this.simple) for (const e of [this.incl, this.lbRpm, this.rpmBar, this.info, this.prog]) e.style.display = 'none';

    // ---- button helpers
    const hold = (b, on, off) => {
      const down = (e) => {
        e.preventDefault();
        b.setPointerCapture && b.setPointerCapture(e.pointerId);
        b.classList.add('down');
        on(e);
      };
      const up = (e) => {
        e.preventDefault();
        b.classList.remove('down');
        off(e);
      };
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
      const pad = mk('steerpad', '<i></i>', {});
      const knob = pad.querySelector('i');
      const set = (e) => {
        const r = pad.getBoundingClientRect();
        const v = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2.3));
        const a = Math.abs(v) < 0.06 ? 0 : Math.sign(v) * Math.pow((Math.abs(v) - 0.06) / 0.94, 1.35);
        this.input.steerA = -a;
        knob.style.transform = `translateX(${v * r.width * 0.33}px)`;
      };
      pad.addEventListener('pointermove', (e) => { if (pad.classList.contains('down')) set(e); });
      hold(pad, set, () => { this.input.steerA = 0; knob.style.transform = ''; });
    } else if (this.steerMode === 'tilt') {
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
      const L = mk('steer steer-l', '<svg class="steer-ico" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>', { left: '3vh' });
      const R = mk('steer steer-r', '<svg class="steer-ico" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>', { left: '21vh' });
      hold(L, () => { this.input.steerL = 1; }, () => { this.input.steerL = 0; });
      hold(R, () => { this.input.steerR = 1; }, () => { this.input.steerR = 0; });
      if (this.steerMode === 'tilt') { L.style.opacity = R.style.opacity = '0.45'; }
    }

    const gas = mk('pedal pedal-gas', '<i class="fill"></i><div class="treads"><i></i><i></i><i></i><i></i><i></i></div><div class="pedal-content"><svg class="pedal-ico" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="currentColor"/></svg><span class="pedal-txt">GAS</span></div>', { right: '3vh', height: '31vh' });
    const brake = mk('pedal pedal-brake', '<div class="treads"><i></i><i></i><i></i><i></i></div><div class="pedal-content"><svg class="pedal-ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg><span class="pedal-txt">BRAKE<small>/ REV</small></span></div>', { right: '20vh', height: '20vh' });
    const gasFill = gas.querySelector('.fill');
    const gasFrom = (e) => {
      const r = gas.getBoundingClientRect();
      const t = 1 - (e.clientY - r.top) / r.height;
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

    const hb = small('<svg class="btn-ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M9 8h4.5a2.5 2.5 0 010 5H9V8zm0 5v4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M2 12h2M20 12h2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>HAND<br>BRAKE</span>', { left: '3vh', bottom: '21.5vh', width: '10.5vh', height: '8.5vh' });
    hold(hb, () => { this.input.hand = true; }, () => { this.input.hand = false; });

    this.bLow = small('<div class="badge-dot"></div><span class="badge-tag">4L</span><span>LOW<br>RANGE</span>', { left: '15vh', bottom: '21.5vh', width: '10vh', height: '8.5vh' });
    this.bLock = small('<div class="badge-dot"></div><svg class="btn-ico" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="10" rx="3" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M7 11V7a5 5 0 0110 0v4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="16" r="1.5" fill="currentColor"/></svg><span>DIFF<br>LOCK</span>', { left: '26.5vh', bottom: '21.5vh', width: '10.5vh', height: '8.5vh' });
    this.bWinch = small('<div class="badge-dot"></div><svg class="btn-ico" viewBox="0 0 24 24"><path d="M12 3v9m0 0a3 3 0 103 3m-3-3a3 3 0 11-3 3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M5 6h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg><span>WINCH</span>', { right: '20vh', bottom: '26vh', width: '14vh', height: '8vh' });

    this.bPause = small('<svg class="top-ico" viewBox="0 0 24 24"><rect x="6" y="5" width="3.5" height="14" rx="1.5" fill="currentColor"/><rect x="14.5" y="5" width="3.5" height="14" rx="1.5" fill="currentColor"/></svg>', { left: '1.4vh', top: '1.4vh', width: '7vh', height: '6.5vh' });
    this.bCam = small('<svg class="top-ico" viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2v-9a2 2 0 012-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="14" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/></svg><span class="top-txt">CAM</span>', { left: '9.6vh', top: '1.4vh', width: '9vh', height: '6.5vh' });
    this.bRecover = small('<svg class="top-ico" viewBox="0 0 24 24"><path d="M4 4v5h5M20 20v-5h-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.93 19.07A10 10 0 0120 12M19.07 4.93A10 10 0 004 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg><span class="top-txt">RESET</span>', { left: '19.8vh', top: '1.4vh', width: '12vh', height: '6.5vh' });

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
    this.root.style.setProperty('--ds', String(Math.min(1, Math.max(0.6, (w / h - 0.75) / 0.9))));
  }

  on(name, fn) { this.actions[name] = fn; }
  fire(name) { if (this.actions[name]) this.actions[name](); }
  toggle(name) {
    if (name === 'lock' && !this.opts.difflock) {
      this.toast('Diff locks not installed - buy them in the garage');
      return;
    }
    this.input[name] = !this.input[name];
    (name === 'low' ? this.bLow : this.bLock).classList.toggle('on', this.input[name]);
  }

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

  look() { return (this.keys.KeyQ ? 1 : 0) - (this.keys.KeyE ? 1 : 0) - this.pad.look; }

  coach(title, sub) {
    if (!title) { this.coachEl.style.display = 'none'; return; }
    this.coachEl.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
    this.coachEl.style.display = 'block';
  }

  read() {
    const k = this.keys, i = this.input;
    const gp = this._gamepad();
    const kGas = k.ArrowUp || k.KeyW ? (k.ControlLeft ? 0.5 : 1) : 0;
    const kBrake = k.ArrowDown || k.KeyS ? 1 : 0;
    const left = Math.max(i.steerL, k.ArrowLeft || k.KeyA ? 1 : 0);
    const right = Math.max(i.steerR, k.ArrowRight || k.KeyD ? 1 : 0);
    return {
      gas: Math.max(i.gas, kGas, gp.gas),
      brake: Math.max(i.brake, kBrake, gp.brake),
      steer: Math.max(-1, Math.min(1, left - right + i.steerA + gp.steer)),
      hand: i.hand || !!k.Space || gp.hand,
      low: i.low,
      lock: i.lock,
      winch: i.winch || !!k.KeyF || gp.winch
    };
  }

  toast(text, ms = 3200) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

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
      if (this.spdVal) this.spdVal.textContent = String(Math.round(kmh));
      else if (this.speedEl.firstChild) this.speedEl.firstChild.nodeValue = String(Math.round(kmh));

      this.tTime.innerHTML = `<b>${fmtTime(ss.totalTime)}</b>`;
      this.tCp.innerHTML = `CP <b>${ss.cpNext}/${ss.track.checkpoints.length}</b>`;
      const rem = ss.remaining;
      this.tDist.innerHTML = `<b>${rem >= 1000 ? (rem / 1000).toFixed(2) + ' km' : Math.round(rem) + ' m'}</b> to go`;

      this.prog.firstChild.style.width = `${ss.progress * 100}%`;
      this.ticks.forEach((t, i) => t.classList.toggle('done', i < ss.cpNext));
      this.rpmBar.firstChild.style.width = `${Math.min(100, veh.rpm01 * 100)}%`;
      const fuel = ss.fuel / ss.params.fuelCap;
      this.fuelBar.firstChild.style.width = `${fuel * 100}%`;
      this.fuelBar.firstChild.style.background = fuel < 0.2 ? '#ef4444' : fuel < 0.4 ? '#f59e0b' : '#10b981';
      this.dmgBar.firstChild.style.width = `${ss.damage}%`;
      if (this.heatBar) {
        this.heatBar.firstChild.style.width = `${ss.heat * 100}%`;
        this.heatBar.firstChild.style.background = ss.overheated ? '#ef4444' : ss.heat > 0.8 ? '#f97316' : '#f59e0b';
      }
      const gear = veh.speed < -0.3 ? 'R' : (veh.low ? '4L ' : 'H ') + veh.gear;
      const surf = veh.wheels[0].surface.name.toUpperCase();
      this.info.innerHTML = `<div class="dash-tags"><span class="tag-gear ${veh.speed < -0.3 ? 'rev' : veh.low ? 'low' : ''}">${gear}</span><span class="tag-surf">${surf}</span>${veh.lock ? '<span class="tag-lock">LOCKED</span>' : ''}</div><div class="dash-meta">${extra.weather}</div>`;
      this.bWinch.classList.toggle('on', !!veh.winchAnchor && this.opts.winch && !this.input.winch);

      let warn = '';
      if (veh.upY < 0.35) warn = 'ROLLED OVER<br>press RESET';
      else if (ss.fuel <= 0) warn = 'OUT OF FUEL<br>press RESET for a tow';
      else if (ss.overheated) warn = 'OVERHEATED - ease off the throttle';
      else if (ss.damage >= 100) warn = 'ENGINE DAMAGED - limp mode until next checkpoint';
      else if (ss.flats.some(Boolean)) warn = 'PUNCTURE - less grip until the next checkpoint';
      else if (ss.brakeHeat > 0.8) warn = 'BRAKES FADING - ease off, use low range downhill';
      else if (ss.heat > 0.88) warn = 'ENGINE HOT';
      else if (ss.offRoute) warn = 'OFF ROUTE';
      else if (ss.stuckTime > 4) warn = this.opts.winch && veh.winchAnchor ? 'STUCK - hold WINCH' : 'STUCK - ease off, reverse, or RESET';
      else if (fuel < 0.15) warn = 'LOW FUEL';
      this.warnEl.style.display = warn ? 'block' : 'none';
      if (warn) this.warnEl.innerHTML = warn;
    }
    if (this.frame % 4 === 0 && !this.simple) this.drawIncl(veh);
    if (this.frame % 6 === 0) this.drawMap(ss);
  }

  drawIncl(veh) {
    const g = this.incl.getContext('2d');
    g.clearRect(0, 0, 120, 120);
    g.save();
    g.translate(60, 60);

    // Bezel & background dial
    g.beginPath();
    g.arc(0, 0, 56, 0, 6.283);
    const bgGrad = g.createRadialGradient(0, 0, 10, 0, 0, 56);
    bgGrad.addColorStop(0, 'rgba(18, 32, 44, 0.75)');
    bgGrad.addColorStop(1, 'rgba(8, 16, 22, 0.92)');
    g.fillStyle = bgGrad;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    g.stroke();
    g.clip();

    // Artificial horizon ground
    g.rotate(-veh.roll);
    const off = Math.max(-50, Math.min(50, veh.pitch * 90));
    const grGrad = g.createLinearGradient(0, off, 0, off + 120);
    grGrad.addColorStop(0, 'rgba(110, 78, 48, 0.95)');
    grGrad.addColorStop(1, 'rgba(65, 42, 24, 0.98)');
    g.fillStyle = grGrad;
    g.fillRect(-90, off, 180, 120);

    // Horizon line
    g.strokeStyle = '#55d0ff';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(-90, off);
    g.lineTo(90, off);
    g.stroke();

    // Pitch ladder ticks
    g.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    g.lineWidth = 1.5;
    [-20, 20].forEach((dy) => {
      g.beginPath();
      g.moveTo(-24, off + dy);
      g.lineTo(24, off + dy);
      g.stroke();
    });
    g.restore();

    // Aircraft crosshair center reticle
    const danger = Math.abs(veh.roll) > 0.42 || Math.abs(veh.pitch) > 0.5;
    const warning = !danger && (Math.abs(veh.roll) > 0.28 || Math.abs(veh.pitch) > 0.35);
    const retColor = danger ? '#ff4d4f' : warning ? '#ffd23f' : '#34d399';
    g.strokeStyle = retColor;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(34, 60); g.lineTo(50, 60);
    g.moveTo(70, 60); g.lineTo(86, 60);
    g.moveTo(60, 50); g.lineTo(60, 56);
    g.stroke();
    g.fillStyle = retColor;
    g.beginPath();
    g.arc(60, 60, 3.5, 0, 6.283);
    g.fill();

    // Degree readouts
    const rollDeg = Math.round(Math.abs(veh.roll) * 57.3);
    const pitchDeg = Math.round(veh.pitch * 57.3);
    g.fillStyle = '#ffffff';
    g.font = '800 13px -apple-system, sans-serif';
    g.textAlign = 'center';
    g.shadowColor = 'rgba(0,0,0,0.8)';
    g.shadowBlur = 4;
    g.fillText(`${rollDeg}° | ${pitchDeg > 0 ? '+' : ''}${pitchDeg}°`, 60, 112);
  }

  drawMap(ss) {
    const g = this.map.getContext('2d');
    const s = this.map.width;
    g.clearRect(0, 0, s, s);
    g.drawImage(this.mapBg, 0, 0);

    // Checkpoint nodes
    this.mapCps.forEach(([x, y], i) => {
      const isNext = i === ss.cpNext;
      const isDone = i < ss.cpNext;
      g.fillStyle = isDone ? '#10b981' : isNext ? '#ffd23f' : '#64748b';
      g.beginPath();
      g.arc(x, y, isNext ? 6 : 4, 0, 6.283);
      g.fill();
      if (isNext) {
        g.strokeStyle = 'rgba(255, 210, 63, 0.5)';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(x, y, 9, 0, 6.283);
        g.stroke();
      }
    });

    // Finish gate
    g.fillStyle = '#ffffff';
    g.fillRect(this.mapFinish[0] - 4, this.mapFinish[1] - 4, 8, 8);
    g.fillStyle = '#0f172a';
    g.fillRect(this.mapFinish[0] - 4, this.mapFinish[1] - 4, 4, 4);
    g.fillRect(this.mapFinish[0], this.mapFinish[1], 4, 4);

    // Caches
    for (const c of ss.caches) {
      if (!c.found) continue;
      const [x, y] = this.mapT(c.x, c.z);
      g.fillStyle = '#ffd23f';
      g.fillRect(x - 3, y - 3, 6, 6);
    }

    // Vehicle cursor with directional headlight cone
    const veh = ss.vehicle;
    const [x, y] = this.mapT(veh.p[0], veh.p[2]);
    g.save();
    g.translate(x, y);
    g.rotate(-veh.heading);

    // Headlight cone
    const coneGrad = g.createRadialGradient(0, 0, 2, 0, -22, 24);
    coneGrad.addColorStop(0, 'rgba(255, 255, 200, 0.45)');
    coneGrad.addColorStop(1, 'rgba(255, 255, 200, 0)');
    g.fillStyle = coneGrad;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(-14, -26);
    g.lineTo(14, -26);
    g.closePath();
    g.fill();

    // Player arrow
    g.fillStyle = '#38bdf8';
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1.8;
    g.beginPath();
    g.moveTo(0, -10);
    g.lineTo(6.5, 7.5);
    g.lineTo(0, 4);
    g.lineTo(-6.5, 7.5);
    g.closePath();
    g.fill();
    g.stroke();
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
    if (!this.loadEl) {
      this.loadEl = el('div', 'load', '<div class="lt"></div><div class="lb"><i></i></div>');
      this.root.appendChild(this.loadEl);
    }
    this.layout();
    const lt = this.loadEl.querySelector('.lt');
    if (lt) lt.textContent = text;
    const bar = this.loadEl.querySelector('i');
    if (bar) bar.style.width = `${Math.min(100, Math.max(0, frac * 100))}%`;
  }
  loaded() {
    if (this.loadEl) {
      const elToFade = this.loadEl;
      this.loadEl = null;
      elToFade.classList.add('fade-out');
      setTimeout(() => {
        if (elToFade && elToFade.parentNode) elToFade.remove();
      }, 380);
    }
  }

  dispose() {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    if (this.onTilt) window.removeEventListener('deviceorientation', this.onTilt);
    clearTimeout(this.toastTimer);
  }
}
