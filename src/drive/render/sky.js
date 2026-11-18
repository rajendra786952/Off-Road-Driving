// Procedural sky dome + per-region horizon silhouettes.
// Each region has its own cloud model (not a recolour): cumulus, overcast deck,
// high wisps, storm towers, desert haze, volcanic ash plumes - plus sun/moon,
// stars at night, aurora over the snow region and crater glow over the volcano.
import * as THREE from 'three';
import { noise2 } from '../core/noise.js';

const STYLE = { cumulus: 0, overcast: 1, wisps: 2, storm: 3, haze: 4, ash: 5 };

const VERT = `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = (octaves) => `
precision mediump float;
uniform vec3 uTop, uHor, uSunDir, uSunCol, uCloudCol, uGlowCol;
uniform float uCover, uScale, uStyle, uStars, uTime, uGlow, uAurora, uDark;
uniform sampler2D uHdrMap;
uniform float uHdrMix, uHdrRot, uHdrLift, uHdrExp;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < ${octaves}; i++) { s += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return s;
}
void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(uHor, uTop, pow(smoothstep(0.0, 0.7, h), 0.75));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunCol * (pow(sd, 420.0) * 4.0 + pow(sd, 14.0) * 0.22 + pow(sd, 3.0) * 0.06);
  if (uStars > 0.02 && d.y > 0.02) {
    vec2 sp = d.xz / (d.y + 0.35) * 170.0;
    vec2 sc = floor(sp);
    float s = step(0.986, hash(sc)) * (0.4 + 0.6 * hash(sc + 3.0)) * smoothstep(0.38, 0.0, length(fract(sp) - 0.5));
    col += vec3(s) * uStars * smoothstep(0.02, 0.3, d.y);
  }
  if (uAurora > 0.02 && d.y > 0.05) {
    float band = fbm(vec2(d.x * 3.0 + uTime * 0.02, d.z * 1.2)) ;
    float curtain = smoothstep(0.45, 0.75, band) * smoothstep(0.08, 0.3, d.y) * (1.0 - smoothstep(0.45, 0.8, d.y));
    col += vec3(0.15, 0.9, 0.5) * curtain * uAurora * (0.6 + 0.4 * sin(d.x * 40.0 + uTime * 0.6));
  }
  // clouds on a virtual plane
  vec2 p = d.xz / (d.y + 0.14) * uScale;
  vec2 drift = vec2(uTime * 0.012, uTime * 0.005);
  float c = 0.0, shade = 1.0;
  if (uStyle < 0.5) {            // cumulus: separate puffs with flat-ish bases
    float n = fbm(p * 1.3 + drift);
    c = smoothstep(1.0 - uCover, 1.0 - uCover + 0.22, n + 0.18);
    shade = 0.72 + 0.4 * smoothstep(0.4, 0.9, fbm(p * 2.6 + drift + 4.0));
  } else if (uStyle < 1.5) {     // overcast: a continuous deck with soft texture
    float n = fbm(p * 0.7 + drift * 0.6);
    c = mix(0.55, 1.0, smoothstep(0.2, 0.75, n)) * uCover;
    shade = 0.7 + 0.35 * fbm(p * 1.6 - drift);
  } else if (uStyle < 2.5) {     // wisps: thin streaks stretched along the wind
    float n = fbm(vec2(p.x * 0.35, p.y * 2.2) + drift * 2.0);
    c = smoothstep(0.62, 0.9, n + uCover * 0.3) * 0.75;
  } else if (uStyle < 3.5) {     // storm: towering, dark-bottomed masses lit from the side
    float n = fbm(p * 0.9 + drift);
    c = smoothstep(1.0 - uCover, 1.0 - uCover + 0.12, n + 0.2);
    shade = 0.35 + 0.9 * pow(max(dot(normalize(vec3(d.x, 0.3, d.z)), uSunDir), 0.0), 1.5) + 0.25 * fbm(p * 2.2);
  } else if (uStyle < 4.5) {     // haze: almost cloudless, dust band on the horizon
    float n = fbm(p * 1.8 + drift);
    c = smoothstep(0.78, 0.98, n + uCover) * 0.5;
    col = mix(col, uCloudCol, exp(-d.y * 7.0) * 0.55);
  } else {                       // ash: rolling plumes with fire underneath
    float n = fbm(p * 0.8 + drift * 1.6);
    c = smoothstep(0.25, 0.7, n + uCover * 0.4);
    shade = 0.55 + 0.6 * fbm(p * 2.0 - drift * 2.0);
  }
  float fade = smoothstep(0.0, 0.16, d.y);
  col = mix(col, uCloudCol * shade, clamp(c, 0.0, 1.0) * fade);
  // photographic sky: only the part of the photo above its own horizon, turned so its sun
  // sits where the game's sun is, eased into the horizon colour so it meets the fog cleanly
  if (uHdrMix > 0.01) {
    float el = mix(uHdrLift, 1.0, clamp(d.y, 0.0, 1.0));
    vec2 hz = normalize(d.xz + vec2(0.00001, 0.0));
    vec2 huv = vec2(atan(hz.y, hz.x) / 6.2831853 + 0.5 + uHdrRot, asin(el) / 3.14159265 + 0.5);
    vec3 hc = texture2D(uHdrMap, huv).rgb * uHdrExp;
    hc = pow(hc / (hc + vec3(1.0)), vec3(0.4545));
    hc = mix(uHor, hc, smoothstep(0.0, 0.2, d.y));
    col = mix(col, hc, uHdrMix);
  }
  if (uGlow > 0.01) col += uGlowCol * uGlow * exp(-d.y * 8.0) * (0.55 + 0.45 * fbm(d.xz * 4.0 + uTime * 0.04));
  gl_FragColor = vec4(col * (1.0 - uDark), 1.0);
}`;

export class Sky {
  constructor(env, quality, seed) {
    this.env = env;
    const st = env.skyStyle;
    this.uniforms = {
      uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() },
      uCloudCol: { value: new THREE.Color() }, uGlowCol: { value: new THREE.Color(1.0, 0.28, 0.06) },
      uCover: { value: st.cover }, uScale: { value: st.scale }, uStyle: { value: STYLE[st.style] ?? 0 },
      uStars: { value: 0 }, uTime: { value: seed % 100 }, uGlow: { value: 0 }, uAurora: { value: 0 }, uDark: { value: 0 },
      uHdrMap: { value: null }, uHdrMix: { value: 0 }, uHdrRot: { value: 0 }, uHdrLift: { value: env.hdrLift ?? 0.1 }, uHdrExp: { value: 1.7 }
    };
    this.geo = new THREE.SphereGeometry(950, 24, 12);
    this.mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG(quality === 'low' ? 3 : 4), side: THREE.BackSide, depthWrite: false, fog: false });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
    this._buildSilhouette(seed);
  }

  /** Distant terrain ring - a different shape language per region. */
  _buildSilhouette(seed) {
    const kind = this.env.silhouette;
    const segs = 144, pos = [], colr = [], idx = [], rp = [];
    const base = this.env.cliff;
    const prof = (a, ring) => {
      const x = Math.cos(a), z = Math.sin(a);
      const n1 = noise2(x * 2.1 + ring * 9, z * 2.1, seed + 40), n2 = noise2(x * 6.5, z * 6.5 + ring * 5, seed + 41), n3 = noise2(x * 17, z * 17, seed + 42);
      switch (kind) {
        case 'rolling': return 0.3 + 0.3 * (n1 * 0.5 + 0.5) + 0.05 * n2;
        case 'alpine': return 0.35 + 0.75 * Math.pow(Math.abs(n1), 0.7) + 0.3 * Math.abs(n2) + 0.08 * n3;
        case 'crags': { const m = Math.floor((n1 * 0.5 + 0.5) * 4) / 4; return 0.25 + 0.8 * m + 0.12 * Math.abs(n3) + (n2 > 0.55 ? 0.35 : 0); }
        case 'snowpeaks': return 0.45 + 0.9 * Math.pow(Math.abs(n1), 0.6) + 0.35 * Math.abs(n2);
        case 'dunes': { const w = a * (7 + ring * 3) + n1 * 2.0; return 0.16 + 0.22 * Math.pow(0.5 + 0.5 * Math.sin(w), 2.2) + 0.05 * n1; }
        case 'canopy': return 0.26 + 0.12 * n1 + 0.07 * Math.abs(n3) + (n3 > 0.62 ? 0.12 : 0);
        case 'volcano': {
          let h = 0.14 + 0.14 * Math.abs(n2) + 0.05 * n3;
          for (const [ca, w, hh] of ring === 0 ? [[0.9, 0.34, 1.5], [3.6, 0.22, 0.9]] : [[2.3, 0.4, 2.1], [5.2, 0.28, 1.2]]) {
            let da = Math.abs(a - ca); if (da > Math.PI) da = 2 * Math.PI - da;
            const cone = Math.max(0, 1 - da / w);
            h = Math.max(h, Math.min(hh * cone * 1.25, hh * 0.86));   // truncated cone = crater rim
          }
          return h;
        }
        default: return 0.3 + 0.4 * (n1 * 0.5 + 0.5) + 0.18 * Math.abs(n2) + 0.04 * n3;
      }
    };
    this.glowPts = [];
    for (let ring = 0; ring < 2; ring++) {
      const r = 560 + ring * 230, amp = 150 * (1 + ring * 0.8), o = pos.length / 3;
      const dim = 1 - ring * 0.28;
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const hN = prof(a, ring);
        const h = amp * hN;
        pos.push(Math.cos(a) * r, -40, Math.sin(a) * r, Math.cos(a) * r, h, Math.sin(a) * r);
        rp.push(a + ring * 1.7, 0, a + ring * 1.7, 0.35 + hN);
        const snow = kind === 'snowpeaks' || (kind === 'alpine' && hN > 0.95);
        const top = snow && hN > 0.75 ? [0.95, 0.97, 1.0] : kind === 'canopy' ? this.env.foliage : kind === 'dunes' ? this.env.grass2 : base;
        const bot = kind === 'canopy' ? this.env.foliage : kind === 'dunes' ? this.env.grass : base;
        colr.push(bot[0] * dim * 0.85, bot[1] * dim * 0.85, bot[2] * dim * 0.85, top[0] * dim, top[1] * dim, top[2] * dim);
        if (i < segs) { const k = o + i * 2; idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3); }
      }
    }
    this.ringGeo = new THREE.BufferGeometry();
    this.ringGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.ringGeo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    this.ringGeo.setAttribute('rp', new THREE.Float32BufferAttribute(rp, 2));
    this.ringGeo.setIndex(idx);
    this.ringU = { uLight: { value: new THREE.Color(1, 1, 1) }, uHaze: { value: new THREE.Color(1, 1, 1) }, uMix: { value: 0.5 } };
    this.ringMat = new THREE.ShaderMaterial({
      uniforms: this.ringU, side: THREE.DoubleSide, depthWrite: false, fog: false,
      // rp = (angle, height): used for ridge / gully shading and for haze that thickens toward the base
      vertexShader: 'attribute vec3 color; attribute vec2 rp; varying vec3 vC; varying vec2 vP; void main(){ vC = color; vP = rp; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'precision mediump float; uniform vec3 uLight, uHaze; uniform float uMix; varying vec3 vC; varying vec2 vP; void main(){ float g = sin(vP.x * 46.0 + vP.y * 7.0) * 0.5 + sin(vP.x * 113.0 - vP.y * 15.0) * 0.3 + sin(vP.x * 19.0 + vP.y * 3.0) * 0.4; float sh = 0.84 + 0.2 * g * smoothstep(0.0, 0.5, vP.y); float hz = clamp(uMix + (1.0 - smoothstep(0.0, 0.9, vP.y)) * 0.3, 0.0, 1.0); gl_FragColor = vec4(mix(vC * uLight * sh, uHaze, hz), 1.0); }'
    });
    this.ring = new THREE.Mesh(this.ringGeo, this.ringMat);
    this.ring.renderOrder = -9;
    this.ring.frustumCulled = false;
  }

  /**
   * @param a { top, hor, sunDir, sunCol, cloudCol, cover, stars, glow, aurora, haze (colour the ring fades to), ringMix }
   */
  set(a, dt) {
    const u = this.uniforms;
    u.uTop.value.copy(a.top); u.uHor.value.copy(a.hor);
    u.uSunDir.value.copy(a.sunDir); u.uSunCol.value.copy(a.sunCol);
    u.uCloudCol.value.copy(a.cloudCol);
    u.uCover.value = a.cover; u.uStars.value = a.stars; u.uGlow.value = a.glow; u.uAurora.value = a.aurora;
    u.uTime.value += dt * (1 + a.wind * 3);
    // the photo fades in once loaded and gives way to the procedural sky in bad weather, at dusk and at night
    this.hdrFade = this.hdrMap ? Math.min(1, (this.hdrFade || 0) + dt * 0.8) : 0;
    u.uHdrMix.value = (a.hdr || 0) * this.hdrFade;
    // the ring is tinted toward the horizon colour (aerial perspective) and darkens at night
    this.ringU.uLight.value.copy(a.ringLight); this.ringU.uHaze.value.copy(a.hor); this.ringU.uMix.value = a.ringMix;
  }

  /** Use an equirectangular HDR as the clear-day sky. rot = fraction of a turn that lines its sun up with the game's. */
  setHdr(tex, rot) {
    this.hdrMap = tex;
    this.uniforms.uHdrMap.value = tex;
    this.uniforms.uHdrRot.value = rot;
  }

  dispose() { this.geo.dispose(); this.mat.dispose(); this.ringGeo.dispose(); this.ringMat.dispose(); }
}

/** Sun elevation (-1..1) for a clock hour: sunrise 6:00, sunset 19:00. */
export function sunElevation(hour) {
  const t = (hour - 6) / 13;
  if (t >= 0 && t <= 1) return Math.sin(t * Math.PI);
  const n = hour < 6 ? (hour + 5) / 11 : (hour - 19) / 11;
  return -Math.sin(n * Math.PI) * 0.6;
}

export function fmtClock(hour) {
  const h = Math.floor(hour) % 24, m = Math.floor((hour % 1) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
