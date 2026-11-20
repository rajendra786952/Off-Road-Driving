// BRAVA COAST RUN - the track built around the asset pack in public/Trail_Torque_Balanced_Asset_Pack.
//
// One 3.4 km point-to-point run from a harbour town to a mountain lookout. Every model, texture
// and sky in the pack is used somewhere along it (see render/pack.js for the loading side):
//
//   Harbour town   asphalt, office towers and the skyscraper, street lamps, construction crane
//   Coast road     sea on the right, palms, wooden fences, the lighthouse
//   Dockyards      warehouse and industrial sheds, water tower, crates / barrels / barriers / cones
//   Village        the two house models, then the WOODEN BRIDGE over the river mouth
//   Jungle         jungle trees, mud, a ford, a waterfall, deer / cows / an elephant on the road
//   Mountain       pines, boulders, cliff pieces, chevron signs, goats, hairpins
//   Summit         a tunnel behind the pack's portals, then the STONE AND STEEL BRIDGE to the finish
//
// Areas are authored here segment by segment (the journey hook leaves this track alone).
import { TrackBuilder } from '../core/track.js';
import { wander, switchbacks, run, square } from './motifs.js';

export const PACK_DIR = './Trail_Torque_Balanced_Asset_Pack/';

/** Light, sky and vegetation shared by the whole track. */
const COAST_ENV = {
  name: 'Brava Coast',
  off: 'grass', hillAmp: 14, detailAmp: 0.5, offRough: 0.1, offWavy: 0.22,
  trees: 0.4, treeKind: 'jungle', boulders: 0.03, bushes: 0.3,
  grass: [0.22, 0.42, 0.16], grass2: [0.30, 0.48, 0.18], cliff: [0.42, 0.38, 0.32],
  sky: [0.20, 0.52, 0.86], horizon: [0.74, 0.88, 0.92], fog: [0.70, 0.84, 0.88], fogFar: 320,
  sun: [1.0, 0.96, 0.84], ambient: 0.74, foliage: [0.10, 0.34, 0.12], foliage2: [0.18, 0.46, 0.14], trunk: [0.30, 0.22, 0.14],
  skyStyle: { style: 'cumulus', cover: 0.38, scale: 0.9, cloud: [1.0, 1.0, 0.98] }, silhouette: 'canopy',
  // the pack's skies: day for most of the run, sunset as the light gets low
  hdr: PACK_DIR + 'environments/tropical_day_2k.hdr', hdrAlt: PACK_DIR + 'environments/tropical_sunset_2k.hdr', hdrLift: 0.02
};
const B = (o) => ({ ...COAST_ENV, boulders: 0.02, bushes: 0.2, shore: 1e9, ...o });

/**
 * Areas. kinds = which of the pack's tree models grow there. ob = obstacle table (core/obstacles.js).
 * urban.kind picks the building models: tower (office towers, skyscraper), shed (warehouse, shed), house.
 */
const AREAS = [
  B({ id: 'city', name: 'Puerto Brava', hillAmp: 1.5, detailAmp: 0.12, offRough: 0.03, offWavy: 0.05, trees: 0.04, bushes: 0.05, boulders: 0,
    grass: [0.30, 0.43, 0.22], grass2: [0.36, 0.46, 0.25], cliff: [0.5, 0.5, 0.48], kinds: ['pk_palm1', 'pk_palm2'], ob: 'city',
    urban: { density: 0.8, kind: 'tower', h: [20, 62], foot: [11, 18] } }),
  B({ id: 'beach', name: 'Costa Dorada', off: 'sand', hillAmp: 2.5, detailAmp: 0.18, offRough: 0.04, offWavy: 0.14, trees: 0.07, bushes: 0.03, boulders: 0.01,
    grass: [0.86, 0.78, 0.58], grass2: [0.80, 0.72, 0.52], cliff: [0.62, 0.52, 0.38], albedo: 0.8, kinds: ['pk_palm1', 'pk_palm2'], ob: 'coastB',
    sea: true, shore: 4, shoreRamp: 110 }),
  B({ id: 'industrial', name: 'Dockyards', off: 'gravel', hillAmp: 1.5, detailAmp: 0.15, offRough: 0.05, offWavy: 0.06, trees: 0.008, bushes: 0.03, boulders: 0,
    grass: [0.40, 0.38, 0.35], grass2: [0.34, 0.33, 0.31], cliff: [0.36, 0.34, 0.32], kinds: ['pk_palm1'], ob: 'city',
    urban: { density: 0.55, kind: 'shed', h: [5.5, 9], foot: [11, 17] } }),
  B({ id: 'village', name: 'San Rafael', hillAmp: 4, detailAmp: 0.25, offRough: 0.06, offWavy: 0.1, trees: 0.12, bushes: 0.18,
    grass: [0.34, 0.46, 0.20], grass2: [0.44, 0.44, 0.24], cliff: [0.44, 0.38, 0.3], kinds: ['pk_palm1', 'pk_palm2', 'pk_jungle1'], ob: 'coastJ',
    urban: { density: 0.5, kind: 'house', h: [4.2, 6.5], foot: [7, 10] } }),
  B({ id: 'jungle', name: 'Selva Verde', hillAmp: 18, detailAmp: 0.7, offRough: 0.14, offWavy: 0.28, trees: 0.6, bushes: 0.55, boulders: 0.03,
    grass: [0.14, 0.36, 0.13], grass2: [0.20, 0.42, 0.14], cliff: [0.30, 0.32, 0.26], kinds: ['pk_jungle1', 'pk_jungle2', 'pk_palm1'], ob: 'coastJ' }),
  B({ id: 'mountain', name: 'Sierra Alta', off: 'scree', hillAmp: 40, detailAmp: 1.0, offRough: 0.22, offWavy: 0.3, trees: 0.09, bushes: 0.05, boulders: 0.15,
    grass: [0.46, 0.42, 0.36], grass2: [0.40, 0.40, 0.32], cliff: [0.44, 0.40, 0.36], kinds: ['pk_pine'], ob: 'coastM' })
];
const AI = Object.fromEntries(AREAS.map((a, i) => [a.id, i]));
const START_Y = 8;

export function bravaCoast() {
  const t = new TrackBuilder({
    id: 'brava-coast', name: 'Brava Coast Run', env: 'jungle', envDef: COAST_ENV, weather: 'clear', time: 'day', seed: 8101, startY: START_Y,
    pack: true, world: { biomes: AREAS, seaLevel: 0, seaSide: -1 }
  });
  /** Grade (%) that brings the road to absolute height y over the next len metres. */
  const to = (y, len) => ((y - START_Y - t.y) / len) * 100;
  /** A row of the same model beside the road: one every `step` m for `len` m ahead. */
  const row = (model, len, step, o = {}) => { for (let a = o.from || 0; a < len; a += step) for (const side of o.both ? [1, -1] : [o.side ?? 1]) t.deco(model, { ...o, ahead: a, side }); };

  // ---------------------------------------------------------------- 1. Puerto Brava (harbour town)
  t.set({ width: 10, surface: 'asphalt', rough: 0, wavy: 0, L: 0.4, R: -0.6, biome: AI.city });
  t.note('Brava Coast Run. Harbour town to the mountain lookout: coast, docks, jungle, then the climb.');
  row('street_lamp', 400, 32, { both: true, off: 1.6, from: 14, r: 0.12, h: 5, face: 'road' });
  t.go(120, 0, 0);
  t.deco('construction_crane', { side: 1, off: 7, scale: 2.6, r: 2.2, h: 22, rot: 0.6 });
  t.go(130, 8, 0);
  t.spur(86, [[50, 0, 0], [46, 20, 0]], { name: 'Harbour cache', reward: 180, width: 8, surface: 'asphalt', rough: 0, wavy: 0 });
  t.go(150, -8, to(6.5, 150));
  t.cp('Harbour Gate');

  // ---------------------------------------------------------------- 2. Costa Dorada (coast road)
  t.set({ width: 8.5, L: 1.5, R: -3, biome: AI.beach });
  t.note('The coast road. Sea on your right: the sand beside the tarmac is soft.');
  row('wood_fence_section', 60, 3.02, { side: -1, off: 0.9, from: 20, r: 0.1, h: 1.2, len: 3 });
  wander(t, 260, { turn: 16, grade: to(5, 260), amp: 0, seg: [60, 90] });
  t.deco('lighthouse', { side: -1, off: 13, scale: 2.6, r: 2.5, h: 19 });
  row('wood_fence_section', 45, 3.02, { side: -1, off: 0.9, from: 6, r: 0.1, h: 1.2, len: 3 });
  wander(t, 240, { turn: 16, grade: 0, amp: 0, seg: [60, 90] });
  t.cp('Lighthouse Point');
  wander(t, 200, { turn: 14, grade: to(6, 200), amp: 0, seg: [60, 90] });

  // ---------------------------------------------------------------- 3. Dockyards
  t.set({ width: 9, surface: 'gravel', rough: 0.03, wavy: 0.05, L: 0.5, R: -1.5, biome: AI.industrial });
  t.note('The Dockyards. Roadworks and loose cargo: crates and barrels move, barriers do not.');
  t.go(110, 30, 0);
  t.deco('water_tower', { side: 1, off: 8, scale: 2.2, r: 2.6, h: 14 });
  t.go(120, 20, 0);
  t.deco('construction_crane', { side: -1, off: 9, scale: 2.2, r: 2.0, h: 19, rot: 2.4 });
  t.go(110, 15, to(7, 110));

  // ---------------------------------------------------------------- 4. San Rafael + the wooden bridge
  t.set({ width: 7, surface: 'dirt', rough: 0.04, wavy: 0.08, L: 0.6, R: -1, biome: AI.village });
  t.aim(t.hd);
  // cattle in the fields beside the village road
  for (const [a, side, off, rot] of [[30, 1, 7, 0.6], [52, 1, 10, 2.2], [120, -1, 8, 4.0]]) t.deco('cow', { ahead: a, side, off, rot, scale: 1.25, r: 0.8, h: 1.6 });
  wander(t, 200, { turn: 22, grade: 0, amp: 0, seg: [50, 70] });
  t.cp('San Rafael');
  square(t, 30, to(7, 30));
  t.note('Rio Brava. A narrow wooden bridge: keep it straight.');
  t.bridge(36, { width: 4.4, depth: 9, rails: true, model: 'wooden_bridge' });
  t.go(36, 0, 0);
  t.go(50, 0, to(9, 50));

  // ---------------------------------------------------------------- 5. Selva Verde (jungle)
  t.set({ width: 6, rough: 0.07, wavy: 0.16, L: 2.5, R: -2.5, biome: AI.jungle });
  t.note('Selva Verde. Mud, fallen timber and animals on the trail.');
  for (const [a, side, off, rot] of [[60, -1, 6, 1.0], [84, -1, 8, 2.6]]) t.deco('deer', { ahead: a, side, off, rot, r: 0.5, h: 1.5 });
  t.deco('elephant', { ahead: 170, side: 1, off: 8, rot: 1.9, scale: 1.2, r: 1.4, h: 3 });
  wander(t, 240, { turn: 44, grade: to(18, 240), amp: 1 });
  t.fall(1, { h: 15, w: 8, ahead: 26 });
  t.spur(70, [[44, 20, 4], [46, -30, 5]], { name: 'Waterfall cache', reward: 220 });
  wander(t, 120, { turn: 36, grade: to(22, 120), amp: 1 });
  square(t, 26, 0);
  t.ford(22, 0.4);
  t.go(44, 0, 1);
  t.mud(20, { from: -1.4, to: 0.2 });
  wander(t, 260, { turn: 44, grade: to(40, 260), amp: 1 });
  t.cp('Selva Verde');

  // ---------------------------------------------------------------- 6. Sierra Alta (mountain)
  t.set({ width: 5.8, surface: 'rock', rough: 0.08, wavy: 0.13, L: 8, R: -8, biome: AI.mountain });
  t.note('Sierra Alta. Low range for the hairpins. The drop is on your right.');
  row('cliff_piece_01', 120, 26, { side: 1, off: 3.2, from: 10, scale: 1.9, r: 3.0, h: 7 });
  switchbacks(t, 2, 140, 10, { r: 14, first: 1 });
  row('chevron_sign', 60, 20, { side: -1, off: 1.3, from: 8, r: 0.1, h: 2.3, face: 'road' });
  { const len = Math.max(220, Math.round((104 - START_Y - t.y) / 0.1)); run(t, len, to(104, len)); }
  row('cliff_piece_02', 80, 27, { side: 1, off: 3.4, scale: 2.1, r: 3.2, h: 8 });
  for (const [a, off, rot] of [[-150, 4, 0.4], [-120, 5, 3.0], [-60, 4.5, 1.6]]) t.deco('goat', { ahead: a, side: 1, off, rot, scale: 0.75, r: 0.4, h: 1.2 });
  t.cp('High Pass');

  // ---------------------------------------------------------------- 7. the tunnel and the stone bridge
  t.set({ width: 6.4, L: 26, R: 26, rough: 0.05, wavy: 0.06 });
  t.go(60, 20, to(107, 60));
  t.note('Cueva del Viento. Lights on.');
  t.tunnel(110);
  t.go(60, 15, to(109, 60));
  t.go(50, -10, 0);
  t.set({ width: 6, L: 6, R: -8, rough: 0.07, wavy: 0.1 });
  t.aim(t.hd);
  t.go(50, 0, to(110, 50));
  square(t, 26, 0);
  t.note('The last crossing: stone and steel over the gorge.');
  t.bridge(40, { width: 4.6, depth: 18, rails: true, model: 'stone_steel_bridge' });
  t.go(40, 0, 0);
  wander(t, 150, { turn: 26, grade: to(118, 150), amp: 0 });
  t.deco('water_tower', { side: 1, off: 7, scale: 1.8, r: 2.2, h: 11 });
  t.go(70, 0, 0);
  return t.build();
}
