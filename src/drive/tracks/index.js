// Registry of all tracks: the expedition in unlock order (8 regions x 5 tracks), then the open Grand Tour (5 tracks).
import { forestEntry, fallenForest, riverCrossing, deepForest } from './forest.js';
import { muddyEntrance, deepMudPit, waterloggedValley, mudMountain } from './mud.js';
import { rockyEntrance, rockCrawler, mountainClimb, mountainDescent } from './rocky.js';
import { ridgeEntry, cliffBridge, deadlyPass, finalRidge } from './ridge.js';
import { snowEntry, frozenRiver, blizzardMountain, extremeSummit } from './snow.js';
import { hiddenForest, swampSurvival, giantRock, narrowRoad, iceValley } from './extra.js';
import { DESERT_TRACKS } from './desert.js';
import { JUNGLE_TRACKS } from './jungle.js';
import { VOLCANO_TRACKS } from './volcano.js';
import { TOUR_TRACKS } from './tour.js';
import { bravaCoast } from './coast.js';
import { TRACK_META } from './meta.js';
import './journey.js';      // every track passes through areas (town, farmland, coast...) - see journey.js

export { REGIONS } from './regions.js';

const BUILDERS = [
  forestEntry, fallenForest, riverCrossing, deepForest, hiddenForest,
  muddyEntrance, deepMudPit, waterloggedValley, mudMountain, swampSurvival,
  rockyEntrance, rockCrawler, mountainClimb, mountainDescent, giantRock,
  ridgeEntry, cliffBridge, deadlyPass, narrowRoad, finalRidge,
  snowEntry, frozenRiver, blizzardMountain, iceValley, extremeSummit,
  ...DESERT_TRACKS, ...JUNGLE_TRACKS, ...VOLCANO_TRACKS,
  ...TOUR_TRACKS,
  bravaCoast
];

// The setup the headless test driver uses per region (= the "recommended" setup:
// every track is proven finishable with it, see scripts/bot.mjs).
const J = 'mountain-jeep';
const REGION_SETUP = {
  forest: { vehicle: J, ups: {}, gear: {} },
  mud: { vehicle: J, ups: { engine: 2, tires: 2 }, gear: { tire: 'mud', winch: true } },
  rocky: { vehicle: J, ups: { engine: 3, tires: 2, suspension: 3, clearance: 3, brakes: 2 }, gear: { tire: 'rock', winch: true, difflock: true } },
  ridge: { vehicle: J, ups: { engine: 3, tires: 3, suspension: 3, clearance: 3, brakes: 3 }, gear: { tire: 'rock', winch: true, difflock: true } },
  snow: { vehicle: J, ups: { engine: 4, tires: 4, suspension: 4, clearance: 3, brakes: 4 }, gear: { tire: 'snow', winch: true, difflock: true } },
  desert: { vehicle: J, ups: { engine: 4, tires: 4, suspension: 4, clearance: 3, brakes: 4, fuel: 3 }, gear: { tire: 'mud', winch: true, difflock: true } },
  jungle: { vehicle: J, ups: { engine: 4, tires: 4, suspension: 4, clearance: 4, brakes: 4, fuel: 3 }, gear: { tire: 'mud', winch: true, difflock: true } },
  tour: { vehicle: J, ups: {}, gear: {} },   // open from the start: proven in a stock jeep
  coast: { vehicle: J, ups: {}, gear: {} },  // open from the start too
  volcano: { vehicle: J, ups: { engine: 5, tires: 5, suspension: 5, clearance: 4, brakes: 5, fuel: 4 }, gear: { tire: 'rock', winch: true, difflock: true } }
};
const TRACK_SETUP = {
  'muddy-entrance': { vehicle: J, ups: { engine: 2 }, gear: {} },
  'rocky-entrance': { vehicle: J, ups: { engine: 2, tires: 2, suspension: 2, clearance: 2 }, gear: { tire: 'mud', winch: true } },
  'swamp-survival': { vehicle: J, ups: { engine: 2, tires: 2, clearance: 2 }, gear: { tire: 'mud', winch: true } },
  'rocky-pass': { vehicle: J, ups: { engine: 4, tires: 4, suspension: 4, clearance: 3, brakes: 4, fuel: 3 }, gear: { tire: 'rock', winch: true, difflock: true } },
  'waterfall-crossing': { vehicle: J, ups: { engine: 4, tires: 4, suspension: 4, clearance: 4, brakes: 4, fuel: 3 }, gear: { tire: 'rock', winch: true, difflock: true } },
  'forgotten-road': { vehicle: J, ups: { engine: 4, tires: 4, suspension: 4, clearance: 4, brakes: 4, fuel: 3 }, gear: { tire: 'rock', winch: true, difflock: true } },
  'ash-valley': { vehicle: J, ups: { engine: 5, tires: 5, suspension: 5, clearance: 4, brakes: 5, fuel: 4 }, gear: { tire: 'mud', winch: true, difflock: true } }
};

let cachedIndex = -1;
let cachedTrack = null;

export const TRACKS = BUILDERS.map((fn, i) => ({
  ...TRACK_META[i],
  n: i + 1,
  bot: TRACK_SETUP[TRACK_META[i].id] || REGION_SETUP[TRACK_META[i].region],
  /** Compile the track. Only one compiled track is kept (they hold large terrain caches). */
  build() {
    if (cachedIndex !== i) {
      cachedTrack = fn();
      // weather plan / clock hours live in the static metadata
      Object.assign(cachedTrack.meta, { weather: TRACK_META[i].weather, weatherPlan: TRACK_META[i].weatherPlan, hours: TRACK_META[i].hours, time: TRACK_META[i].time || cachedTrack.meta.time });
      cachedIndex = i;
    }
    return cachedTrack;
  }
}));

export function getTrackDef(id) {
  return TRACKS.find((t) => t.id === id) || TRACKS[0];
}
