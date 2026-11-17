// Track + terrain model (pure JS, no rendering).
//
// A track is authored "turtle style" with TrackBuilder: go(length, turn, grade)
// segments plus features (mud, rocks, fords, bridges, bypasses, spurs...).
// build() compiles that into:
//   - a centreline polyline (2 m spacing) with per-point width / surface / banks
//   - a continuous heightfield h(x,z) in which the road is carved, so the road
//     always follows real terrain (no floating roads)
//   - obstacles, tree colliders, checkpoints, water, bridges, winch anchors
// The heightfield is cached in 32 m chunks on a 1 m grid. The renderer builds
// its meshes from the SAME chunk data the physics samples, so what you see is
// exactly what the wheels touch.
import { fbm, noise2, rand2, smoothstep } from './noise.js';
import { SURFACES } from './surfaces.js';
import { ENVIRONMENTS } from './environments.js';

export const STEP = 2;          // centreline spacing (m)
export const CHUNK = 32;        // chunk size (m) == cells per side (1 m grid)
export const CW = CHUNK + 3;    // stored grid width (1 cell border for normals)
const HASH = 30;                // centreline spatial hash cell (m)
const SEARCH = 3;               // hash cells searched each way
const R2 = (HASH * SEARCH) * (HASH * SEARCH);
const BUCKET = 32;              // points per candidate bucket
const W_MACRO = 1 / Math.pow(60, 4);
const OB_CELL = 8;

const key2 = (a, b) => (a + 32768) * 65536 + (b + 32768);

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothArray(arr, radius, from = 0, to = arr.length) {
  const out = arr.slice();
  for (let i = from; i < to; i++) {
    let sum = 0;
    let n = 0;
    for (let k = -radius; k <= radius; k++) {
      const j = i + k;
      if (j < from || j >= to) continue;
      sum += arr[j];
      n++;
    }
    out[i] = sum / n;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Authoring DSL
// ---------------------------------------------------------------------------
export class TrackBuilder {
  /** @param meta {id,name,region,env,weather,time,seed,startY} */
  constructor(meta) {
    this.meta = { weather: 'clear', time: 'day', startY: 120, seed: 1, ...meta };
    this.cur = { width: 7, surface: 'dirt', rough: 0.04, wavy: 0.05, L: 0, R: 0, bank: 0 };
    this.segs = [];
    this.features = [];
    this.s = 0;
    this.hd = 0;    // current heading (deg, + = left of the start direction)
    this.base = 0;  // heading the wander() motif is pulled towards
    this.y = 0;     // elevation relative to the start
    this.rand = mulberry((this.meta.seed | 0) * 2654435761 + 99);
  }

  /** Set the general direction of travel for following motifs. */
  aim(deg) { this.base = deg; return this; }

  /** Sticky defaults for following segments. */
  set(o) { Object.assign(this.cur, o); return this; }

  /** Drive `len` metres, turning `turn` degrees in total (+ = left), at `grade` percent. */
  go(len, turn = 0, grade = 0, o) {
    this.segs.push({ len, turn, grade, ...this.cur, ...(o || {}) });
    this.s += len;
    this.hd += turn;
    this.y += (grade / 100) * len;
    return this;
  }

  cp(name) { this.features.push({ type: 'cp', s: this.s, name }); return this; }
  note(text) { this.features.push({ type: 'note', s: this.s, text }); return this; }
  anchor(side = 1, ahead = 0) { this.features.push({ type: 'anchor', s: this.s + ahead, side }); return this; }

  /** Surface patch over the next `len` m. from/to are fractions of the half width (-1 right edge .. 1 left edge). */
  patch(len, surf, o = {}) {
    this.features.push({ type: 'patch', s0: this.s + (o.at || 0), s1: this.s + (o.at || 0) + len, f0: o.from ?? -1.4, f1: o.to ?? 1.4, surf });
    return this;
  }
  mud(len, o = {}) { return this.patch(len, o.deep ? 'deepmud' : 'mud', o); }
  ice(len, o = {}) { return this.patch(len, 'ice', o); }

  /** Lava (or any hazard surface) in a strip BESIDE the road for the next len m. Never on the driving line. */
  lava(len, o = {}) {
    const side = o.side ?? 1, gap = o.gap ?? 1.35, w = o.width ?? 3.5;
    this.features.push({ type: 'patch', s0: this.s + (o.at || 0), s1: this.s + (o.at || 0) + len, f0: side > 0 ? gap : -gap - w, f1: side > 0 ? gap + w : -gap, surf: o.surf || 'lava' });
    return this;
  }
  /** Waterfall on the bank beside the road (visual + mist), `ahead` m from here. */
  fall(side = 1, o = {}) {
    this.features.push({ type: 'fall', s: this.s + (o.ahead || 0), side, h: o.h ?? 12, w: o.w ?? 6 });
    return this;
  }

  /** Scatter n rocks over the next len m. size = [min,max] radius. */
  rocks(len, n, size = [0.25, 0.5], o = {}) {
    this.features.push({ type: 'rocks', s0: this.s + (o.at || 0), len, n, size, hr: o.hr ?? 0.7, spread: o.spread ?? 1.0, clear: o.clear });
    return this;
  }
  /** One boulder `ahead` m from here at lateral fraction `f` of the half width. */
  boulder(ahead, f, r = 1.2, h) {
    this.features.push({ type: 'boulder', s: this.s + ahead, f, r, h: h ?? r * 1.1 });
    return this;
  }
  /** Fallen log lying across the road. f0..f1 = lateral extent (fractions), r = radius. */
  log(ahead, o = {}) {
    this.features.push({ type: 'log', s: this.s + ahead, r: o.r ?? 0.24, f0: o.from ?? -1.2, f1: o.to ?? 1.2, skew: o.skew ?? 0 });
    return this;
  }
  /** River crossing over the next len m, `depth` m deep at the middle. */
  ford(len, depth = 0.6, o = {}) {
    this.features.push({ type: 'ford', s0: this.s + (o.at || 0), s1: this.s + (o.at || 0) + len, depth, bed: o.bed || 'riverbed' });
    return this;
  }
  /** Wooden bridge over a gorge for the next len m (author it straight). */
  bridge(len, o = {}) {
    this.features.push({ type: 'bridge', s0: this.s, s1: this.s + len, width: o.width ?? 3.4, depth: o.depth ?? 14, rails: o.rails ?? false });
    return this;
  }
  /** Alternative line beside the main road for the next len m. */
  bypass(len, o = {}) {
    this.features.push({ type: 'bypass', s0: this.s + (o.at || 0), s1: this.s + (o.at || 0) + len, side: o.side ?? 1, offset: o.offset ?? 12, width: o.width ?? 4.5, surface: o.surface || 'grass', rough: o.rough ?? 0.08, wavy: o.wavy ?? 0.12, dy: o.dy ?? 0, prefer: !!o.prefer });
    return this;
  }
  /** Dead-end side trail starting here. segs = [[len, turn, grade], ...]. Ends at a supply cache. */
  spur(turn, segs, o = {}) {
    this.features.push({ type: 'spur', s: this.s, turn, segs, reward: o.reward ?? 150, name: o.name || 'Supply cache', width: o.width ?? 4.5, surface: o.surface || 'dirt', rough: o.rough ?? 0.1 });
    return this;
  }

  build() { return new Track(this); }
}

// ---------------------------------------------------------------------------
// Compiled track
// ---------------------------------------------------------------------------
export class Track {
  constructor(b) {
    this.meta = b.meta;
    this.env = ENVIRONMENTS[b.meta.env];
    this.seed = b.meta.seed | 0;
    this.offSurface = SURFACES[this.env.off];
    this._compile(b);
    this.chunks = new Map();
    this._lastChunk = null;
    this._lastKey = -1;
    this._bk = new Int32Array(64);
    this._bd = new Float64Array(64);
    this._bi = new Int32Array(64);
    this._o = { h: 0, e: 0, idx: -1 };
    this.sq = { surface: this.offSurface, waterY: -1e9, s: 0, d: 0, onRoad: false };
  }

  // ---- compilation -------------------------------------------------------
  _compile(b) {
    const P = { x: [], z: [], y: [], hw: [], surf: [], rough: [], wavy: [], L: [], R: [], bank: [], s: [], chain: [] };
    const chainStart = [];
    const chainEnd = [];

    // main chain
    let x = 0, z = 0, hd = 0, y = b.meta.startY, s = 0;
    const heads = [];
    const push = (seg, chain, sVal, hdVal) => {
      P.x.push(x); P.z.push(z); P.y.push(y);
      P.hw.push(seg.width / 2); P.surf.push(SURFACES[seg.surface].id);
      P.rough.push(seg.rough); P.wavy.push(seg.wavy ?? 0.05); P.L.push(seg.L); P.R.push(seg.R);
      P.bank.push(Math.tan((seg.bank * Math.PI) / 180));
      P.s.push(sVal); P.chain.push(chain);
      if (chain === 0) heads.push(hdVal);
    };
    chainStart.push(0);
    push(b.segs[0], 0, 0, 0);
    for (const seg of b.segs) {
      const n = Math.max(1, Math.round(seg.len / STEP));
      const ds = seg.len / n;
      const dh = ((seg.turn * Math.PI) / 180) / n;
      for (let i = 0; i < n; i++) {
        hd += dh;
        x += Math.sin(hd) * ds;
        z += Math.cos(hd) * ds;
        y += (seg.grade / 100) * ds;
        s += ds;
        push(seg, 0, s, hd);
      }
    }
    const nMain = P.x.length;
    chainEnd.push(nMain - 1);
    this.length = s;
    this.nMain = nMain;

    // smooth main-chain profiles
    P.y = smoothArray(P.y, 3);
    P.hw = smoothArray(P.hw, 5);
    P.rough = smoothArray(P.rough, 4);
    P.wavy = smoothArray(P.wavy, 4);
    P.L = smoothArray(P.L, 8);
    P.R = smoothArray(P.R, 8);
    P.bank = smoothArray(P.bank, 6);

    const idxAt = (sv) => Math.max(0, Math.min(nMain - 1, Math.round((sv / this.length) * (nMain - 1))));
    // exact index by s (points are not perfectly uniform) - refine locally
    const idxS = (sv) => {
      let i = idxAt(sv);
      while (i > 0 && P.s[i] > sv) i--;
      while (i < nMain - 1 && P.s[i + 1] <= sv) i++;
      return i;
    };
    this._idxS = idxS;

    this.checkpoints = [];
    this.notes = [];
    this.patches = [];
    this.water = [];
    this.bridges = [];
    this.obstacles = [];
    this.anchors = [];
    this.caches = [];
    this.bypasses = [];
    this.falls = [];
    this.relics = [];
    const rng = mulberry(this.seed * 7919 + 13);
    const leftOf = (i) => {
      const a = Math.max(0, i - 1), c = Math.min(nMain - 1, i + 1);
      const tx = P.x[c] - P.x[a], tz = P.z[c] - P.z[a];
      const l = Math.hypot(tx, tz) || 1;
      return { tx: tx / l, tz: tz / l, lx: tz / l, lz: -tx / l };
    };
    const posAt = (sv, f) => {
      const i = idxS(sv);
      const fr = leftOf(i);
      const ds = sv - P.s[i];
      const d = f * P.hw[i];
      return { x: P.x[i] + fr.tx * ds + fr.lx * d, z: P.z[i] + fr.tz * ds + fr.lz * d, i, fr };
    };

    // features that reshape the road first
    for (const f of b.features) {
      if (f.type === 'ford') {
        const i0 = idxS(f.s0), i1 = idxS(f.s1);
        const level = Math.min(P.y[i0], P.y[i1]) - 0.12;
        for (let i = i0; i <= i1; i++) {
          const u = (P.s[i] - f.s0) / (f.s1 - f.s0);
          const bell = smoothstep(0, 0.3, u) * smoothstep(1, 0.7, u);
          const base = P.y[i0] + (P.y[i1] - P.y[i0]) * u;
          P.y[i] = base - f.depth * bell - 0.12 * Math.min(1, bell * 4);
          if (bell > 0.15) P.surf[i] = SURFACES[f.bed].id;
        }
        this.water.push({ s0: f.s0 - 2, s1: f.s1 + 2, level, i0, i1 });
      } else if (f.type === 'bridge') {
        const i0 = idxS(f.s0), i1 = idxS(f.s1);
        const y0 = P.y[i0], y1 = P.y[i1];
        for (let i = i0; i <= i1; i++) {
          const u = (P.s[i] - f.s0) / (f.s1 - f.s0);
          const gap = smoothstep(0.02, 0.2, u) * smoothstep(0.98, 0.8, u);
          P.y[i] = y0 + (y1 - y0) * u - f.depth * gap;
          P.L[i] = 0; P.R[i] = 0;
        }
        this.bridges.push({
          x0: P.x[i0], z0: P.z[i0], y0, x1: P.x[i1], z1: P.z[i1], y1,
          half: f.width / 2, len: Math.hypot(P.x[i1] - P.x[i0], P.z[i1] - P.z[i0]), s0: f.s0, s1: f.s1, rails: f.rails
        });
      }
    }

    // branch chains
    const addChain = (pts, o) => {
      const c = chainStart.length;
      chainStart.push(P.x.length);
      let sv = 0;
      pts.forEach((p, k) => {
        if (k > 0) sv += Math.hypot(p.x - pts[k - 1].x, p.z - pts[k - 1].z);
        P.x.push(p.x); P.z.push(p.z); P.y.push(p.y);
        P.hw.push(o.width / 2); P.surf.push(SURFACES[o.surface].id);
        P.rough.push(o.rough); P.wavy.push(o.wavy ?? 0.1); P.L.push(0); P.R.push(0); P.bank.push(0);
        P.s.push(sv); P.chain.push(c);
      });
      chainEnd.push(P.x.length - 1);
      return c;
    };
    for (const f of b.features) {
      if (f.type === 'bypass') {
        const i0 = idxS(f.s0), i1 = idxS(f.s1);
        const pts = [];
        for (let i = i0; i <= i1; i++) {
          const u = (i - i0) / (i1 - i0);
          const w = smoothstep(0, 0.28, u) * smoothstep(1, 0.72, u);
          const fr = leftOf(i);
          const off = f.side * f.offset * w;
          pts.push({ x: P.x[i] + fr.lx * off, z: P.z[i] + fr.lz * off, y: P.y[i] + f.dy * w });
        }
        const c = addChain(pts, f);
        this.bypasses.push({ s0: f.s0, s1: f.s1, side: f.side, prefer: !!f.prefer, i0, n: pts.length, start: chainStart[c] });
      } else if (f.type === 'spur') {
        const i0 = idxS(f.s);
        let sx = P.x[i0], sz = P.z[i0], sy = P.y[i0];
        let h = heads[i0] + (f.turn * Math.PI) / 180;
        const pts = [{ x: sx, z: sz, y: sy }];
        for (const [len, turn, grade] of f.segs) {
          const n = Math.max(1, Math.round(len / STEP));
          const ds = len / n;
          for (let k = 0; k < n; k++) {
            h += ((turn * Math.PI) / 180) / n;
            sx += Math.sin(h) * ds; sz += Math.cos(h) * ds; sy += (grade / 100) * ds;
            pts.push({ x: sx, z: sz, y: sy });
          }
        }
        const ys = smoothArray(pts.map((p) => p.y), 3);
        pts.forEach((p, k) => { p.y = ys[k]; });
        addChain(pts, f);
        const end = pts[pts.length - 1];
        this.caches.push({ x: end.x, z: end.z, reward: f.reward, name: f.name, s: f.s });
      }
    }

    // typed arrays
    const n = P.x.length;
    this.n = n;
    this.PX = Float64Array.from(P.x); this.PZ = Float64Array.from(P.z); this.PY = Float64Array.from(P.y);
    this.HW = Float32Array.from(P.hw); this.SURF = Uint8Array.from(P.surf); this.ROUGH = Float32Array.from(P.rough); this.WAVY = Float32Array.from(P.wavy);
    this.SL = Float32Array.from(P.L); this.SR = Float32Array.from(P.R); this.BANK = Float32Array.from(P.bank);
    this.S = Float32Array.from(P.s); this.CHAIN = Uint8Array.from(P.chain);
    this.chainStart = chainStart; this.chainEnd = chainEnd;
    this.TX = new Float32Array(n); this.TZ = new Float32Array(n);
    this.BUCKET = new Int32Array(n);
    for (let c = 0; c < chainStart.length; c++) {
      for (let i = chainStart[c]; i <= chainEnd[c]; i++) {
        const a = Math.max(chainStart[c], i - 1), d = Math.min(chainEnd[c], i + 1);
        const tx = this.PX[d] - this.PX[a], tz = this.PZ[d] - this.PZ[a];
        const l = Math.hypot(tx, tz) || 1;
        this.TX[i] = tx / l; this.TZ[i] = tz / l;
        this.BUCKET[i] = c * 100000 + Math.floor((i - chainStart[c]) / BUCKET);
      }
    }
    this.hash = new Map();
    for (let i = 0; i < n; i++) {
      const k = key2(Math.floor(this.PX[i] / HASH), Math.floor(this.PZ[i] / HASH));
      let arr = this.hash.get(k);
      if (!arr) this.hash.set(k, (arr = []));
      arr.push(i);
    }

    // macro control points (road elevation field, with side trends)
    const cx = [], cz = [], cy = [];
    for (let i = 0; i < nMain; i += 30) {
      const fr = leftOf(i);
      cx.push(P.x[i]); cz.push(P.z[i]); cy.push(P.y[i]);
      for (const side of [1, -1]) {
        const amt = side > 0 ? P.L[i] : P.R[i];
        cx.push(P.x[i] + fr.lx * side * 95); cz.push(P.z[i] + fr.lz * side * 95); cy.push(P.y[i] + amt);
      }
    }
    this.CX = Float64Array.from(cx); this.CZ = Float64Array.from(cz); this.CY = Float64Array.from(cy);

    // remaining features
    for (const f of b.features) {
      if (f.type === 'cp') {
        this.checkpoints.push({ s: f.s, name: f.name });
      } else if (f.type === 'note') {
        this.notes.push({ s: f.s, text: f.text });
      } else if (f.type === 'patch') {
        this.patches.push({ s0: f.s0, s1: f.s1, f0: f.f0, f1: f.f1, surface: SURFACES[f.surf] });
      } else if (f.type === 'fall') {
        const p = posAt(f.s, f.side);
        this.falls.push({ x: p.x + p.fr.lx * f.side * 4.5, z: p.z + p.fr.lz * f.side * 4.5, heading: Math.atan2(p.fr.tx, p.fr.tz), side: f.side, h: f.h, w: f.w });
      } else if (f.type === 'anchor') {
        const p = posAt(f.s, f.side * 1.0);
        const fr = p.fr;
        this.anchors.push({ x: p.x + fr.lx * f.side * 1.6, z: p.z + fr.lz * f.side * 1.6, post: true });
      } else if (f.type === 'rocks') {
        for (let k = 0; k < f.n; k++) {
          const sv = f.s0 + rng() * f.len;
          let fl = (rng() * 2 - 1) * f.spread;
          if (f.clear !== undefined && Math.abs(fl - f.clear) < 0.32) fl += fl > f.clear ? 0.36 : -0.36;
          const r = f.size[0] + rng() * (f.size[1] - f.size[0]);
          const p = posAt(sv, fl);
          this.obstacles.push({ type: 'rock', x: p.x, z: p.z, r, h: r * f.hr * (0.8 + rng() * 0.4), rot: rng() * 6.28, tint: rng() });
        }
      } else if (f.type === 'boulder') {
        const p = posAt(f.s, f.f);
        this.obstacles.push({ type: 'rock', x: p.x, z: p.z, r: f.r, h: f.h, rot: rng() * 6.28, tint: rng(), big: true });
      } else if (f.type === 'log') {
        const a = posAt(f.s - f.skew, f.f0), c = posAt(f.s + f.skew, f.f1);
        const len = Math.hypot(c.x - a.x, c.z - a.z);
        this.obstacles.push({
          type: 'log', x: (a.x + c.x) / 2, z: (a.z + c.z) / 2, r: f.r, len,
          ax: (c.x - a.x) / len, az: (c.z - a.z) / len
        });
      }
    }
    this.sidePatches = this.patches.some((p) => p.f1 > 1.5 || p.f0 < -1.5);
    // hidden relics: three collectibles tucked off the trail (not shown on the map)
    for (let k = 0; k < 3; k++) {
      let sv = this.length * (0.17 + 0.3 * k + rng() * 0.08);
      for (let tries = 0; tries < 12; tries++, sv += 22) {
        const i = idxS(sv);
        if (this.water.some((w) => sv > w.s0 - 12 && sv < w.s1 + 12) || this.bridges.some((b) => sv > b.s0 - 15 && sv < b.s1 + 15)) continue;
        let side = rng() < 0.5 ? 1 : -1;
        if (Math.abs(side > 0 ? P.L[i] : P.R[i]) > 7) side = -side;
        // on a ledge with a wall and a drop there is no room off the trail: tuck it against the wall
        const steep = Math.abs(side > 0 ? P.L[i] : P.R[i]) > 7;
        if (steep) side = (P.L[i] > P.R[i]) ? 1 : -1;
        if (this.patches.some((p) => sv > p.s0 - 4 && sv < p.s1 + 4 && (p.f1 > 1.5 || p.f0 < -1.5))) continue;
        const fr = leftOf(i);
        const off = steep ? P.hw[i] + 1.1 : P.hw[i] + 6.5 + rng() * 4;
        this.relics.push({ x: P.x[i] + fr.lx * side * off, z: P.z[i] + fr.lz * side * off, s: sv });
        break;
      }
    }
    this.checkpoints.sort((a, c) => a.s - c.s);
    this.patches.sort((a, c) => a.s0 - c.s0);
    this.finishS = this.length - 12;
    this.startS = 8;

    this.obHash = new Map();
    for (const o of this.obstacles) {
      const reach = o.type === 'log' ? o.len / 2 + o.r : o.r;
      for (let gx = Math.floor((o.x - reach) / OB_CELL); gx <= Math.floor((o.x + reach) / OB_CELL); gx++) {
        for (let gz = Math.floor((o.z - reach) / OB_CELL); gz <= Math.floor((o.z + reach) / OB_CELL); gz++) {
          const k = key2(gx, gz);
          let arr = this.obHash.get(k);
          if (!arr) this.obHash.set(k, (arr = []));
          arr.push(o);
        }
      }
    }
  }

  // ---- raw analytic terrain ---------------------------------------------
  /** Evaluate terrain at (x,z) -> this._o {h, e (signed distance to road edge), idx (nearest centreline point)} */
  _eval(x, z) {
    const o = this._o;
    const { PX, PZ, PY, HW, BUCKET: BK, CHAIN, TX, TZ } = this;
    const bk = this._bk, bd = this._bd, bi = this._bi;
    let nb = 0;
    const hx = Math.floor(x / HASH), hz = Math.floor(z / HASH);
    for (let dz = -SEARCH; dz <= SEARCH; dz++) {
      for (let dx = -SEARCH; dx <= SEARCH; dx++) {
        const arr = this.hash.get(key2(hx + dx, hz + dz));
        if (!arr) continue;
        for (let k = 0; k < arr.length; k++) {
          const i = arr[k];
          const ex = x - PX[i], ez = z - PZ[i];
          const d2 = ex * ex + ez * ez;
          if (d2 > R2) continue;
          const bkt = BK[i];
          let j = 0;
          for (; j < nb; j++) if (bk[j] === bkt) break;
          if (j === nb) {
            if (nb >= 64) continue;
            bk[nb] = bkt; bd[nb] = d2; bi[nb] = i; nb++;
          } else if (d2 < bd[j]) { bd[j] = d2; bi[j] = i; }
        }
      }
    }

    const seed = this.seed;
    const env = this.env;
    const hills = fbm(x / 230, z / 230, seed + 7, 3) * env.hillAmp;
    const detail = fbm(x / 11, z / 11, seed + 3, 2) * env.detailAmp;
    const rn = noise2(x / 1.9, z / 1.9, seed + 11) * 0.7 + noise2(x / 4.3, z / 4.3, seed + 12) * 0.5;
    const wn = noise2(x / 2.9, z / 2.9, seed + 13) + noise2(x / 6.3, z / 6.3, seed + 14) * 0.6;

    // macro field: smooth interpolation of road elevations (pre-sampled per chunk when available)
    const macro = (this._mbUse ? this._mbVal : this._macroBase(x, z)) + hills + detail + rn * env.offRough + wn * env.offWavy;

    let wsum = W_MACRO, hsum = W_MACRO * macro;
    let bestE = 1e9, bestIdx = -1;
    for (let j = 0; j < nb; j++) {
      const i = bi[j];
      const c = CHAIN[i];
      const first = this.chainStart[c], last = this.chainEnd[c];
      if (i > first) { const ex = x - PX[i - 1], ez = z - PZ[i - 1]; if (ex * ex + ez * ez < bd[j]) continue; }
      if (i < last) { const ex = x - PX[i + 1], ez = z - PZ[i + 1]; if (ex * ex + ez * ez < bd[j]) continue; }

      // project on the two adjacent segments
      let bestD2 = 1e18, ia = i, u = 0, fx = PX[i], fz = PZ[i];
      for (let side = 0; side < 2; side++) {
        const a = side === 0 ? i - 1 : i;
        if (a < first || a + 1 > last) continue;
        const sx = PX[a + 1] - PX[a], sz = PZ[a + 1] - PZ[a];
        let t = ((x - PX[a]) * sx + (z - PZ[a]) * sz) / (sx * sx + sz * sz);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = PX[a] + sx * t, qz = PZ[a] + sz * t;
        const d2 = (x - qx) * (x - qx) + (z - qz) * (z - qz);
        if (d2 < bestD2) { bestD2 = d2; ia = a; u = t; fx = qx; fz = qz; }
      }
      const ib = Math.min(last, ia + 1);
      const dist = Math.sqrt(bestD2);
      const tx = TX[ia] + (TX[ib] - TX[ia]) * u, tz = TZ[ia] + (TZ[ib] - TZ[ia]) * u;
      const dSigned = (x - fx) * tz + (z - fz) * -tx; // left positive
      const sgn = dSigned >= 0 ? 1 : -1;
      const hw = HW[ia] + (HW[ib] - HW[ia]) * u;
      const yI = PY[ia] + (PY[ib] - PY[ia]) * u;
      const bank = this.BANK[ia] + (this.BANK[ib] - this.BANK[ia]) * u;
      const rough = this.ROUGH[ia] + (this.ROUGH[ib] - this.ROUGH[ia]) * u;
      const wavy = this.WAVY[ia] + (this.WAVY[ib] - this.WAVY[ia]) * u;
      let h;
      const e = dist - hw;
      if (e <= 0) {
        h = yI + bank * dSigned + rough * rn + wavy * wn;
      } else {
        const amt = sgn > 0 ? this.SL[ia] + (this.SL[ib] - this.SL[ia]) * u : this.SR[ia] + (this.SR[ib] - this.SR[ia]) * u;
        const run = 1.5 + Math.abs(amt) * 0.75;
        const fade = smoothstep(0, 6, e);
        h = yI + bank * sgn * hw + amt * smoothstep(0, run, e)
          + hills * smoothstep(10, 70, e) + detail * smoothstep(0, 10, e)
          + rn * (rough + (env.offRough - rough) * fade) + wn * (wavy + (env.offWavy - wavy) * fade);
      }
      const q = bestD2 + 4;
      const w = 1 / (q * q);
      wsum += w; hsum += w * h;
      if (e < bestE) { bestE = e; bestIdx = dist - hw < 40 ? i : -1; }
    }
    o.h = hsum / wsum;
    o.e = bestE;
    o.idx = bestIdx;
    return o;
  }

  /** Smooth field interpolating road elevations (and their side trends). */
  _macroBase(x, z) {
    let ws = 0, hs = 0;
    const { CX, CZ, CY } = this;
    for (let k = 0; k < CX.length; k++) {
      const ex = x - CX[k], ez = z - CZ[k];
      const q = ex * ex + ez * ez + 400;
      const w = 1 / (q * q);
      ws += w; hs += w * CY[k];
    }
    return hs / ws;
  }

  /** Smooth field interpolating road elevations (and their side trends). */
  _macroBase(x, z) {
    let ws = 0, hs = 0;
    const { CX, CZ, CY } = this;
    for (let k = 0; k < CX.length; k++) {
      const ex = x - CX[k], ez = z - CZ[k];
      const q = ex * ex + ez * ez + 400;
      const w = 1 / (q * q);
      ws += w; hs += w * CY[k];
    }
    return hs / ws;
  }

  // ---- chunk cache --------------------------------------------------------
  getChunk(cx, cz) {
    const k = key2(cx, cz);
    if (k === this._lastKey) return this._lastChunk;
    let ch = this.chunks.get(k);
    if (!ch) {
      const h = new Float32Array(CW * CW);
      const e = new Float32Array(CW * CW);
      const idx = new Int32Array(CW * CW);
      const x0 = cx * CHUNK - 1, z0 = cz * CHUNK - 1;
      // 8 m lattice of the macro field (6 x 6 samples instead of 35 x 35)
      const LS = 8, LN = 6;
      const lat = this._lat || (this._lat = new Float64Array(LN * LN));
      for (let j = 0; j < LN; j++) for (let i = 0; i < LN; i++) lat[j * LN + i] = this._macroBase(x0 + i * LS, z0 + j * LS);
      this._mbUse = true;
      for (let j = 0; j < CW; j++) {
        const fj = j / LS, j0 = Math.min(LN - 2, Math.floor(fj)), tj = fj - j0;
        for (let i = 0; i < CW; i++) {
          const fi = i / LS, i0 = Math.min(LN - 2, Math.floor(fi)), ti = fi - i0;
          const a = lat[j0 * LN + i0], b = lat[j0 * LN + i0 + 1], c = lat[(j0 + 1) * LN + i0], d = lat[(j0 + 1) * LN + i0 + 1];
          this._mbVal = a + (b - a) * ti + (c - a) * tj + (a - b - c + d) * ti * tj;
          const o = this._eval(x0 + i, z0 + j);
          const q = j * CW + i;
          h[q] = o.h; e[q] = o.e; idx[q] = o.idx;
        }
      }
      this._mbUse = false;
      this._mbUse = false;
      ch = { cx, cz, h, e, idx, props: null };
      this.chunks.set(k, ch);
    }
    this._lastKey = k; this._lastChunk = ch;
    return ch;
  }

  /** Bare terrain height (triangle-exact on the 1 m grid, matches the rendered mesh). */
  heightAt(x, z) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const ch = this.getChunk(cx, cz);
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
    let ix = Math.floor(lx), iz = Math.floor(lz);
    if (ix > CHUNK - 1) ix = CHUNK - 1;
    if (iz > CHUNK - 1) iz = CHUNK - 1;
    const fx = lx - ix, fz = lz - iz;
    const q = (iz + 1) * CW + ix + 1;
    const h = ch.h;
    const h00 = h[q], h10 = h[q + 1], h01 = h[q + CW], h11 = h[q + CW + 1];
    if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
    return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  }

  /** Height added by rocks / logs at (x,z). */
  bumpAt(x, z) {
    const arr = this.obHash.get(key2(Math.floor(x / OB_CELL), Math.floor(z / OB_CELL)));
    if (!arr) return 0;
    let best = 0;
    for (let k = 0; k < arr.length; k++) {
      const o = arr[k];
      const dx = x - o.x, dz = z - o.z;
      if (o.type === 'rock') {
        const u2 = (dx * dx + dz * dz) / (o.r * o.r);
        if (u2 < 1) { const h = o.h * (1 - u2); if (h > best) best = h; }
      } else {
        const t = dx * o.ax + dz * o.az;
        if (Math.abs(t) > o.len / 2) continue;
        const u = Math.abs(dx * o.az - dz * o.ax);
        if (u < o.r * 0.95) { const h = Math.sqrt(o.r * o.r - u * u) + o.r * 0.55; if (h > best) best = h; }
      }
    }
    return best;
  }

  /** Bridge deck height at (x,z) or -Infinity. */
  deckAt(x, z) {
    for (let k = 0; k < this.bridges.length; k++) {
      const b = this.bridges[k];
      const sx = b.x1 - b.x0, sz = b.z1 - b.z0;
      const t = ((x - b.x0) * sx + (z - b.z0) * sz) / (b.len * b.len);
      if (t < -0.02 || t > 1.02) continue;
      const d = Math.abs(((x - b.x0) * sz - (z - b.z0) * sx) / b.len);
      if (d > b.half) continue;
      return b.y0 + (b.y1 - b.y0) * Math.min(1, Math.max(0, t));
    }
    return -Infinity;
  }

  /** Solid ground under a point that is itself at height y (bridges only count from above). */
  groundAt(x, z, y) {
    let g = this.heightAt(x, z) + this.bumpAt(x, z);
    if (this.bridges.length) {
      const d = this.deckAt(x, z);
      if (d > g && y > d - 0.9) g = d;
    }
    return g;
  }

  normalAt(x, z, y, out) {
    const e = 0.3;
    const dx = this.groundAt(x + e, z, y) - this.groundAt(x - e, z, y);
    const dz = this.groundAt(x, z + e, y) - this.groundAt(x, z - e, y);
    const nx = -dx, ny = 2 * e, nz = -dz;
    const l = Math.hypot(nx, ny, nz);
    out[0] = nx / l; out[1] = ny / l; out[2] = nz / l;
    return out;
  }

  /** Surface + water at (x,z). Result in this.sq (reused object). */
  surfaceAt(x, z, y = 1e9) {
    const sq = this.sq;
    sq.surface = this.offSurface; sq.waterY = -1e9; sq.onRoad = false; sq.s = -1; sq.d = 0;
    if (this.bridges.length) {
      const dk = this.deckAt(x, z);
      if (dk > -1e8 && y > dk - 0.9 && dk > this.heightAt(x, z)) { sq.surface = SURFACES.wood; sq.onRoad = true; return sq; }
    }
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const ch = this.getChunk(cx, cz);
    const ix = Math.min(CHUNK, Math.round(x - cx * CHUNK)), iz = Math.min(CHUNK, Math.round(z - cz * CHUNK));
    const i = ch.idx[(iz + 1) * CW + ix + 1];
    if (i < 0) return sq;
    const dx = x - this.PX[i], dz = z - this.PZ[i];
    const tx = this.TX[i], tz = this.TZ[i];
    const s = this.S[i] + dx * tx + dz * tz;
    const d = dx * tz - dz * tx;
    const hw = this.HW[i];
    sq.s = s; sq.d = d;
    const main = this.CHAIN[i] === 0;
    if (main) {
      for (let k = 0; k < this.water.length; k++) {
        const w = this.water[k];
        if (s >= w.s0 && s <= w.s1) { sq.waterY = w.level; break; }
      }
    }
    if (Math.abs(d) <= hw + 0.5) {
      sq.onRoad = true;
      sq.surface = SURFACE_BY_ID[this.SURF[i]];
    } else if (sq.waterY > -1e8 && Math.abs(d) < 60) {
      sq.surface = SURFACES.riverbed;
    }
    if (main) {
      const f = d / hw;
      for (let k = 0; k < this.patches.length; k++) {
        const p = this.patches[k];
        if (p.s0 > s) break;
        if (s <= p.s1 && f >= p.f0 && f <= p.f1) { sq.surface = p.surface; sq.onRoad = true; break; }
      }
    }
    return sq;
  }

  // ---- props (trees / boulders / bushes), deterministic per chunk --------
  propsFor(cx, cz) {
    const ch = this.getChunk(cx, cz);
    if (ch.props) return ch.props;
    const env = this.env;
    const props = [];
    const G = 4; // 4 m placement cells
    const nG = CHUNK / G;
    const seed = this.seed;
    for (let gj = 0; gj < nG; gj++) {
      for (let gi = 0; gi < nG; gi++) {
        const wx = cx * nG + gi, wz = cz * nG + gj;
        const r0 = rand2(wx, wz, seed + 501);
        const x = (wx + 0.15 + 0.7 * rand2(wx, wz, seed + 502)) * G;
        const z = (wz + 0.15 + 0.7 * rand2(wx, wz, seed + 503)) * G;
        const lx = Math.round(x - cx * CHUNK), lz = Math.round(z - cz * CHUNK);
        const q = (lz + 1) * CW + lx + 1;
        const e = ch.e[q];
        if (e < 2.2) continue;
        const y = this.heightAt(x, z);
        const slope = Math.abs(ch.h[q + 1] - ch.h[q - 1]) + Math.abs(ch.h[q + CW] - ch.h[q - CW]);
        const mask = 0.55 + 0.45 * fbm(x / 60, z / 60, seed + 91, 2);
        let type = null;
        if (r0 < env.trees * mask && slope < 1.6) type = 'tree';
        else if (r0 > 1 - env.boulders) type = 'boulder';
        else if (r0 > 0.5 && r0 < 0.5 + env.bushes * 0.5 && slope < 1.6) type = 'bush';
        if (!type) continue;
        if (this.water.length || this.sidePatches) { const sq = this.surfaceAt(x, z); if (sq.waterY > y - 0.3 || sq.surface.hot) continue; }
        const sc = 0.75 + rand2(wx, wz, seed + 504) * 0.7;
        const p = { type, x, z, y, scale: sc, rot: rand2(wx, wz, seed + 505) * 6.28, v: rand2(wx, wz, seed + 506), r: 0 };
        if (type === 'tree') p.r = 0.28 * sc;
        if (type === 'boulder') { p.scale = 0.7 + rand2(wx, wz, seed + 504) * 1.6; p.r = 0.8 * p.scale; }
        props.push(p);
      }
    }
    ch.props = props;
    return props;
  }

  /** Call fn(prop) for solid props near (x,z). */
  collidersNear(x, z, fn) {
    const c0x = Math.floor((x - 3) / CHUNK), c1x = Math.floor((x + 3) / CHUNK);
    const c0z = Math.floor((z - 3) / CHUNK), c1z = Math.floor((z + 3) / CHUNK);
    for (let cz = c0z; cz <= c1z; cz++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const props = this.propsFor(cx, cz);
        for (let k = 0; k < props.length; k++) {
          const p = props[k];
          if (p.r > 0 && Math.abs(p.x - x) < 4 && Math.abs(p.z - z) < 4) fn(p);
        }
      }
    }
  }

  /** Nearest winch anchor in front of the vehicle within `range`. */
  findAnchor(x, z, fx, fz, range = 46) {
    // Prefer what is straight ahead (a pull to the side drags the truck off the trail)
    // and purpose-built winch posts over random trees.
    let best = null, bestScore = -1e9;
    const r2 = range * range;
    const test = (ax, az, post) => {
      const dx = ax - x, dz = az - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 16 || d2 > r2) return;
      const d = Math.sqrt(d2);
      const cos = (dx * fx + dz * fz) / d;
      if (cos < (post ? 0.5 : 0.8)) return;
      const score = cos * 2 - d / 120 + (post ? 0.6 : 0);
      if (score > bestScore) { bestScore = score; best = { x: ax, z: az, post }; }
    };
    for (const a of this.anchors) test(a.x, a.z, true);
    const c0x = Math.floor((x - range) / CHUNK), c1x = Math.floor((x + range) / CHUNK);
    const c0z = Math.floor((z - range) / CHUNK), c1z = Math.floor((z + range) / CHUNK);
    for (let cz = c0z; cz <= c1z; cz++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        for (const p of this.propsFor(cx, cz)) if (p.type === 'tree' || (p.type === 'boulder' && p.scale > 1.2)) test(p.x, p.z, false);
      }
    }
    if (best) best.y = this.heightAt(best.x, best.z) + 1.0;
    return best;
  }

  // ---- route queries ------------------------------------------------------
  /** Nearest main-chain point index, searching around `hint`. */
  locateMain(x, z, hint = 0) {
    const { PX, PZ } = this;
    let best = hint, bd = 1e18;
    const a = Math.max(0, hint - 30), b = Math.min(this.nMain - 1, hint + 45);
    for (let i = a; i <= b; i++) {
      const dx = x - PX[i], dz = z - PZ[i];
      const d2 = dx * dx + dz * dz;
      if (d2 < bd) { bd = d2; best = i; }
    }
    if (bd > 60 * 60) {
      for (let i = 0; i < this.nMain; i += 3) {
        const dx = x - PX[i], dz = z - PZ[i];
        const d2 = dx * dx + dz * dz;
        if (d2 < bd) { bd = d2; best = i; }
      }
    }
    return best;
  }

  /** Progress s and signed lateral offset relative to main point i. */
  mainSD(i, x, z, out) {
    const dx = x - this.PX[i], dz = z - this.PZ[i];
    out.s = this.S[i] + dx * this.TX[i] + dz * this.TZ[i];
    out.d = dx * this.TZ[i] - dz * this.TX[i];
    return out;
  }

  /** Pose on the road centre at distance s (for spawning and recovery). */
  roadPose(s, lateral = 0) {
    const i = this._idxS(Math.max(0, Math.min(this.length, s)));
    const tx = this.TX[i], tz = this.TZ[i];
    const ds = s - this.S[i];
    const x = this.PX[i] + tx * ds + tz * lateral;
    const z = this.PZ[i] + tz * ds - tx * lateral;
    return { x, z, y: this.groundAt(x, z, 1e9), heading: Math.atan2(tx, tz), i };
  }

  /** Road gradient (rise/run) and curvature (1/m, + = left) around main index i. */
  roadShape(i, span = 4) {
    const a = Math.max(0, i - span), b = Math.min(this.nMain - 1, i + span);
    const ds = this.S[b] - this.S[a] || 1;
    const grade = (this.PY[b] - this.PY[a]) / ds;
    const h0 = Math.atan2(this.TX[a], this.TZ[a]), h1 = Math.atan2(this.TX[b], this.TZ[b]);
    let dh = h1 - h0;
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    return { grade, curv: dh / ds };
  }
}

const SURFACE_BY_ID = Object.values(SURFACES);
