// Small geometry helpers shared by the world and the vehicle model.
import * as THREE from 'three';

/** Merge simple geometries (each with one flat colour) into one vertex-coloured geometry = one draw call. */
export function mergeColored(parts) {
  let nv = 0, ni = 0;
  for (const p of parts) {
    if (p.matrix) p.geo.applyMatrix4(p.matrix);
    nv += p.geo.attributes.position.count;
    ni += p.geo.index ? p.geo.index.count : p.geo.attributes.position.count;
  }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), colr = new Float32Array(nv * 3);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const p of parts) {
    const g = p.geo;
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    const n = g.attributes.position.count;
    for (let i = 0; i < n; i++) {
      let shade = 1;
      if (p.shade) shade = 0.78 + 0.26 * Math.min(1, Math.max(0, (g.attributes.position.getY(i) - p.shade[0]) / (p.shade[1] - p.shade[0])));
      colr[(vo + i) * 3] = p.color[0] * shade; colr[(vo + i) * 3 + 1] = p.color[1] * shade; colr[(vo + i) * 3 + 2] = p.color[2] * shade;
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.array[i] + vo;
    else for (let i = 0; i < n; i++) idx[io++] = vo + i;
    vo += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/** Matrix from position / scale / euler rotation. */
export function M(x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz)
  );
}
