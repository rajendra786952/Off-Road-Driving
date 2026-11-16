// Registry of all expedition tracks, in unlock order.
import { FOREST_TRACKS } from './forest.js';
import { MUD_TRACKS } from './mud.js';
import { ROCKY_TRACKS } from './rocky.js';
import { RIDGE_TRACKS } from './ridge.js';
import { SNOW_TRACKS } from './snow.js';
import { TRACK_META } from './meta.js';

export { REGIONS } from './regions.js';

const BUILDERS = [...FOREST_TRACKS, ...MUD_TRACKS, ...ROCKY_TRACKS, ...RIDGE_TRACKS, ...SNOW_TRACKS];

// The setup the headless test driver uses per region (= the "recommended" setup:
// every track is proven finishable with it, see scripts/bot.mjs).
const REGION_SETUP = {
  forest: { vehicle: 'mountain-jeep', ups: {}, gear: {} },
  mud: { vehicle: 'mountain-jeep', ups: { engine: 2, tires: 2 }, gear: { tire: 'mud', winch: true } },
  rocky: { vehicle: 'mountain-jeep', ups: { engine: 3, tires: 2, suspension: 3, clearance: 3, brakes: 2 }, gear: { tire: 'rock', winch: true, difflock: true } },
  ridge: { vehicle: 'mountain-jeep', ups: { engine: 3, tires: 3, suspension: 3, clearance: 3, brakes: 3 }, gear: { tire: 'rock', winch: true, difflock: true } },
  snow: { vehicle: 'mountain-jeep', ups: { engine: 4, tires: 4, suspension: 4, clearance: 3, brakes: 4 }, gear: { tire: 'snow', winch: true, difflock: true } }
};
const TRACK_SETUP = {
  'muddy-entrance': { vehicle: 'mountain-jeep', ups: { engine: 2 }, gear: {} },
  'rocky-entrance': { vehicle: 'mountain-jeep', ups: { engine: 2, tires: 2, suspension: 2, clearance: 2 }, gear: { tire: 'mud', winch: true } }
};

let cachedIndex = -1;
let cachedTrack = null;

export const TRACKS = BUILDERS.map((fn, i) => ({
  ...TRACK_META[i],
  n: i + 1,
  bot: TRACK_SETUP[TRACK_META[i].id] || REGION_SETUP[TRACK_META[i].region],
  /** Compile the track. Only one compiled track is kept (they hold large terrain caches). */
  build() {
    if (cachedIndex !== i) { cachedTrack = fn(); cachedIndex = i; }
    return cachedTrack;
  }
}));

export function getTrackDef(id) {
  return TRACKS.find((t) => t.id === id) || TRACKS[0];
}
