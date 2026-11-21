export const GAME_W = 960;
export const GAME_H = 540;

// Physics runs on a fixed 60 Hz step (see LevelScene) so the car behaves the
// same on 60/90/120 Hz phones.
export const PHYSICS_STEP = 1000 / 60;
export const MAX_STEPS_PER_FRAME = 4;
export const GRAVITY_Y = 1.1;

export const CHUNK_SIZE = 1200; // must equal 2 * CELL (core/pickups.js)
export const TERRAIN_THICKNESS = 60;
export const SPAWN_X = 220;
export const PX_PER_METER = 20;

export const FUEL = {
  base: 100,
  idleDrain: 1.5, // units / second while driving
  gasDrain: 5.2, // extra units / second while accelerating (demands throttle control)
  canAmount: 25 // scarce fuel cans - gives a critical +25 boost
};

export const COIN_VALUE = 5;

// Open the game with ?debug=1 to draw physics shapes and an FPS counter.
export const DEBUG =
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('debug') === '1';

// Toggle variable to unlock all tracks and regions:
// Set to true to unlock all tracks and regions across the game.
// Set to false to enforce standard career and expedition progression.
// Can also be dynamically overridden via URL query param: ?unlockTracks=1 or ?unlockTracks=0
const URL_UNLOCK_PARAM =
  typeof location !== 'undefined'
    ? (new URLSearchParams(location.search).get('unlockTracks') ?? new URLSearchParams(location.search).get('unlock'))
    : null;

export const UNLOCK_ALL_TRACKS =
  URL_UNLOCK_PARAM !== null
    ? (URL_UNLOCK_PARAM === '1' || URL_UNLOCK_PARAM === 'true')
    : true;

// Toggle variable to enable or disable the 3D skybox / sky dome:
// Set to true to render the 3D skybox (sky dome with clouds, atmospheric shader & HDR photographic environment).
// Set to false to disable the skybox and render a clean solid/fog background backdrop.
// Can also be dynamically overridden via URL query param: ?skybox=1 or ?skybox=0
const URL_SKYBOX_PARAM =
  typeof location !== 'undefined'
    ? (new URLSearchParams(location.search).get('skybox') ?? new URLSearchParams(location.search).get('sky'))
    : null;

export const ENABLE_SKYBOX =
  URL_SKYBOX_PARAM !== null
    ? (URL_SKYBOX_PARAM === '1' || URL_SKYBOX_PARAM === 'true')
    : false;
