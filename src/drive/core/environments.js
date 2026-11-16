// Region environments: terrain shape, vegetation and colour. Pure data shared
// by the physics core (hills, off-road surface, tree colliders) and the renderer.
export const ENVIRONMENTS = {
  forest: {
    name: 'Forest Trails',
    off: 'grass', hillAmp: 14, detailAmp: 0.55, offRough: 0.10, offWavy: 0.22,
    trees: 0.55, treeKind: 'mixed', boulders: 0.03, bushes: 0.25,
    grass: [0.26, 0.42, 0.17], grass2: [0.33, 0.47, 0.20], cliff: [0.40, 0.37, 0.33],
    sky: [0.55, 0.74, 0.90], horizon: [0.80, 0.88, 0.92], fog: [0.72, 0.82, 0.86], fogFar: 260,
    sun: [1.0, 0.96, 0.86], ambient: 0.62, foliage: [0.16, 0.36, 0.14], foliage2: [0.24, 0.42, 0.16], trunk: [0.33, 0.24, 0.15]
  },
  mud: {
    name: 'Mud Valley',
    off: 'grass', hillAmp: 9, detailAmp: 0.45, offRough: 0.10, offWavy: 0.22,
    trees: 0.22, treeKind: 'broad', boulders: 0.02, bushes: 0.35,
    grass: [0.30, 0.36, 0.17], grass2: [0.36, 0.34, 0.18], cliff: [0.36, 0.30, 0.24],
    sky: [0.52, 0.60, 0.66], horizon: [0.70, 0.74, 0.74], fog: [0.62, 0.66, 0.65], fogFar: 210,
    sun: [0.92, 0.90, 0.84], ambient: 0.70, foliage: [0.22, 0.34, 0.14], foliage2: [0.30, 0.36, 0.15], trunk: [0.30, 0.22, 0.15]
  },
  rocky: {
    name: 'Rocky Mountains',
    off: 'scree', hillAmp: 34, detailAmp: 0.9, offRough: 0.22, offWavy: 0.30,
    trees: 0.10, treeKind: 'pine', boulders: 0.16, bushes: 0.08,
    grass: [0.46, 0.43, 0.38], grass2: [0.40, 0.40, 0.33], cliff: [0.44, 0.41, 0.38],
    sky: [0.45, 0.66, 0.90], horizon: [0.80, 0.86, 0.92], fog: [0.74, 0.80, 0.86], fogFar: 300,
    sun: [1.0, 0.95, 0.85], ambient: 0.58, foliage: [0.14, 0.30, 0.16], foliage2: [0.18, 0.34, 0.18], trunk: [0.30, 0.22, 0.15]
  },
  ridge: {
    name: 'Deadly Ridge',
    off: 'scree', hillAmp: 44, detailAmp: 1.0, offRough: 0.25, offWavy: 0.32,
    trees: 0.04, treeKind: 'pine', boulders: 0.14, bushes: 0.05,
    grass: [0.50, 0.42, 0.34], grass2: [0.44, 0.38, 0.30], cliff: [0.46, 0.38, 0.32],
    sky: [0.80, 0.62, 0.48], horizon: [0.95, 0.80, 0.62], fog: [0.86, 0.74, 0.62], fogFar: 280,
    sun: [1.0, 0.82, 0.62], ambient: 0.55, foliage: [0.20, 0.30, 0.14], foliage2: [0.26, 0.32, 0.16], trunk: [0.30, 0.22, 0.15]
  },
  snow: {
    name: 'Extreme Expedition',
    off: 'deepsnow', hillAmp: 38, detailAmp: 0.6, offRough: 0.08, offWavy: 0.20,
    trees: 0.12, treeKind: 'snowpine', boulders: 0.06, bushes: 0,
    grass: [0.92, 0.94, 0.97], grass2: [0.86, 0.90, 0.95], cliff: [0.52, 0.55, 0.60],
    sky: [0.62, 0.72, 0.84], horizon: [0.88, 0.91, 0.95], fog: [0.86, 0.89, 0.93], fogFar: 240,
    sun: [0.96, 0.97, 1.0], ambient: 0.78, foliage: [0.20, 0.34, 0.26], foliage2: [0.86, 0.90, 0.94], trunk: [0.28, 0.22, 0.17]
  }
};
