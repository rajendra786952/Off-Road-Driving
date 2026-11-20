// The ten environments. The first four palettes (countryside, desert, snow,
// jungle) are the original game's themes; the rest are new.
import type { FeatureType } from '../core/features';

export type ThemeId =
  | 'countryside'
  | 'forest'
  | 'desert'
  | 'mountains'
  | 'snow'
  | 'jungle'
  | 'swamp'
  | 'city'
  | 'canyon'
  | 'volcano';

export type DecorType = 'tree' | 'pine' | 'bush' | 'rock' | 'cactus' | 'palm' | 'lamp' | 'sign' | 'deadtree' | 'reed' | 'fence' | 'cone';
export type Backdrop = 'hills' | 'peaks' | 'dunes' | 'mesas' | 'skyline' | 'treeline' | 'volcano';

export interface Theme {
  id: ThemeId;
  name: string;
  blurb: string;
  friction: number;
  frictionStatic: number;
  skyTop: string;
  skyBottom: string;
  sun: string;
  farHill: string;
  nearHill: string;
  dirt: string;
  dirtDeep: string;
  grass: string;
  grassLight: string;
  leaf: string;
  trunk: string;
  rock: string;
  bush: string;
  water: string;
  mud: string;
  backdrop: Backdrop;
  decor: DecorType[];
  night?: boolean;
  /** Terrain shape adjustments for this environment. */
  hill: number;
  rough: number;
  bumps: number;
  /** Obstacles this environment favours. */
  bias: Partial<Record<FeatureType, number>>;
}

export const THEME_ORDER: ThemeId[] = [
  'countryside', 'forest', 'desert', 'mountains', 'snow', 'jungle', 'swamp', 'city', 'canyon', 'volcano',
];

export const THEMES: Record<ThemeId, Theme> = {
  countryside: {
    id: 'countryside', name: 'Green Valley', blurb: 'Rolling farmland. A gentle start.',
    friction: 2.5, frictionStatic: 4.0,
    skyTop: '#4a90d9', skyBottom: '#d3ecf8', sun: '#fff2b3',
    farHill: '#9dbfd0', nearHill: '#6faa7a',
    dirt: '#7b5a3c', dirtDeep: '#5a402a', grass: '#4f9e3f', grassLight: '#7ccf5f',
    leaf: '#3d8f3a', trunk: '#6b4a2b', rock: '#8a8f95', bush: '#3f8a44', water: '#3f8fd0', mud: '#5b4028',
    backdrop: 'hills', decor: ['tree', 'tree', 'bush', 'bush', 'fence', 'fence', 'rock', 'sign'],
    hill: 0, rough: 0, bumps: 0,
    bias: { crates: 1.5, logs: 1.3, ramp: 1.2 },
  },
  forest: {
    id: 'forest', name: 'Pine Forest', blurb: 'Fallen logs and muddy hollows under the pines.',
    friction: 2.4, frictionStatic: 3.8,
    skyTop: '#3f7fb8', skyBottom: '#cfe6d8', sun: '#fff5c8',
    farHill: '#7fa894', nearHill: '#3f7a57',
    dirt: '#6b4c33', dirtDeep: '#4b3423', grass: '#3d8438', grassLight: '#63b356',
    leaf: '#2c6e3a', trunk: '#5c3f26', rock: '#7d858a', bush: '#2f7a3c', water: '#3a7fb0', mud: '#4d3622',
    backdrop: 'treeline', decor: ['pine', 'pine', 'pine', 'tree', 'bush', 'rock', 'pine', 'bush'],
    hill: 0.02, rough: 0.05, bumps: 0.03,
    bias: { logs: 2.4, mud: 1.6, rocks: 1.3, boulder: 1.2 },
  },
  desert: {
    id: 'desert', name: 'Desert Storm', blurb: 'Loose sand, tall dunes and long jumps.',
    friction: 1.9, frictionStatic: 3.0,
    skyTop: '#e0a35f', skyBottom: '#f8e2b8', sun: '#fff0c2',
    farHill: '#d2a577', nearHill: '#c08a58',
    dirt: '#c28f56', dirtDeep: '#9b6c3a', grass: '#d9b36a', grassLight: '#e9cc88',
    leaf: '#8aa04a', trunk: '#7a5a38', rock: '#a87f5a', bush: '#9aa855', water: '#4aa3b8', mud: '#8a6238',
    backdrop: 'dunes', decor: ['cactus', 'cactus', 'rock', 'rock', 'bush', 'deadtree', 'sign', 'rock'],
    hill: 0.06, rough: 0.08, bumps: -0.05,
    bias: { hill: 2.2, ramp: 1.8, rocks: 1.4, barrels: 1.2, gap: 1.2 },
  },
  mountains: {
    id: 'mountains', name: 'Rocky Mountains', blurb: 'Steep climbs, loose boulders and rockfall.',
    friction: 2.2, frictionStatic: 3.4,
    skyTop: '#5b86c4', skyBottom: '#dfe9f2', sun: '#ffffff',
    farHill: '#a7b4c4', nearHill: '#7d8a99',
    dirt: '#77706a', dirtDeep: '#55504c', grass: '#7f9a62', grassLight: '#a3bd80',
    leaf: '#3f7a4a', trunk: '#5a4632', rock: '#8c8f96', bush: '#5f8a55', water: '#4a8fc8', mud: '#574a3c',
    backdrop: 'peaks', decor: ['rock', 'rock', 'pine', 'pine', 'bush', 'rock', 'deadtree', 'sign'],
    hill: 0.1, rough: 0.06, bumps: 0.08,
    bias: { boulder: 2, falling: 2.2, hill: 1.6, drop: 1.6, bridge: 1.5, rocks: 1.5 },
  },
  snow: {
    id: 'snow', name: 'Snow Mountain', blurb: 'Slippery ice, freezing water and deep drifts.',
    friction: 0.95, frictionStatic: 1.4,
    skyTop: '#6c8fb8', skyBottom: '#e6f1fa', sun: '#ffffff',
    farHill: '#b6c9dc', nearHill: '#9fb6cc',
    dirt: '#8a8f9a', dirtDeep: '#646a75', grass: '#f2f7fb', grassLight: '#ffffff',
    leaf: '#2f6b4f', trunk: '#5c4a3a', rock: '#7c8490', bush: '#dfe9f1', water: '#7fc4e8', mud: '#6f7480',
    backdrop: 'peaks', decor: ['pine', 'pine', 'pine', 'rock', 'bush', 'deadtree', 'sign', 'pine'],
    hill: 0.04, rough: 0, bumps: 0.02,
    bias: { water: 2.2, hill: 1.5, platform: 1.5, bridge: 1.4, logs: 1.2 },
  },
  jungle: {
    id: 'jungle', name: 'Jungle Expedition', blurb: 'Rope bridges, rivers and thick mud.',
    friction: 2.3, frictionStatic: 3.6,
    skyTop: '#3f8f7a', skyBottom: '#c9ecd0', sun: '#fff2b3',
    farHill: '#6fa58a', nearHill: '#3f7f55',
    dirt: '#6a4630', dirtDeep: '#4a3022', grass: '#2f8a3a', grassLight: '#55b650',
    leaf: '#1f7a3a', trunk: '#5a3d24', rock: '#707a70', bush: '#2c7f3c', water: '#3f9a8a', mud: '#4a3320',
    backdrop: 'treeline', decor: ['palm', 'palm', 'tree', 'bush', 'bush', 'rock', 'reed', 'tree'],
    hill: 0.05, rough: 0.1, bumps: 0.06,
    bias: { bridge: 2.4, water: 1.8, mud: 1.8, logs: 1.6, platform: 1.3 },
  },
  swamp: {
    id: 'swamp', name: 'Mud Marsh', blurb: 'Bog after bog. Keep your momentum.',
    friction: 1.7, frictionStatic: 2.6,
    skyTop: '#5f7f78', skyBottom: '#cfd9bf', sun: '#f4efc0',
    farHill: '#8a9d86', nearHill: '#5f7a58',
    dirt: '#5a4a34', dirtDeep: '#3e3324', grass: '#5d7f3a', grassLight: '#86a756',
    leaf: '#4a6e34', trunk: '#4a3a28', rock: '#6c7268', bush: '#557a3a', water: '#4f7f6a', mud: '#453220',
    backdrop: 'treeline', decor: ['reed', 'reed', 'deadtree', 'deadtree', 'bush', 'tree', 'rock', 'reed'],
    hill: -0.06, rough: 0.12, bumps: 0.05,
    bias: { mud: 3.2, water: 2.4, logs: 1.6, bridge: 1.4, barrels: 1.2 },
  },
  city: {
    id: 'city', name: 'Neon City', blurb: 'Night streets: roadworks, ramps and broken overpasses.',
    friction: 2.6, frictionStatic: 4.2,
    skyTop: '#141a3a', skyBottom: '#4a3f78', sun: '#f5f1d8',
    farHill: '#2a2f58', nearHill: '#1d2140',
    dirt: '#3a3d48', dirtDeep: '#24262e', grass: '#565a66', grassLight: '#f2c94c',
    leaf: '#2f6b4f', trunk: '#3a3a44', rock: '#6a6e78', bush: '#2f5f4a', water: '#2f6fb0', mud: '#2e2a26',
    backdrop: 'skyline', decor: ['lamp', 'lamp', 'cone', 'cone', 'sign', 'fence', 'bush', 'lamp'],
    night: true,
    hill: -0.14, rough: -0.1, bumps: 0.04,
    bias: { crates: 2.2, barrels: 2.2, ramp: 2, gap: 2, platform: 1.8, bridge: 1.2, rocks: 0.5, logs: 0.4, hill: 0.6 },
  },
  canyon: {
    id: 'canyon', name: 'Red Canyon', blurb: 'Cliff drops, long gaps and rockfall at sunset.',
    friction: 2.2, frictionStatic: 3.4,
    skyTop: '#c2553a', skyBottom: '#f6c58a', sun: '#ffe2a8',
    farHill: '#b86a4a', nearHill: '#9a4a34',
    dirt: '#a8553a', dirtDeep: '#7a3a28', grass: '#c9764a', grassLight: '#e39a62',
    leaf: '#7a8a3a', trunk: '#6a4630', rock: '#a0624a', bush: '#8a7a3a', water: '#4a9ab0', mud: '#6e3e2a',
    backdrop: 'mesas', decor: ['rock', 'rock', 'cactus', 'deadtree', 'bush', 'rock', 'sign', 'cactus'],
    hill: 0.1, rough: 0.08, bumps: 0.1,
    bias: { drop: 2.4, gap: 2, falling: 1.8, bridge: 1.6, boulder: 1.5, roller: 1.4 },
  },
  volcano: {
    id: 'volcano', name: 'Volcanic Wasteland', blurb: 'Everything at once, under falling ash.',
    friction: 2.1, frictionStatic: 3.2,
    skyTop: '#2a1a22', skyBottom: '#c2502a', sun: '#ffb070',
    farHill: '#5a2a26', nearHill: '#3a2022',
    dirt: '#3a3234', dirtDeep: '#241e20', grass: '#4a4042', grassLight: '#ff7a3a',
    leaf: '#4a4a3a', trunk: '#2e2626', rock: '#55484a', bush: '#5a4a3a', water: '#ff6a2a', mud: '#2a2022',
    backdrop: 'volcano', decor: ['deadtree', 'deadtree', 'rock', 'rock', 'rock', 'sign', 'deadtree', 'rock'],
    night: true,
    hill: 0.12, rough: 0.12, bumps: 0.12,
    bias: { falling: 2.4, roller: 2.2, gap: 1.8, drop: 1.5, platform: 1.5, boulder: 1.4 },
  },
};
