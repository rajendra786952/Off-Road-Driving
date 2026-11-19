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

function catmullRomSmooth(arr, iterations = 2, preserveEnds = 2) {
  let cur = arr.slice();
  const n = cur.length;
  if (n < 5) return cur;
  for (let it = 0; it < iterations; it++) {
    const next = cur.slice();
    for (let i = preserveEnds; i < n - preserveEnds; i++) {
      // 5-point quintic Catmull-Rom B-spline filter: weights (-1, 4, 10, 4, -1) / 16
      next[i] = (-cur[i - 2] + 4 * cur[i - 1] + 10 * cur[i] + 4 * cur[i + 1] - cur[i + 2]) / 16;
    }
    cur = next;
  }
  return cur;
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
    this.x = 0;     // plan position (m), integrated the same way the compiler does
    this.z = 0;
    this.marks = {};
    this.rand = mulberry((this.meta.seed | 0) * 2654435761 + 99);
  }

  /** Name this point of the route (for link()). */
  mark(name) { this.marks[name] = this.s; return this; }

  /**
   * A second road between two marked points of the main route (open world road network).
   * o: { width, surface, rough, wavy, bend (m, sideways bulge), dy (m, hump or dip mid-way), wig (m, meander), biome, name }
   */
  link(a, b, o = {}) {
    if (!(a in this.marks) || !(b in this.marks)) throw new Error(`link: unknown mark ${a} / ${b}`);
    this.features.push({ type: 'link', sA: this.marks[a], sB: this.marks[b], width: o.width ?? 5, surface: o.surface || 'dirt', rough: o.rough ?? 0.08, wavy: o.wavy ?? 0.12, bend: o.bend ?? 0, dy: o.dy ?? 0, wig: o.wig ?? 0, side: o.side || 0, biome: o.biome, name: o.name || '' });
    return this;
  }

  /** The next len m run under a rock roof (author the cutting with high L / R banks). */
  tunnel(len) { this.features.push({ type: 'tunnel', s0: this.s, s1: this.s + len }); return this; }

  /** A named place beside the road. o: { side, off (m from the road edge), ahead, kind, reward, r } */
  landmark(id, name, o = {}) {
    this.features.push({ type: 'landmark', s: this.s + (o.ahead || 0), side: o.side ?? 1, off: o.off ?? 8, id, name, kind: o.kind || 'poi', reward: o.reward ?? 150, r: o.r ?? 32 });
    return this;
  }

  /** Set the general direction of travel for following motifs. */
  aim(deg) { this.base = deg; return this; }

  /** Sticky defaults for following segments. */
  set(o) { Object.assign(this.cur, o); return this; }

  /** Drive `len` metres, turning `turn` degrees in total (+ = left), at `grade` percent. */
  go(len, turn = 0, grade = 0, o) {
    this.segs.push({ len, turn, grade, ...this.cur, ...(o || {}) });
    {
      const n = Math.max(1, Math.round(len / STEP)), ds = len / n, dh = ((turn * Math.PI) / 180) / n;
      let h = (this.hd * Math.PI) / 180;
      for (let i = 0; i < n; i++) { h += dh; this.x += Math.sin(h) * ds; this.z += Math.cos(h) * ds; }
    }
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
    this.features.push({ type: 'spur', s: this.s, turn, segs, reward: o.reward ?? 150, name: o.name || 'Supply cache', width: o.width ?? 4.5, surface: o.surface || 'dirt', rough: o.rough ?? 0.1, wavy: o.wavy, cache: o.cache !== false, biome: o.biome ?? this.cur.biome });
    return this;
  }

  build() {
    // tracks/journey.js divides a registered track into areas here, just before it is compiled
    if (TrackBuilder.journey) TrackBuilder.journey(this);
    return new Track(this);
  }
}

// ---------------------------------------------------------------------------
// Compiled track
// ---------------------------------------------------------------------------
export class Track {
  constructor(b) {
    this.meta = b.meta;
    this.env = b.meta.envDef || ENVIRONMENTS[b.meta.env];
    this.seed = b.meta.seed | 0;
    this.offSurface = SURFACES[this.env.off];
    // open world: several biomes blended by position, and a sea
    this.biomes = b.meta.world ? b.meta.world.biomes : null;
    this.seaLevel = b.meta.world ? b.meta.world.seaLevel : undefined;
    this.seaSide = b.meta.world && b.meta.world.seaSide ? b.meta.world.seaSide : -1;      // which side of a coast road the sea is on (-1 = right)
    this.offSurfaces = this.biomes ? this.biomes.map((e) => SURFACES[e.off]) : null;
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
    const P = { x: [], z: [], y: [], hw: [], surf: [], rough: [], wavy: [], L: [], R: [], bank: [], s: [], chain: [], bio: [] };
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
      P.s.push(sVal); P.chain.push(chain); P.bio.push(seg.biome | 0);
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

    // Catmull-Rom spline smoothing for main-chain path ribbon
    P.x = catmullRomSmooth(P.x, 2, 2);
    P.z = catmullRomSmooth(P.z, 2, 2);
    P.y = catmullRomSmooth(P.y, 2, 2);

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
    this.links = [];
    this.junctions = [];
    this.tunnels = [];
    this.landmarks = [];
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
        P.s.push(sv); P.chain.push(c); P.bio.push(o.biome | 0);
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
        if (f.cache !== false) this.caches.push({ x: end.x, z: end.z, reward: f.reward, name: f.name, s: f.s });
        this.junctions.push(f.s);
      } else if (f.type === 'link') {
        // a road between two points of the main route: a smooth curve that leaves each end square to the road
        const i0 = idxS(f.sA), i1 = idxS(f.sB);
        const ax = P.x[i0], az = P.z[i0], bx = P.x[i1], bz = P.z[i1];
        const L = Math.hypot(bx - ax, bz - az) || 1;
        const fa = leftOf(i0), fb = leftOf(i1);
        const sa = f.side || ((bx - ax) * fa.lx + (bz - az) * fa.lz >= 0 ? 1 : -1);      // f.side: leave both ends on that side of the road
        const sb = f.side || ((ax - bx) * fb.lx + (az - bz) * fb.lz >= 0 ? 1 : -1);
        const k = L * 0.36, px = -(bz - az) / L, pz = (bx - ax) / L;
        const c1x = ax + fa.lx * sa * k + px * f.bend, c1z = az + fa.lz * sa * k + pz * f.bend;
        const c2x = bx + fb.lx * sb * k + px * f.bend, c2z = bz + fb.lz * sb * k + pz * f.bend;
        const dense = [];
        const nD = Math.max(40, Math.round(L * 2));
        for (let q = 0; q <= nD; q++) {
          const u = q / nD, v = 1 - u;
          const w = f.wig * Math.sin(Math.PI * u) * (noise2(u * L / 60, f.sA * 0.01, this.seed + 401));
          dense.push({
            x: v * v * v * ax + 3 * v * v * u * c1x + 3 * v * u * u * c2x + u * u * u * bx + px * w,
            z: v * v * v * az + 3 * v * v * u * c1z + 3 * v * u * u * c2z + u * u * u * bz + pz * w
          });
        }
        // resample to the same 2 m spacing as the main route
        let total = 0;
        for (let q = 1; q < dense.length; q++) total += Math.hypot(dense[q].x - dense[q - 1].x, dense[q].z - dense[q - 1].z);
        const nP = Math.max(4, Math.round(total / STEP));
        const pts = [];
        let q = 1, acc = 0, seg = Math.hypot(dense[1].x - dense[0].x, dense[1].z - dense[0].z);
        for (let m = 0; m <= nP; m++) {
          const want = (m / nP) * total;
          while (q < dense.length - 1 && acc + seg < want) { acc += seg; q++; seg = Math.hypot(dense[q].x - dense[q - 1].x, dense[q].z - dense[q - 1].z); }
          const t = seg > 0 ? Math.min(1, (want - acc) / seg) : 0, u = m / nP;
          pts.push({
            x: dense[q - 1].x + (dense[q].x - dense[q - 1].x) * t, z: dense[q - 1].z + (dense[q].z - dense[q - 1].z) * t,
            y: P.y[i0] + (P.y[i1] - P.y[i0]) * smoothstep(0, 1, u) + f.dy * Math.sin(Math.PI * u)
          });
        }
        const c = addChain(pts, { ...f, biome: f.biome ?? P.bio[i0] });
        this.links.push({ name: f.name, start: chainStart[c], n: pts.length, sA: f.sA, sB: f.sB });
        this.junctions.push(f.sA, f.sB);
      }
    }

    // typed arrays
    const n = P.x.length;
    this.n = n;
    this.PX = Float64Array.from(P.x); this.PZ = Float64Array.from(P.z); this.PY = Float64Array.from(P.y);
    this.HW = Float32Array.from(P.hw); this.SURF = Uint8Array.from(P.surf); this.ROUGH = Float32Array.from(P.rough); this.WAVY = Float32Array.from(P.wavy);
    this.SL = Float32Array.from(P.L); this.SR = Float32Array.from(P.R); this.BANK = Float32Array.from(P.bank);
    this.S = Float32Array.from(P.s); this.CHAIN = Uint8Array.from(P.chain); this.BIO = Uint8Array.from(P.bio);
    this.chainStart = chainStart; this.chainEnd = chainEnd;
    this.TX = new Float32Array(n); this.TZ = new Float32Array(n);
    this.BUCKET = new Int32Array(n);
    for (let c = 0; c < chainStart.length; c++) {
      const cStart = chainStart[c], cEnd = chainEnd[c];
      for (let i = cStart; i <= cEnd; i++) {
        let tx, tz;
        if (i >= cStart + 2 && i <= cEnd - 2) {
          // 4th-order Catmull-Rom tangent stencil: continuous C1 tangents
          tx = (-this.PX[i + 2] + 8 * this.PX[i + 1] - 8 * this.PX[i - 1] + this.PX[i - 2]) / 12;
          tz = (-this.PZ[i + 2] + 8 * this.PZ[i + 1] - 8 * this.PZ[i - 1] + this.PZ[i - 2]) / 12;
        } else {
          const a = Math.max(cStart, i - 1), d = Math.min(cEnd, i + 1);
          tx = this.PX[d] - this.PX[a];
          tz = this.PZ[d] - this.PZ[a];
        }
        const l = Math.hypot(tx, tz) || 1;
        this.TX[i] = tx / l; this.TZ[i] = tz / l;
        this.BUCKET[i] = c * 100000 + Math.floor((i - cStart) / BUCKET);
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
    // link roads shape the land they cross too
    for (const l of this.links) for (let i = l.start + 15; i < l.start + l.n - 10; i += 30) { cx.push(P.x[i]); cz.push(P.z[i]); cy.push(P.y[i]); }
    this.CX = Float64Array.from(cx); this.CZ = Float64Array.from(cz); this.CY = Float64Array.from(cy);
    if (this.biomes) {
      // area anchors: every 24 m of every road, with the road's direction and height there (the coast needs both)
      const ax = [], az = [], ab = [], atx = [], atz = [], ay = [], am = [];
      for (let c = 0; c < chainStart.length; c++) {
        for (let i = chainStart[c]; i <= chainEnd[c]; i += 12) {
          ax.push(P.x[i]); az.push(P.z[i]); ab.push(P.bio[i]); atx.push(this.TX[i]); atz.push(this.TZ[i]); ay.push(P.y[i]); am.push(c === 0 ? 1 : 0);
        }
      }
      this.AX = Float64Array.from(ax); this.AZ = Float64Array.from(az); this.AB = Uint8Array.from(ab);
      this.ATX = Float32Array.from(atx); this.ATZ = Float32Array.from(atz); this.AY = Float32Array.from(ay); this.AM = Uint8Array.from(am);
    }

    // remaining features
    for (const f of b.features) {
      if (f.type === 'cp') {
        this.checkpoints.push({ s: f.s, name: f.name });
      } else if (f.type === 'note') {
        this.notes.push({ s: f.s, text: f.text });
      } else if (f.type === 'tunnel') {
        this.tunnels.push({ s0: f.s0, s1: f.s1, i0: idxS(f.s0), i1: idxS(f.s1) });
      } else if (f.type === 'landmark') {
        const p = posAt(f.s, f.side);
        this.landmarks.push({ id: f.id, name: f.name, kind: f.kind, reward: f.reward, r: f.r, s: f.s, x: p.x + p.fr.lx * f.side * f.off, z: p.z + p.fr.lz * f.side * f.off, heading: Math.atan2(p.fr.tx, p.fr.tz) });
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

    this.layer = null;
    this.solidHash = new Map();
    this._hashObstacles();
  }

  // ---- generated obstacle layer (core/obstacles.js) ------------------------------
  _hashInto(map, o, reach) {
    for (let gx = Math.floor((o.x - reach) / OB_CELL); gx <= Math.floor((o.x + reach) / OB_CELL); gx++) {
      for (let gz = Math.floor((o.z - reach) / OB_CELL); gz <= Math.floor((o.z + reach) / OB_CELL); gz++) {
        const k = key2(gx, gz);
        let arr = map.get(k);
        if (!arr) map.set(k, (arr = []));
        arr.push(o);
      }
    }
  }

  _reach(o) { return o.type === 'log' ? o.len / 2 + o.r : o.type === 'slab' ? Math.hypot(o.len / 2, o.depth / 2) : o.r; }

  _hashObstacles() {
    this.obHash = new Map();
    for (const o of this.obstacles) this._hashInto(this.obHash, o, this._reach(o));
  }

  /**
   * Install (or with null, remove) a generated obstacle layer. The compiled track is cached and
   * shared between runs, so this always strips the previous layer first.
   */
  setLayer(layer) {
    if (this.layer || this.obstacles.some((o) => o.gen)) {
      this.obstacles = this.obstacles.filter((o) => !o.gen);
      this.patches = this.patches.filter((p) => !p.gen);
      this.anchors = this.anchors.filter((a) => !a.gen);
      for (const b of this.bridges) b.gaps = null;
    }
    this.layer = layer || null;
    this.solidHash = new Map();
    if (layer) {
      for (const p of layer.patches) p.off = !!p.dyn0;
      this.obstacles.push(...layer.obstacles);
      this.patches.push(...layer.patches);
      this.patches.sort((a, c) => a.s0 - c.s0);
      this.anchors.push(...layer.anchors);
      for (const g of layer.gaps) { const b = this.bridges[g.bridge]; (b.gaps || (b.gaps = [])).push(g); }
      for (const o of layer.solids) { o.y = undefined; this._hashInto(this.solidHash, o, o.r); }
    }
    this._hashObstacles();
  }

  /** Add an obstacle while a run is in progress (a tree that has just come down). Removed with the layer. */
  addObstacle(o) {
    o.gen = true;
    this.obstacles.push(o);
    this._hashInto(this.obHash, o, this._reach(o));
  }

  /** Lateral offset (m, + = left) of the clear line the generator left through its obstacles at distance s. */
  lineOffset(s) {
    const H = this.layer && this.layer.hints;
    if (!H || !H.length) return 0;
    let ws = 0, ds = 0;
    for (let k = 0; k < H.length; k++) {
      const h = H[k];
      if (h.s0 - 10 > s) break;
      if (h.s1 + 10 < s) continue;
      const w = smoothstep(h.s0 - 10, h.s0, s) * smoothstep(h.s1 + 10, h.s1, s);
      ws += w; ds += w * h.d;
    }
    return ws > 1 ? ds / ws : ds;
  }

  /** Call fn(solid) for the layer's solid blocks near (x,z). */
  solidsNear(x, z, fn) {
    if (!this.solidHash.size) return;
    const arr = this.solidHash.get(key2(Math.floor(x / OB_CELL), Math.floor(z / OB_CELL)));
    if (!arr) return;
    for (let k = 0; k < arr.length; k++) fn(arr[k]);
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
    const env = this._envP || this.env;
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
      // open world: biome weights and the sea drop on a 4 m lattice
      const BL = this.biomes ? this._biomeLattice(x0, z0) : null;
      const bio = BL ? new Uint8Array(CW * CW) : null, bio2 = BL ? new Uint8Array(CW * CW) : null, bt = BL ? new Float32Array(CW * CW) : null;
      const NB = BL ? this.biomes.length : 0, wv = BL ? BL.tmp : null, EP = BL ? BL.env : null;
      this._mbUse = true;
      for (let j = 0; j < CW; j++) {
        const fj = j / LS, j0 = Math.min(LN - 2, Math.floor(fj)), tj = fj - j0;
        for (let i = 0; i < CW; i++) {
          const fi = i / LS, i0 = Math.min(LN - 2, Math.floor(fi)), ti = fi - i0;
          const a = lat[j0 * LN + i0], b = lat[j0 * LN + i0 + 1], c = lat[(j0 + 1) * LN + i0], d = lat[(j0 + 1) * LN + i0 + 1];
          this._mbVal = a + (b - a) * ti + (c - a) * tj + (a - b - c + d) * ti * tj;
          const q = j * CW + i;
          let drop = 0;
          if (BL) {
            const gi = i / 4, gj = j / 4, bi = Math.min(BL.n - 2, Math.floor(gi)), bj = Math.min(BL.n - 2, Math.floor(gj)), u = gi - bi, v = gj - bj;
            const k00 = bj * BL.n + bi, k10 = k00 + 1, k01 = k00 + BL.n, k11 = k01 + 1;
            const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w01 = (1 - u) * v, w11 = u * v;
            drop = BL.drop[k00] * w00 + BL.drop[k10] * w10 + BL.drop[k01] * w01 + BL.drop[k11] * w11;
            let b1 = 0, b2 = 0, m1 = -1, m2 = -1, hill = 0, det = 0, ro = 0, wa = 0;
            for (let m = 0; m < NB; m++) {
              const w = BL.w[k00 * NB + m] * w00 + BL.w[k10 * NB + m] * w10 + BL.w[k01 * NB + m] * w01 + BL.w[k11 * NB + m] * w11;
              wv[m] = w;
              if (w > m1) { m2 = m1; b2 = b1; m1 = w; b1 = m; } else if (w > m2) { m2 = w; b2 = m; }
              const E = this.biomes[m];
              hill += w * E.hillAmp; det += w * E.detailAmp; ro += w * E.offRough; wa += w * E.offWavy;
            }
            bio[q] = b1; bio2[q] = b2; bt[q] = m2 > 0 ? m2 / (m1 + m2) : 0;
            EP.hillAmp = hill; EP.detailAmp = det; EP.offRough = ro; EP.offWavy = wa;
            this._envP = EP;
          }
          const o = this._eval(x0 + i, z0 + j);
          h[q] = o.h - drop; e[q] = o.e; idx[q] = o.idx;
        }
      }
      this._mbUse = false;
      this._envP = null;
      ch = { cx, cz, h, e, idx, props: null, bio, bio2, bt };
      this.chunks.set(k, ch);
    }
    this._lastKey = k; this._lastChunk = ch;
    return ch;
  }

  /**
   * Area weights and the drop into the sea for one chunk, on a 4 m lattice.
   * An area's weight falls off with the distance to its nearest road anchor (the position is
   * warped by noise so borders wander). The sea: beside a coast road, on its sea side only, the
   * land slopes down below sea level - but never within 25 m of any road, so no road, side
   * trail or bypass is ever cut by it.
   */
  _biomeLattice(x0, z0) {
    const NB = this.biomes.length, n = 10;
    const L = this._bl || (this._bl = { n, w: new Float32Array(n * n * NB), drop: new Float32Array(n * n), d: new Float64Array(NB), tmp: new Float32Array(NB), env: { hillAmp: 0, detailAmp: 0, offRough: 0, offWavy: 0 }, near: [] });
    const { AX, AZ, AB, ATX, ATZ, AY, AM } = this;
    const sea = this.seaLevel, side = this.seaSide;
    const mx = x0 + 17, mz = z0 + 17, near = L.near;
    near.length = 0;
    for (let k = 0; k < AX.length; k++) if (Math.abs(AX[k] - mx) < 520 && Math.abs(AZ[k] - mz) < 520) near.push(k);
    if (!near.length) for (let k = 0; k < AX.length; k += 3) near.push(k);
    const seed = this.seed, d = L.d;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = x0 + i * 4, z = z0 + j * 4;
        const wx = x + 34 * noise2(x / 110, z / 110, seed + 71), wz = z + 34 * noise2(x / 110, z / 110, seed + 72);
        d.fill(1e9);
        let f = 1e9, dmin = 1e9, dAny = 1e9, depth = 0, ramp = 110;
        for (let q = 0; q < near.length; q++) {
          const k = near[q], b = AB[k];
          const dist = Math.hypot(AX[k] - wx, AZ[k] - wz);
          if (dist < d[b]) d[b] = dist;
          if (dist < dmin) dmin = dist;
          const ex = x - AX[k], ez = z - AZ[k], dt = Math.hypot(ex, ez);
          if (dt < dAny) dAny = dt;
          if (sea !== undefined && AM[k] && this.biomes[b].sea && (ex * ATZ[k] - ez * ATX[k]) * side > 0) {
            const g = dt - this.biomes[b].shore;
            if (g < f) { f = g; depth = AY[k] - sea + 7; ramp = this.biomes[b].shoreRamp || 110; }
          }
        }
        let sum = 0;
        const o = (j * n + i) * NB;
        for (let m = 0; m < NB; m++) { const w = d[m] > 1e8 ? 0 : Math.exp(-(d[m] - dmin) / 55); L.w[o + m] = w; sum += w; }
        for (let m = 0; m < NB; m++) L.w[o + m] /= sum || 1;
        L.drop[j * n + i] = f > 1e8 ? 0 : (smoothstep(0, ramp, f) * depth + Math.max(0, f - ramp) * 0.3) * smoothstep(25, 80, dAny);
      }
    }
    return L;
  }

  /** Open world: the environment that dominates at (x,z). */
  envAt(x, z) {
    if (!this.biomes) return this.env;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const ch = this.getChunk(cx, cz);
    return this.biomes[ch.bio[(Math.min(CHUNK, Math.round(z - cz * CHUNK)) + 1) * CW + Math.min(CHUNK, Math.round(x - cx * CHUNK)) + 1]];
  }

  /** Nearest road point of any chain: { x, z, y, heading, i } (free-roam recovery, spawning). */
  nearestRoad(x, z) {
    let best = 0, bd = 1e18;
    for (let i = 0; i < this.n; i += 2) {
      const dx = x - this.PX[i], dz = z - this.PZ[i], d2 = dx * dx + dz * dz;
      if (d2 < bd) { bd = d2; best = i; }
    }
    return { x: this.PX[best], z: this.PZ[best], y: this.groundAt(this.PX[best], this.PZ[best], 1e9), heading: Math.atan2(this.TX[best], this.TZ[best]), i: best, dist: Math.sqrt(bd) };
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
    let best = 0, low = 0;
    for (let k = 0; k < arr.length; k++) {
      const o = arr[k];
      const dx = x - o.x, dz = z - o.z;
      if (o.type === 'rock') {
        const u2 = (dx * dx + dz * dz) / (o.r * o.r);
        if (u2 < 1) { const h = o.h * (1 - u2); if (h > best) best = h; }
      } else if (o.type === 'slab') {
        // a flat-topped block lying across the road with ramped edges
        const t = Math.abs(dx * o.ax + dz * o.az), u = Math.abs(dx * o.az - dz * o.ax);
        if (t < o.len / 2 && u < o.depth / 2) {
          const h = o.h * Math.min(1, (o.depth / 2 - u) / o.ramp) * Math.min(1, (o.len / 2 - t) / 0.2);
          if (h > best) best = h;
        }
      } else if (o.type === 'hole') {
        // a pothole: a bowl below the road surface
        const u2 = (dx * dx + dz * dz) / (o.r * o.r);
        if (u2 < 1) { const h = -o.h * (1 - u2 * u2); if (h < low) low = h; }
      } else {
        const t = dx * o.ax + dz * o.az;
        if (Math.abs(t) > o.len / 2) continue;
        const u = Math.abs(dx * o.az - dz * o.ax);
        if (u < o.r * 0.95) { const h = Math.sqrt(o.r * o.r - u * u) + o.r * 0.55; if (h > best) best = h; }
      }
    }
    return best > 0 ? best : low;
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
      if (b.gaps) {
        // missing planks: no deck on one side of the bridge for a short stretch
        const sd = ((x - b.x0) * sz - (z - b.z0) * sx) / b.len;   // + = left of travel
        let open = false;
        for (let g = 0; g < b.gaps.length; g++) { const q = b.gaps[g]; if (t > q.t0 && t < q.t1 && sd * q.side > q.d0) { open = true; break; } }
        if (open) continue;
      }
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
    let sea = -1e9;
    if (this.biomes) {
      const qq = (iz + 1) * CW + ix + 1;
      sq.surface = this.offSurfaces[ch.bio[qq]];
      if (ch.h[qq] < this.seaLevel) { sea = this.seaLevel; sq.waterY = sea; sq.surface = SURFACES.riverbed; }   // sea, lagoons
    }
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
        if (s >= w.s0 && s <= w.s1) { sq.waterY = Math.max(sea, w.level); break; }
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
        if (s <= p.s1 && f >= p.f0 && f <= p.f1 && !p.off) { sq.surface = p.surface; sq.onRoad = true; break; }
      }
    }
    return sq;
  }

  // ---- props (trees / boulders / bushes), deterministic per chunk --------
  propsFor(cx, cz) {
    const ch = this.getChunk(cx, cz);
    if (ch.props) return ch.props;
    const env0 = this.env, B = this.biomes;
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
        // open world: the biome here (near a border, sometimes the neighbour's) decides what grows
        const bi = B ? (rand2(wx, wz, seed + 507) < ch.bt[q] ? ch.bio2[q] : ch.bio[q]) : 0;
        const env = B ? B[bi] : env0;
        const minE = env.treeClearance || 2.2;
        if (e < minE) continue;
        const y = this.heightAt(x, z);
        const slope = Math.abs(ch.h[q + 1] - ch.h[q - 1]) + Math.abs(ch.h[q + CW] - ch.h[q - CW]);
        // Clumping pattern: dense tree clusters with natural woodland clearings
        const clumping = fbm(x / 45, z / 45, seed + 91, 3);
        const mask = 0.55 + 0.45 * clumping + (clumping > 0.1 ? 0.25 : -0.12);
        let type = null;
        if (r0 < env.trees * mask && slope < 1.6) type = 'tree';
        else if (r0 > 1 - env.boulders) type = 'boulder';
        else if (r0 > 0.5 && r0 < 0.5 + env.bushes * 0.5 && slope < 1.6) type = 'bush';
        if (!type) continue;
        if (this.water.length || this.sidePatches || B) { const sq = this.surfaceAt(x, z); if (sq.waterY > y - 0.3 || sq.surface.hot) continue; }
        const sc = 0.75 + rand2(wx, wz, seed + 504) * 0.7;
        const p = { type, x, z, y, scale: sc, rot: rand2(wx, wz, seed + 505) * 6.28, v: rand2(wx, wz, seed + 506), r: 0, b: bi };
        if (type === 'tree') p.r = 0.28 * sc;
        if (type === 'boulder') { p.scale = 0.7 + rand2(wx, wz, seed + 504) * 1.6; p.r = 0.8 * p.scale; }
        props.push(p);
      }
    }
    if (B) this._buildings(cx, cz, ch, props);
    this._solidScenery(cx, cz, ch, props);
    ch.props = props;
    return props;
  }

  /**
   * Open world: buildings for one chunk (towers downtown, sheds at the docks, houses in the
   * villages and on farms). They stand beside the roads, square to them, on ground that is
   * nearly level, and each gets a ring of solid colliders around its walls.
   */
  _buildings(cx, cz, ch, props) {
    const seed = this.seed, G = 16, nG = CHUNK / G;
    const first = props.length;
    const rects = [];
    for (let gj = 0; gj < nG; gj++) {
      for (let gi = 0; gi < nG; gi++) {
        const wx = cx * nG + gi, wz = cz * nG + gj;
        const x = (wx + 0.5) * G + (rand2(wx, wz, seed + 901) - 0.5) * 4, z = (wz + 0.5) * G + (rand2(wx, wz, seed + 902) - 0.5) * 4;
        const q = (Math.round(z - cz * CHUNK) + 1) * CW + Math.round(x - cx * CHUNK) + 1;
        const bi = ch.bio[q], U = this.biomes[bi].urban;
        if (!U || rand2(wx, wz, seed + 903) > U.density) continue;
        const i = ch.idx[q], e = ch.e[q];
        if (i < 0) continue;
        const w = U.foot[0] + (U.foot[1] - U.foot[0]) * rand2(wx, wz, seed + 904), d = U.foot[0] + (U.foot[1] - U.foot[0]) * rand2(wx, wz, seed + 905);
        const half = Math.hypot(w, d) / 2;
        if (e < half + 2.5 || e > 60) continue;
        const rot = Math.atan2(this.TX[i], this.TZ[i]), cs = Math.cos(rot), sn = Math.sin(rot);
        const at = (lx, lz) => [x + lx * cs + lz * sn, z - lx * sn + lz * cs];
        let y0 = 1e9, y1 = -1e9;
        for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [0, 0]]) {
          const [px, pz] = at(lx, lz), hh = this.heightAt(px, pz);
          if (hh < y0) y0 = hh;
          if (hh > y1) y1 = hh;
        }
        if (y1 - y0 > 2.4 || y0 < this.seaLevel + 0.8) continue;
        const clearOf = (list, r) => list.some((c) => Math.hypot(c.x - x, c.z - z) < half + r);
        if (clearOf(this.relics, 7) || clearOf(this.caches, 9) || clearOf(this.anchors, 4) || clearOf(this.falls, 10)) continue;
        const k = Math.pow(fbm(x / 150, z / 150, seed + 906, 2) * 0.5 + 0.5, 1.7) * (0.55 + 0.45 * rand2(wx, wz, seed + 907));
        const h = U.h[0] + (U.h[1] - U.h[0]) * Math.min(1, k * 1.5);
        props.push({ type: 'building', kind: U.kind, x, z, y: y0 - 0.4, w, d, h, rot, v: rand2(wx, wz, seed + 908), r: 0, scale: 1, b: bi });
        rects.push({ x, z, cs, sn, w: w / 2 + 1.2, d: d / 2 + 1.2 });
        // walls: a ring of circles just inside the footprint
        const r = 1.25, add = (lx, lz) => { const [px, pz] = at(lx, lz); props.push({ type: 'solid', x: px, z: pz, y: this.heightAt(px, pz), scale: 1, rot: 0, v: 0, r, h: h + 1 }); };
        const nw = Math.max(2, Math.ceil(w / 2.3)), nd = Math.max(2, Math.ceil(d / 2.3));
        for (let a = 0; a <= nw; a++) { const lx = -w / 2 + r + ((w - 2 * r) * a) / nw; add(lx, -d / 2 + r); add(lx, d / 2 - r); }
        for (let a = 1; a < nd; a++) { const lz = -d / 2 + r + ((d - 2 * r) * a) / nd; add(-w / 2 + r, lz); add(w / 2 - r, lz); }
      }
    }
    if (!rects.length) return;
    // nothing grows through a building
    for (let k = first - 1; k >= 0; k--) {
      const p = props[k];
      for (const b of rects) {
        const dx = p.x - b.x, dz = p.z - b.z;
        if (Math.abs(dx * b.cs - dz * b.sn) < b.w && Math.abs(dx * b.sn + dz * b.cs) < b.d) { props.splice(k, 1); break; }
      }
    }
  }

  /**
   * Solid scenery for a chunk: fallen logs and stumps among the trees, plus roadside
   * furniture (marker posts, chevron signs on tight bends, guard fences on the outside of
   * bends above a drop). Deterministic, shared by the renderer and the physics colliders
   * (r = collision radius, h = collision height). Logs sit well clear of the road.
   */
  _solidScenery(cx, cz, ch, props) {
    const env = this.env, seed = this.seed;
    const wet = this.water.length > 0 || this.sidePatches;
    const logDensity = env.trees > 0.03 ? ({ grass: 0.5, scree: 0.12, sand: 0.05, deepsnow: 0.2, ash: 0.1 }[env.off] ?? 0.2) : 0;
    if (logDensity > 0) {
      const G = 10;
      const i0 = Math.floor((cx * CHUNK - 5) / G), i1 = Math.floor((cx * CHUNK + CHUNK + 5) / G);
      const j0 = Math.floor((cz * CHUNK - 5) / G), j1 = Math.floor((cz * CHUNK + CHUNK + 5) / G);
      for (let wz = j0; wz <= j1; wz++) {
        for (let wx = i0; wx <= i1; wx++) {
          if (rand2(wx, wz, seed + 811) > logDensity * 0.32) continue;
          const x = (wx + 0.8 * (rand2(wx, wz, seed + 812) - 0.5)) * G, z = (wz + 0.8 * (rand2(wx, wz, seed + 813) - 0.5)) * G;
          if (Math.floor(x / CHUNK) !== cx || Math.floor(z / CHUNK) !== cz) continue;
          const q = (Math.round(z - cz * CHUNK) + 1) * CW + Math.round(x - cx * CHUNK) + 1;
          if (ch.e[q] < 6.5) continue;
          if (this.biomes && this.biomes[ch.bio[q]].trees < 0.1) continue;      // no deadfall where there are no woods
          const slope = Math.abs(ch.h[q + 1] - ch.h[q - 1]) + Math.abs(ch.h[q + CW] - ch.h[q - CW]);
          if (slope > 1.1) continue;
          const y = this.heightAt(x, z);
          if (wet) { const sq = this.surfaceAt(x, z); if (sq.waterY > y - 0.3 || sq.surface.hot) continue; }
          const v = rand2(wx, wz, seed + 814), rot = rand2(wx, wz, seed + 815) * 6.283;
          if (v < 0.6) {
            const len = 2.6 + 2.4 * rand2(wx, wz, seed + 816), rad = 0.5 + 0.6 * v;
            const ax = Math.cos(rot), az = -Math.sin(rot);       // log axis on the ground
            const tilt = Math.atan2(this.heightAt(x + ax, z + az) - this.heightAt(x - ax, z - az), 2);
            props.push({ type: 'log', x, z, y, scale: 1, rot, v, r: 0, len, rad, tilt });
            for (let u = -len / 2 + 0.4; u <= len / 2 - 0.39; u += 0.8) {
              const sx = x + ax * u, sz = z + az * u;
              props.push({ type: 'solid', x: sx, z: sz, y: this.heightAt(sx, sz), scale: 1, rot: 0, v, r: rad * 0.45, h: rad * 0.9 });
            }
          } else {
            const sc = 0.7 + 0.9 * (v - 0.6) / 0.4;
            props.push({ type: 'stump', x, z, y, scale: sc, rot, v, r: 0.5 * sc, h: 0.6 + 0.4 * v });
          }
        }
      }
    }
    if (!this._roadside) this._roadside = this._buildRoadside();
    const items = this._roadside.get(key2(cx, cz));
    if (!items) return;
    for (const it of items) {
      const y = this.heightAt(it.x, it.z);
      const sq = this.surfaceAt(it.x, it.z);
      if (sq.onRoad || sq.waterY > y - 0.1 || sq.surface.hot) continue;
      if (it.type !== 'fence' && it.type !== 'solid' && Math.abs(y - this.PY[it.i]) > (it.type === 'sign' ? 2.6 : 1.6)) continue;   // not hanging off an edge or buried in a bank
      const p = { type: it.type, x: it.x, z: it.z, y, scale: 1, rot: it.rot || 0, v: 0.5, r: it.r, h: it.h };
      if (it.type === 'fence') { p.x2 = it.x2; p.z2 = it.z2; p.y2 = this.heightAt(it.x2, it.z2); }
      if (it.type === 'sign') p.dir = it.dir;
      props.push(p);
    }
  }

  /** Roadside furniture positions (no heights yet), bucketed by chunk. Built once per track. */
  _buildRoadside() {
    const map = new Map();
    const add = (x, z, o) => {
      const k = key2(Math.floor(x / CHUNK), Math.floor(z / CHUNK));
      let a = map.get(k);
      if (!a) map.set(k, (a = []));
      a.push({ x, z, ...o });
    };
    const { PX, PZ, TX, TZ, HW, S, SL, SR } = this;
    const snowy = this.env.off === 'deepsnow';
    const n = this.nMain;
    for (let i = 4; i < n - 4; i++) {
      const s = S[i];
      if (this.bridges.some((b) => s > b.s0 - 4 && s < b.s1 + 4) || this.water.some((w) => s > w.s0 - 2 && s < w.s1 + 2)) continue;
      const tx = TX[i], tz = TZ[i], hw = HW[i], rot = Math.atan2(tx, tz);
      const curv = this.roadShape(i, 3).curv;
      const sharp = Math.abs(curv) >= 0.022;
      for (const sd of [1, -1]) {                               // +1 = left of travel
        const outside = curv * sd < 0;
        const fence = sharp && outside && (sd > 0 ? SL[i] : SR[i]) < -3.5;
        if (fence) {
          if (i % 2 === 0) {
            const j = Math.min(n - 1, i + 2), off = hw + 0.62, off2 = HW[j] + 0.62;
            const x = PX[i] + tz * off * sd, z = PZ[i] - tx * off * sd;
            const x2 = PX[j] + TZ[j] * off2 * sd, z2 = PZ[j] - TX[j] * off2 * sd;
            add(x, z, { type: 'fence', x2, z2, r: 0.1, h: 1.1, i });
            for (const u of [0.33, 0.66]) add(x + (x2 - x) * u, z + (z2 - z) * u, { type: 'solid', r: 0.08, h: 1.0, i });
          }
        } else if (snowy ? i % 7 === 0 : sharp && i % 4 === 0) {
          const off = hw + 1.25;
          add(PX[i] + tz * off * sd, PZ[i] - tx * off * sd, { type: 'post', rot, r: 0.07, h: snowy ? 2.3 : 1.0, i });
        }
        if (Math.abs(curv) >= 0.045 && outside && i % 8 === 0) {
          const off = hw + 1.55;
          add(PX[i] + tz * off * sd, PZ[i] - tx * off * sd, { type: 'sign', rot, dir: curv > 0 ? 1 : -1, r: 0.09, h: 2.0, i });
        }
      }
    }
    return map;
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
    if (this.solidHash.size) {
      const g0x = Math.floor((x - 3) / OB_CELL), g1x = Math.floor((x + 3) / OB_CELL);
      const g0z = Math.floor((z - 3) / OB_CELL), g1z = Math.floor((z + 3) / OB_CELL);
      for (let gz = g0z; gz <= g1z; gz++) {
        for (let gx = g0x; gx <= g1x; gx++) {
          const arr = this.solidHash.get(key2(gx, gz));
          if (!arr) continue;
          for (let k = 0; k < arr.length; k++) {
            const p = arr[k];
            // a solid spanning two cells is listed in both: report it from its own cell only
            if (Math.floor(p.x / OB_CELL) !== gx || Math.floor(p.z / OB_CELL) !== gz) continue;
            if (Math.abs(p.x - x) < 4 && Math.abs(p.z - z) < 4) { if (p.y === undefined) p.y = this.heightAt(p.x, p.z); fn(p); }
          }
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
