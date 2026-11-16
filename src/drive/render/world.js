// Three.js world: streamed terrain chunks built from the SAME height grid the
// physics uses, instanced vegetation, water, bridges, gates, sky and weather.
import * as THREE from 'three';
import { CHUNK, CW } from '../core/track.js';
import { noise2, smoothstep } from '../core/noise.js';
import { mergeColored, M } from './geo.js';

const TIMES = {
  morning: { sun: [0.55, 0.52, 0.35], sunI: 2.3, amb: 1.0, tint: [1.0, 0.97, 0.92] },
  day:     { sun: [0.3, 0.85, 0.25], sunI: 2.7, amb: 1.05, tint: [1, 1, 1] },
  overcast:{ sun: [0.2, 0.9, 0.2], sunI: 1.1, amb: 1.35, tint: [0.82, 0.84, 0.86] },
  dusk:    { sun: [-0.7, 0.28, 0.35], sunI: 1.9, amb: 0.8, tint: [1.0, 0.78, 0.62] },
  night:   { sun: [-0.3, 0.7, -0.4], sunI: 0.5, amb: 0.42, tint: [0.36, 0.44, 0.62] }
};

const col = (a) => new THREE.Color(a[0], a[1], a[2]);
const key2 = (a, b) => (a + 32768) * 65536 + (b + 32768);

function detailTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const img = g.createImageData(64, 64);
  for (let i = 0; i < 64 * 64; i++) {
    const v = 205 + Math.floor(Math.random() * 50);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function bannerTexture(text, bg, fg = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 48;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 48);
  if (text === '#') {
    for (let y = 0; y < 3; y++) for (let x = 0; x < 16; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#eee'; g.fillRect(x * 16, y * 16, 16, 16); }
  } else {
    g.fillStyle = fg; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 128, 25);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class World {
  /** @param quality {radius, shadows, pixelRatio, treeShadows} */
  constructor(track, quality) {
    this.track = track;
    this.q = quality;
    this.env = track.env;
    this.weather = null;
    this.scene = new THREE.Scene();
    this.disposables = [];
    this.chunkMeshes = new Map();
    this.queue = [];
    this.lastScan = -1;
    this.propKey = '';
    this.tmpM = new THREE.Matrix4();
    this.tmpQ = new THREE.Quaternion();
    this.tmpV = new THREE.Vector3();
    this.tmpS = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
  }

  track_(o) { this.disposables.push(o); return o; }

  init(weather) {
    this.weather = weather;
    const env = this.env, scene = this.scene;
    const time = TIMES[weather.snow > 0.8 || weather.rain > 0.4 || weather.fog < 0.4 ? 'overcast' : this.track.meta.time] || TIMES.day;
    this.time = TIMES[this.track.meta.time] === TIMES.night || this.track.meta.time === 'dusk' ? TIMES[this.track.meta.time] : time;
    const T = this.time;
    this.isNight = this.track.meta.time === 'night';
    const tint = (a, k = 1) => new THREE.Color(a[0] * T.tint[0] * k, a[1] * T.tint[1] * k, a[2] * T.tint[2] * k);

    this.fogColor = tint(env.fog);
    const far = Math.min(this.q.radius * 0.97, env.fogFar * weather.fog);
    this.fogFar = far;
    scene.fog = new THREE.Fog(this.fogColor, far * 0.22, far);
    scene.background = this.fogColor;

    // sky dome
    {
      const g = this.track_(new THREE.SphereGeometry(900, 20, 10));
      const c = new Float32Array(g.attributes.position.count * 3);
      const top = tint(env.sky, weather.fog < 0.5 ? 0.8 : 1), hor = this.fogColor;
      for (let i = 0; i < g.attributes.position.count; i++) {
        const t = smoothstep(0.0, 0.5, g.attributes.position.getY(i) / 900);
        c[i * 3] = hor.r + (top.r - hor.r) * t; c[i * 3 + 1] = hor.g + (top.g - hor.g) * t; c[i * 3 + 2] = hor.b + (top.b - hor.b) * t;
      }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      const m = this.track_(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
      this.sky = new THREE.Mesh(g, m);
      this.sky.renderOrder = -10;
      this.sky.frustumCulled = false;
      scene.add(this.sky);
    }
    // distant mountain silhouettes
    if (weather.fog > 0.4) {
      const segs = 72, pos = [], colr = [], idx = [];
      const base = tint(env.cliff, 0.9);
      const mix = (k) => [base.r + (this.fogColor.r - base.r) * k, base.g + (this.fogColor.g - base.g) * k, base.b + (this.fogColor.b - base.b) * k];
      for (let ring = 0; ring < 2; ring++) {
        const r = 520 + ring * 220, amp = (env.hillAmp * 3 + 40) * (1 + ring * 0.9), o = pos.length / 3;
        const cTop = mix(0.55 + ring * 0.22), cBot = mix(0.8 + ring * 0.1);
        for (let i = 0; i <= segs; i++) {
          const a = (i / segs) * Math.PI * 2;
          const h = amp * (0.35 + 0.65 * Math.abs(noise2(Math.cos(a) * 2.3 + ring * 9, Math.sin(a) * 2.3, this.track.seed + 40) + 0.5 * noise2(Math.cos(a) * 7, Math.sin(a) * 7, this.track.seed + 41)));
          pos.push(Math.cos(a) * r, -30, Math.sin(a) * r, Math.cos(a) * r, h, Math.sin(a) * r);
          colr.push(...cBot, ...cTop);
          if (i < segs) { const k = o + i * 2; idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3); }
        }
      }
      const g = this.track_(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
      g.setIndex(idx);
      this.mountains = new THREE.Mesh(g, this.track_(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide, depthWrite: false })));
      this.mountains.renderOrder = -9;
      this.mountains.frustumCulled = false;
      scene.add(this.mountains);
    }

    // lights
    this.hemi = new THREE.HemisphereLight(tint(env.sky, 1.1), tint(env.grass, 0.7), env.ambient * T.amb * 1.9);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(tint(env.sun), T.sunI * (0.45 + 0.55 * weather.fog));
    this.sunDir = new THREE.Vector3(T.sun[0], T.sun[1], T.sun[2]).normalize();
    if (this.q.shadows) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(this.q.shadows, this.q.shadows);
      const c = this.sun.shadow.camera;
      c.left = -26; c.right = 26; c.top = 26; c.bottom = -26; c.near = 1; c.far = 160;
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.06;
    }
    scene.add(this.sun, this.sun.target);

    // terrain material
    this.detail = this.track_(detailTexture());
    this.terrainMat = this.track_(new THREE.MeshLambertMaterial({ vertexColors: true, map: this.detail, side: THREE.DoubleSide }));

    this._buildPropTemplates();
    this._buildStatics();
    this._buildWeather();
  }

  // ------------------------------------------------------------------ props
  _buildPropTemplates() {
    const env = this.env;
    const cap = this.q.props;
    const lam = this.track_(new THREE.MeshLambertMaterial({ vertexColors: true }));
    const mk = (geo, n) => {
      const im = new THREE.InstancedMesh(this.track_(geo), lam, n);
      im.count = 0;
      im.frustumCulled = false;
      im.castShadow = !!this.q.treeShadows;
      im.receiveShadow = false;
      this.scene.add(im);
      return im;
    };
    const tr = env.trunk, f1 = env.foliage, f2 = env.foliage2;
    const pine = mergeColored([
      { geo: new THREE.CylinderGeometry(0.16, 0.26, 2.4, 5), matrix: M(0, 1.2, 0), color: tr },
      { geo: new THREE.ConeGeometry(1.9, 3.2, 6), matrix: M(0, 3.2, 0), color: f1, shade: [1.6, 4.8] },
      { geo: new THREE.ConeGeometry(1.45, 2.8, 6), matrix: M(0, 5.0, 0, 1, 1, 1, 0, 0.5, 0), color: env.treeKind === 'snowpine' ? f2 : f1, shade: [3.6, 6.4] },
      { geo: new THREE.ConeGeometry(0.95, 2.4, 6), matrix: M(0, 6.7, 0), color: env.treeKind === 'snowpine' ? f2 : f1, shade: [5.5, 7.9] }
    ]);
    const broad = mergeColored([
      { geo: new THREE.CylinderGeometry(0.2, 0.32, 3.2, 5), matrix: M(0, 1.6, 0), color: tr },
      { geo: new THREE.IcosahedronGeometry(2.1, 0), matrix: M(0, 4.6, 0, 1, 0.85, 1), color: f2, shade: [2.8, 6.4] },
      { geo: new THREE.IcosahedronGeometry(1.5, 0), matrix: M(0.9, 5.6, 0.5, 1, 0.9, 1, 0.5, 1, 0), color: f1, shade: [4.2, 7] }
    ]);
    const rockG = new THREE.IcosahedronGeometry(1, 1);
    {
      const p = rockG.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const k = 1 + 0.16 * noise2(p.getX(i) * 2.1 + 5, p.getZ(i) * 2.1 + p.getY(i) * 1.7, 77);
        p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
      }
      rockG.computeVertexNormals();
    }
    const cl = this.env.cliff;
    const rock = mergeColored([{ geo: rockG, color: [cl[0] * 0.95, cl[1] * 0.95, cl[2] * 0.95], shade: [-1, 1] }]);
    const bush = mergeColored([{ geo: new THREE.IcosahedronGeometry(0.7, 0), matrix: M(0, 0.4, 0, 1, 0.7, 1), color: f2, shade: [-0.1, 0.9] }]);
    this.inst = {
      pine: mk(pine, cap), broad: mk(broad, cap), boulder: mk(rock, Math.ceil(cap / 3)), bush: mk(bush, cap)
    };
    this.rockGeo = rock;
    this.lam = lam;
  }

  _refreshProps(cx0, cz0) {
    const R = this.q.propChunks;
    const k = cx0 + ',' + cz0;
    if (k === this.propKey) return;
    this.propKey = k;
    const env = this.env;
    const counts = { pine: 0, broad: 0, boulder: 0, bush: 0 };
    const put = (name, p, sy = 1) => {
      const im = this.inst[name];
      if (counts[name] >= im.instanceMatrix.count) return;
      this.tmpQ.setFromAxisAngle(this.up, p.rot);
      this.tmpV.set(p.x, p.y - 0.1, p.z);
      this.tmpS.set(p.scale, p.scale * sy, p.scale);
      im.setMatrixAt(counts[name]++, this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS));
    };
    for (let cz = cz0 - R; cz <= cz0 + R; cz++) {
      for (let cx = cx0 - R; cx <= cx0 + R; cx++) {
        if (!this.track.chunks.has(key2(cx, cz))) continue;
        for (const p of this.track.propsFor(cx, cz)) {
          if (p.type === 'tree') {
            const pine = env.treeKind === 'pine' || env.treeKind === 'snowpine' || (env.treeKind === 'mixed' && p.v > 0.45);
            put(pine ? 'pine' : 'broad', p, 0.9 + p.v * 0.4);
          } else if (p.type === 'boulder') put('boulder', { ...p, y: p.y + p.scale * 0.25 }, 0.75);
          else put('bush', p);
        }
      }
    }
    for (const name in counts) {
      this.inst[name].count = counts[name];
      this.inst[name].instanceMatrix.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- statics
  _buildStatics() {
    const tr = this.track, scene = this.scene;
    const lam = this.lam;
    // track rocks
    const rocks = tr.obstacles.filter((o) => o.type === 'rock');
    if (rocks.length) {
      const im = new THREE.InstancedMesh(this.rockGeo, lam, rocks.length);
      rocks.forEach((o, i) => {
        const y = tr.heightAt(o.x, o.z);
        this.tmpQ.setFromAxisAngle(this.up, o.rot);
        this.tmpM.compose(this.tmpV.set(o.x, y - o.h * 0.08, o.z), this.tmpQ, this.tmpS.set(o.r * 0.9, o.h * 1.02, o.r * 0.9));
        im.setMatrixAt(i, this.tmpM);
        const k = 0.8 + o.tint * 0.35;
        im.setColorAt(i, new THREE.Color(k, k, k * 1.02));
      });
      im.castShadow = !!this.q.shadows; im.receiveShadow = true;
      im.frustumCulled = false;
      scene.add(im);
    }
    const parts = [];
    const wood = [0.36, 0.25, 0.14], woodD = [0.27, 0.18, 0.1];
    for (const o of tr.obstacles) {
      if (o.type !== 'log') continue;
      const y = tr.heightAt(o.x, o.z) + o.r * 0.55;
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(o.ax, 0, o.az));
      parts.push({ geo: new THREE.CylinderGeometry(o.r, o.r * 1.08, o.len, 7), matrix: new THREE.Matrix4().compose(new THREE.Vector3(o.x, y, o.z), q, new THREE.Vector3(1, 1, 1)), color: woodD });
    }
    // bridges
    for (const b of tr.bridges) {
      const ang = Math.atan2(b.x1 - b.x0, b.z1 - b.z0);
      const mx = (b.x0 + b.x1) / 2, mz = (b.z0 + b.z1) / 2, my = (b.y0 + b.y1) / 2;
      const pitch = -Math.atan2(b.y1 - b.y0, b.len);
      const base = new THREE.Matrix4().compose(new THREE.Vector3(mx, my, mz), new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, ang, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
      const local = (m) => base.clone().multiply(m);
      const nPl = Math.round(b.len / 0.6);
      for (let i = 0; i < nPl; i++) {
        const z = -b.len / 2 + (i + 0.5) * (b.len / nPl);
        parts.push({ geo: new THREE.BoxGeometry(b.half * 2, 0.14, b.len / nPl - 0.06), matrix: local(M(0, -0.07, z)), color: i % 3 ? wood : woodD });
      }
      for (const sx of [-1, 1]) {
        parts.push({ geo: new THREE.BoxGeometry(0.22, 0.34, b.len + 1), matrix: local(M(sx * (b.half - 0.2), -0.3, 0)), color: woodD });
        if (b.rails) parts.push({ geo: new THREE.BoxGeometry(0.1, 0.1, b.len), matrix: local(M(sx * (b.half + 0.05), 0.7, 0)), color: woodD });
      }
      const nPost = Math.max(2, Math.round(b.len / 9));
      for (let i = 0; i <= nPost; i++) {
        const u = i / nPost, z = -b.len / 2 + u * b.len;
        const wx = b.x0 + (b.x1 - b.x0) * u, wz = b.z0 + (b.z1 - b.z0) * u;
        const drop = (b.y0 + (b.y1 - b.y0) * u) - tr.heightAt(wx, wz) + 1;
        if (drop < 1.5) continue;
        for (const sx of [-1, 1]) parts.push({ geo: new THREE.BoxGeometry(0.28, drop, 0.28), matrix: local(M(sx * (b.half - 0.2), -0.3 - drop / 2, z)), color: woodD });
        if (b.rails) for (const sx of [-1, 1]) parts.push({ geo: new THREE.BoxGeometry(0.1, 0.8, 0.1), matrix: local(M(sx * (b.half + 0.05), 0.35, z)), color: woodD });
      }
    }
    // winch anchor posts
    for (const a of tr.anchors) {
      const y = tr.heightAt(a.x, a.z);
      parts.push({ geo: new THREE.CylinderGeometry(0.12, 0.14, 1.5, 6), matrix: M(a.x, y + 0.7, a.z), color: [0.9, 0.45, 0.08] });
      parts.push({ geo: new THREE.TorusGeometry(0.2, 0.05, 5, 8), matrix: M(a.x, y + 1.45, a.z), color: [0.75, 0.75, 0.78] });
    }
    // gates
    const gate = (s, color) => {
      const p = tr.roadPose(s);
      const hw = tr.HW[p.i] + 0.9;
      const lx = Math.cos(p.heading), lz = -Math.sin(p.heading);
      for (const sd of [-1, 1]) {
        const x = p.x + lx * hw * sd, z = p.z + lz * hw * sd;
        const y = tr.heightAt(x, z);
        parts.push({ geo: new THREE.CylinderGeometry(0.13, 0.16, 5.2, 6), matrix: M(x, y + 2.4, z), color });
      }
      return { p, hw };
    };
    this.banners = [];
    const addBanner = (g, text, bg) => {
      const tex = this.track_(bannerTexture(text, bg));
      const mat = this.track_(new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
      const bw = Math.min(g.hw * 2, 9);
      const m = new THREE.Mesh(this.track_(new THREE.PlaneGeometry(bw, bw * 0.19)), mat);
      m.position.set(g.p.x, g.p.y + 4.4, g.p.z);
      m.rotation.y = g.p.heading + Math.PI;
      scene.add(m);
      this.banners.push(m);
    };
    tr.checkpoints.forEach((c, i) => addBanner(gate(c.s, [0.9, 0.55, 0.1]), `CHECKPOINT ${i + 1}`, '#c8771a'));
    addBanner(gate(tr.finishS, [0.85, 0.85, 0.85]), '#', '#fff');
    addBanner(gate(tr.startS + 6, [0.2, 0.55, 0.3]), 'START', '#2f9e55');
    if (parts.length) {
      const m = new THREE.Mesh(this.track_(mergeColored(parts)), lam);
      m.castShadow = !!this.q.shadows; m.receiveShadow = true;
      scene.add(m);
    }
    // supply caches
    this.cacheMeshes = tr.caches.map((c) => {
      const g = new THREE.Group();
      const y = tr.heightAt(c.x, c.z);
      const box = new THREE.Mesh(this.track_(new THREE.BoxGeometry(1.1, 0.8, 0.8)), this.track_(new THREE.MeshLambertMaterial({ color: 0xd9a12b })));
      box.position.y = 0.4;
      const beam = new THREE.Mesh(this.track_(new THREE.CylinderGeometry(0.25, 0.25, 26, 8, 1, true)), this.track_(new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.28, depthWrite: false, fog: false })));
      beam.position.y = 13;
      g.add(box, beam);
      g.position.set(c.x, y, c.z);
      scene.add(g);
      return g;
    });
    // water
    const wmat = this.track_(new THREE.MeshLambertMaterial({ color: new THREE.Color(0.2, 0.36, 0.42).lerp(this.fogColor, 0.25), transparent: true, opacity: 0.78, depthWrite: false }));
    this.waterMeshes = [];
    for (const w of tr.water) {
      const im = Math.round((w.i0 + w.i1) / 2);
      const len = w.s1 - w.s0;
      const m = new THREE.Mesh(this.track_(new THREE.PlaneGeometry(150, len)), wmat);
      m.quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, Math.atan2(tr.TX[im], tr.TZ[im]), 0, 'YXZ'));
      m.position.set(tr.PX[im], w.level, tr.PZ[im]);
      m.renderOrder = 2;
      scene.add(m);
      this.waterMeshes.push(m);
    }
  }

  // ---------------------------------------------------------------- weather
  _buildWeather() {
    const w = this.weather;
    this.precip = null;
    const amount = Math.max(w.rain, w.snow);
    if (amount <= 0) return;
    const n = Math.round(this.q.particles * (0.35 + 0.65 * amount));
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 50; pos[i * 3 + 1] = Math.random() * 26; pos[i * 3 + 2] = (Math.random() - 0.5) * 50; }
    const g = this.track_(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const snow = w.snow > 0;
    const m = this.track_(new THREE.PointsMaterial({ color: snow ? 0xffffff : 0xa9c4d8, size: snow ? 0.16 : 0.09, transparent: true, opacity: snow ? 0.9 : 0.55, depthWrite: false, fog: false }));
    this.precip = new THREE.Points(g, m);
    this.precip.frustumCulled = false;
    this.precipFall = snow ? 4.5 : 26;
    this.precipWind = w.wind * (snow ? 9 : 5);
    this.scene.add(this.precip);
  }

  // ---------------------------------------------------------------- terrain
  _buildChunk(cx, cz, st) {
    const tr = this.track, env = this.env;
    const ch = tr.getChunk(cx, cz);
    const n = CHUNK / st, nv = n + 1;
    const skirtN = nv * 4;
    const pos = new Float32Array((nv * nv + skirtN) * 3);
    const nor = new Float32Array((nv * nv + skirtN) * 3);
    const colr = new Float32Array((nv * nv + skirtN) * 3);
    const uv = new Float32Array((nv * nv + skirtN) * 2);
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const g1 = env.grass, g2 = env.grass2, cl = env.cliff;
    const snowy = env.off === 'deepsnow';
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nv; i++) {
        const q = (j * st + 1) * CW + i * st + 1;
        const k = j * nv + i;
        const x = x0 + i * st, z = z0 + j * st, y = ch.h[q];
        pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
        let nx = ch.h[q - 1] - ch.h[q + 1], nz = ch.h[q - CW] - ch.h[q + CW], ny = 2;
        const l = Math.hypot(nx, ny, nz);
        nx /= l; ny /= l; nz /= l;
        nor[k * 3] = nx; nor[k * 3 + 1] = ny; nor[k * 3 + 2] = nz;
        uv[k * 2] = x / 5; uv[k * 2 + 1] = z / 5;
        const nz1 = noise2(x / 23, z / 23, 9) * 0.5 + 0.5;
        const nz2 = 0.9 + 0.2 * noise2(x / 3.1, z / 3.1, 10);
        let r = g1[0] + (g2[0] - g1[0]) * nz1, g = g1[1] + (g2[1] - g1[1]) * nz1, b = g1[2] + (g2[2] - g1[2]) * nz1;
        const steep = smoothstep(snowy ? 0.42 : 0.30, snowy ? 0.62 : 0.55, 1 - ny);
        r += (cl[0] - r) * steep; g += (cl[1] - g) * steep; b += (cl[2] - b) * steep;
        const e = ch.e[q];
        if (e < 1.6) {
          const sq = tr.surfaceAt(x, z);
          const c = sq.surface.color;
          const t = sq.onRoad && e > 0 ? 1 : smoothstep(1.6, -0.2, e);
          r += (c[0] - r) * t; g += (c[1] - g) * t; b += (c[2] - b) * t;
          if (sq.waterY > y) { r *= 0.72; g *= 0.74; b *= 0.78; }
        } else if (tr.water.length) {
          const sq = tr.surfaceAt(x, z);
          if (sq.waterY > y - 0.4) { const c = sq.surface.color; r = c[0] * 0.8; g = c[1] * 0.8; b = c[2] * 0.82; }
        }
        colr[k * 3] = r * nz2; colr[k * 3 + 1] = g * nz2; colr[k * 3 + 2] = b * nz2;
      }
    }
    const idx = new (nv * nv + skirtN > 65535 ? Uint32Array : Uint16Array)(n * n * 6 + n * 4 * 6);
    let io = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = j * nv + i, b = a + 1, c = a + nv, d = c + 1;
        idx[io++] = a; idx[io++] = c; idx[io++] = b;
        idx[io++] = b; idx[io++] = c; idx[io++] = d;
      }
    }
    // skirts hide cracks between LOD levels
    let so = nv * nv;
    const edge = (get) => {
      const start = so;
      for (let i = 0; i < nv; i++) {
        const k = get(i);
        pos[so * 3] = pos[k * 3]; pos[so * 3 + 1] = pos[k * 3 + 1] - 1.2 * st - 0.6; pos[so * 3 + 2] = pos[k * 3 + 2];
        nor[so * 3] = nor[k * 3]; nor[so * 3 + 1] = nor[k * 3 + 1]; nor[so * 3 + 2] = nor[k * 3 + 2];
        colr[so * 3] = colr[k * 3]; colr[so * 3 + 1] = colr[k * 3 + 1]; colr[so * 3 + 2] = colr[k * 3 + 2];
        uv[so * 2] = uv[k * 2]; uv[so * 2 + 1] = uv[k * 2 + 1];
        if (i < n) {
          const a = k, b = get(i + 1), c = so, d = so + 1;
          idx[io++] = a; idx[io++] = c; idx[io++] = b;
          idx[io++] = b; idx[io++] = c; idx[io++] = d;
        }
        so++;
      }
      return start;
    };
    edge((i) => i); edge((i) => n * nv + i); edge((i) => i * nv); edge((i) => i * nv + n);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.terrainMat);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  /** Stream chunks around the focus point. Call every frame. */
  update(dt, fx, fz, camera, time) {
    const tr = this.track;
    const ccx = Math.floor(fx / CHUNK), ccz = Math.floor(fz / CHUNK);
    const R = Math.ceil(this.q.radius / CHUNK);
    const scanKey = key2(ccx, ccz);
    if (scanKey !== this.lastScan) {
      this.lastScan = scanKey;
      this.queue.length = 0;
      for (let dz = -R; dz <= R; dz++) {
        for (let dx = -R; dx <= R; dx++) {
          const d = Math.hypot(dx, dz);
          if (d > R + 0.5) continue;
          const st = d <= 2.2 ? 1 : d <= 4.6 ? 2 : 4;
          const k = key2(ccx + dx, ccz + dz);
          const cur = this.chunkMeshes.get(k);
          if (!cur || cur.st !== st) this.queue.push({ cx: ccx + dx, cz: ccz + dz, st, d, k });
        }
      }
      this.queue.sort((a, b) => b.d - a.d);
      for (const [k, m] of this.chunkMeshes) {
        if (Math.hypot(m.cx - ccx, m.cz - ccz) > R + 1.6) {
          this.scene.remove(m.mesh); m.mesh.geometry.dispose(); this.chunkMeshes.delete(k);
        }
      }
      // drop far height data so memory stays bounded on long tracks
      if (tr.chunks.size > 900) {
        for (const [k, ch] of tr.chunks) if (Math.hypot(ch.cx - ccx, ch.cz - ccz) > R + 4) tr.chunks.delete(k);
        tr._lastKey = -1;
      }
    }
    let budget = this.queue.length > 40 ? this.q.buildPerFrame * 3 : this.q.buildPerFrame;
    let built = false;
    while (budget-- > 0 && this.queue.length) {
      const job = this.queue.pop();
      const old = this.chunkMeshes.get(job.k);
      const mesh = this._buildChunk(job.cx, job.cz, job.st);
      this.scene.add(mesh);
      if (old) { this.scene.remove(old.mesh); old.mesh.geometry.dispose(); }
      this.chunkMeshes.set(job.k, { mesh, st: job.st, cx: job.cx, cz: job.cz });
      built = true;
    }
    // vegetation instances are refilled when the terrain around the truck has settled
    // (not after every single chunk - that made loading several times slower)
    if (built) this.propsDirty = true;
    this.propTimer = (this.propTimer || 0) + dt;
    if (this.propsDirty && (this.queue.length === 0 || this.propTimer > 0.6)) {
      this.propsDirty = false;
      this.propTimer = 0;
      this.propKey = '';
    }
    this._refreshProps(ccx, ccz);

    // follow the camera with sky, sun and precipitation
    const cp = camera.position;
    this.sky.position.copy(cp);
    if (this.mountains) this.mountains.position.set(cp.x, Math.min(cp.y - 40, tr.meta.startY - 20), cp.z);
    this.sun.target.position.set(fx, cp.y - 3, fz);
    this.sun.position.set(fx + this.sunDir.x * 70, cp.y - 3 + this.sunDir.y * 70, fz + this.sunDir.z * 70);
    if (this.precip) {
      const a = this.precip.geometry.attributes.position;
      const arr = a.array;
      const fall = this.precipFall * dt, wind = this.precipWind * dt;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] -= fall * (0.8 + (i % 7) * 0.06);
        arr[i] += wind;
        if (arr[i + 1] < -4) arr[i + 1] += 26;
        if (arr[i] > 25) arr[i] -= 50;
      }
      a.needsUpdate = true;
      this.precip.position.set(cp.x, cp.y - 6, cp.z);
    }
    for (let i = 0; i < this.cacheMeshes.length; i++) this.cacheMeshes[i].children[0].rotation.y = time * 1.5;
    for (const w of this.waterMeshes) w.position.y += Math.sin(time * 1.3) * 0.0004;
  }

  /** How much of the initial area is built (0..1) - used for the loading bar. */
  get pending() { return this.queue.length; }

  hideCache(i) { this.cacheMeshes[i].visible = false; }

  dispose() {
    for (const [, m] of this.chunkMeshes) m.mesh.geometry.dispose();
    this.chunkMeshes.clear();
    for (const d of this.disposables) d.dispose && d.dispose();
    for (const k in this.inst) this.inst[k].dispose();
    this.scene.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
  }
}

export const QUALITY = {
  low:    { radius: 150, shadows: 0,    pixelRatio: 1.0, props: 900,  propChunks: 3, particles: 500,  buildPerFrame: 1, treeShadows: false, antialias: false },
  medium: { radius: 200, shadows: 1024, pixelRatio: 1.5, props: 1800, propChunks: 4, particles: 900,  buildPerFrame: 2, treeShadows: false, antialias: false },
  high:   { radius: 260, shadows: 2048, pixelRatio: 2.0, props: 3200, propChunks: 5, particles: 1500, buildPerFrame: 3, treeShadows: true,  antialias: true }
};
