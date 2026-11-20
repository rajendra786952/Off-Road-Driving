// 100 levels = 10 environments x 10 stages, all generated from one formula.
// Difficulty ramps through hill height, roughness, bump frequency, length,
// fuel-can spacing and the obstacle pool (see core/features.ts).
import { generateFeatures, type Feature, type FeatureType } from '../core/features';
import { THEME_ORDER, THEMES, type ThemeId } from './themes';
import type { TerrainConfig } from '../core/terrain';
import type { PickupConfig } from '../core/pickups';

export interface LevelConfig {
  id: number; // 1..100
  name: string;
  theme: ThemeId;
  stage: number; // 1..10 inside its environment
  length: number; // px; 20 px = 1 m
  terrain: TerrainConfig;
  pickups: PickupConfig;
  bonus: number;
  difficulty: number; // 0..1
}

export const LEVEL_COUNT = 100;
export const STAGES_PER_WORLD = 10;

const NAMES: Record<ThemeId, string[]> = {
  countryside: ['First Roll', 'Meadow Run', 'Barn Road', 'Rolling Hills', 'Hay Bale Lane', 'Orchard Hop', 'Tractor Trail', 'Windmill Rise', 'Harvest Dash', 'Valley Crown'],
  forest: ['Pine Ridge', 'Fallen Timber', 'Mossy Hollow', 'Lumber Road', 'Fern Gully', 'Owl Creek', 'Sawmill Jump', 'Deep Woods', 'Bear Hill', 'Old Growth'],
  desert: ['Dry Wash', 'Dune Hopper', 'Cactus Flats', 'Sandstorm Alley', 'Mirage Mile', 'Scorpion Pass', 'Oasis Run', 'Bone Dry', 'Sun Furnace', 'Storm Front'],
  mountains: ['Rocky Creek', "Hawk's Climb", 'Scree Slope', 'Boulder Field', 'Goat Path', 'Stormy Ridge', 'Cliffside', 'Avalanche Alley', 'Summit Push', 'Eagle Peak'],
  snow: ['First Frost', 'Powder Run', 'Frozen Lake', 'Ice Bridge', 'Whiteout', 'Glacier Gap', 'Snowplough Hill', 'Blizzard Pass', 'Cold Snap', 'North Face'],
  jungle: ['Vine Road', 'Rope Bridge', 'River Bend', 'Monkey Trail', 'Hidden Temple', 'Rainfall Run', 'Croc Crossing', 'Canopy Climb', 'Lost Valley', 'Heart of Green'],
  swamp: ['Soggy Start', 'Bog Hop', 'Reed Maze', 'Sinking Road', 'Gator Gulch', 'Black Water', 'Marsh Lights', 'Deep Mire', 'Rot Wood', 'The Big Bog'],
  city: ['Night Shift', 'Roadworks', 'Overpass', 'Neon Mile', 'Dockside', 'Rooftop Run', 'Rush Hour', 'Broken Bridge', 'Midnight Sprint', 'Downtown Finale'],
  canyon: ['Red Rim', 'Dust Devil', 'Switchback', 'Echo Gorge', 'Rattler Ridge', 'Hanging Road', 'Sunset Drop', 'Thunder Gap', 'Mesa Leap', 'Grand Finale'],
  volcano: ['Ash Valley', 'Black Rock', 'Cinder Road', 'Lava Ridge', 'Smoke Stack', 'Ember Fall', 'Magma Gap', 'Crater Rim', 'Fire Mountain', 'Torque Master'],
};

function build(i: number): LevelConfig {
  const theme = THEME_ORDER[Math.floor(i / STAGES_PER_WORLD)];
  const stage = (i % STAGES_PER_WORLD) + 1;
  const th = THEMES[theme];
  const d = i / (LEVEL_COUNT - 1);
  // every environment opens a little easier than the previous one ended
  const wave = ((stage - 1) / 9 - 0.5) * 0.06;
  return {
    id: i + 1,
    name: NAMES[theme][stage - 1],
    theme,
    stage,
    length: Math.round((16000 + i * 640 + (stage - 1) * 500) / 40) * 40,
    terrain: {
      seed: 1000 + i * 77,
      hill: Math.max(0.5, 0.64 + 0.44 * d + wave + th.hill),
      rough: Math.max(0.3, 0.48 + 0.42 * d + wave + th.rough),
      bumps: Math.max(0.2, 0.33 + 0.5 * d + wave + th.bumps),
    },
    pickups: {
      seed: 5000 + i * 31,
      coinRate: 0.75,
      // obstacles cost time, so cans are closer together than in the original ten levels
      fuelInterval: i < 10 ? 6 : 4,
      fuelPhase: i % 3,
    },
    bonus: 150 + i * 25,
    difficulty: d,
  };
}

export const LEVELS: LevelConfig[] = Array.from({ length: LEVEL_COUNT }, (_, i) => build(i));

export function getLevel(id: number): LevelConfig {
  return LEVELS[Math.min(LEVEL_COUNT, Math.max(1, Math.floor(id))) - 1];
}

const featureCache = new Map<number, Feature[]>();

/** The obstacle layout of a level (generated once, then cached). */
export function getFeatures(level: LevelConfig): Feature[] {
  let f = featureCache.get(level.id);
  if (!f) {
    f = generateFeatures({
      index: level.id - 1,
      length: level.length,
      seed: level.terrain.seed,
      bias: THEMES[level.theme].bias,
    });
    featureCache.set(level.id, f);
  }
  return f;
}

/** Obstacle kinds present on a level, for the level card. */
export function levelObstacles(level: LevelConfig): FeatureType[] {
  const seen = new Set<FeatureType>();
  for (const f of getFeatures(level)) if (f.type !== 'checkpoint') seen.add(f.type);
  return [...seen];
}

export function starsForRatio(ratio: number): number {
  if (ratio >= 0.9) return 3;
  if (ratio >= 0.6) return 2;
  return 1;
}

export const DIFFICULTY_LABEL = ['Easy', 'Medium', 'Hard', 'Expert', 'Extreme'];
export function difficultyTier(level: LevelConfig): number {
  return Math.min(4, Math.floor(level.difficulty * 5));
}
