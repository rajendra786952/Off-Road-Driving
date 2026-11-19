// Three.js world: streamed terrain chunks built from the SAME height grid the
// physics uses, instanced vegetation with LOD, water, waterfalls, lava, bridges,
// gates, a procedural sky per region and a live atmosphere (weather + time of day).
import * as THREE from 'three';
import { CHUNK, CW } from '../core/track.js';
import { noise2, smoothstep } from '../core/noise.js';
import { SURFACE_LIST } from '../core/surfaces.js';
import { mergeColored, M } from './geo.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { Sky, sunElevation, ENABLE_SKYBOX } from './sky.js';
import { Scenery } from './scenery.js';
import { treeAtlas, treeGeometries } from './trees.js';

const key2 = (a, b) => (a + 32768) * 65536 + (b + 32768);

/** Photo ground layers (public/textures/ground/<name>_diff.jpg + _nor.jpg) and which one each surface uses. */
const GROUND_LAYERS = ['grass', 'dirt', 'mud', 'rock', 'gravel', 'sand', 'snow', 'forest'];
const LAYER_OF = {
  grass: 0, dirt: 1, wood: 1, mud: 2, deepmud: 2, bog: 2, rock: 3, wetrock: 3, lavarock: 3, lava: 3,
  gravel: 4, scree: 4, riverbed: 4, ash: 4, sand: 5, deepsand: 5, snow: 6, deepsnow: 6, ice: 6, asphalt: 3
};

/** Building facade: a 4 x 4 grid of windows (one tile = 13.6 m of wall) and the same grid with some of them lit. */
function facadeTextures() {
  const mk = (lit) => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = lit ? '#000' : '#d6d2c8'; g.fillRect(0, 0, 128, 128);
    let seed = 11;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      const x = i * 32 + 8, y = j * 32 + 7, on = rnd() < 0.42;
      if (lit) { if (on) { g.fillStyle = rnd() < 0.5 ? '#ffd98a' : '#fff2c4'; g.fillRect(x, y, 17, 17); } }
      else { g.fillStyle = '#2a3a4c'; g.fillRect(x, y, 17, 17); g.fillStyle = '#4f6a84'; g.fillRect(x, y, 17, 5); g.fillStyle = '#b9b5ab'; g.fillRect(x - 1, y + 17, 19, 2); }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  };
  return { map: mk(false), lit: mk(true) };
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const LAYER_OF_NAME = SURFACE_LIST.map((s) => s.name);      // surface id -> name

/**
 * Tiling ground detail (linear data, mean ~0.82): soft mottling at three frequencies plus
 * hard grit speckles. The terrain shader samples it at three scales, so one small texture
 * gives close-up grain, mid-range patchiness and slow colour drift without a visible repeat.
 */
function detailTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const tile = (x, y, freq, seed) => {
    const u = x / size, v = y / size;
    const n = (p, q) => noise2(p * freq, q * freq, seed);
    return n(u, v) * (1 - u) * (1 - v) + n(u - 1, v) * u * (1 - v) + n(u, v - 1) * (1 - u) * v + n(u - 1, v - 1) * u * v;
  };
  let rnd = 12345;
  const rand = () => ((rnd = (rnd * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0.82 + 0.10 * tile(x, y, 7, 51) + 0.08 * tile(x, y, 23, 52) + 0.05 * tile(x, y, 61, 53);
      const r = rand();
      if (r < 0.05) v -= 0.10 + 0.14 * rand(); else if (r > 0.965) v += 0.08 + 0.08 * rand();
      const k = (y * size + x) * 4, px = Math.max(0, Math.min(255, Math.round(v * 255)));
      img.data[k] = img.data[k + 1] = img.data[k + 2] = px; img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
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
/**
 * Terrain shader patch.
 *  - vertex colours above 1.0 glow (lava) regardless of lighting
 *  - ground detail: until the photo textures have loaded (and always on Low) a procedural detail
 *    map at three scales; afterwards eight photographed ground layers blended by per-vertex
 *    weights. Each layer is divided by its own average colour, so the photo supplies the grain,
 *    stones and leaves while the vertex colour keeps the region's palette, lava, wet banks etc.
 *    A second, larger-scale sample takes over with distance so the tiling never shows.
 *  - the photographed normal maps replace the procedural bump up close
 */
function glowPatch(mat, ground) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, ground);
    sh.vertexShader = 'attribute vec4 aW0;\nattribute vec4 aW1;\nvarying vec4 vW0;\nvarying vec4 vW1;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vW0 = aW0; vW1 = aW1;');
    const layer = (i, w) => `    if (${w} > 0.004) { vec3 ca = texture(uGround, vec3(uvA, ${i}.0)).rgb; vec3 cb = texture(uGround, vec3(uvB, ${i}.0)).rgb; acc += ${w} * mix(ca, cb, fb) / uMean[${i}]; nacc += ${w} * texture(uGroundN, vec3(uvA, ${i}.0)).rgb; }`;
    const W = ['vW0.x', 'vW0.y', 'vW0.z', 'vW0.w', 'vW1.x', 'vW1.y', 'vW1.z', 'vW1.w'];
    sh.fragmentShader = ('uniform sampler2DArray uGround;\nuniform sampler2DArray uGroundN;\nuniform vec3 uMean[8];\nuniform float uPhoto;\nvarying vec4 vW0;\nvarying vec4 vW1;\n' + sh.fragmentShader)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += max(vColor.rgb - vec3(1.0), vec3(0.0)) * 1.6;')
      .replace('#include <map_fragment>', [
        '#ifdef USE_MAP',
        '  float tDist = length(vViewPosition);',
        '  float tNear = 1.0 - smoothstep(14.0, 60.0, tDist);',
        '  vec3 dMacro = texture2D(map, vMapUv * 0.137 + 0.31).rgb;',
        '  vec3 gN = vec3(0.5, 0.5, 1.0);',
        '  vec3 det;',
        '  if (uPhoto > 0.5) {',
        '    vec2 uvA = vMapUv * 1.6;',                       // ~3 m tiles up close
        '    vec2 uvB = vMapUv * 0.37 + 0.43;',               // ~13 m tiles further out
        '    float fb = smoothstep(16.0, 90.0, tDist) * 0.8 + 0.12;',
        '    vec3 acc = vec3(0.0); vec3 nacc = vec3(0.0);',
        ...W.map((w, i) => layer(i, w)),
        '    float ws = max(vW0.x + vW0.y + vW0.z + vW0.w + vW1.x + vW1.y + vW1.z + vW1.w, 0.001);',
        '    det = acc / ws; gN = nacc / ws;',
        '  } else {',
        '    vec3 dMicro = texture2D(map, vMapUv * 3.7).rgb * 1.22;',
        '    vec3 dMid = texture2D(map, vMapUv).rgb * 1.22;',
        '    det = mix(vec3(1.0), dMicro, tNear * 0.9) * mix(vec3(1.0), dMid, 0.8);',
        '  }',
        '  diffuseColor.rgb *= det * (0.36 + 0.62 * dMacro);',
        '#endif'
      ].join('\n'))
      .replace('#include <normal_fragment_maps>', [
        '#ifdef USE_NORMALMAP_TANGENTSPACE',
        '  vec3 mapN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;',
        '  if (uPhoto > 0.5) mapN = normalize(mix(mapN * vec3(0.5, 0.5, 1.0), gN * 2.0 - 1.0, 0.25 + 0.65 * tNear));',
        '  mapN.xy *= normalScale;',
        '  normal = normalize(tbn * mapN);',
        '#endif'
      ].join('\n'));
  };
  return mat;
}

/** Boulders and rocks: the photographed rock layer projected from three sides in world space, tinted by the region's rock colour. */
function rockPatch(mat, ground) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, ground);
    sh.vertexShader = 'varying vec3 vRockP;\nvarying vec3 vRockN;\n' + sh.vertexShader.replace('#include <begin_vertex>', [
      '#include <begin_vertex>',
      '  vec4 rockP = vec4(transformed, 1.0); vec3 rockN = objectNormal;',
      '  #ifdef USE_INSTANCING',
      '    rockP = instanceMatrix * rockP; rockN = mat3(instanceMatrix) * rockN;',
      '  #endif',
      '  vRockP = (modelMatrix * rockP).xyz; vRockN = mat3(modelMatrix) * rockN;'
    ].join('\n'));
    sh.fragmentShader = ('uniform sampler2DArray uGround;\nuniform vec3 uMean[8];\nuniform float uPhoto;\nvarying vec3 vRockP;\nvarying vec3 vRockN;\n' + sh.fragmentShader).replace('#include <color_fragment>', [
      '#include <color_fragment>',
      '  if (uPhoto > 0.5) {',
      '    vec3 bw = abs(normalize(vRockN)); bw = bw * bw; bw /= (bw.x + bw.y + bw.z);',
      '    vec3 rc = texture(uGround, vec3(vRockP.zy * 0.42, 3.0)).rgb * bw.x + texture(uGround, vec3(vRockP.xz * 0.42, 3.0)).rgb * bw.y + texture(uGround, vec3(vRockP.xy * 0.42, 3.0)).rgb * bw.z;',
      '    diffuseColor.rgb *= rc / uMean[3];',
      '  }'
    ].join('\n'));
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
    this.glossy = [];        // materials that reflect the HDR sky: [{ m, base }]
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
    this.skyboxEnabled = ENABLE_SKYBOX;
  }

  keep(o) { this.disposables.push(o); return o; }

  /** Dynamic toggle to enable or disable the 3D skybox at runtime */
  setSkyboxEnabled(enabled) {
    this.skyboxEnabled = !!enabled;
    if (this.sky) {
      this.sky.setVisible(this.skyboxEnabled);
      if (this.skyboxEnabled && this.hdrTex && this.env.hdrSky !== false && !this.sky.hdrMap) {
        const rot = (this.hdrRot || 0) / (Math.PI * 2);
        this.sky.setHdr(this.hdrTex, rot);
      }
    }
  }

  init(session) {
    const env = this.env, scene = this.scene, pbr = this.q.pbr;
    this.sunAz = ((this.track.seed * 37) % 360) * Math.PI / 180;
    const initFog = new THREE.Color(env.fog ? (Math.round(env.fog[0] * 255) << 16 | Math.round(env.fog[1] * 255) << 8 | Math.round(env.fog[2] * 255)) : 0x9fb8a8);
    scene.fog = env.fogExp
      ? new THREE.FogExp2(initFog, env.fogDensity || 0.0078)
      : new THREE.Fog(initFog, 20, env.fogFar || 240);
    scene.background = initFog.clone();

    this.sky = new Sky(env, this.q.name, this.track.seed);
    this.setSkyboxEnabled(this.skyboxEnabled);
    if (this.track && this.track.meta) {
      this.sky.mesh.position.set(this.track.meta.startX || 0, this.track.meta.startY || 0, this.track.meta.startZ || 0);
      this.sky.ring.position.set(this.track.meta.startX || 0, (this.track.meta.startY || 0) - 30, this.track.meta.startZ || 0);
    }
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
    const aniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.grain = this.keep(detailTexture(this.q.name === 'low' ? 128 : 256));
    this.grain.anisotropy = aniso;
    this.ground = {
      uGround: { value: null }, uGroundN: { value: null }, uPhoto: { value: 0 },
      uMean: { value: GROUND_LAYERS.map(() => new THREE.Vector3(1, 1, 1)) }
    };
    if (pbr) {
      const nSize = this.q.name === 'ultra' ? 256 : 128;
      this.terrainNormal = this.keep(normalTexture(nSize, 9, 2.4, 3));
      this.terrainNormal.anisotropy = aniso;
      this.terrainMat = this.keep(glowPatch(new THREE.MeshStandardMaterial({ vertexColors: true, map: this.grain, normalMap: this.terrainNormal, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.92, metalness: 0.02, envMapIntensity: 0.35, side: THREE.DoubleSide }), this.ground));
    } else {
      this.terrainMat = this.keep(glowPatch(new THREE.MeshLambertMaterial({ vertexColors: true, map: this.grain, side: THREE.DoubleSide }), this.ground));
    }
    this.propMat = this.keep(pbr
      ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, envMapIntensity: 0.25 })
      : new THREE.MeshLambertMaterial({ vertexColors: true }));

    this.rockMat = pbr ? this.keep(rockPatch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0, envMapIntensity: 0.25 }), this.ground)) : this.propMat;
    this._buildPropTemplates();
    this._buildStatics(session);
    if (this.track.biomes) this._buildWorldExtras();
    this._buildPrecip();
    this.scenery = new Scenery(this.track, this.q, scene);
    if (pbr && env.hdr && this.skyboxEnabled) this._loadHdr(env.hdr);
    if (pbr) this._loadGround(aniso);
    this.setAtmosphere(session.weather, session.hour, 0);
  }

  /**
   * Photographed ground: loads the eight colour + normal JPGs in the background, packs them into two
   * texture arrays and switches the terrain shader over. Until then (and on Low) the ground is procedural.
   */
  _loadGround(aniso) {
    const S = this.q.name === 'medium' ? 512 : 1024, SN = S / 2, N = GROUND_LAYERS.length;
    const load = (name) => new Promise((res, rej) => new THREE.ImageLoader().load('./textures/ground/' + name + '.jpg', res, undefined, rej));
    Promise.all(GROUND_LAYERS.flatMap((n) => [load(n + '_diff'), load(n + '_nor')])).then((imgs) => {
      if (this.disposed) return;
      const cv = document.createElement('canvas');
      const g = cv.getContext('2d', { willReadFrequently: true });
      const pack = (size, pick, srgb) => {
        cv.width = cv.height = size;
        const data = new Uint8Array(size * size * 4 * N);
        for (let i = 0; i < N; i++) {
          g.drawImage(imgs[i * 2 + pick], 0, 0, size, size);
          const px = g.getImageData(0, 0, size, size).data, row = size * 4;
          // canvas rows run top-down; textures are bottom-up (keeps the normal maps' green channel the right way round)
          for (let y = 0; y < size; y++) data.set(px.subarray(y * row, y * row + row), i * size * row + (size - 1 - y) * row);
          if (srgb) {
            // average colour in linear light: the shader divides by it so only the layer's detail remains
            let r = 0, gg = 0, b = 0, n = 0;
            for (let k = 0; k < px.length; k += 4 * 37) { r += Math.pow(px[k] / 255, 2.2); gg += Math.pow(px[k + 1] / 255, 2.2); b += Math.pow(px[k + 2] / 255, 2.2); n++; }
            this.ground.uMean.value[i].set(r / n, gg / n, b / n);
          }
        }
        const t = new THREE.DataArrayTexture(data, size, size, N);
        t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
        t.generateMipmaps = true; t.anisotropy = aniso;
        t.needsUpdate = true;
        return t;
      };
      this.groundTex = [pack(S, 0, true), pack(SN, 1, false)];
      this.ground.uGround.value = this.groundTex[0];
      this.ground.uGroundN.value = this.groundTex[1];
      this.ground.uPhoto.value = 1;
    }).catch((err) => console.warn('Ground textures not loaded, keeping the procedural ground:', err));
  }

  /**
   * Photographic sky + image-based lighting. Loads in the background (the track starts on the
   * procedural sky and the photo fades in), so it never delays the start of a run.
   */
  _loadHdr(file) {
    new RGBELoader().load('./environments/' + file, (tex) => {
      if (this.disposed) { tex.dispose(); return; }
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.wrapS = THREE.RepeatWrapping;
      tex.minFilter = tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      // find the photo's sun (brightest texel in the upper half) and turn the sky so it matches the game's sun
      const { data, width, height } = tex.image;
      const half = data instanceof Uint16Array;
      let best = -1, bu = 0.5;
      for (let y = Math.floor(height * 0.5); y < height; y += 4) {
        for (let x = 0; x < width; x += 4) {
          const k = (y * width + x) * 4;
          const g = half ? THREE.DataUtils.fromHalfFloat(data[k + 1]) : data[k + 1];
          if (g > best) { best = g; bu = (x + 0.5) / width; }
        }
      }
      const rot = bu - (this.sunAz / (Math.PI * 2) + 0.5);
      this.hdrTex = tex;
      if (this.env.hdrSky !== false && this.skyboxEnabled) this.sky.setHdr(tex, rot);
      // lighting and reflections from the same photo
      const pm = new THREE.PMREMGenerator(this.renderer);
      const rt = pm.fromEquirectangular(tex);
      pm.dispose();
      // Only glossy materials (truck paint, chrome, glass, water) reflect the photo. Terrain and
      // scenery keep the soft gradient environment: a photographed sun glitters on rough ground.
      this.hdrRT = rt;
      this.hdrRot = rot * Math.PI * 2;
      this.hdrEnv = true;
      for (const e of this.glossy) this._applyHdr(e);
      this._hdrLevel();
    }, undefined, (err) => console.warn('HDR sky not loaded, keeping the procedural sky:', err));
  }

  /** Register a glossy material that should reflect the photographic sky once it has loaded. */
  /** Register a glossy material (materials reflect scene.environment). */
  useHdrOn(m) {
    if (!m || !m.isMeshStandardMaterial) return;
    const e = { m, base: m.envMapIntensity };
    this.glossy.push(e);
    if (this.hdrEnv) { this._applyHdr(e); this._hdrLevel(); }
  }
  _applyHdr(e) {
    e.m.envMap = this.hdrRT.texture;
    e.m.envMapRotation.y = this.hdrRot;
    e.m.needsUpdate = true;
  }
  /** A material's own envMap ignores scene.environmentIntensity, so daylight and weather are applied here. */
  _hdrLevel() {
    if (!this.hdrEnv) return;
    const k = this.scene.environmentIntensity * 0.75;
    for (const e of this.glossy) e.m.envMapIntensity = e.base * k;
  }

  // -------------------------------------------------------------- atmosphere
  /** Apply weather + clock hour to sky, fog, lights and precipitation. Cheap; call a few times a second. */
  setAtmosphere(w, hour, dt) {
    const env = this.env, c = this.c;
    this.weatherNow = w;
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

    c.fog.copy(c.hor).lerp(this.tmpC.setRGB(env.fog[0], env.fog[1], env.fog[2]).multiplyScalar(0.08 + 0.92 * day), 0.45 * (1 - w.dust) * (1 - w.ash));
    c.fog.multiplyScalar(1 - gloom * 0.38);
    this.scene.fog.color.copy(c.fog);
    this.scene.background.copy(c.fog);
    if (this.scene.fog.isFogExp2) {
      const baseD = (env.fogDensity || 0.0078) * (1.1 - 0.2 * day);
      this.scene.fog.density = baseD / Math.max(0.25, w.fog);
      this.fogFar = 3.0 / Math.max(0.001, this.scene.fog.density);
    } else {
      const far = Math.min(this.q.radius * 0.97, env.fogFar * w.fog * (0.7 + 0.3 * day));
      this.scene.fog.near = far * 0.3; this.scene.fog.far = far;
      this.fogFar = far;
    }

    // sun by day, a dim blue moon by night
    const elv = Math.max(el, 0.08);
    if (day > 0.02) c.sunDir.set(Math.cos(this.sunAz) * Math.cos(elv * 1.3), Math.sin(elv * 1.3), Math.sin(this.sunAz) * Math.cos(elv * 1.3)).normalize();
    else c.sunDir.set(Math.cos(this.sunAz + 2) * 0.6, 0.75, Math.sin(this.sunAz + 2) * 0.6).normalize();
    c.sunCol.setRGB(env.sun[0], env.sun[1], env.sun[2]).lerp(this.tmpC.setRGB(1.0, 0.65, 0.35), low * 0.7);
    this.sun.color.copy(c.sunCol).lerp(this.tmpC.setRGB(0.45, 0.55, 0.9), 1 - day);
    this.sun.intensity = 2.6 * day * clamp(1 - gloom * 1.15, 0.12, 1) * (1 - 0.5 * w.dust) * (1 - 0.4 * w.ash) + 0.3 * (1 - day);
    this.hemi.color.copy(c.top).lerp(c.hor, 0.5).lerp(this.tmpC.setRGB(1, 1, 1), 0.35);
    this.hemi.intensity = env.ambient * (0.18 + 0.95 * day) * (1 + gloom * 0.25);
    this.scene.environmentIntensity = (0.12 + 0.7 * day) * (1 - gloom * 0.3);
    this._sunI = this.sun.intensity; this._hemiI = this.hemi.intensity; this._envI = this.scene.environmentIntensity;
    if (this.bldMat) this.bldMat.emissiveIntensity = clamp((1 - day) * 1.3 + gloom * 0.25, 0, 1.1);
    if (this.oceanMat) this.oceanMat.color.copy(this.oceanCol).multiplyScalar(0.18 + 0.82 * day).lerp(c.hor, 0.18);
    this._hdrLevel();

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
      hdr: day * clamp(1 - gloom * 1.5, 0, 1) * (1 - low * 0.55) * (1 - w.dust) * (1 - w.ash),
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
    const mk = (geo, n, colored, mat) => {
      const im = new THREE.InstancedMesh(this.keep(geo), mat || this.propMat, n);
      im.count = 0; im.frustumCulled = false;
      im.castShadow = !!this.q.treeShadows;
      if (colored) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
      this.scene.add(im);
      return im;
    };
    const tr = env.trunk, f1 = env.foliage, f2 = env.foliage2, snowy = kind === 'snowpine';
    const geos = {
      pine: () => mergeColored([
        { geo: new THREE.CylinderGeometry(0.22, 0.42, 2.8, 8), matrix: M(0, 1.4, 0), color: tr },
        { geo: new THREE.ConeGeometry(2.1, 3.0, 9), matrix: M(0, 3.3, 0), color: f1, shade: [1.6, 4.8] },
        { geo: new THREE.ConeGeometry(1.65, 2.7, 9), matrix: M(0, 4.9, 0, 1, 1, 1, 0, 0.4, 0), color: snowy ? f2 : f1, shade: [3.4, 6.2] },
        { geo: new THREE.ConeGeometry(1.15, 2.3, 8), matrix: M(0, 6.3, 0, 1, 1, 1, 0, 0.8, 0), color: snowy ? f2 : f1, shade: [5.1, 7.5] }
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
    this.fol = {};          // foliage meshes: share their trunk mesh's instance matrices
    const tex = this.q.pbr ? this._treeMaterials(treeGeometries(kind, env)) : null;
    for (const k of used) {
      const n = Math.ceil(cap / used.length) + 200;
      if (tex && tex[k]) {
        this.inst[k] = mk(tex[k].trunk, n, false, this.barkMat[tex[k].bark]);
        const fol = mk(tex[k].fol, n, true, this.leafMat);
        fol.instanceMatrix = this.inst[k].instanceMatrix;
        fol.customDepthMaterial = this.leafDepth;
        if (env.trees > 0.7) fol.castShadow = false;      // a closed canopy shades everything anyway: skip thousands of shadow cards
        this.fol[k] = fol;
      } else this.inst[k] = mk(geos[k](), n, true);
    }
    if (tex) for (const k of ['pine', 'broad', 'jungle', 'palm']) if (!used.includes(k)) { tex[k].trunk.dispose(); tex[k].fol.dispose(); }
    // far LOD: one very cheap silhouette for trees beyond the near ring
    const farGeo = kind === 'dead' || kind === 'desert'
      ? mergeColored([{ geo: new THREE.CylinderGeometry(0.2, 0.34, 3.6, 4), matrix: M(0, 1.8, 0), color: [1, 1, 1] }])
      : mergeColored([{ geo: new THREE.CylinderGeometry(0.2, 0.3, 2.6, 3), matrix: M(0, 1.3, 0), color: [tr[0] / f1[0], tr[1] / f1[1], tr[2] / f1[2]] }, { geo: new THREE.ConeGeometry(2.0, kind === 'jungle' ? 4 : 5.6, 4), matrix: M(0, kind === 'jungle' ? 9 : 4.8, 0, kind === 'jungle' ? 1.7 : 1, 1, kind === 'jungle' ? 1.7 : 1), color: [1, 1, 1], shade: [2, 8] }]);
    if (kind === 'jungle') farGeo.attributes.position.needsUpdate = true;
    if (tex && tex.far) {
      farGeo.dispose();
      this.inst.far = mk(tex.far, cap, true, this.leafMat);
      this.inst.far.castShadow = false;
    } else this.inst.far = mk(farGeo, cap, true);

    const rockG = new THREE.IcosahedronGeometry(1, 1);
    const rp = rockG.attributes.position;
    for (let i = 0; i < rp.count; i++) {
      const k = 1 + 0.18 * noise2(rp.getX(i) * 2.1 + 5, rp.getZ(i) * 2.1 + rp.getY(i) * 1.7, 77);
      rp.setXYZ(i, rp.getX(i) * k, rp.getY(i) * k, rp.getZ(i) * k);
    }
    rockG.computeVertexNormals();
    const cl = env.cliff;
    this.rockGeo = this.keep(mergeColored([{ geo: rockG, color: [cl[0] * 0.95, cl[1] * 0.95, cl[2] * 0.95], shade: [-1, 1] }]));
    this.inst.boulder = mk(this.rockGeo, Math.ceil(cap / 2), false, this.rockMat);
    const bushGeo = kind === 'jungle'
      ? mergeColored([0, 1, 2, 3, 4].map((i) => ({ geo: new THREE.ConeGeometry(0.34, 1.9, 3), matrix: new THREE.Matrix4().makeRotationY(i * 1.26).multiply(M(0, 0.7, 0.55, 1, 1, 0.3, 1.0, 0, 0)), color: i % 2 ? f1 : f2 })))
      : mergeColored([
        // a shrub is a few overlapping leaf masses on a darker core, not a single blob
        { geo: new THREE.IcosahedronGeometry(0.55, 0), matrix: M(0, 0.42, 0, 1, 0.8, 1), color: [f1[0] * 0.8, f1[1] * 0.8, f1[2] * 0.8], shade: [0, 0.9] },
        { geo: new THREE.IcosahedronGeometry(0.42, 0), matrix: M(0.42, 0.34, 0.14, 1, 0.8, 1, 0.4, 0.7, 0), color: f1, shade: [0, 0.7] },
        { geo: new THREE.IcosahedronGeometry(0.38, 0), matrix: M(-0.36, 0.3, -0.22, 1, 0.75, 1, 0, 1.9, 0.3), color: [f2[0] * 0.9, f2[1] * 0.9, f2[2] * 0.9], shade: [0, 0.65] },
        { geo: new THREE.IcosahedronGeometry(0.3, 0), matrix: M(0.05, 0.72, -0.1, 1, 0.8, 1, 0.8, 0.3, 0), color: f2, shade: [0.5, 1.0] }
      ]);
    if (tex && tex.bush) {
      bushGeo.dispose();
      this.inst.bush = mk(tex.bush, cap, false, this.leafMat);
      this.inst.bush.customDepthMaterial = this.leafDepth;
    } else this.inst.bush = mk(bushGeo, cap);
  }

  /** Leaf-card and bark materials. Bark photos load in the background; trunks are plain brown until then. */
  _treeMaterials(geos) {
    const atlas = this.keep(treeAtlas());
    this.windU = { value: 0 };
    this.leafMat = this.keep(new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.86, metalness: 0, envMapIntensity: 0.2 }));
    this.leafMat.onBeforeCompile = (sh) => {
      sh.uniforms.uWindT = this.windU;
      // leaves sway a little, more the higher up the tree; cards keep their authored normal on both faces
      sh.vertexShader = 'uniform float uWindT;\n' + sh.vertexShader.replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        '  #ifdef USE_INSTANCING',
        '    float lp = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.23 + position.y * 0.5;',
        '    float ls = (sin(uWindT * 1.3 + lp) + 0.5 * sin(uWindT * 2.9 + lp * 1.7)) * 0.012 * position.y;',
        '    transformed.x += ls; transformed.z += ls * 0.6;',
        '  #endif'
      ].join('\n'));
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin> normal = normalize(vNormal);');
    };
    this.leafDepth = this.keep(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: atlas, alphaTest: 0.42 }));
    this.barkMat = {};
    const loader = new THREE.TextureLoader();
    for (const name of ['pine', 'broad', 'palm']) {
      const m = this.keep(new THREE.MeshStandardMaterial({ vertexColors: true, color: new THREE.Color(0.3, 0.22, 0.15), roughness: 0.92, metalness: 0, envMapIntensity: 0.2 }));
      this.barkMat[name] = m;
      loader.load('./textures/trees/bark_' + name + '.jpg', (t) => {
        if (this.disposed) { t.dispose(); return; }
        t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
        // divide out the photo's average brightness so the trunk keeps the region's bark colour
        const cv = document.createElement('canvas'); cv.width = cv.height = 16;
        const g = cv.getContext('2d'); g.drawImage(t.image, 0, 0, 16, 16);
        const px = g.getImageData(0, 0, 16, 16).data;
        let lum = 0; for (let k = 0; k < px.length; k += 4) lum += Math.pow((px[k] + px[k + 1] + px[k + 2]) / 765, 2.2);
        lum = Math.max(0.03, lum / (px.length / 4));
        m.map = this.keep(t);
        m.color.setScalar(Math.min(2.5, 0.17 / lum));
        m.needsUpdate = true;
      }, undefined, () => {});
    }
    return geos;
  }

  _refreshProps(cx0, cz0) {
    const R = this.q.propChunks;
    const k = cx0 + ',' + cz0;
    if (k === this.propKey) return;
    this.propKey = k;
    const env0 = this.env, kinds0 = this.treeKinds, B = this.track.biomes;
    if (B && !this.bKinds) this.bKinds = B.map((e) => { const k = (e.kinds || []).filter((n) => this.inst[n]); return k.length ? k : kinds0; });
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
      if (col && im.instanceColor) im.instanceColor.setXYZ(i, col[0], col[1], col[2]);
      counts[name] = i + 1;
    };
    for (let cz = cz0 - R; cz <= cz0 + R; cz++) {
      for (let cx = cx0 - R; cx <= cx0 + R; cx++) {
        if (!this.track.chunks.has(key2(cx, cz))) continue;
        const near = Math.max(Math.abs(cx - cx0), Math.abs(cz - cz0)) <= this.q.propNear;
        for (const p of this.track.propsFor(cx, cz)) {
          if (p.type === 'tree') {
            const env = B ? B[p.b] : env0, kinds = B ? this.bKinds[p.b] : kinds0;
            const kindIdx = Math.min(kinds.length - 1, Math.floor(p.v * kinds.length * (kinds.length > 1 ? 1.35 : 1)) % kinds.length);
            const tk = kinds[kindIdx];
            let col = null;
            if (env.foliagePalette && env.foliagePalette.length) {
              const palIdx = Math.floor(p.v * env.foliagePalette.length * 3.7) % env.foliagePalette.length;
              col = env.foliagePalette[palIdx];
            } else {
              col = p.v > 0.5 ? env.foliage : env.foliage2;
            }
            if (near) {
              put(tk, p, 0.9 + p.v * 0.4, col);
              if (this.fol[tk] && this.fol[tk].instanceColor) {
                const idx = counts[tk] - 1;
                if (idx >= 0 && idx < this.fol[tk].instanceColor.count) {
                  this.fol[tk].instanceColor.setXYZ(idx, col[0], col[1], col[2]);
                }
              }
            } else {
              put('far', p, 0.9 + p.v * 0.4, col);
            }
          } else if (p.type === 'boulder') put('boulder', { ...p, y: p.y + p.scale * 0.25 }, 0.75);
          else if (p.type === 'bush' && (near || p.v > 0.5)) put('bush', p);
          else if (p.type === 'building') this._putBuilding(p, counts);
        }
      }
    }
    // open world: buildings are drawn much further out than trees, so a skyline shows from the coast road
    if (B && this.inst.bld) {
      const Rb = Math.ceil(this.q.radius / CHUNK);
      for (let cz = cz0 - Rb; cz <= cz0 + Rb; cz++) {
        for (let cx = cx0 - Rb; cx <= cx0 + Rb; cx++) {
          if (Math.abs(cx - cx0) <= R && Math.abs(cz - cz0) <= R) continue;
          const ch = this.track.chunks.get(key2(cx, cz));
          if (!ch) continue;
          // only where a town is: the chunk's own biome sample says so without building its props
          const mid = 17 * CW + 17;
          if (!B[ch.bio[mid]].urban && !B[ch.bio2[mid]].urban) continue;
          for (const p of this.track.propsFor(cx, cz)) if (p.type === 'building') this._putBuilding(p, counts);
        }
      }
    }
    for (const k in this.fol) {
      this.fol[k].count = counts[k];
      if (this.fol[k].instanceColor) this.fol[k].instanceColor.needsUpdate = true;
    }
    for (const name in counts) {
      const im = this.inst[name];
      im.count = counts[name];
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }

  /** One building: a box with the facade texture (scaled per instance in the shader), plus a roof for houses. */
  _putBuilding(p, counts) {
    const im = this.inst.bld, i = counts.bld;
    if (i >= im.instanceMatrix.count) return;
    this.tmpQ.setFromAxisAngle(this.up, p.rot);
    im.setMatrixAt(i, this.tmpM.compose(this.tmpV.set(p.x, p.y + p.h / 2, p.z), this.tmpQ, this.tmpS.set(p.w, p.h, p.d)));
    const v = p.v, c = this.tmpC;
    if (p.kind === 'tower') c.setRGB(0.62 + 0.3 * v, 0.66 + 0.26 * v, 0.72 + 0.22 * ((v * 7) % 1));
    else if (p.kind === 'shed') c.setRGB(0.5 + 0.2 * v, 0.5 + 0.16 * v, 0.5 + 0.1 * v);
    else c.setRGB(0.95, 0.86 - 0.2 * v, 0.7 - 0.25 * ((v * 5) % 1));                    // painted village houses
    im.instanceColor.setXYZ(i, c.r, c.g, c.b);
    counts.bld = i + 1;
    if (p.kind !== 'tower') {
      const rm = this.inst.roof, k = counts.roof;
      if (k >= rm.instanceMatrix.count) return;
      const rh = p.kind === 'shed' ? 1.4 : 2.4;
      rm.setMatrixAt(k, this.tmpM.compose(this.tmpV.set(p.x, p.y + p.h + rh / 2, p.z), this.tmpQ, this.tmpS.set(p.w + 0.8, rh, p.d + 0.8)));
      if (p.kind === 'shed') c.setRGB(0.42, 0.44, 0.47); else c.setRGB(0.62 - 0.2 * v, 0.26, 0.18);
      rm.instanceColor.setXYZ(k, c.r, c.g, c.b);
      counts.roof = k + 1;
    }
  }

  /** Extras for tracks with areas: building meshes, the sea, tunnel roofs, landmarks, road markings. */
  _buildWorldExtras() {
    const tr = this.track, scene = this.scene, env = this.env;
    // ---- buildings
    const tex = facadeTextures();
    this.keep(tex.map); this.keep(tex.lit);
    this.bldMat = this.keep(this.q.pbr
      ? new THREE.MeshStandardMaterial({ map: tex.map, emissiveMap: tex.lit, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.72, metalness: 0.08, envMapIntensity: 0.5 })
      : new THREE.MeshLambertMaterial({ map: tex.map, emissiveMap: tex.lit, emissive: 0xffffff, emissiveIntensity: 0 }));
    this.bldMat.onBeforeCompile = (sh) => {
      // repeat the facade by the instance's real size (one tile = 13.6 m); roofs get the plain wall texel
      sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', [
        '#include <uv_vertex>',
        '#ifdef USE_INSTANCING',
        '  vec3 isc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));',
        '  vec2 fsc = abs(normal.y) > 0.5 ? vec2(0.0) : vec2((abs(normal.x) > 0.5 ? isc.z : isc.x) / 13.6, isc.y / 13.6);',
        '  #ifdef USE_MAP',
        '    vMapUv = uv * fsc;',
        '  #endif',
        '  #ifdef USE_EMISSIVEMAP',
        '    vEmissiveMapUv = uv * fsc;',
        '  #endif',
        '#endif'
      ].join('\n'));
    };
    const nB = this.q.name === 'low' ? 260 : 700;
    const mk = (geo, mat) => {
      const im = new THREE.InstancedMesh(this.keep(geo), mat, nB);
      im.count = 0; im.frustumCulled = false; im.castShadow = !!this.q.shadows; im.receiveShadow = true;
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(nB * 3).fill(1), 3);
      scene.add(im);
      return im;
    };
    this.inst.bld = mk(new THREE.BoxGeometry(1, 1, 1), this.bldMat);
    this.inst.roof = mk(mergeColored([{ geo: new THREE.ConeGeometry(0.7071, 1, 4), matrix: M(0, 0, 0, 1, 1, 1, 0, Math.PI / 4, 0), color: [1, 1, 1] }]), this.propMat);

    // ---- the sea: one big sheet that follows the camera (only on tracks that have a coast)
    if (tr.seaLevel !== undefined) {
    this.oceanCol = new THREE.Color(0.05, 0.34, 0.4);
    this.oceanNormal = this.keep(normalTexture(128, 5, 1.6, 33));
    this.oceanNormal.repeat.set(220, 220);
    this.oceanMat = this.keep(this.q.pbr
      ? new THREE.MeshStandardMaterial({ color: this.oceanCol.clone(), roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.84, depthWrite: false, normalMap: this.oceanNormal, normalScale: new THREE.Vector2(0.5, 0.5), envMapIntensity: 2.0 })
      : new THREE.MeshLambertMaterial({ color: this.oceanCol.clone(), transparent: true, opacity: 0.8, depthWrite: false }));
    this.useHdrOn(this.oceanMat);
    this.ocean = new THREE.Mesh(this.keep(new THREE.PlaneGeometry(2600, 2600)), this.oceanMat);
    this.ocean.rotation.x = -Math.PI / 2;
    this.ocean.position.y = tr.seaLevel;
    this.ocean.renderOrder = 2;
    scene.add(this.ocean);
    }

    const parts = [];
    const rockA = [0.3, 0.28, 0.26], rockB = [0.22, 0.2, 0.19];      // the tunnel is cut through grey summit rock
    const yawAt = (i) => Math.atan2(tr.TX[i], tr.TZ[i]);
    // ---- tunnel: a rock roof over the cutting, heavier portals at both ends
    for (const t of tr.tunnels) {
      for (let i = t.i0; i <= t.i1; i += 2) {
        const hw = tr.HW[i], end = i === t.i0 || i + 2 > t.i1;
        const w = 2 * (hw + (end ? 10 : 7.5)), th = end ? 6 : 3.4;
        parts.push({ geo: new THREE.BoxGeometry(w, th, 4.4), matrix: M(tr.PX[i], tr.PY[i] + 5.6 + th / 2 + 0.5 * Math.sin(i * 1.7), tr.PZ[i], 1, 1, 1, 0, yawAt(i), 0), color: (i / 2) % 2 ? rockA : rockB });
        // ribs down the walls so the inside reads as a bore, not a box
        if ((i - t.i0) % 6 === 0) for (const sd of [-1, 1]) {
          parts.push({ geo: new THREE.BoxGeometry(1.1, 6.4, 1.2), matrix: M(tr.PX[i] + tr.TZ[i] * sd * (hw + 1.3), tr.PY[i] + 2.9, tr.PZ[i] - tr.TX[i] * sd * (hw + 1.3), 1, 1, 1, 0, yawAt(i), sd * 0.16), color: rockB });
        }
      }
    }
    // ---- lane markings on the asphalt (the road profile is exact there, so no terrain lookups are needed)
    const paint = [1.0, 0.9, 0.45];
    for (let c = 0; c < tr.chainStart.length; c++) {
      for (let i = tr.chainStart[c] + 3; i < tr.chainEnd[c] - 2; i += 4) {
        if (LAYER_OF_NAME[tr.SURF[i]] !== 'asphalt' || tr.HW[i] < 3.6) continue;
        parts.push({ geo: new THREE.BoxGeometry(0.16, 0.03, 2.4), matrix: M(tr.PX[i], tr.PY[i] + 0.035, tr.PZ[i], 1, 1, 1, 0, yawAt(i), 0), color: paint });
      }
    }
    // ---- landmarks: service stations, the lighthouse, signposts
    const beamGeo = this.keep(new THREE.CylinderGeometry(0.4, 0.4, 60, 8, 1, true));
    const beamMat = this.keep(new THREE.MeshBasicMaterial({ color: 0x7fe3ff, transparent: true, opacity: 0.24, depthWrite: false, fog: false }));
    this.landmarkBeams = tr.landmarks.map((l) => {
      const y = tr.heightAt(l.x, l.z), rot = l.heading || 0;
      const at = (lx, ly, lz, rx = 0, ry = 0, rz = 0) => M(l.x + lx * Math.cos(rot) + lz * Math.sin(rot), y + ly, l.z - lx * Math.sin(rot) + lz * Math.cos(rot), 1, 1, 1, rx, rot + ry, rz);
      if (l.kind === 'fuel') {
        for (const [px, pz] of [[-2.6, -1.8], [2.6, -1.8], [-2.6, 1.8], [2.6, 1.8]]) parts.push({ geo: new THREE.CylinderGeometry(0.12, 0.12, 3.8, 6), matrix: at(px, 1.9, pz), color: [0.85, 0.85, 0.88] });
        parts.push({ geo: new THREE.BoxGeometry(6.4, 0.35, 4.6), matrix: at(0, 3.95, 0), color: [0.9, 0.2, 0.12] });
        parts.push({ geo: new THREE.BoxGeometry(6.0, 0.12, 4.2), matrix: at(0, 3.72, 0), color: [0.95, 0.95, 0.95] });
        for (const px of [-1.1, 1.1]) parts.push({ geo: new THREE.BoxGeometry(0.6, 1.5, 0.45), matrix: at(px, 0.75, 0), color: [0.9, 0.75, 0.1] });
        parts.push({ geo: new THREE.CylinderGeometry(0.1, 0.1, 7, 6), matrix: at(4.2, 3.5, 0), color: [0.8, 0.8, 0.82] });
        parts.push({ geo: new THREE.BoxGeometry(1.8, 1.2, 0.2), matrix: at(4.2, 6.6, 0), color: [0.9, 0.2, 0.12] });
        return null;
      }
      if (l.id === 'lighthouse') {
        for (let k = 0; k < 5; k++) parts.push({ geo: new THREE.CylinderGeometry(1.5 - k * 0.14, 1.64 - k * 0.14, 3.4, 12), matrix: M(l.x, y + 1.7 + k * 3.4, l.z), color: k % 2 ? [0.82, 0.16, 0.12] : [0.95, 0.95, 0.93] });
        parts.push({ geo: new THREE.CylinderGeometry(1.3, 1.3, 0.3, 12), matrix: M(l.x, y + 17.1, l.z), color: [0.2, 0.2, 0.22] });
        parts.push({ geo: new THREE.ConeGeometry(1.2, 1.6, 10), matrix: M(l.x, y + 19.6, l.z), color: [0.82, 0.16, 0.12] });
        const lamp = new THREE.Mesh(this.keep(new THREE.SphereGeometry(0.8, 10, 8)), this.keep(new THREE.MeshBasicMaterial({ color: 0xfff1b0, fog: false })));
        lamp.position.set(l.x, y + 18.1, l.z);
        scene.add(lamp);
      } else {
        // a signpost
        parts.push({ geo: new THREE.CylinderGeometry(0.09, 0.11, 3.6, 6), matrix: at(0, 1.8, 0), color: [0.5, 0.36, 0.2] });
        parts.push({ geo: new THREE.BoxGeometry(2.2, 0.7, 0.12), matrix: at(0, 3.3, 0), color: [0.12, 0.42, 0.55] });
      }
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.set(l.x, y + 30, l.z);
      scene.add(beam);
      return beam;
    });
    if (parts.length) {
      const m = new THREE.Mesh(this.keep(mergeColored(parts)), this.propMat);
      m.castShadow = !!this.q.shadows; m.receiveShadow = true;
      scene.add(m);
    }
  }

  /** Free roam: a landmark has been found, or was found on an earlier visit. */
  hideLandmark(i) { const b = this.landmarkBeams && this.landmarkBeams[i]; if (b) b.visible = false; }

  // ---------------------------------------------------------------- statics
  _buildStatics(session) {
    const tr = this.track, scene = this.scene, env = this.env;
    const rocks = tr.obstacles.filter((o) => o.type === 'rock');
    if (rocks.length) {
      const im = new THREE.InstancedMesh(this.rockGeo, this.rockMat, rocks.length);
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
      // mountain and desert regions get masonry bridges: paved deck, kerbs (parapets when railed), arched piers
      if (['alpine', 'crags', 'dunes', 'snowpeaks'].includes(env.silhouette)) {
        const st = env.cliff, sA = [st[0] * 1.15, st[1] * 1.13, st[2] * 1.1], sB = [st[0] * 0.9, st[1] * 0.9, st[2] * 0.9], sC = [st[0] * 0.7, st[1] * 0.7, st[2] * 0.7];
        const nSl = Math.max(2, Math.round(b.len / 1.4));
        for (let i = 0; i < nSl; i++) {
          const z = -b.len / 2 + (i + 0.5) * (b.len / nSl);
          parts.push({ geo: new THREE.BoxGeometry(b.half * 2 + 0.3, 0.5, b.len / nSl - 0.04), matrix: local(M(0, -0.25, z)), color: i % 2 ? sA : sB });
        }
        const kh = b.rails ? 0.75 : 0.22;
        for (const sx of [-1, 1]) {
          parts.push({ geo: new THREE.BoxGeometry(0.34, kh, b.len + 0.6), matrix: local(M(sx * (b.half + 0.16), kh / 2 - 0.02, 0)), color: sB });
          parts.push({ geo: new THREE.BoxGeometry(0.42, 0.1, b.len + 0.6), matrix: local(M(sx * (b.half + 0.16), kh + 0.03, 0)), color: sA });
        }
        const nPier = Math.max(1, Math.round(b.len / 11));
        for (let i = 0; i <= nPier; i++) {
          const u = i / nPier, z = -b.len / 2 + u * b.len;
          const wx = b.x0 + (b.x1 - b.x0) * u, wz = b.z0 + (b.z1 - b.z0) * u;
          const drop = (b.y0 + (b.y1 - b.y0) * u) - tr.heightAt(wx, wz) + 1.5;
          if (drop > 2) parts.push({ geo: new THREE.BoxGeometry(b.half * 2 + 0.5, drop, 1.1), matrix: local(M(0, -0.5 - drop / 2, z)), color: sC });
          // arch haunch under the deck between piers
          if (i < nPier) {
            const zl = b.len / nPier;
            for (const k of [0.16, 0.84]) parts.push({ geo: new THREE.BoxGeometry(b.half * 2 + 0.2, 0.9, zl * 0.24), matrix: local(M(0, -0.95, z + zl * k)), color: sB });
            parts.push({ geo: new THREE.BoxGeometry(b.half * 2 + 0.2, 0.45, zl * 0.5), matrix: local(M(0, -0.72, z + zl * 0.5)), color: sB });
          }
        }
        continue;
      }
      const nPl = Math.round(b.len / 0.6);
      for (let i = 0; i < nPl; i++) {
        const z = -b.len / 2 + (i + 0.5) * (b.len / nPl);
        // missing planks (generated obstacle layer): only the part of the plank that is still there
        const u = (i + 0.5) / nPl, gap = b.gaps && b.gaps.find((g) => u > g.t0 - 0.3 / b.len && u < g.t1 + 0.3 / b.len);
        if (gap) {
          const w = b.half + gap.d0;
          parts.push({ geo: new THREE.BoxGeometry(w, 0.14, b.len / nPl - 0.06), matrix: local(M(gap.side * (gap.d0 - b.half) / 2, -0.07, z)), color: cB });
          continue;
        }
        parts.push({ geo: new THREE.BoxGeometry(b.half * 2, 0.14, b.len / nPl - 0.06), matrix: local(M(0, -0.07, z)), color: i % 3 ? cA : cB });
      }
      // a snapped plank hanging in each hole
      for (const g of b.gaps || []) {
        const z = -b.len / 2 + ((g.t0 + g.t1) / 2) * b.len;
        parts.push({ geo: new THREE.BoxGeometry((b.half - g.d0) * 0.8, 0.12, 0.5), matrix: local(M(g.side * (b.half + g.d0) / 2, -0.42, z, 1, 1, 1, 0, 0, g.side * 0.75)), color: cB });
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
      ? new THREE.MeshStandardMaterial({ color: wcol, roughness: 0.06, metalness: 0.35, transparent: true, opacity: 0.86, depthWrite: false, normalMap: this.waterNormal, normalScale: new THREE.Vector2(0.65, 0.65), envMapIntensity: 2.2 })
      : new THREE.MeshLambertMaterial({ color: wcol, transparent: true, opacity: 0.78, depthWrite: false }));
    this.useHdrOn(this.waterMat);
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
    const wgt = new Uint8Array((nv * nv + skirtN) * 8);     // ground layer weights (8 per vertex)
    const lw = this._lw || (this._lw = new Float32Array(8));
    const offLayer = LAYER_OF[env.off] ?? 0;
    const leafy = env.off === 'grass' ? Math.min(1, env.trees * 1.5) : 0;   // forest floor under the trees
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const g1 = env.grass, g2 = env.grass2, cl = env.cliff;
    const snowy = env.off === 'deepsnow';
    const extra = tr.water.length > 0 || tr.sidePatches;
    const alb = env.albedo || 1;   // very bright ground (sand, snow) is toned down so it does not clip
    const B = tr.biomes, sea = tr.seaLevel;
    let litter = 0;
    const addLayer = (E, w) => {
      if (E.off === 'grass') { const ff = Math.min(1, E.trees * 1.5) * litter; lw[0] += w * (1 - ff); lw[7] += w * ff; }
      else lw[LAYER_OF[E.off] ?? 0] += w;
    };
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
        let r, g, b, c0 = cl[0], c1 = cl[1], c2 = cl[2], al = alb;
        lw.fill(0);
        if (B) {
          // open world: two biomes meet here; mix their ground colours, cliffs and ground textures
          const ea = B[ch.bio[q]], eb = B[ch.bio2[q]], t2 = ch.bt[q], t1 = 1 - t2;
          const A1 = ea.grass, A2 = ea.grass2, B1 = eb.grass, B2 = eb.grass2;
          r = (A1[0] + (A2[0] - A1[0]) * nz1) * t1 + (B1[0] + (B2[0] - B1[0]) * nz1) * t2;
          g = (A1[1] + (A2[1] - A1[1]) * nz1) * t1 + (B1[1] + (B2[1] - B1[1]) * nz1) * t2;
          b = (A1[2] + (A2[2] - A1[2]) * nz1) * t1 + (B1[2] + (B2[2] - B1[2]) * nz1) * t2;
          c0 = ea.cliff[0] * t1 + eb.cliff[0] * t2; c1 = ea.cliff[1] * t1 + eb.cliff[1] * t2; c2 = ea.cliff[2] * t1 + eb.cliff[2] * t2;
          al = (ea.albedo || 1) * t1 + (eb.albedo || 1) * t2;
          litter = smoothstep(0.35, 0.7, noise2(x / 13, z / 13, 57) * 0.5 + 0.5);
          addLayer(ea, t1); addLayer(eb, t2);
        } else {
          r = g1[0] + (g2[0] - g1[0]) * nz1; g = g1[1] + (g2[1] - g1[1]) * nz1; b = g1[2] + (g2[2] - g1[2]) * nz1;
          // layer weights: open ground (grass, with leaf litter in patches under trees), rock on steep faces
          if (leafy > 0) { const ff = leafy * smoothstep(0.35, 0.7, noise2(x / 13, z / 13, 57) * 0.5 + 0.5); lw[0] = 1 - ff; lw[7] = ff; } else lw[offLayer] = 1;
        }
        const steep = smoothstep(snowy ? 0.42 : 0.30, snowy ? 0.62 : 0.55, 1 - ny);
        r += (c0 - r) * steep; g += (c1 - g) * steep; b += (c2 - b) * steep;
        if (B && y < sea + 1.7) {
          // every shoreline is a beach: sand above the waterline, darker wet sand and seabed below it
          const sh = smoothstep(sea + 1.7, sea + 0.35, y), deep = smoothstep(sea, sea - 5, y);
          r += (0.78 - r) * sh; g += (0.70 - g) * sh; b += (0.50 - b) * sh;
          r *= 1 - 0.5 * deep; g *= 1 - 0.42 * deep; b *= 1 - 0.35 * deep;
          for (let m = 0; m < 8; m++) lw[m] *= 1 - sh;
          lw[5] += sh;
          al += (0.8 - al) * sh;
        }
        if (steep > 0) { for (let m = 0; m < 8; m++) lw[m] *= 1 - steep; lw[3] += steep; }
        const e = ch.e[q];
        let glow = 0;
        if (e < 1.6) {
          const sq = tr.surfaceAt(x, z);
          const c = sq.surface.color;
          const t = sq.onRoad && e > 0 ? 1 : smoothstep(1.6, -0.2, e);
          r += (c[0] - r) * t; g += (c[1] - g) * t; b += (c[2] - b) * t;
          for (let m = 0; m < 8; m++) lw[m] *= 1 - t;
          lw[LAYER_OF[sq.surface.name] ?? 1] += t;                 // the road's own surface
          if (sq.waterY > y) { r *= 0.72; g *= 0.74; b *= 0.78; }
          if (sq.surface.hot) glow = 1;
        } else if (extra && e < 70) {
          const sq = tr.surfaceAt(x, z);
          if (sq.surface.hot) { const c = sq.surface.color; r = c[0]; g = c[1]; b = c[2]; glow = 1; }
          else if (sq.waterY > y - 0.4) { const c = sq.surface.color; r = c[0] * 0.8; g = c[1] * 0.8; b = c[2] * 0.82; for (let m = 0; m < 8; m++) lw[m] *= 0.25; lw[4] += 0.75; }   // pebbly banks
        }
        if (glow) {
          // crust pattern: dark plates with bright cracks
          const cr = Math.abs(noise2(x / 1.7, z / 1.7, 31));
          const k2 = cr < 0.22 ? 1.25 : 0.42;
          colr[k * 3] = r * k2; colr[k * 3 + 1] = g * k2 * (cr < 0.22 ? 1.2 : 0.6); colr[k * 3 + 2] = b * k2;
        } else { colr[k * 3] = r * nz2 * al; colr[k * 3 + 1] = g * nz2 * al; colr[k * 3 + 2] = b * nz2 * al; }
        for (let m = 0; m < 8; m++) wgt[k * 8 + m] = Math.round(Math.min(1, lw[m]) * 255);
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
        for (let m = 0; m < 8; m++) wgt[so * 8 + m] = wgt[k * 8 + m];
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
    const wi = new THREE.InterleavedBuffer(wgt, 8);
    geo.setAttribute('aW0', new THREE.InterleavedBufferAttribute(wi, 4, 0, true));
    geo.setAttribute('aW1', new THREE.InterleavedBufferAttribute(wi, 4, 4, true));
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
    this.scenery.update(dt, fx, fz, camera, this.weatherNow, this.day);

    const cp = camera.position;
    if (this.skyboxEnabled) {
      this.sky.mesh.position.copy(cp);
      this.sky.ring.position.set(cp.x, Math.min(cp.y - 50, tr.meta.startY - 30), cp.z);
    }
    if (this.ocean) {
      this.ocean.position.x = Math.round(cp.x / 16) * 16; this.ocean.position.z = Math.round(cp.z / 16) * 16;
      this.oceanNormal.offset.set(time * 0.006, time * 0.011);
    }
    if (this._sunI !== undefined) {
      // under the rock (free roam tunnel) the daylight goes
      const c = this.cover || 0;
      this.sun.intensity = this._sunI * (1 - 0.97 * c);
      this.hemi.intensity = this._hemiI * (1 - 0.86 * c);
      this.scene.environmentIntensity = this._envI * (1 - 0.9 * c);
    }
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
    if (this.windU) this.windU.value = time;
    if (this.fallTex) this.fallTex.offset.y = time * 0.9;
  }

  get pending() { return this.queue.length; }
  hideCache(i) { this.cacheMeshes[i].visible = false; }
  hideRelic(i) { this.relicMeshes[i].visible = false; }

  dispose() {
    this.disposed = true;
    if (this.hdrTex) this.hdrTex.dispose();
    if (this.hdrRT) this.hdrRT.dispose();
    if (this.groundTex) this.groundTex.forEach((t) => t.dispose());
    for (const [, m] of this.chunkMeshes) m.mesh.geometry.dispose();
    this.chunkMeshes.clear();
    for (const d of this.disposables) d.dispose && d.dispose();
    this.scene.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
    this.sky.dispose();
    if (this.scenery) this.scenery.dispose();
    if (this.envRT) this.envRT.dispose();
  }
}

export const QUALITY = {
  low:    { name: 'low',    radius: 150, shadows: 0,    pixelRatio: 1.0, props: 900,  propChunks: 3, propNear: 1, particles: 500,  buildPerFrame: 1, treeShadows: false, antialias: false, pbr: false, post: false },
  medium: { name: 'medium', radius: 200, shadows: 1024, pixelRatio: 1.5, props: 1800, propChunks: 4, propNear: 2, particles: 900,  buildPerFrame: 2, treeShadows: false, antialias: false, pbr: true,  post: false },
  high:   { name: 'high',   radius: 260, shadows: 2048, pixelRatio: 2.0, props: 3200, propChunks: 5, propNear: 3, particles: 1500, buildPerFrame: 3, treeShadows: true,  antialias: true,  pbr: true,  post: false },
  ultra:  { name: 'ultra',  radius: 340, shadows: 4096, pixelRatio: 2.0, props: 5000, propChunks: 6, propNear: 4, particles: 2400, buildPerFrame: 4, treeShadows: true,  antialias: true,  pbr: true,  post: true }
};
