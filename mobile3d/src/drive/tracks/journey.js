// Journeys: every existing track passes through several AREAS instead of one uniform region.
//
// The road itself is not touched - same bends, same gradients, same surfaces, same authored
// features. What changes is the land it runs through:
//   - a town or village at the trailhead (buildings beside the road), and a village at the finish
//   - farmland between the settlement and the wild part, where the region has grass
//   - the track's own region for the main part of the route
//   - on the desert and jungle tracks, a coast: the lowest stretch of the road runs along the sea
// Each area is the track's own environment with different vegetation, ground and buildings, so
// the regions keep their character (a snow village is still in the snow).
//
// This hooks into TrackBuilder.build(), and only for the 45 registered tracks.
import { TrackBuilder } from '../core/track.js';
import { ENVIRONMENTS } from '../core/environments.js';
import { TRACK_META } from './meta.js';

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** [fraction of the route where the area ends, area]. 'own' = the track's own region. */
const PLANS = {
  forest:  [[0.07, 'village'], [0.20, 'farmland'], [0.95, 'own'], [1, 'village']],
  mud:     [[0.07, 'village'], [0.18, 'farmland'], [0.95, 'own'], [1, 'village']],
  rocky:   [[0.06, 'village'], [0.95, 'own'], [1, 'village']],
  ridge:   [[0.05, 'village'], [0.96, 'own'], [1, 'village']],
  snow:    [[0.06, 'village'], [0.95, 'own'], [1, 'village']],
  desert:  [[0.08, 'city'], [0.94, 'own'], [1, 'village']],
  jungle:  [[0.07, 'village'], [0.15, 'farmland'], [0.95, 'own'], [1, 'village']],
  volcano: [[0.08, 'industrial'], [0.96, 'own'], [1, 'industrial']],
  tour:    [[0.09, 'city'], [0.19, 'farmland'], [0.94, 'own'], [1, 'village']]
};
/** Environments whose tracks get a stretch of coast. */
const COASTAL = new Set(['desert', 'jungle']);
const ORDER = ['own', 'village', 'farmland', 'city', 'industrial', 'beach'];
const NAMES = { village: 'village', farmland: 'farmland', city: 'town', industrial: 'works', beach: 'coast' };

/** The six areas of one track, derived from its environment E. */
function areasFor(E, envId) {
  const green = E.off === 'grass';
  const base = { ...E, ob: envId, shore: 1e9, area: 'own' };
  // settlements stand on levelled ground (this only changes land away from the road)
  const flat = { offWavy: Math.min(E.offWavy, 0.1), offRough: Math.min(E.offRough, 0.06) };
  const A = (area, o) => ({ ...base, area, name: `${E.name} ${NAMES[area]}`, ...o });
  return [
    base,
    A('village', {
      trees: E.trees * 0.3, bushes: E.bushes * 0.6, boulders: E.boulders * 0.4, hillAmp: Math.min(E.hillAmp, 7), detailAmp: Math.min(E.detailAmp, 0.4), ...flat,
      grass: green ? mix(E.grass, [0.36, 0.46, 0.22], 0.4) : E.grass, grass2: green ? mix(E.grass2, [0.44, 0.46, 0.24], 0.4) : E.grass2,
      urban: { density: 0.45, kind: 'house', h: [3.4, 6.5], foot: [8, 12] }
    }),
    A('farmland', {
      trees: E.trees * 0.14, bushes: E.bushes * 0.5, hillAmp: Math.min(E.hillAmp, 10), detailAmp: Math.min(E.detailAmp, 0.45),
      grass: green ? mix(E.grass, [0.42, 0.50, 0.20], 0.6) : E.grass, grass2: green ? mix(E.grass2, [0.54, 0.52, 0.22], 0.6) : E.grass2,
      urban: { density: 0.06, kind: 'house', h: [3.4, 5.5], foot: [8, 12] }
    }),
    A('city', {
      trees: Math.min(E.trees, 0.05), bushes: Math.min(E.bushes, 0.06), boulders: 0, hillAmp: 2, detailAmp: 0.15, ...flat,
      urban: { density: 0.7, kind: 'tower', h: [12, 70], foot: [12, 20] }
    }),
    A('industrial', {
      trees: Math.min(E.trees, 0.01), bushes: Math.min(E.bushes, 0.03), hillAmp: Math.min(E.hillAmp, 5), detailAmp: Math.min(E.detailAmp, 0.3), ...flat,
      grass: mix(E.grass, [0.40, 0.38, 0.35], 0.45), grass2: mix(E.grass2, [0.34, 0.33, 0.31], 0.45),
      urban: { density: 0.45, kind: 'shed', h: [6, 14], foot: [13, 22] }
    }),
    A('beach', {
      off: 'sand', trees: Math.min(E.trees, 0.06), bushes: Math.min(E.bushes, 0.04), boulders: 0.01, hillAmp: 3, detailAmp: 0.2,
      grass: [0.86, 0.78, 0.58], grass2: [0.80, 0.72, 0.52], cliff: [0.62, 0.52, 0.38], albedo: 0.8, sea: true, shore: 4, shoreRamp: 110
    })
  ];
}

const REGION_OF = Object.fromEntries(TRACK_META.map((t) => [t.id, t.region]));

/** Assign an area to every segment of a registered track just before it is compiled. */
export function applyJourney(b) {
  const region = REGION_OF[b.meta.id];
  if (!region || b.meta.world || !b.segs.length) return;
  const E = b.meta.envDef || ENVIRONMENTS[b.meta.env];
  const plan = PLANS[region] || PLANS[b.meta.env];
  if (!plan) return;
  const total = b.s;
  // height of the road along the route (from the authored gradients)
  const at = [];
  let s = 0, y = 0;
  for (const seg of b.segs) { at.push({ s0: s, s1: s + seg.len, y0: y, y1: y + (seg.grade / 100) * seg.len, seg }); s += seg.len; y += (seg.grade / 100) * seg.len; }
  const yAt = (sv) => { const a = at.find((q) => sv <= q.s1) || at[at.length - 1]; return a.y0 + (a.y1 - a.y0) * Math.min(1, Math.max(0, (sv - a.s0) / (a.s1 - a.s0 || 1))); };

  // the coast goes where the road is lowest, away from both ends
  let coast = null, seaLevel, seaSide = -1;
  if (COASTAL.has(b.meta.env)) {
    let low = 1e9, sLow = total / 2;
    for (const a of at) for (const [sv, yv] of [[a.s0, a.y0], [a.s1, a.y1]]) if (sv > total * 0.14 && sv < total * 0.86 && yv < low) { low = yv; sLow = sv; }
    coast = [Math.max(total * 0.1, sLow - total * 0.09), Math.min(total * 0.93, sLow + total * 0.09)];
    // the sea lies below every road of the track, side trails and bypasses included
    let floor = Math.min(...at.map((a) => Math.min(a.y0, a.y1)));
    for (const f of b.features) {
      if (f.type === 'spur') { let yy = yAt(f.s); for (const [len, , grade] of f.segs) { yy += (grade / 100) * len; floor = Math.min(floor, yy); } }
      else if (f.type === 'bypass') floor = Math.min(floor, yAt((f.s0 + f.s1) / 2) + Math.min(0, f.dy));
    }
    seaLevel = b.meta.startY + floor - 2.4;
    // on the side where the land already falls away
    let l = 0, r = 0;
    for (const a of at) if (a.s1 > coast[0] && a.s0 < coast[1]) { l += a.seg.L; r += a.seg.R; }
    seaSide = r <= l ? -1 : 1;
  }
  for (const a of at) {
    const mid = (a.s0 + a.s1) / 2, fr = mid / total;
    let area = (plan.find((p) => fr <= p[0]) || plan[plan.length - 1])[1];
    if (area === 'own' && coast && mid > coast[0] && mid < coast[1]) area = 'beach';
    a.seg.biome = ORDER.indexOf(area);
  }
  b.meta.world = { biomes: areasFor(E, b.meta.env), seaLevel, seaSide, coast };
}

/** Area names along a compiled track, for docs and tests: [[area, start s], ...]. */
export function journeyOf(track) {
  const out = [];
  if (!track.biomes) return out;
  for (let i = 0; i < track.nMain; i++) { const a = track.biomes[track.BIO[i]].area; if (!out.length || out[out.length - 1][0] !== a) out.push([a, track.S[i]]); }
  return out;
}

TrackBuilder.journey = applyJourney;
