// Near-field scenery that makes the ground read as a place instead of a painted
// surface: grass tufts, pebbles, fallen logs and stumps, roadside marker posts and
// chevron signs, guard fences and drifting leaves / dust / embers. Everything is instanced
// (one draw call per kind) and streamed around the truck. Grass, pebbles and particles are
// visual only; logs, stumps, posts, signs and fences are drawn from the track's own solid
// props (core/track.js), so what you see is exactly what the physics collides with.
import * as THREE from 'three';
import { CHUNK, CW } from '../core/track.js';
import { noise2, rand2 } from '../core/noise.js';
import { mergeColored, M } from './geo.js';

/** Per-terrain ground cover recipe. tuft/pebble/log = density 0..1, h = tuft height scale, dry = straw tint 0..1. */
const COVER = {
  grass:    { tuft: 0.85, h: 1.0,  dry: 0.10, pebble: 0.06, log: 0.5 },
  scree:    { tuft: 0.14, h: 0.8,  dry: 0.75, pebble: 0.40, log: 0.12 },
  sand:     { tuft: 0.06, h: 0.9,  dry: 0.95, pebble: 0.08, log: 0.05 },
  deepsnow: { tuft: 0.05, h: 0.9,  dry: 0.85, pebble: 0.04, log: 0.2 },
  ash:      { tuft: 0.0,  h: 1.0,  dry: 1.0,  pebble: 0.45, log: 0.1 }
};
/** Drifting particles per region silhouette: [colour, size, fall m/s, drift m/s, count multiplier, glow]. */
const MOTES = {
  ridges: [0xa89a3c, 0.085, 0.7, 0.9, 0.8, false],     // falling leaves
  rolling: [0x8a8048, 0.08, 0.6, 0.7, 0.5, false],
  canopy: [0x6f9a34, 0.09, 0.5, 0.5, 1.0, false],
  dunes: [0xe2c48c, 0.07, 0.05, 2.6, 1.0, false],     // blowing sand
  alpine: [0xd8d2c4, 0.05, 0.03, 1.2, 0.4, false],    // dust
  crags: [0xd9c2a4, 0.05, 0.03, 1.6, 0.5, false],
  snowpeaks: [0xffffff, 0.06, 0.25, 1.4, 0.6, false], // spindrift
  volcano: [0xff7a22, 0.09, -0.5, 0.8, 0.8, true]     // rising embers
};

function tuftGeometry() {
  // a clump of seven narrow blades fanning outwards; dark at the root, light at the tip.
  // Normals point up so a tuft takes the same light as the ground it stands on.
  const pos = [], nor = [], col = [], idx = [];
  const N = 7;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2 + (k % 2) * 0.4, r0 = 0.03 + 0.09 * ((k * 37) % 10) / 10;
    const dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx;      // outward + sideways
    const h = 0.42 + 0.2 * ((k * 53) % 10) / 10, lean = 0.16 + 0.14 * ((k * 71) % 10) / 10;
    const o = pos.length / 3;
    const ring = [[0, r0, 0.045, 0.66], [h * 0.55, r0 + lean * 0.4, 0.032, 1.0], [h, r0 + lean, 0.0, 1.32]];
    for (const [y, out, w, shade] of ring) {
      const n = w > 0 ? 2 : 1;
      for (let e = 0; e < n; e++) {
        const sgn = n === 2 ? (e ? 1 : -1) : 0;
        pos.push(dx * out + px * w * sgn, y, dz * out + pz * w * sgn);
        nor.push(0, 1, 0);
        col.push(shade, shade, shade);
      }
    }
    idx.push(o, o + 1, o + 2, o + 2, o + 1, o + 3, o + 2, o + 3, o + 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

export class Scenery {
  constructor(track, quality, scene) {
    this.track = track;
    this.env = track.env;
    this.scene = scene;
    this.q = quality;
    const lvl = { low: 0, medium: 1, high: 2, ultra: 3 }[quality.name] ?? 1;
    this.cover = COVER[this.env.off] || COVER.grass;
    this.nearR = [18, 28, 38, 46][lvl];      // grass + pebbles
    this.farR = [50, 70, 95, 120][lvl];      // logs, stumps, posts
    this.cell = [1.9, 1.3, 1.1, 1.0][lvl];
    this.tmpM = new THREE.Matrix4(); this.tmpQ = new THREE.Quaternion(); this.tmpV = new THREE.Vector3(); this.tmpS = new THREE.Vector3();
    this.tmpE = new THREE.Euler();
    this.nearKey = ''; this.farKey = '';
    this.mainHint = 0;
    this.time = { value: 0 };
    this.wind = { value: 0.3 };
    this.owned = [];
    const keep = (o) => { this.owned.push(o); return o; };
    const pbr = quality.pbr;
    const inst = (geo, mat, n, shadow) => {
      const im = new THREE.InstancedMesh(keep(geo), mat, n);
      im.count = 0; im.frustumCulled = false;
      im.castShadow = !!shadow; im.receiveShadow = true;
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
      scene.add(im);
      return im;
    };

    // ---- grass tufts (sway in the wind)
    const cells = Math.ceil((Math.PI * this.nearR * this.nearR) / (this.cell * this.cell));
    this.tuftMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    this.tuftMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.time; sh.uniforms.uWind = this.wind;
      sh.vertexShader = 'uniform float uTime;\nuniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n  float swayP = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.29;\n' +
        '  float sway = (sin(uTime * 1.9 + swayP) + 0.5 * sin(uTime * 3.7 + swayP * 1.7)) * (0.05 + 0.16 * uWind) * position.y;\n' +
        '  transformed.x += sway; transformed.z += sway * 0.6;');
      // blades are double sided: keep the up-facing normal on both faces instead of flipping it
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin> normal = normalize(vNormal);');
    };
    this.tufts = this.cover.tuft > 0 ? inst(tuftGeometry(), this.tuftMat, Math.ceil(cells * Math.min(1, this.cover.tuft * 1.15)) + 64, false) : null;

    // ---- pebbles / small stones
    this.solidMat = keep(pbr ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, envMapIntensity: 0.25, flatShading: true })
      : new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    const pg = new THREE.IcosahedronGeometry(1, 0);
    const pp = pg.attributes.position;
    for (let i = 0; i < pp.count; i++) { const k = 0.8 + 0.4 * rand2(Math.round(pp.getX(i) * 7), Math.round(pp.getZ(i) * 7 + pp.getY(i) * 3), 17); pp.setXYZ(i, pp.getX(i) * k, pp.getY(i) * k * 0.6, pp.getZ(i) * k); }
    this.pebbles = inst(mergeColored([{ geo: pg, color: [1, 1, 1] }]), this.solidMat, Math.ceil(cells * Math.min(1, this.cover.pebble * 1.4)) + 64, lvl >= 2);

    // ---- fallen logs + stumps (off the road, among the trees)
    const trunk = this.env.trunk, cut = [trunk[0] * 1.9, trunk[1] * 1.8, trunk[2] * 1.5];
    const logGeo = mergeColored([
      { geo: new THREE.CylinderGeometry(0.5, 0.56, 1, 7), matrix: M(0, 0, 0, 1, 1, 1, 0, 0, Math.PI / 2), color: trunk },
      { geo: new THREE.CylinderGeometry(0.42, 0.42, 1.01, 7), matrix: M(0, 0, 0, 1, 1, 1, 0, 0, Math.PI / 2), color: cut },
      { geo: new THREE.CylinderGeometry(0.1, 0.16, 0.9, 4), matrix: M(0.18, 0.55, 0.1, 1, 1, 1, 0.5, 0, 0.2), color: trunk }
    ]);
    const stumpGeo = mergeColored([
      { geo: new THREE.CylinderGeometry(0.42, 0.6, 0.7, 7), matrix: M(0, 0.3, 0), color: trunk },
      { geo: new THREE.CylinderGeometry(0.4, 0.4, 0.02, 7), matrix: M(0, 0.66, 0), color: cut }
    ]);
    this.logs = inst(logGeo, this.solidMat, 260, lvl >= 1);
    this.stumps = inst(stumpGeo, this.solidMat, 200, lvl >= 1);

    // ---- roadside furniture: marker posts (tall orange poles in snow), chevron signs, guard fences
    const snowy = this.env.off === 'deepsnow';
    const ph = snowy ? 2.3 : 1.0;
    const body = snowy ? [0.95, 0.42, 0.08] : [0.92, 0.92, 0.9];
    const band = snowy ? [0.08, 0.08, 0.08] : [0.85, 0.1, 0.08];
    this.posts = inst(mergeColored([
      { geo: new THREE.BoxGeometry(0.1, ph, 0.1), matrix: M(0, ph / 2, 0), color: body },
      { geo: new THREE.BoxGeometry(0.115, 0.14, 0.115), matrix: M(0, ph - 0.2, 0), color: band }
    ]), this.solidMat, 420, false);
    // chevron board: black plate with three yellow arrows pointing along +X (flipped per instance)
    const sign = [
      { geo: new THREE.BoxGeometry(0.09, 1.9, 0.09), matrix: M(0, 0.95, 0), color: [0.45, 0.46, 0.48] },
      { geo: new THREE.BoxGeometry(1.5, 0.5, 0.05), matrix: M(0, 1.75, 0), color: [0.05, 0.05, 0.05] }
    ];
    for (let k = -1; k <= 1; k++) for (const up of [-1, 1]) {
      sign.push({ geo: new THREE.BoxGeometry(0.3, 0.09, 0.07), matrix: M(k * 0.45 + 0.03, 1.75 + up * 0.09, 0, 1, 1, 1, 0, 0, -up * 0.75), color: [1.0, 0.78, 0.05] });
    }
    this.signs = inst(mergeColored(sign), this.solidMat, 120, lvl >= 1);
    const wood = [0.36, 0.25, 0.14], woodD = [0.27, 0.18, 0.1];
    this.fencePosts = inst(mergeColored([{ geo: new THREE.CylinderGeometry(0.07, 0.085, 1.2, 6), matrix: M(0, 0.55, 0), color: woodD }]), this.solidMat, 500, lvl >= 1);
    // rails run from a post (origin) to the next one: unit length along +Z, scaled per instance
    this.fenceRails = inst(mergeColored([
      { geo: new THREE.BoxGeometry(0.05, 0.12, 1), matrix: M(0, 0.48, 0.5), color: wood },
      { geo: new THREE.BoxGeometry(0.05, 0.12, 1), matrix: M(0, 0.92, 0.5), color: wood }
    ]), this.solidMat, 500, lvl >= 1);

    // ---- drifting leaves / dust / embers
    const mk = MOTES[this.env.silhouette] || MOTES.alpine;
    const n = Math.round([0, 70, 130, 200][lvl] * mk[4]);
    this.motes = null;
    if (n > 0) {
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 44; pos[i * 3 + 1] = Math.random() * 14; pos[i * 3 + 2] = (Math.random() - 0.5) * 44; }
      const g = keep(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = keep(new THREE.PointsMaterial({ color: mk[0], size: mk[1], transparent: true, opacity: mk[5] ? 0.95 : 0.8, depthWrite: false, fog: !mk[5], blending: mk[5] ? THREE.AdditiveBlending : THREE.NormalBlending }));
      const points = new THREE.Points(g, mat);
      points.frustumCulled = false;
      scene.add(points);
      this.motes = { points, n, fall: mk[2], drift: mk[3], base: new THREE.Color(mk[0]), glow: mk[5] };
    }
  }

  _put(im, i, x, y, z, yaw, sx, sy, sz, r, g, b, rx = 0, rz = 0) {
    if (i >= im.instanceMatrix.count) return i;
    this.tmpQ.setFromEuler(this.tmpE.set(rx, yaw, rz, 'YXZ'));
    im.setMatrixAt(i, this.tmpM.compose(this.tmpV.set(x, y, z), this.tmpQ, this.tmpS.set(sx, sy, sz)));
    im.instanceColor.setXYZ(i, r, g, b);
    return i + 1;
  }

  _commit(im, n) {
    if (!im) return;
    im.count = n;
    im.instanceMatrix.needsUpdate = true;
    im.instanceColor.needsUpdate = true;
  }

  /** Grass tufts and pebbles in a disc around the truck. */
  _refreshNear(fx, fz) {
    const tr = this.track, env = this.env, cov = this.cover, C = this.cell, R = this.nearR, seed = tr.seed;
    const g1 = env.grass, g2 = env.grass2, cl = env.cliff, alb = env.albedo || 1;
    const snowy = env.off === 'deepsnow';
    const i0 = Math.round(fx / C), j0 = Math.round(fz / C), n = Math.ceil(R / C);
    const wet = tr.water.length > 0 || tr.sidePatches;
    let nt = 0, np = 0;
    for (let dj = -n; dj <= n; dj++) {
      for (let di = -n; di <= n; di++) {
        const d = Math.hypot(di, dj) * C;
        if (d > R) continue;
        const wx = i0 + di, wz = j0 + dj;
        const r0 = rand2(wx, wz, seed + 801);
        const isTuft = this.tufts && r0 < cov.tuft, isPeb = !isTuft && r0 > 1 - cov.pebble;
        if (!isTuft && !isPeb) continue;
        const x = (wx + 0.8 * (rand2(wx, wz, seed + 802) - 0.5)) * C, z = (wz + 0.8 * (rand2(wx, wz, seed + 803) - 0.5)) * C;
        const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
        const ch = tr.getChunk(cx, cz);
        const q = (Math.round(z - cz * CHUNK) + 1) * CW + Math.round(x - cx * CHUNK) + 1;
        const e = ch.e[q];
        if (e < (isTuft ? 0.9 : 0.5)) continue;                               // never on the driving surface
        const slope = Math.abs(ch.h[q + 1] - ch.h[q - 1]) + Math.abs(ch.h[q + CW] - ch.h[q - CW]);
        if (isTuft && slope > 1.5) continue;
        const y = tr.heightAt(x, z);
        if (wet || e < 70) { const sq = tr.surfaceAt(x, z); if (sq.waterY > y - 0.15 || sq.surface.hot || sq.onRoad) continue; }
        const v = rand2(wx, wz, seed + 804), edge = 1 - Math.max(0, (d - R * 0.62) / (R * 0.38));
        const yaw = v * 6.283;
        if (isTuft) {
          // same colour recipe as the terrain under it, so tufts grow out of the ground instead of sitting on it
          const nz1 = noise2(x / 23, z / 23, 9) * 0.5 + 0.5;
          const patch = noise2(x / 9, z / 9, seed + 61) * 0.5 + 0.5;          // clumps: taller and denser in patches
          if (patch < 0.2 && v > cov.tuft * 0.5) continue;
          let r = g1[0] + (g2[0] - g1[0]) * nz1, g = g1[1] + (g2[1] - g1[1]) * nz1, b = g1[2] + (g2[2] - g1[2]) * nz1;
          const dry = Math.min(1, cov.dry + (v > 0.9 ? 0.35 : 0) + (e < 2.2 ? 0.2 : 0));
          const sr = snowy ? 0.42 : 0.62, sg = snowy ? 0.36 : 0.55, sb = snowy ? 0.24 : 0.27;
          r += (sr - r) * dry; g += (sg - g) * dry; b += (sb - b) * dry;
          const k = (0.85 + 0.35 * v) * (snowy ? 1 : alb);
          const s = (0.85 + 0.75 * patch) * edge, hgt = cov.h * (0.6 + 1.0 * patch * (0.5 + 0.9 * v)) * edge;
          nt = this._put(this.tufts, nt, x, y - 0.03, z, yaw, s, hgt, s, r * k, g * k, b * k);
        } else {
          const near = e < 3 ? 1.5 : 1;
          const s = (0.06 + 0.2 * v * v) * near * edge;
          const k = 0.75 + 0.5 * rand2(wx, wz, seed + 805);
          np = this._put(this.pebbles, np, x, y + s * 0.15, z, yaw, s, s, s * (0.7 + 0.6 * v), cl[0] * k * alb, cl[1] * k * alb, cl[2] * k * 1.03 * alb, (v - 0.5) * 0.5, (r0 - 0.5) * 0.5);
        }
      }
    }
    this._commit(this.tufts, nt);
    this._commit(this.pebbles, np);
  }

  /** Draw the track's solid scenery (logs, stumps, posts, signs, fences) around the truck. */
  _refreshFar(fx, fz) {
    const tr = this.track, R = this.farR;
    const c0x = Math.floor((fx - R) / CHUNK), c1x = Math.floor((fx + R) / CHUNK), c0z = Math.floor((fz - R) / CHUNK), c1z = Math.floor((fz + R) / CHUNK);
    let nl = 0, ns = 0, np = 0, ng = 0, nf = 0, nr = 0;
    for (let cz = c0z; cz <= c1z; cz++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        if (!tr.chunks.has((cx + 32768) * 65536 + (cz + 32768))) continue;      // only where terrain is already streamed in
        for (const p of tr.propsFor(cx, cz)) {
          const t = p.type;
          if (t === 'tree' || t === 'boulder' || t === 'bush' || t === 'solid') continue;
          if (Math.hypot(p.x - fx, p.z - fz) > R) continue;
          const k = 0.8 + 0.4 * p.v;
          if (t === 'log') nl = this._put(this.logs, nl, p.x, p.y + p.rad * 0.34, p.z, p.rot, p.len, p.rad, p.rad, k, k, k, 0, p.tilt);
          else if (t === 'stump') ns = this._put(this.stumps, ns, p.x, p.y - 0.06, p.z, p.rot, p.scale, 0.7 + 0.6 * p.v, p.scale, k, k, k);
          else if (t === 'post') np = this._put(this.posts, np, p.x, p.y - 0.05, p.z, p.rot, 1, 1, 1, 1, 1, 1);
          else if (t === 'sign') ng = this._put(this.signs, ng, p.x, p.y - 0.05, p.z, p.rot + (p.dir > 0 ? 0 : Math.PI), 1, 1, 1, 1, 1, 1);
          else if (t === 'fence') {
            nf = this._put(this.fencePosts, nf, p.x, p.y - 0.05, p.z, 0, 1, 1, 1, 1, 1, 1);
            const dx = p.x2 - p.x, dz = p.z2 - p.z, len = Math.hypot(dx, dz);
            nr = this._put(this.fenceRails, nr, p.x, p.y - 0.05, p.z, Math.atan2(dx, dz), 1, 1, Math.hypot(len, p.y2 - p.y), 1, 1, 1, -Math.atan2(p.y2 - p.y, len));
          }
        }
      }
    }
    this._commit(this.logs, nl); this._commit(this.stumps, ns); this._commit(this.posts, np);
    this._commit(this.signs, ng); this._commit(this.fencePosts, nf); this._commit(this.fenceRails, nr);
  }

  /** Call every frame. weather = session weather, day = 0..1 daylight. */
  update(dt, fx, fz, camera, weather, day) {
    this.time.value += dt;
    this.wind.value += ((weather ? weather.wind : 0.3) - this.wind.value) * Math.min(1, dt * 0.5);
    const nk = Math.round(fx / 5) + ',' + Math.round(fz / 5);
    if (nk !== this.nearKey) { this.nearKey = nk; this._refreshNear(fx, fz); }
    const fk = Math.round(fx / 14) + ',' + Math.round(fz / 14);
    this.farT = (this.farT || 0) + dt;
    if (fk !== this.farKey || this.farT > 1.5) { this.farKey = fk; this.farT = 0; this._refreshFar(fx, fz); }

    const m = this.motes;
    if (m) {
      const wet = weather ? Math.max(weather.rain, weather.snow) : 0;
      m.points.visible = wet < 0.5;
      if (m.points.visible) {
        const arr = m.points.geometry.attributes.position.array;
        const t = this.time.value, w = m.drift * (0.4 + 1.6 * this.wind.value) * dt, fall = m.fall * dt;
        for (let i = 0; i < m.n * 3; i += 3) {
          arr[i] += w + Math.sin(t * 1.3 + i) * 0.35 * dt;
          arr[i + 1] -= fall * (0.6 + (i % 5) * 0.2);
          arr[i + 2] += Math.cos(t * 0.9 + i * 0.7) * 0.35 * dt;
          if (arr[i + 1] < -1) arr[i + 1] += 14; else if (arr[i + 1] > 13) arr[i + 1] -= 14;
          if (arr[i] > 22) arr[i] -= 44;
        }
        m.points.geometry.attributes.position.needsUpdate = true;
        m.points.position.set(camera.position.x, camera.position.y - 4, camera.position.z);
        if (!m.glow) m.points.material.color.copy(m.base).multiplyScalar(0.2 + 0.8 * day);
      }
    }
  }

  dispose() {
    for (const im of [this.tufts, this.pebbles, this.logs, this.stumps, this.posts, this.signs, this.fencePosts, this.fenceRails]) if (im) { this.scene.remove(im); im.dispose(); }
    if (this.motes) this.scene.remove(this.motes.points);
    for (const o of this.owned) o.dispose && o.dispose();
  }
}
