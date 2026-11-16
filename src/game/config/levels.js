import { countCoins } from '../core/pickups.js';

const NAMES = [
  'First Roll', 'Meadow Run', 'Pine Ridge', 'Rolling Hills', 'Rocky Creek',
  "Hawk's Climb", 'Stormy Ridge', 'Cliffside', 'Summit Push', 'Torque Master'
];

const LEVEL_THEMES = [
  'green-valley',
  'green-valley',
  'green-valley',
  'desert-storm',
  'desert-storm',
  'desert-storm',
  'snow-mountain',
  'snow-mountain',
  'snow-mountain',
  'jungle-expedition'
];

const LENGTHS = [
  20000,  // Level 1: 1,000 m (1.0 km) - Green Valley
  30000,  // Level 2: 1,500 m (1.5 km) - Green Valley
  40000,  // Level 3: 2,000 m (2.0 km) - Green Valley
  50000,  // Level 4: 2,500 m (2.5 km) - Desert Storm
  60000,  // Level 5: 3,000 m (3.0 km) - Desert Storm
  70000,  // Level 6: 3,500 m (3.5 km) - Desert Storm
  80000,  // Level 7: 4,000 m (4.0 km) - Snow Mountain
  90000,  // Level 8: 4,500 m (4.5 km) - Snow Mountain
  100000, // Level 9: 5,000 m (5.0 km) - Snow Mountain
  120000  // Level 10: 6,000 m (6.0 km) - Jungle Expedition
];

// Ten designed levels spanning 4 distinct worlds (Green Valley, Desert Storm,
// Snow Mountain, Jungle Expedition). Difficulty ramps through hill height,
// roughness, bump frequency, level length (1km to 6km) and fuel-can spacing.
export const LEVELS = NAMES.map((name, i) => ({
  id: i + 1,
  name,
  theme: LEVEL_THEMES[i] || 'green-valley',
  length: LENGTHS[i],
  terrain: {
    seed: 1000 + i * 77,
    hill: 0.68 + i * 0.046,
    rough: 0.50 + i * 0.045,
    bumps: 0.35 + i * 0.055,
    endless: false
  },
  pickups: {
    seed: 5000 + i * 31,
    coinRate: 0.75,
    fuelInterval: 7 + (i >= 3 ? 1 : 0) + (i >= 7 ? 1 : 0),
    fuelPhase: i % 3
  },
  bonus: 150 + i * 50
}));

export function getLevel(id) {
  return LEVELS.find((l) => l.id === id) || LEVELS[0];
}

export function getLevelCoinTotal(level) {
  return countCoins(level.pickups, level.length);
}

export function makeEndlessConfig() {
  const seed = Math.floor(Math.random() * 1e6) + 1;
  const themeKeys = ['green-valley', 'desert-storm', 'snow-mountain', 'jungle-expedition'];
  const theme = themeKeys[Math.floor(Math.random() * themeKeys.length)];
  return {
    id: 'endless',
    name: 'Endless',
    theme,
    length: Infinity,
    terrain: { seed, hill: 1, rough: 1, bumps: 1, endless: true },
    pickups: { seed: seed + 9000, coinRate: 0.7, fuelInterval: 7, fuelPhase: seed % 4 },
    bonus: 0
  };
}

export function starsForRatio(ratio) {
  if (ratio >= 0.9) return 3;
  if (ratio >= 0.6) return 2;
  return 1;
}
