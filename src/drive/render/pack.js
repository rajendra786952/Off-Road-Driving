// Loader for public/Trail_Torque_Balanced_Asset_Pack (used by the Brava Coast Run, tracks/coast.js).
//
// The pack's GLBs are small vertex-coloured models made of many separate boxes, modelled Z-up
// with no normals or UVs. Each one is turned into a single game-ready geometry here: all parts
// merged (one draw call, instanceable), turned Y-up, given flat normals, and stood on the ground
// at the origin. The jeep keeps its body and one wheel apart so the wheels can spin and steer.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PACK_DIR } from '../tracks/coast.js';

/** Every model in the pack: name -> folder. */
export const PACK_MODELS = {
  cow: 'animals', deer: 'animals', elephant: 'animals', goat: 'animals',
  stone_steel_bridge: 'bridges', wooden_bridge: 'bridges',
  city_house_01: 'buildings', industrial_shed_02: 'buildings', office_tower_01: 'buildings', office_tower_02: 'buildings', skyscraper_03: 'buildings', village_house_02: 'buildings', warehouse_01: 'buildings',
  construction_crane: 'landmarks', lighthouse: 'landmarks', water_tower: 'landmarks',
  barrel: 'props', chevron_sign: 'props', crate: 'props', road_barrier: 'props', street_lamp: 'props', traffic_cone: 'props', tunnel_portal: 'props', wood_fence_section: 'props',
  boulder_01: 'rocks', boulder_02: 'rocks', boulder_03: 'rocks', boulder_04: 'rocks', cliff_piece_01: 'rocks', cliff_piece_02: 'rocks',
  jungle_tree_01: 'trees', jungle_tree_02: 'trees', palm_tree_01: 'trees', palm_tree_02: 'trees', pine_tree_01: 'trees',
  offroad_jeep: 'vehicles'
};
/** Which building models stand in for each kind of building the track asks for. */
export const PACK_BUILDINGS = {
  tower: ['office_tower_01', 'office_tower_02', 'skyscraper_03'],
  shed: ['warehouse_01', 'industrial_shed_02'],
  house: ['city_house_01', 'village_house_02']
};
/** Tree templates the track's areas name (tracks/coast.js `kinds`), with how much to enlarge the model. */
export const PACK_TREES = { pk_palm1: ['palm_tree_01', 1.35], pk_palm2: ['palm_tree_02', 1.5], pk_jungle1: ['jungle_tree_01', 1.9], pk_jungle2: ['jungle_tree_02', 2.2], pk_pine: ['pine_tree_01', 1.25] };
export const PACK_GROUND = ['grass', 'dirt', 'mud', 'rock', 'gravel', 'sand', 'asphalt'];

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
  const one = (name) => loader.loadAsync(`${PACK_DIR}models/${PACK_MODELS[name]}/${name}.glb`).then((gltf) => {
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
  // the textures the renderer needs straight away (ground photos and skies are loaded by the world itself)
  const tl = new THREE.TextureLoader();
  const tex = (key, file, srgb) => tl.loadAsync(PACK_DIR + file).then((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4;
    pack.tex[key] = t;
  }).catch((err) => console.warn(`Asset pack: ${file} did not load`, err));
  cache = Promise.all([...names.map(one), tex('facade', 'textures/buildings/office_facade.jpg', true), tex('waterNormal', 'textures/water/water_normal.png', false), tex('waterColor', 'textures/water/water_foam_color.png', true)]).then(() => pack);
  return cache;
}
