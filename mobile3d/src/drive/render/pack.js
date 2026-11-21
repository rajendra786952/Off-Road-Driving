// Loader for public/Trail_Torque_Balanced_Asset_Pack (used by the Brava Coast Run, tracks/coast.js).
//
// The pack's GLBs are small vertex-coloured models made of many separate boxes, modelled Z-up
// with no normals or UVs. Each one is turned into a single game-ready geometry here: all parts
// merged (one draw call, instanceable), turned Y-up, given flat normals, and stood on the ground
// at the origin. The jeep keeps its body and one wheel apart so the wheels can spin and steer.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { modelBytes, rawTexture, hasAsset } from '../../platform/textures';

import { PACK_MODELS } from './packList.js';

export { PACK_MODELS, PACK_BUILDINGS, PACK_TREES, PACK_GROUND } from './packList.js';

const Z_UP_TO_Y_UP = new THREE.Matrix4().makeRotationX(-Math.PI / 2);

/** Merge the meshes of a loaded scene (those `pick` accepts) into one flat-shaded, vertex-coloured, Y-up geometry. */
function merged(scene, pick) {
  const list = [];
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.isMesh || (pick && !pick(o))) return;
    let g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    const pos = g.getAttribute('position'), col = g.getAttribute('color');
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos.array.slice(0, pos.count * 3)), 3));
    const c = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { c[i * 3] = col ? col.getX(i) : 0.7; c[i * 3 + 1] = col ? col.getY(i) : 0.7; c[i * 3 + 2] = col ? col.getZ(i) : 0.7; }
    out.setAttribute('color', new THREE.BufferAttribute(c, 3));
    list.push(out);
    g.dispose();
  });
  if (!list.length) return null;
  const geo = mergeGeometries(list, false);
  list.forEach((g) => g.dispose());
  geo.applyMatrix4(Z_UP_TO_Y_UP);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  return geo;
}

/** Stand a geometry on the ground, centred on the origin; returns its size [w, h, d]. */
function ground(geo) {
  const b = geo.boundingBox, cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
  geo.translate(-cx, -b.min.y, -cz);
  geo.computeBoundingBox();
  return [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z];
}

/** Centre a geometry and scale it to fit a sphere of radius 1 (boulders are placed by radius). */
function unit(geo) {
  const b = geo.boundingBox, c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
  geo.translate(-c.x, -c.y, -c.z);
  const k = 2 / Math.max(s.x, s.y, s.z);
  geo.scale(k, k, k);
  geo.computeBoundingBox();
}

let cache = null;

/**
 * Load the whole pack once. Resolves to
 *   { geo: { name: geometry }, size: { name: [w, h, d] }, rocks: [unit geometries], jeep: { body, wheel, ... }, tex: {...} }
 * onProgress(0..1) is called as files arrive. A model that fails to load is left out (the game falls back to its own shapes).
 */
export function loadPack(onProgress) {
  if (cache) return cache;
  const loader = new GLTFLoader();
  const names = Object.keys(PACK_MODELS);
  let done = 0;
  const pack = { geo: {}, size: {}, rocks: [], jeep: null, tex: {}, missing: [] };
  // the files were read into memory by the loading screen (see packAssetKeys)
  const parse = (name) => { const b = modelBytes(name); return b ? loader.parseAsync(b, '') : Promise.reject(new Error('file missing')); };
  const one = (name) => parse(name).then((gltf) => {
    if (name === 'offroad_jeep') {
      // body = everything that is not a wheel or its rim; wheel = the front-left tyre with its rim
      const isWheel = (o) => o.name.startsWith('wheel_') || o.name.startsWith('rim_');
      const body = merged(gltf.scene, (o) => !isWheel(o)), all = merged(gltf.scene, isWheel);
      const wheel = merged(gltf.scene, (o) => o.name === 'wheel_L_front' || o.name.startsWith('rim_-') && o.name.endsWith('_-1.05'));
      const wb = wheel.boundingBox, wc = wb.getCenter(new THREE.Vector3());
      const ab = all.boundingBox;
      wheel.translate(-wc.x, -wc.y, -wc.z);
      pack.jeep = {
        body, wheel,
        radius: (wb.max.y - wb.min.y) / 2,                 // wheel radius in the model
        axleY: wc.y,                                       // height of the wheel centres
        halfTrack: Math.abs(wc.x),                         // wheel centre: sideways from the middle...
        halfBase: (ab.max.z - ab.min.z) / 2 - (wb.max.z - wb.min.z) / 2,   // ...and front / back
        midZ: (ab.max.z + ab.min.z) / 2
      };
      all.dispose();
    } else {
      const g = merged(gltf.scene);
      if (name.startsWith('boulder_')) { unit(g); pack.rocks.push(g); pack.geo[name] = g; pack.size[name] = [2, 2, 2]; }
      else if (name.endsWith('_bridge')) { pack.geo[name] = g; const b = g.boundingBox; pack.size[name] = [b.max.x - b.min.x, b.max.y, b.max.z - b.min.z]; }   // keeps its own height: the deck top matters
      else { pack.size[name] = ground(g); pack.geo[name] = g; }
    }
  }).catch((err) => { pack.missing.push(name); console.warn(`Asset pack: ${name} did not load`, err); }).finally(() => { done++; if (onProgress) onProgress(done / names.length); });
  // the textures the renderer needs straight away (ground photos are loaded by the world itself)
  if (hasAsset('pack_facade')) pack.tex.facade = rawTexture('pack_facade', { srgb: true, anisotropy: 4 });
  if (hasAsset('pack_water_normal')) pack.tex.waterNormal = rawTexture('pack_water_normal', { anisotropy: 4 });
  if (hasAsset('pack_water_color')) pack.tex.waterColor = rawTexture('pack_water_color', { srgb: true, anisotropy: 4 });
  cache = Promise.all(names.map(one)).then(() => pack);
  return cache;
}

/** Everything loadPack and a pack track's world need in memory first. */
export function packAssetKeys() {
  return [...Object.keys(PACK_MODELS).map((n) => 'model:' + n), 'pack_facade', 'pack_water_normal', 'pack_water_color', 'pack_ground_c', 'pack_ground_n'];
}
