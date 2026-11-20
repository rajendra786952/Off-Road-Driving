// Shared numbers for the 2D game. Values are carried over from the original
// Phaser version (src/game/config/constants.js) so the car drives the same.

export const VIEW_W = 960; // logical width of the camera view at zoom 1
export const VIEW_H = 540;

// Physics runs on a fixed 60 Hz step so the car behaves the same on 60/90/120 Hz phones.
export const PHYSICS_STEP = 1000 / 60;
export const MAX_STEPS_PER_FRAME = 4;
export const GRAVITY_Y = 1.1;

export const CHUNK_SIZE = 1200; // must equal 2 * CELL (pickups.ts)
export const TERRAIN_THICKNESS = 60;
export const SPAWN_X = 220;
export const PX_PER_METER = 20;

export const FUEL = {
  base: 100,
  idleDrain: 1.5, // units / second while driving
  gasDrain: 5.2, // extra units / second while accelerating
  canAmount: 25,
};

export const COIN_VALUE = 5;
export const MAX_CONTINUES = 3; // checkpoint restarts allowed per run
