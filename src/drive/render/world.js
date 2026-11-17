// Three.js world: streamed terrain chunks built from the SAME height grid the
// physics uses, instanced vegetation with LOD, water, waterfalls, lava, bridges,
// gates, a procedural sky per region and a live atmosphere (weather + time of day).
import * as THREE from 'three';
import { CHUNK, CW } from '../core/track.js';
import { noise2, smoothstep } from '../core/noise.js';
import { mergeColored, M } from './geo.js';
import { Sky, sunElevation } from './sky.js';

const key2 = (a, b) => (a + 32768) * 65536 + (b + 32768);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function grainTexture() {
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

/** Tiling normal map generated from value noise (no image files). */
function normalTexture(size, freq, strength, seed) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const hgt = (x, y) => {
    // periodic noise: blend four offset samples so the texture tiles
    const u = x / size, v = y / size;
    const n = (a, b) => noise2(a * freq, b * freq, seed) + 0.5 * noise2(a * freq * 2.3, b * freq * 2.3, seed + 5);
    return n(u, v) * (1 - u) * (1 - v) + n(u - 1, v) * u * (1 - v) + n(u, v - 1) * (1 - u) * v + n(u - 1, v - 1) * u * v;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (hgt(x + 1, y) - hgt(x - 1, y)) * strength, dy = (hgt(x, y + 1) - hgt(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1), k = (y * size + x) * 4;
      img.data[k] = (-dx / l * 0.5 + 0.5) * 255; img.data[k + 1] = (-dy / l * 0.5 + 0.5) * 255; img.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function bannerTexture(text, bg) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 48;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 48);
  if (text === '#') {
    for (let y = 0; y < 3; y++) for (let x = 0; x < 16; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#eee'; g.fillRect(x * 16, y * 16, 16, 16); }
  } else {
    g.fillStyle = '#fff'; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 128, 25);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function fallTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 128);
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 64, y = Math.random() * 128, l = 14 + Math.random() * 40;
    g.fillStyle = `rgba(255,255,255,${0.18 + Math.random() * 0.5})`;
    g.fillRect(x, y, 1 + Math.random() * 2.5, l);
    g.fillRect(x, y - 128, 1 + Math.random() * 2.5, l);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Vertex colours above 1.0 glow (lava) regardless of lighting. */
function glowPatch(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += max(vColor.rgb - vec3(1.0), vec3(0.0)) * 1.6;');
  };
  return mat;
}

export class World {
  constructor(track, quality, renderer) {
    this.track = track;
    this.q = quality;
    this.renderer = renderer;
    this.env = track.env;
    this.scene = new THREE.Scene();
    this.disposables = [];
    this.chunkMeshes = new Map();
    this.queue = [];
    this.lastScan = -1;
    this.propKey = '';
    this.day = 1;
    this.tmpM = new THREE.Matrix4();
    this.tmpQ = new THREE.Quaternion();
    this.tmpV = new THREE.Vector3();
    this.tmpS = new THREE.Vector3();
    this.tmpC = new THREE.Color();
    this.up = new THREE.Vector3(0, 1, 0);
    this.c = { top: new THREE.Color(), hor: new THREE.Color(), fog: new THREE.Color(), sunCol: new THREE.Color(), cloud: new THREE.Color(), light: new THREE.Color(), sunDir: new THREE.Vector3() };
  }

  keep(o) { this.disposables.push(o); return o; }

  init(session) {
    const env = this.env, scene = this.scene, pbr = this.q.pbr;
    this.sunAz = ((this.track.seed * 37) % 360) * Math.PI / 180;
    scene.fog = new THREE.Fog(0xffffff, 40, 200);
    scene.background = new THREE.Color();

    this.sky = new Sky(env, this.q.name, this.track.seed);
    scene.add(this.sky.mesh, this.sky.ring);

    this.hemi = new THREE.HemisphereLight(0xffffff, new THREE.Color(env.grass[0] * 0.7, env.grass[1] * 0.7, env.grass[2] * 0.7), 1);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    if (this.q.shadows) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(this.q.shadows, this.q.shadows);
      const c = this.sun.shadow.camera;
      c.left = -26; c.right = 26; c.top = 26; c.bottom = -26; c.near = 1; c.far = 160;
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.06;
    }
    scene.add(this.sun, this.sun.target);

    // image-based lighting for the PBR materials: a tiny gradient environment
    if (pbr) {
      const es = new THREE.Scene();
      const eg = new THREE.SphereGeometry(10, 16, 8);
      const ec = new Float32Array(eg.attributes.position.count * 3);
      for (let i = 0; i < eg.attributes.position.count; i++) {
        const y = eg.attributes.position.getY(i) / 10;
        const a = y > 0 ? env.horizon : env.grass, b = y > 0 ? env.sky : env.grass;
        const t = Math.abs(y);
        ec[i * 3] = a[0] + (b[0] - a[0]) * t; ec[i * 3 + 1] = a[1] + (b[1] - a[1]) * t; ec[i * 3 + 2] = a[2] + (b[2] - a[2]) * t;
      }
      eg.setAttribute('color', new THREE.BufferAttribute(ec, 3));
      const em = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
      es.add(new THREE.Mesh(eg, em));
      const pm = new THREE.PMREMGenerator(this.renderer);
      this.envRT = pm.fromScene(es, 0.03);
      scene.environment = this.envRT.texture;
      pm.dispose(); eg.dispose(); em.dispose();
    }

    // terrain: PBR with a procedural normal map on medium/high, Lambert on low
    this.grain = this.keep(grainTexture());
    if (pbr) {
      this.terrainNormal = this.keep(normalTexture(128, 9, 2.2, 3));
      this.terrainMat = this.keep(glowPatch(new THREE.MeshStandardMaterial({ vertexColors: true, map: this.grain, normalMap: this.terrainNormal, normalScale: new THREE.Vector2(0.85, 0.85), roughness: 0.94, metalness: 0, envMapIntensity: 0.3, side: THREE.DoubleSide })));
    } else {
      this.terrainMat = this.keep(glowPatch(new THREE.MeshLambertMaterial({ vertexColors: true, map: this.grain, side: THREE.DoubleSide })));
    }
    this.propMat = this.keep(pbr
      ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, envMapIntensity: 0.25 })
      : new THREE.MeshLambertMaterial({ vertexColors: true }));

    this._buildPropTemplates();
    this._buildStatics(session);
    this._buildPrecip();
    this.setAtmosphere(session.weather, session.hour, 0);
  }

  // -------------------------------------------------------------- atmosphere
  /** Apply weather + clock hour to sky, fog, lights and precipitation. Cheap; call a few times a second. */
  setAtmosphere(w, hour, dt) {
    const env = this.env, c = this.c;
    const el = sunElevation(hour);
    const day = smoothstep(-0.1, 0.22, el);
    const low = clamp(1 - Math.abs(el) / 0.4, 0, 1) * smoothstep(-0.2, 0.02, el);
    const gloom = clamp(1 - w.fog, 0, 0.8);
    const wetSky = Math.max(w.rain, w.snow * 0.6);
    this.day = day;

    c.top.setRGB(0.012, 0.02, 0.05).lerp(this.tmpC.setRGB(env.sky[0], env.sky[1], env.sky[2]), day);
    c.hor.setRGB(0.03, 0.05, 0.09).lerp(this.tmpC.setRGB(env.horizon[0], env.horizon[1], env.horizon[2]), day);
    c.hor.lerp(this.tmpC.setRGB(1.0, 0.5, 0.24), low * 0.6);
    c.top.lerp(this.tmpC.setRGB(0.28, 0.2, 0.42), low * 0.35);
    const grey = (col, k) => { const g = (col.r + col.g + col.b) / 3 * 0.92; col.lerp(this.tmpC.setRGB(g, g, g * 1.03), k); };
    grey(c.top, gloom * 0.9); grey(c.hor, gloom * 0.8);
    if (w.dust > 0) { c.top.lerp(this.tmpC.setRGB(0.74, 0.58, 0.36).multiplyScalar(0.3 + 0.7 * day), w.dust * 0.8); c.hor.lerp(this.tmpC.setRGB(0.82, 0.66, 0.42).multiplyScalar(0.3 + 0.7 * day), w.dust * 0.85); }
    if (w.ash > 0) { c.top.lerp(this.tmpC.setRGB(0.1, 0.08, 0.08), w.ash * 0.75); c.hor.lerp(this.tmpC.setRGB(0.3, 0.16, 0.1), w.ash * 0.6); }

    c.fog.copy(c.hor).lerp(this.tmpC.setRGB(env.fog[0], env.fog[1], env.fog[2]).multiplyScalar(0.08 + 0.92 * day), 0.35 * (1 - w.dust) * (1 - w.ash));
    c.fog.multiplyScalar(1 - gloom * 0.38);
    this.scene.fog.color.copy(c.fog);
    this.scene.background.copy(c.fog);
    const far = Math.min(this.q.radius * 0.97, env.fogFar * w.fog * (0.7 + 0.3 * day));
    this.scene.fog.near = far * 0.3; this.scene.fog.far = far;
    this.fogFar = far;

    // sun by day, a dim blue moon by night
    const elv = Math.max(el, 0.08);
    if (day > 0.02) c.sunDir.set(Math.cos(this.sunAz) * Math.cos(elv * 1.3), Math.sin(elv * 1.3), Math.sin(this.sunAz) * Math.cos(elv * 1.3)).normalize();
    else c.sunDir.set(Math.cos(this.sunAz + 2) * 0.6, 0.75, Math.sin(this.sunAz + 2) * 0.6).normalize();
    c.sunCol.setRGB(env.sun[0], env.sun[1], env.sun[2]).lerp(this.tmpC.setRGB(1.0, 0.55, 0.28), low * 0.75);
    this.sun.color.copy(c.sunCol).lerp(this.tmpC.setRGB(0.45, 0.55, 0.9), 1 - day);
    this.sun.intensity = 2.3 * day * clamp(1 - gloom * 1.15, 0.12, 1) * (1 - 0.5 * w.dust) * (1 - 0.4 * w.ash) + 0.3 * (1 - day);
    this.hemi.color.copy(c.top).lerp(c.hor, 0.5).lerp(this.tmpC.setRGB(1, 1, 1), 0.35);
    this.hemi.intensity = env.ambient * (0.18 + 0.95 * day) * (1 + gloom * 0.25);
    this.scene.environmentIntensity = (0.12 + 0.7 * day) * (1 - gloom * 0.3);

    // wet ground shines
    if (this.q.pbr) {
      this.terrainMat.roughness = 0.94 - 0.5 * w.wet;
      this.terrainMat.envMapIntensity = 0.3 + 0.7 * w.wet;
    }

    const st = env.skyStyle;
    c.cloud.setRGB(st.cloud[0], st.cloud[1], st.cloud[2]).multiplyScalar((0.16 + 0.84 * day) * (1 - wetSky * 0.4) * (1 - gloom * 0.25));
    c.cloud.lerp(this.tmpC.setRGB(1.0, 0.6, 0.4).multiplyScalar(0.3 + 0.7 * day), low * 0.5);
    c.light.setRGB(1, 1, 1).multiplyScalar(0.12 + 0.88 * day);
    this.sky.set({
      top: c.top, hor: c.hor, sunDir: c.sunDir,
      sunCol: this.tmpC.copy(c.sunCol).multiplyScalar(day > 0.02 ? clamp(1 - gloom * 1.3, 0, 1) * (1 - w.dust * 0.8) : 0.35 * (1 - gloom)),
      cloudCol: c.cloud, cover: clamp(st.cover + gloom * 0.7 + wetSky * 0.25, 0, 1),
      stars: (1 - day) * clamp(1 - gloom * 1.4, 0, 1), wind: w.wind,
      glow: env.silhouette === 'volcano' ? 0.55 + 0.45 * (1 - day) : 0,
      aurora: env.off === 'deepsnow' ? (1 - day) * clamp(1 - gloom * 1.5, 0, 1) : 0,
      ringLight: c.light, ringMix: clamp(0.42 + gloom * 0.5 + w.dust * 0.4 + w.ash * 0.3, 0, 0.97)
    }, dt);

    // precipitation: one particle system that changes character with the weather
    const p = this.precip;
    let kind = 'none', amt = 0;
    if (w.snow > amt) { kind = 'snow'; amt = w.snow; }
    if (w.rain > amt) { kind = 'rain'; amt = w.rain; }
    if (w.dust > amt) { kind = 'dust'; amt = w.dust; }
    if (w.ash > amt) { kind = 'ash'; amt = w.ash; }
    p.points.visible = amt > 0.04;
    if (p.points.visible) {
      const K = { snow: [0xffffff, 0.16, 4.5, 9, 0.9], rain: [0xa9c4d8, 0.09, 27, 5, 0.55], dust: [0xd9b377, 0.2, 1.2, 26, 0.5], ash: [0x6a6260, 0.14, 2.4, 6, 0.8] }[kind];
      p.mat.color.setHex(K[0]).multiplyScalar(0.25 + 0.75 * day);
      p.mat.size = K[1]; p.fall = K[2]; p.wind = K[3] * (0.3 + w.wind); p.mat.opacity = K[4];
      p.points.geometry.setDrawRange(0, Math.floor(p.n * (0.3 + 0.7 * Math.min(1, amt))));
    }
  }

  // ------------------------------------------------------------------ props
  _buildPropTemplates() {
    const env = this.env, cap = this.q.props, kind = env.treeKind;
    const mk = (geo, n, colored) => {
      const im = new THREE.InstancedMesh(this.keep(geo), this.propMat, n);
      im.count = 0; im.frustumCulled = false;
      im.castShadow = !!this.q.treeShadows;
      if (colored) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
      this.scene.add(im);
      return im;
    };
    const tr = env.trunk, f1 = env.foliage, f2 = env.foliage2, snowy = kind === 'snowpine';
    const geos = {
      pine: () => mergeColored([
        { geo: new THREE.CylinderGeometry(0.16, 0.26, 2.4, 5), matrix: M(0, 1.2, 0), color: tr },
        { geo: new THREE.ConeGeometry(1.9, 3.2, 7), matrix: M(0, 3.2, 0), color: f1, shade: [1.6, 4.8] },
        { geo: new THREE.ConeGeometry(1.45, 2.8, 7), matrix: M(0, 5.0, 0, 1, 1, 1, 0, 0.5, 0), color: snowy ? f2 : f1, shade: [3.6, 6.4] },
        { geo: new THREE.ConeGeometry(0.95, 2.4, 6), matrix: M(0, 6.7, 0), color: snowy ? f2 : f1, shade: [5.5, 7.9] }
      ]),
      broad: () => mergeColored([
        { geo: new THREE.CylinderGeometry(0.2, 0.32, 3.2, 5), matrix: M(0, 1.6, 0), color: tr },
        { geo: new THREE.IcosahedronGeometry(2.1, 1), matrix: M(0, 4.6, 0, 1, 0.85, 1), color: f2, shade: [2.8, 6.4] },
        { geo: new THREE.IcosahedronGeometry(1.5, 0), matrix: M(0.9, 5.6, 0.5, 1, 0.9, 1, 0.5, 1, 0), color: f1, shade: [4.2, 7] }
      ]),
      jungle: () => mergeColored([
        { geo: new THREE.CylinderGeometry(0.24, 0.5, 9, 6), matrix: M(0, 4.5, 0), color: tr },
        { geo: new THREE.ConeGeometry(0.9, 2.2, 4), matrix: M(0, 0.9, 0), color: tr },                                    // buttress
        { geo: new THREE.IcosahedronGeometry(3.4, 1), matrix: M(0, 10.2, 0, 1.25, 0.5, 1.25), color: f2, shade: [8.5, 12] },
        { geo: new THREE.IcosahedronGeometry(2.2, 0), matrix: M(1.6, 8.4, -1.0, 1.1, 0.5, 1.1, 0.3, 1, 0), color: f1, shade: [7.3, 9.6] },
        { geo: new THREE.CylinderGeometry(0.03, 0.03, 5, 3), matrix: M(1.2, 6.2, 0.6), color: f1 },                         // liana
        { geo: new THREE.CylinderGeometry(0.03, 0.03, 4, 3), matrix: M(-1.4, 6.9, -0.4), color: f1 }
      ]),
      palm: () => {
        const parts = [{ geo: new THREE.CylinderGeometry(0.14, 0.24, 6, 6), matrix: M(0.3, 3, 0, 1, 1, 1, 0, 0, -0.1), color: tr }];
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          parts.push({ geo: new THREE.ConeGeometry(0.5, 3.4, 3), matrix: new THREE.Matrix4().makeRotationY(a).multiply(M(0, 6.1, 1.5, 1, 1, 0.25, 1.95, 0, 0)).premultiply(new THREE.Matrix4().makeTranslation(0.6, 0, 0)), color: i % 2 ? f1 : f2 });
        }
        return mergeColored(parts);
      },
      cactus: () => mergeColored([
        { geo: new THREE.CylinderGeometry(0.34, 0.38, 3.6, 7), matrix: M(0, 1.8, 0), color: f1, shade: [0, 3.6] },
        { geo: new THREE.SphereGeometry(0.34, 7, 4), matrix: M(0, 3.6, 0), color: f1 },
        { geo: new THREE.CylinderGeometry(0.2, 0.2, 1.0, 6), matrix: M(0.62, 1.9, 0, 1, 1, 1, 0, 0, Math.PI / 2), color: f1 },
        { geo: new THREE.CylinderGeometry(0.2, 0.22, 1.4, 6), matrix: M(1.05, 2.5, 0), color: f2 },
        { geo: new THREE.CylinderGeometry(0.18, 0.18, 0.8, 6), matrix: M(-0.52, 1.3, 0, 1, 1, 1, 0, 0, Math.PI / 2), color: f1 },
        { geo: new THREE.CylinderGeometry(0.18, 0.2, 1.0, 6), matrix: M(-0.86, 1.75, 0), color: f2 }
      ]),
      dead: () => mergeColored([
        { geo: new THREE.CylinderGeometry(0.1, 0.3, 4.6, 5), matrix: M(0, 2.3, 0), color: tr },
        { geo: new THREE.CylinderGeometry(0.04, 0.1, 2.2, 4), matrix: M(0.7, 3.4, 0, 1, 1, 1, 0, 0, -0.9), color: tr },
        { geo: new THREE.CylinderGeometry(0.04, 0.09, 1.8, 4), matrix: M(-0.55, 2.8, 0.2, 1, 1, 1, 0.3, 0, 0.8), color: tr },
        { geo: new THREE.CylinderGeometry(0.03, 0.07, 1.4, 4), matrix: M(0.1, 4.4, -0.4, 1, 1, 1, -0.6, 0, 0.2), color: tr }
      ])
    };
    const used = { mixed: ['pine', 'broad'], pine: ['pine'], snowpine: ['pine'], broad: ['broad'], desert: ['cactus', 'palm'], jungle: ['jungle', 'palm', 'broad'], dead: ['dead'] }[kind] || ['pine'];
    this.treeKinds = used;
    this.inst = {};
    for (const k of used) this.inst[k] = mk(geos[k](), Math.ceil(cap / used.length) + 200);
    // far LOD: one very cheap silhouette for trees beyond the near ring
    const farGeo = kind === 'dead' || kind === 'desert'
      ? mergeColored([{ geo: new THREE.CylinderGeometry(0.2, 0.34, 3.6, 4), matrix: M(0, 1.8, 0), color: [1, 1, 1] }])
      : mergeColored([{ geo: new THREE.CylinderGeometry(0.2, 0.3, 2.6, 3), matrix: M(0, 1.3, 0), color: [tr[0] / f1[0], tr[1] / f1[1], tr[2] / f1[2]] }, { geo: new THREE.ConeGeometry(2.0, kind === 'jungle' ? 4 : 5.6, 4), matrix: M(0, kind === 'jungle' ? 9 : 4.8, 0, kind === 'jungle' ? 1.7 : 1, 1, kind === 'jungle' ? 1.7 : 1), color: [1, 1, 1], shade: [2, 8] }]);
    if (kind === 'jungle') farGeo.attributes.position.needsUpdate = true;
    this.inst.far = mk(farGeo, cap, true);

    const rockG = new THREE.IcosahedronGeometry(1, 1);
    const rp = rockG.attributes.position;
    for (let i = 0; i < rp.count; i++) {
      const k = 1 + 0.18 * noise2(rp.getX(i) * 2.1 + 5, rp.getZ(i) * 2.1 + rp.getY(i) * 1.7, 77);
      rp.setXYZ(i, rp.getX(i) * k, rp.getY(i) * k, rp.getZ(i) * k);
    }
    rockG.computeVertexNormals();
    const cl = env.cliff;
    this.rockGeo = this.keep(mergeColored([{ geo: rockG, color: [cl[0] * 0.95, cl[1] * 0.95, cl[2] * 0.95], shade: [-1, 1] }]));
    this.inst.boulder = mk(this.rockGeo, Math.ceil(cap / 2));
    const bushGeo = kind === 'jungle'
      ? mergeColored([0, 1, 2, 3, 4].map((i) => ({ geo: new THREE.ConeGeometry(0.34, 1.9, 3), matrix: new THREE.Matrix4().makeRotationY(i * 1.26).multiply(M(0, 0.7, 0.55, 1, 1, 0.3, 1.0, 0, 0)), color: i % 2 ? f1 : f2 })))
      : mergeColored([{ geo: new THREE.IcosahedronGeometry(0.7, 0), matrix: M(0, 0.4, 0, 1, 0.7, 1), color: f2, shade: [-0.1, 0.9] }]);
    this.inst.bush = mk(bushGeo, cap);
  }

  _refreshProps(cx0, cz0) {
    const R = this.q.propChunks;
    const k = cx0 + ',' + cz0;
    if (k === this.propKey) return;
    this.propKey = k;
    const env = this.env, kinds = this.treeKinds;
    const counts = {};
    for (const n in this.inst) counts[n] = 0;
    const put = (name, p, sy = 1, col) => {
      const im = this.inst[name];
      const i = counts[name];
      if (i >= im.instanceMatrix.count) return;
      this.tmpQ.setFromAxisAngle(this.up, p.rot);
      this.tmpV.set(p.x, p.y - 0.1, p.z);
      this.tmpS.set(p.scale, p.scale * sy, p.scale);
      im.setMatrixAt(i, this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS));
      if (col) im.instanceColor.setXYZ(i, col[0], col[1], col[2]);
      counts[name] = i + 1;
    };
    for (let cz = cz0 - R; cz <= cz0 + R; cz++) {
      for (let cx = cx0 - R; cx <= cx0 + R; cx++) {
        if (!this.track.chunks.has(key2(cx, cz))) continue;
        const near = Math.max(Math.abs(cx - cx0), Math.abs(cz - cz0)) <= this.q.propNear;
        for (const p of this.track.propsFor(cx, cz)) {
          if (p.type === 'tree') {
            if (near) put(kinds[Math.min(kinds.length - 1, Math.floor(p.v * kinds.length * (kinds.length > 1 ? 1.35 : 1)) % kinds.length)], p, 0.9 + p.v * 0.4);
            else put('far', p, 0.9 + p.v * 0.4, p.v > 0.5 ? env.foliage : env.foliage2);
          } else if (p.type === 'boulder') put('boulder', { ...p, y: p.y + p.scale * 0.25 }, 0.75);
          else if (near || p.v > 0.5) put('bush', p);
        }
      }
    }
    for (const name in counts) {
      const im = this.inst[name];
      im.count = counts[name];
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- statics
  _buildStatics(session) {
    const tr = this.track, scene = this.scene, env = this.env;
    const rocks = tr.obstacles.filter((o) => o.type === 'rock');
    if (rocks.length) {
      const im = new THREE.InstancedMesh(this.rockGeo, this.propMat, rocks.length);
      rocks.forEach((o, i) => {
        const y = tr.heightAt(o.x, o.z);
        this.tmpQ.setFromAxisAngle(this.up, o.rot);
        im.setMatrixAt(i, this.tmpM.compose(this.tmpV.set(o.x, y - o.h * 0.08, o.z), this.tmpQ, this.tmpS.set(o.r * 0.9, o.h * 1.02, o.r * 0.9)));
        const k = 0.8 + o.tint * 0.35;
        im.setColorAt(i, this.tmpC.setRGB(k, k, k * 1.02));
      });
      im.castShadow = !!this.q.shadows; im.receiveShadow = true; im.frustumCulled = false;
      scene.add(im);
    }
    const parts = [];
    const wood = [0.36, 0.25, 0.14], woodD = [0.27, 0.18, 0.1];
    for (const o of tr.obstacles) {
      if (o.type !== 'log') continue;
      const y = tr.heightAt(o.x, o.z) + o.r * 0.55;
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(o.ax, 0, o.az));
      parts.push({ geo: new THREE.CylinderGeometry(o.r, o.r * 1.08, o.len, 8), matrix: new THREE.Matrix4().compose(new THREE.Vector3(o.x, y, o.z), q, new THREE.Vector3(1, 1, 1)), color: woodD });
    }
    for (const b of tr.bridges) {
      const ang = Math.atan2(b.x1 - b.x0, b.z1 - b.z0);
      const mx = (b.x0 + b.x1) / 2, mz = (b.z0 + b.z1) / 2, my = (b.y0 + b.y1) / 2;
      const pitch = -Math.atan2(b.y1 - b.y0, b.len);
      const base = new THREE.Matrix4().compose(new THREE.Vector3(mx, my, mz), new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, ang, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
      const local = (m) => base.clone().multiply(m);
      const steel = env.silhouette === 'volcano';
      const cA = steel ? [0.3, 0.3, 0.32] : wood, cB = steel ? [0.2, 0.2, 0.22] : woodD;
      const nPl = Math.round(b.len / 0.6);
      for (let i = 0; i < nPl; i++) {
        const z = -b.len / 2 + (i + 0.5) * (b.len / nPl);
        parts.push({ geo: new THREE.BoxGeometry(b.half * 2, 0.14, b.len / nPl - 0.06), matrix: local(M(0, -0.07, z)), color: i % 3 ? cA : cB });
      }
      for (const sx of [-1, 1]) {
        parts.push({ geo: new THREE.BoxGeometry(0.22, 0.34, b.len + 1), matrix: local(M(sx * (b.half - 0.2), -0.3, 0)), color: cB });
        if (b.rails) parts.push({ geo: new THREE.BoxGeometry(0.1, 0.1, b.len), matrix: local(M(sx * (b.half + 0.05), 0.7, 0)), color: cB });
      }
      const nPost = Math.max(2, Math.round(b.len / 9));
      for (let i = 0; i <= nPost; i++) {
        const u = i / nPost, z = -b.len / 2 + u * b.len;
        const wx = b.x0 + (b.x1 - b.x0) * u, wz = b.z0 + (b.z1 - b.z0) * u;
        const drop = (b.y0 + (b.y1 - b.y0) * u) - tr.heightAt(wx, wz) + 1;
        if (drop < 1.5) continue;
        for (const sx of [-1, 1]) parts.push({ geo: new THREE.BoxGeometry(0.28, drop, 0.28), matrix: local(M(sx * (b.half - 0.2), -0.3 - drop / 2, z)), color: cB });
        if (b.rails) for (const sx of [-1, 1]) parts.push({ geo: new THREE.BoxGeometry(0.1, 0.8, 0.1), matrix: local(M(sx * (b.half + 0.05), 0.35, z)), color: cB });
      }
    }
    for (const a of tr.anchors) {
      const y = tr.heightAt(a.x, a.z);
      parts.push({ geo: new THREE.CylinderGeometry(0.12, 0.14, 1.5, 6), matrix: M(a.x, y + 0.7, a.z), color: [0.9, 0.45, 0.08] });
      parts.push({ geo: new THREE.TorusGeometry(0.2, 0.05, 5, 8), matrix: M(a.x, y + 1.45, a.z), color: [0.75, 0.75, 0.78] });
    }
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
    const addBanner = (g, text, bg) => {
      const tex = this.keep(bannerTexture(text, bg));
      const mat = this.keep(new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
      const bw = Math.min(g.hw * 2, 9);
      const m = new THREE.Mesh(this.keep(new THREE.PlaneGeometry(bw, bw * 0.19)), mat);
      m.position.set(g.p.x, g.p.y + 4.4, g.p.z);
      m.rotation.y = g.p.heading + Math.PI;
      scene.add(m);
    };
    tr.checkpoints.forEach((c, i) => addBanner(gate(c.s, [0.9, 0.55, 0.1]), `CHECKPOINT ${i + 1}`, '#c8771a'));
    addBanner(gate(tr.finishS, [0.85, 0.85, 0.85]), '#', '#fff');
    addBanner(gate(tr.startS + 6, [0.2, 0.55, 0.3]), 'START', '#2f9e55');
    if (parts.length) {
      const m = new THREE.Mesh(this.keep(mergeColored(parts)), this.propMat);
      m.castShadow = !!this.q.shadows; m.receiveShadow = true;
      scene.add(m);
    }
    // supply caches (beacon) and hidden relics (no beacon - you have to look)
    const crateGeo = this.keep(new THREE.BoxGeometry(1.1, 0.8, 0.8));
    const crateMat = this.keep(new THREE.MeshLambertMaterial({ color: 0xd9a12b }));
    const beamGeo = this.keep(new THREE.CylinderGeometry(0.25, 0.25, 26, 8, 1, true));
    const beamMat = this.keep(new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.28, depthWrite: false, fog: false }));
    this.cacheMeshes = tr.caches.map((c) => {
      const g = new THREE.Group();
      const box = new THREE.Mesh(crateGeo, crateMat); box.position.y = 0.4;
      const beam = new THREE.Mesh(beamGeo, beamMat); beam.position.y = 13;
      g.add(box, beam);
      g.position.set(c.x, tr.heightAt(c.x, c.z), c.z);
      scene.add(g);
      return g;
    });
    const relGeo = this.keep(new THREE.OctahedronGeometry(0.42, 0));
    const relMat = this.keep(new THREE.MeshBasicMaterial({ color: 0x66e0ff, fog: true }));
    this.relicMeshes = (tr.relics || []).map((c) => {
      const m = new THREE.Mesh(relGeo, relMat);
      m.position.set(c.x, tr.heightAt(c.x, c.z) + 1.0, c.z);
      scene.add(m);
      return m;
    });
    // water
    this.waterNormal = this.keep(normalTexture(128, 5, 1.6, 21));
    this.waterNormal.repeat.set(18, 4);
    const wcol = new THREE.Color(0.16, 0.32, 0.36);
    if (env.silhouette === 'canopy') wcol.setRGB(0.2, 0.3, 0.2);
    if (env.off === 'deepsnow') wcol.setRGB(0.3, 0.42, 0.5);
    this.waterMat = this.keep(this.q.pbr
      ? new THREE.MeshStandardMaterial({ color: wcol, roughness: 0.1, metalness: 0.15, transparent: true, opacity: 0.84, depthWrite: false, normalMap: this.waterNormal, normalScale: new THREE.Vector2(0.5, 0.5), envMapIntensity: 1.4 })
      : new THREE.MeshLambertMaterial({ color: wcol, transparent: true, opacity: 0.78, depthWrite: false }));
    for (const w of tr.water) {
      const im = Math.round((w.i0 + w.i1) / 2);
      const m = new THREE.Mesh(this.keep(new THREE.PlaneGeometry(150, w.s1 - w.s0)), this.waterMat);
      m.quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, Math.atan2(tr.TX[im], tr.TZ[im]), 0, 'YXZ'));
      m.position.set(tr.PX[im], w.level, tr.PZ[im]);
      m.renderOrder = 2;
      scene.add(m);
    }
    // waterfalls: scrolling streak sheet + mist at the base
    this.fallTex = null;
    if (tr.falls.length) {
      this.fallTex = this.keep(fallTexture());
      const fm = this.keep(new THREE.MeshBasicMaterial({ map: this.fallTex, transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide, color: 0xdff4ff }));
      const mist = this.keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false }));
      for (const f of tr.falls) {
        const y0 = tr.heightAt(f.x, f.z);
        const lx = Math.cos(f.heading), lz = -Math.sin(f.heading);
        const m = new THREE.Mesh(this.keep(new THREE.PlaneGeometry(f.w, f.h)), fm);
        m.position.set(f.x, y0 + f.h / 2 - 0.5, f.z);
        m.rotation.y = Math.atan2(-f.side * lx, -f.side * lz);
        m.renderOrder = 3;
        const fog = new THREE.Mesh(this.keep(new THREE.SphereGeometry(f.w * 0.55, 8, 6)), mist);
        fog.position.set(f.x - f.side * lx * 0.8, y0 + 0.6, f.z - f.side * lz * 0.8);
        fog.scale.y = 0.45;
        fog.renderOrder = 4;
        scene.add(m, fog);
      }
    }
  }

  _buildPrecip() {
    const n = this.q.particles;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 50; pos[i * 3 + 1] = Math.random() * 26; pos[i * 3 + 2] = (Math.random() - 0.5) * 50; }
    const g = this.keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = this.keep(new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.7, depthWrite: false, fog: false }));
    const points = new THREE.Points(g, mat);
    points.frustumCulled = false;
    points.visible = false;
    this.scene.add(points);
    this.precip = { points, mat, n, fall: 5, wind: 1 };
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
    const extra = tr.water.length > 0 || tr.sidePatches;
    const alb = env.albedo || 1;   // very bright ground (sand, snow) is toned down so it does not clip
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
        let glow = 0;
        if (e < 1.6) {
          const sq = tr.surfaceAt(x, z);
          const c = sq.surface.color;
          const t = sq.onRoad && e > 0 ? 1 : smoothstep(1.6, -0.2, e);
          r += (c[0] - r) * t; g += (c[1] - g) * t; b += (c[2] - b) * t;
          if (sq.waterY > y) { r *= 0.72; g *= 0.74; b *= 0.78; }
          if (sq.surface.hot) glow = 1;
        } else if (extra && e < 70) {
          const sq = tr.surfaceAt(x, z);
          if (sq.surface.hot) { const c = sq.surface.color; r = c[0]; g = c[1]; b = c[2]; glow = 1; }
          else if (sq.waterY > y - 0.4) { const c = sq.surface.color; r = c[0] * 0.8; g = c[1] * 0.8; b = c[2] * 0.82; }
        }
        if (glow) {
          // crust pattern: dark plates with bright cracks
          const cr = Math.abs(noise2(x / 1.7, z / 1.7, 31));
          const k2 = cr < 0.22 ? 1.25 : 0.42;
          colr[k * 3] = r * k2; colr[k * 3 + 1] = g * k2 * (cr < 0.22 ? 1.2 : 0.6); colr[k * 3 + 2] = b * k2;
        } else { colr[k * 3] = r * nz2 * alb; colr[k * 3 + 1] = g * nz2 * alb; colr[k * 3 + 2] = b * nz2 * alb; }
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
    let so = nv * nv;
    const edge = (get) => {
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

  /** Stream chunks around the focus point and animate the environment. Call every frame. */
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
    // vegetation instances are refilled once the terrain around the truck has settled
    if (built) this.propsDirty = true;
    this.propTimer = (this.propTimer || 0) + dt;
    if (this.propsDirty && (this.queue.length === 0 || this.propTimer > 0.6)) {
      this.propsDirty = false; this.propTimer = 0; this.propKey = '';
    }
    this._refreshProps(ccx, ccz);

    const cp = camera.position;
    this.sky.mesh.position.copy(cp);
    this.sky.ring.position.set(cp.x, Math.min(cp.y - 50, tr.meta.startY - 30), cp.z);
    const sd = this.c.sunDir;
    this.sun.target.position.set(fx, cp.y - 3, fz);
    this.sun.position.set(fx + sd.x * 70, cp.y - 3 + sd.y * 70, fz + sd.z * 70);
    const p = this.precip;
    if (p.points.visible) {
      const a = p.points.geometry.attributes.position;
      const arr = a.array;
      const fall = p.fall * dt, wind = p.wind * dt;
      const lim = p.points.geometry.drawRange.count * 3;
      for (let i = 0; i < lim; i += 3) {
        arr[i + 1] -= fall * (0.8 + (i % 7) * 0.06);
        arr[i] += wind;
        if (arr[i + 1] < -4) arr[i + 1] += 26;
        if (arr[i] > 25) arr[i] -= 50;
      }
      a.needsUpdate = true;
      p.points.position.set(cp.x, cp.y - 6, cp.z);
    }
    for (let i = 0; i < this.cacheMeshes.length; i++) this.cacheMeshes[i].children[0].rotation.y = time * 1.5;
    for (let i = 0; i < this.relicMeshes.length; i++) { this.relicMeshes[i].rotation.y = time * 2; }
    this.waterNormal.offset.set(time * 0.012, time * 0.03);
    if (this.fallTex) this.fallTex.offset.y = time * 0.9;
  }

  get pending() { return this.queue.length; }
  hideCache(i) { this.cacheMeshes[i].visible = false; }
  hideRelic(i) { this.relicMeshes[i].visible = false; }

  dispose() {
    for (const [, m] of this.chunkMeshes) m.mesh.geometry.dispose();
    this.chunkMeshes.clear();
    for (const d of this.disposables) d.dispose && d.dispose();
    this.scene.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
    this.sky.dispose();
    if (this.envRT) this.envRT.dispose();
  }
}

export const QUALITY = {
  low:    { name: 'low',    radius: 150, shadows: 0,    pixelRatio: 1.0, props: 900,  propChunks: 3, propNear: 1, particles: 500,  buildPerFrame: 1, treeShadows: false, antialias: false, pbr: false },
  medium: { name: 'medium', radius: 200, shadows: 1024, pixelRatio: 1.5, props: 1800, propChunks: 4, propNear: 2, particles: 900,  buildPerFrame: 2, treeShadows: false, antialias: false, pbr: true },
  high:   { name: 'high',   radius: 260, shadows: 2048, pixelRatio: 2.0, props: 3200, propChunks: 5, propNear: 3, particles: 1500, buildPerFrame: 3, treeShadows: true,  antialias: true,  pbr: true }
};
