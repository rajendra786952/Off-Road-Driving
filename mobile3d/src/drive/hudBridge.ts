// The link between the 3D game loop and the React Native HUD.
//
// The browser version built its HUD out of DOM nodes inside the game class. Here the game
// calls the same methods (toast, coach, update, panel, loading ...) on this object, which
// keeps a plain snapshot; src/screens/DriveHud.tsx draws the snapshot and src/screens/
// DriveControls.tsx writes the touch input back into it. The game never touches React.
import { Platform } from 'react-native';
import { fmtTime } from './core/session.js';

export interface PanelLine { text?: string; color?: string; small?: boolean; bold?: boolean; stars?: number; of?: number }
export interface PanelButton { label: string; cls?: string; fn: () => void }
export interface HudConfig { difflock: boolean; winch: boolean; hot: boolean; steerMode: string; simple: boolean }

export interface HudMap {
  /** SVG path of the main route and of side roads, in a 220 x 220 box. */
  main: string;
  side: string;
  cps: [number, number][];
  finish: [number, number];
}

export interface HudState {
  loading: { text: string; frac: number } | null;
  failed: string | null;
  toast: string;
  coach: { title: string; sub: string } | null;
  warn: string;
  panel: { title: string; body: PanelLine[]; buttons: PanelButton[] } | null;
  running: boolean;
  time: string;
  cp: number;
  cpTotal: number;
  cpTicks: number[];
  togo: string;
  progress: number;
  speed: number;
  rpm: number;
  fuel: number;
  damage: number;
  heat: number;
  overheated: boolean;
  gear: string;
  gearKind: '' | 'rev' | 'low';
  surface: string;
  locked: boolean;
  weather: string;
  fps: number;
  roll: number;
  pitch: number;
  low: boolean;
  lock: boolean;
  winchReady: boolean;
  carX: number;
  carY: number;
  carHeading: number;
  found: [number, number][];
}

const blank = (): HudState => ({
  loading: { text: 'Loading...', frac: 0 }, failed: null, toast: '', coach: null, warn: '', panel: null, running: false,
  time: '0:00', cp: 0, cpTotal: 0, cpTicks: [], togo: '', progress: 0, speed: 0, rpm: 0, fuel: 1, damage: 0, heat: 0, overheated: false,
  gear: 'H 1', gearKind: '', surface: '', locked: false, weather: '', fps: 0, roll: 0, pitch: 0, low: false, lock: false, winchReady: false,
  carX: 110, carY: 110, carHeading: 0, found: [],
});

type Actions = 'pause' | 'camera' | 'recover';

export class HudBridge {
  state: HudState = blank();
  cfg: HudConfig = { difflock: false, winch: false, hot: false, steerMode: 'buttons', simple: true };
  map: HudMap | null = null;
  /** Touch input, written by the controls layer. */
  input = { gas: 0, brake: 0, steerL: 0, steerR: 0, steerA: 0, hand: false, low: false, lock: false, winch: false };
  /** The game checks these when it words the first-run coach. */
  pad = { active: false, look: 0 };
  touch = Platform.OS !== 'web';

  private listeners = new Set<() => void>();
  private actions: Partial<Record<Actions, () => void>> = {};
  private keys: Record<string, boolean> = {};
  private frame = 0;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private mapT: (x: number, z: number) => [number, number] = () => [110, 110];
  private onKey: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    // a keyboard works in the browser build (and makes the game testable on a desktop)
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      this.onKey = (e: KeyboardEvent) => {
        const d = e.type === 'keydown', k = e.code;
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
    }
  }

  // ------------------------------------------------------------ React side
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = (): HudState => this.state;
  private set(patch: Partial<HudState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  // ------------------------------------------------------------- game side
  configure(cfg: HudConfig): void {
    this.cfg = cfg;
  }
  layout(): void {}
  on(name: Actions, fn: () => void): void {
    this.actions[name] = fn;
  }
  fire(name: Actions): void {
    this.actions[name]?.();
  }
  toggle(name: 'low' | 'lock'): void {
    if (name === 'lock' && !this.cfg.difflock) {
      this.toast('Diff locks not installed - buy them in the garage');
      return;
    }
    this.input[name] = !this.input[name];
    this.set({ low: this.input.low, lock: this.input.lock });
  }
  look(): number {
    return (this.keys.KeyQ ? 1 : 0) - (this.keys.KeyE ? 1 : 0);
  }
  coach(title: string | null, sub?: string): void {
    const cur = this.state.coach;
    if (!title) {
      if (cur) this.set({ coach: null });
    } else if (!cur || cur.title !== title || cur.sub !== (sub || '')) this.set({ coach: { title, sub: sub || '' } });
  }
  read() {
    const k = this.keys, i = this.input;
    const kGas = k.ArrowUp || k.KeyW ? (k.ControlLeft ? 0.5 : 1) : 0;
    const kBrake = k.ArrowDown || k.KeyS ? 1 : 0;
    const left = Math.max(i.steerL, k.ArrowLeft || k.KeyA ? 1 : 0);
    const right = Math.max(i.steerR, k.ArrowRight || k.KeyD ? 1 : 0);
    return {
      gas: Math.max(i.gas, kGas),
      brake: Math.max(i.brake, kBrake),
      steer: Math.max(-1, Math.min(1, left - right + i.steerA)),
      hand: i.hand || !!k.Space,
      low: i.low,
      lock: i.lock,
      winch: i.winch || !!k.KeyF,
    };
  }
  toast(text: string, ms = 3200): void {
    this.set({ toast: text });
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.set({ toast: '' }), ms);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initMap(track: any): void {
    const size = 220;
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (let i = 0; i < track.nMain; i++) {
      minX = Math.min(minX, track.PX[i]); maxX = Math.max(maxX, track.PX[i]);
      minZ = Math.min(minZ, track.PZ[i]); maxZ = Math.max(maxZ, track.PZ[i]);
    }
    const span = Math.max(maxX - minX, maxZ - minZ) + 60;
    const sc = size / span;
    const ox = (minX + maxX) / 2, oz = (minZ + maxZ) / 2;
    this.mapT = (x, z) => [size / 2 - (x - ox) * sc, size / 2 - (z - oz) * sc];
    const line = (a: number, b: number): string => {
      // about 240 points is plenty for a 110-point-wide map
      const step = Math.max(2, Math.ceil((b - a) / 240));
      let d = '';
      for (let i = a; i <= b; i += step) {
        const [x, y] = this.mapT(track.PX[i], track.PZ[i]);
        d += `${i === a ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      return d;
    };
    let side = '';
    for (let c = 1; c < track.chainStart.length; c++) side += line(track.chainStart[c], track.chainEnd[c]);
    const f = track.roadPose(track.finishS);
    this.map = {
      main: line(0, track.nMain - 1),
      side,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cps: track.checkpoints.map((cp: any) => { const p = track.roadPose(cp.s); return this.mapT(p.x, p.z); }),
      finish: this.mapT(f.x, f.z),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.set({ cpTotal: track.checkpoints.length, cpTicks: track.checkpoints.map((cp: any) => cp.s / track.finishS) });
  }

  /** Called every frame; the snapshot is refreshed about ten times a second. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update(ss: any, extra: { weather: string; fps: number }): void {
    this.frame++;
    if (this.frame % 6 !== 0) return;
    const veh = ss.vehicle;
    const rem = ss.remaining;
    const fuel = ss.fuel / ss.params.fuelCap;
    let warn = '';
    if (veh.upY < 0.35) warn = 'ROLLED OVER\npress RESET';
    else if (ss.fuel <= 0) warn = 'OUT OF FUEL\npress RESET for a tow';
    else if (ss.overheated) warn = 'OVERHEATED - ease off the throttle';
    else if (ss.damage >= 100) warn = 'ENGINE DAMAGED - limp mode until next checkpoint';
    else if (ss.flats.some(Boolean)) warn = 'PUNCTURE - less grip until the next checkpoint';
    else if (ss.brakeHeat > 0.8) warn = 'BRAKES FADING - ease off, use low range downhill';
    else if (ss.heat > 0.88) warn = 'ENGINE HOT';
    else if (ss.offRoute) warn = 'OFF ROUTE';
    else if (ss.stuckTime > 4) warn = this.cfg.winch && veh.winchAnchor ? 'STUCK - hold WINCH' : 'STUCK - ease off, reverse, or RESET';
    else if (fuel < 0.15) warn = 'LOW FUEL';
    const [carX, carY] = this.mapT(veh.p[0], veh.p[2]);
    const found: [number, number][] = [];
    for (const c of ss.caches) if (c.found) found.push(this.mapT(c.x, c.z));
    this.set({
      running: true,
      speed: Math.round(Math.abs(veh.speed) * 3.6),
      time: fmtTime(ss.totalTime),
      cp: ss.cpNext,
      togo: rem >= 1000 ? (rem / 1000).toFixed(2) + ' km' : Math.round(rem) + ' m',
      progress: ss.progress,
      rpm: Math.min(1, veh.rpm01),
      fuel,
      damage: ss.damage / 100,
      heat: ss.heat,
      overheated: !!ss.overheated,
      gear: veh.speed < -0.3 ? 'R' : (veh.low ? '4L ' : 'H ') + veh.gear,
      gearKind: veh.speed < -0.3 ? 'rev' : veh.low ? 'low' : '',
      surface: veh.wheels[0].surface.name.toUpperCase(),
      locked: !!veh.lock,
      weather: extra.weather,
      fps: extra.fps,
      roll: veh.roll,
      pitch: veh.pitch,
      winchReady: !!veh.winchAnchor && this.cfg.winch && !this.input.winch,
      warn,
      carX, carY, carHeading: veh.heading, found,
    });
  }

  panel(title: string, body: PanelLine[], buttons: PanelButton[]): void {
    this.set({ panel: { title, body, buttons } });
  }
  closePanel(): void {
    if (this.state.panel) this.set({ panel: null });
  }
  loading(text: string, frac: number): void {
    const f = Math.min(1, Math.max(0, frac));
    const cur = this.state.loading;
    // a few percent at a time is enough: every change is a React render
    if (!cur || cur.text !== text || f - cur.frac > 0.02 || f < cur.frac) this.set({ loading: { text, frac: f } });
  }
  loaded(): void {
    this.set({ loading: null });
  }
  /** The track could not be built: the HUD shows the reason and a way back. */
  fail(message: string): void {
    this.set({ failed: message, loading: null });
  }

  dispose(): void {
    if (this.onKey && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.onKey);
      window.removeEventListener('keyup', this.onKey);
    }
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.listeners.clear();
  }
}
