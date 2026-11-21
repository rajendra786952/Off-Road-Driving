// Textured trees for Medium quality and above.
//  - trunks: real geometry with a photographed bark texture (public/textures/trees)
//  - foliage: alpha-tested cards (fir boughs, leaf clusters, palm fronds, big jungle leaves) arranged
//    around the trunk; the card artwork is drawn here in greyscale and tinted per region by vertex colour
//  - far LOD: two crossed cards showing a whole tree
// Low quality keeps the flat low-poly trees in world.js.
import * as THREE from 'three';
import { rawTexture } from '../../platform/textures';

import { COLS, ROWS, CELL, rng } from './treeArt.js';

/** UV rectangle [u0, v0, u1, v1] of an atlas cell (row 0 = top), inset to stop neighbours bleeding in. */
const cell = (c, r) => { const p = 3 / CELL; return [(c + p) / COLS, 1 - (r + 1 - p) / ROWS, (c + 1 - p) / COLS, 1 - (r + p) / ROWS]; };
export const CARD = { pine: cell(0, 0), leaf: cell(1, 0), palm: cell(2, 0), jungle: cell(3, 0), pineTree: cell(0, 1), broadTree: cell(1, 1), jungleTree: cell(2, 1) };

/** The atlas as a texture. The artwork above is drawn once by scripts/bake-assets.mjs (phones have no 2D canvas). */
export function treeAtlas() {
  return rawTexture('tree_atlas', { srgb: true, anisotropy: 4, repeat: false });
}

/** Accumulates textured, vertex-coloured triangles. */
class Builder {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; }
  /** Quad a-b-c-d (a = uv 0,0; b = 1,0; c = 1,1; d = 0,1) inside atlas rect r, with one shading normal n. */
  quad(a, b, c, d, r, n, color, uSpan = [0, 1]) {
    const o = this.pos.length / 3;
    const u0 = r[0] + (r[2] - r[0]) * uSpan[0], u1 = r[0] + (r[2] - r[0]) * uSpan[1];
    for (const [p, u, v] of [[a, u0, r[1]], [b, u1, r[1]], [c, u1, r[3]], [d, u0, r[3]]]) {
      this.pos.push(p[0], p[1], p[2]); this.nor.push(n[0], n[1], n[2]); this.uv.push(u, v); this.col.push(color[0], color[1], color[2]);
    }
    this.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  /** Add a standard geometry (uses its own uv scaled by uvScale). */
  add(geo, matrix, color, uvScale = [1, 1]) {
    if (matrix) geo.applyMatrix4(matrix);
    const o = this.pos.length / 3, p = geo.attributes.position, n = geo.attributes.normal, u = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i)); this.nor.push(n.getX(i), n.getY(i), n.getZ(i));
      this.uv.push(u.getX(i) * uvScale[0], u.getY(i) * uvScale[1]); this.col.push(color[0], color[1], color[2]);
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) this.idx.push(geo.index.array[i] + o);
    else for (let i = 0; i < p.count; i++) this.idx.push(o + i);
    geo.dispose();
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return g;
  }
}

const V = (x, y, z) => [x, y, z];
const add3 = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const Mx = (x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));

/** A ball of outward-facing cards around centre C (the classic leafy crown). */
function crown(b, C, n, radius, size, rect, colA, colB, squash = 1, seed = 1) {
  const R = rng(seed);
  for (let i = 0; i < n; i++) {
    const y = 1 - (i + 0.5) / n * 1.7, rr = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996 + R() * 0.4;
    const dir = norm([Math.cos(a) * rr, y, Math.sin(a) * rr]);
    const P = [C[0] + dir[0] * radius, C[1] + dir[1] * radius * squash, C[2] + dir[2] * radius];
    let u = cross([0, 1, 0], dir);
    if (Math.hypot(u[0], u[1], u[2]) < 0.2) u = [1, 0, 0];
    u = norm(u);
    const v = norm(cross(dir, u));
    const h = size * (0.85 + R() * 0.3), tw = R() * 6.283, cs = Math.cos(tw), sn = Math.sin(tw);
    const uu = add3(mul(u, cs), v, sn), vv = add3(mul(v, cs), u, -sn);
    const col = mul(i % 2 ? colA : colB, 0.78 + 0.3 * (dir[1] * 0.5 + 0.5));
    b.quad(add3(add3(P, uu, -h), vv, -h), add3(add3(P, uu, h), vv, -h), add3(add3(P, uu, h), vv, h), add3(add3(P, uu, -h), vv, h), rect, norm([dir[0], dir[1] + 0.45, dir[2]]), col);
  }
}

/** Two crossed upright cards showing a whole tree (far LOD). Instance colour supplies the tint. */
function impostor(width, height, rect) {
  const b = new Builder(), w = width / 2;
  for (const a of [0, Math.PI / 2]) {
    const dx = Math.cos(a) * w, dz = Math.sin(a) * w;
    b.quad(V(-dx, 0, -dz), V(dx, 0, dz), V(dx, height, dz), V(-dx, height, -dz), rect, [0, 1, 0], [1, 1, 1]);
  }
  return b.build();
}

/**
 * Tree parts for a region. Returns { <kind>: { trunk, fol, bark }, far?, bush? } where trunk / fol are
 * geometries sharing one origin (so both can use the same instance matrices) and bark names the bark texture.
 */
export function treeGeometries(kind, env) {
  const tr = env.trunk, f1 = env.foliage, f2 = env.foliage2, snowy = kind === 'snowpine';
  // trunks are tinted by the region's trunk colour relative to a mid brown, so bark keeps its own detail
  const bk = [Math.min(1.6, tr[0] / 0.3), Math.min(1.6, tr[1] / 0.22), Math.min(1.6, tr[2] / 0.15)];
  const out = {};

  out.pine = (() => {
    const t = new Builder(), f = new Builder();
    t.add(new THREE.CylinderGeometry(0.14, 0.27, 3.0, 7), Mx(0, 1.5, 0), bk, [2, 2]);
    t.add(new THREE.CylinderGeometry(0.03, 0.14, 4.8, 5), Mx(0, 5.4, 0), bk, [1, 3]);
    for (let tier = 0; tier < 8; tier++) {
      const y = 1.55 + tier * 0.8, R = 2.15 * (1 - tier / 9.6), n = tier < 5 ? 6 : 5;
      const col = snowy ? mix(f1, f2, tier < 2 ? 0.45 : 0.8) : mul(f1, 0.8 + tier * 0.045);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + tier * 0.55, d = [Math.cos(a), 0, Math.sin(a)], s = [-Math.sin(a), 0, Math.cos(a)];
        const B = [d[0] * 0.04, y + R * 0.08, d[2] * 0.04], Tp = [d[0] * R, y - R * 0.36, d[2] * R], w = R * 0.56;
        f.quad(add3(B, s, -w), add3(Tp, s, -w), add3(Tp, s, w), add3(B, s, w), CARD.pine, norm([d[0] * 0.6, 0.8, d[2] * 0.6]), col);
      }
    }
    for (const a of [0, Math.PI / 2]) {            // leader: two crossed upright boughs
      const dx = Math.cos(a) * 0.55, dz = Math.sin(a) * 0.55, c = snowy ? f2 : mul(f1, 1.15);
      f.quad(V(dx, 6.9, dz), V(dx, 8.6, dz), V(-dx, 8.6, -dz), V(-dx, 6.9, -dz), CARD.pine, [0, 1, 0], c);
    }
    return { trunk: t.build(), fol: f.build(), bark: 'pine' };
  })();

  out.broad = (() => {
    const t = new Builder(), f = new Builder();
    t.add(new THREE.CylinderGeometry(0.2, 0.34, 3.6, 7), Mx(0, 1.8, 0), bk, [2, 2.4]);
    t.add(new THREE.CylinderGeometry(0.07, 0.17, 2.2, 5), Mx(0.55, 4.0, 0.1, 0, 0, -0.6), bk, [1, 1.5]);
    t.add(new THREE.CylinderGeometry(0.06, 0.15, 2.0, 5), Mx(-0.5, 4.1, -0.25, 0.3, 0, 0.6), bk, [1, 1.5]);
    t.add(new THREE.CylinderGeometry(0.06, 0.16, 2.0, 5), Mx(0, 4.4, 0.4, -0.5, 0, 0), bk, [1, 1.5]);
    crown(f, [0, 5.0, 0], 18, 1.35, 1.3, CARD.leaf, f1, f2, 0.85, 11);
    crown(f, [0, 4.9, 0], 7, 0.5, 1.15, CARD.leaf, mul(f1, 0.8), mul(f2, 0.8), 0.8, 12);
    return { trunk: t.build(), fol: f.build(), bark: 'broad' };
  })();

  out.jungle = (() => {
    const t = new Builder(), f = new Builder();
    t.add(new THREE.CylinderGeometry(0.24, 0.5, 9.4, 7), Mx(0, 4.7, 0), bk, [2, 5]);
    t.add(new THREE.ConeGeometry(0.95, 2.3, 5), Mx(0, 0.95, 0), bk, [2, 1.2]);                 // buttress
    t.add(new THREE.CylinderGeometry(0.03, 0.03, 5, 3), Mx(1.2, 6.2, 0.6), mul(f1, 2.2), [1, 1]);  // lianas
    t.add(new THREE.CylinderGeometry(0.03, 0.03, 4, 3), Mx(-1.4, 6.9, -0.4), mul(f1, 2.2), [1, 1]);
    t.add(new THREE.CylinderGeometry(0.08, 0.18, 3.0, 5), Mx(1.0, 9.0, -0.6, 0.35, 0, -0.75), bk, [1, 2]);
    crown(f, [0, 10.3, 0], 14, 2.5, 2.1, CARD.leaf, f2, f1, 0.42, 21);
    crown(f, [0, 10.0, 0], 6, 3.1, 1.8, CARD.jungle, f1, f2, 0.3, 22);
    crown(f, [1.7, 8.6, -1.1], 6, 0.95, 1.25, CARD.leaf, f1, f2, 0.6, 23);
    return { trunk: t.build(), fol: f.build(), bark: 'broad' };
  })();

  out.palm = (() => {
    const t = new Builder(), f = new Builder();
    t.add(new THREE.CylinderGeometry(0.17, 0.25, 2.2, 7), Mx(0.06, 1.1, 0, 0, 0, -0.06), bk, [1, 2]);
    t.add(new THREE.CylinderGeometry(0.15, 0.17, 2.2, 7), Mx(0.26, 3.2, 0, 0, 0, -0.12), bk, [1, 2]);
    t.add(new THREE.CylinderGeometry(0.13, 0.15, 2.0, 7), Mx(0.52, 5.2, 0, 0, 0, -0.14), bk, [1, 2]);
    const top = [0.66, 6.15, 0];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.2, d = [Math.cos(a), 0, Math.sin(a)], s = [-Math.sin(a), 0, Math.cos(a)];
      const up = i % 2 ? 0.75 : 0.35, len = i % 2 ? 2.9 : 3.3, w = 0.62, col = i % 2 ? f1 : f2;
      const mid = add3(add3(top, d, len * 0.5), [0, 1, 0], up), tip = add3(add3(top, d, len), [0, 1, 0], up - len * 0.36);
      const n = norm([d[0] * 0.4, 0.9, d[2] * 0.4]);
      f.quad(add3(top, s, -w * 0.5), add3(mid, s, -w), add3(mid, s, w), add3(top, s, w * 0.5), CARD.palm, n, col, [0, 0.5]);
      f.quad(add3(mid, s, -w), add3(tip, s, -w), add3(tip, s, w), add3(mid, s, w), CARD.palm, n, col, [0.5, 1]);
    }
    return { trunk: t.build(), fol: f.build(), bark: 'palm' };
  })();

  if (kind !== 'jungle') {
    const b = new Builder();
    crown(b, [0, 0.5, 0], 7, 0.3, 0.6, CARD.leaf, f1, f2, 0.8, 31);
    out.bush = b.build();
  }
  if (kind === 'jungle') out.far = impostor(8.6, 12.6, CARD.jungleTree);
  else if (kind === 'broad') out.far = impostor(5.2, 7.2, CARD.broadTree);
  else if (kind === 'mixed' || kind === 'pine' || kind === 'snowpine') out.far = impostor(4.6, 8.6, CARD.pineTree);
  return out;
}
