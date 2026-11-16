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
