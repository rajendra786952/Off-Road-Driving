// Region environments: terrain shape, vegetation, colour and sky. Pure data shared
// by the physics core (hills, off-road surface, tree colliders) and the renderer.
//
// sky: { style, cover, scale, soft, cloud:[r,g,b] }  style = cumulus | overcast | wisps | storm | haze | ash
// silhouette: ridges | rolling | alpine | crags | snowpeaks | dunes | canopy | volcano
// hdr: photographic sky in public/environments, used on Medium and above for the clear-day sky and for
//      reflections on the truck and water. hdrLift = how far above the photo's horizon sampling starts, so
//      only its sky shows. hdrSky: false = reflections only (the jungle photo is all canopy). The volcano keeps its ash sky.
export const ENVIRONMENTS = {
  forest: {
    name: 'Forest Trails',
    off: 'grass', hillAmp: 14, detailAmp: 0.55, offRough: 0.10, offWavy: 0.22,
    trees: 0.76, treeKind: 'mixed', boulders: 0.03, bushes: 0.25, treeClearance: 1.8,
    grass: [0.26, 0.42, 0.17], grass2: [0.33, 0.47, 0.20], cliff: [0.40, 0.37, 0.33],
    sky: [0.32, 0.56, 0.74], horizon: [0.78, 0.86, 0.82], fog: [0.624, 0.722, 0.659], fogFar: 220,
    fogExp: true, fogDensity: 0.0078,
    sun: [1.0, 0.902, 0.741], ambient: 0.72,
    foliage: [0.12, 0.24, 0.13], foliage2: [0.17, 0.30, 0.15], trunk: [0.28, 0.18, 0.11],
    foliagePalette: [[0.11, 0.21, 0.12], [0.14, 0.26, 0.14], [0.17, 0.30, 0.15], [0.09, 0.18, 0.11]],
    skyStyle: { style: 'cumulus', cover: 0.42, scale: 1.0, cloud: [1.0, 1.0, 1.0] }, silhouette: 'ridges'
  },
  mud: {
    name: 'Mud Valley',
    off: 'grass', hillAmp: 9, detailAmp: 0.45, offRough: 0.10, offWavy: 0.22,
    trees: 0.22, treeKind: 'broad', boulders: 0.02, bushes: 0.35,
    grass: [0.30, 0.36, 0.17], grass2: [0.36, 0.34, 0.18], cliff: [0.36, 0.30, 0.24],
    sky: [0.38, 0.44, 0.50], horizon: [0.62, 0.66, 0.68], fog: [0.60, 0.64, 0.64], fogFar: 210,
    sun: [0.92, 0.90, 0.84], ambient: 0.70, foliage: [0.22, 0.34, 0.14], foliage2: [0.30, 0.36, 0.15], trunk: [0.30, 0.22, 0.15],
    skyStyle: { style: 'overcast', cover: 0.92, scale: 0.7, cloud: [0.62, 0.65, 0.68] }, silhouette: 'rolling'
  },
  rocky: {
    name: 'Rocky Mountains',
    off: 'scree', hillAmp: 34, detailAmp: 0.9, offRough: 0.22, offWavy: 0.30,
    trees: 0.10, treeKind: 'pine', boulders: 0.16, bushes: 0.08,
    grass: [0.46, 0.43, 0.38], grass2: [0.40, 0.40, 0.33], cliff: [0.44, 0.41, 0.38],
    sky: [0.22, 0.48, 0.90], horizon: [0.76, 0.86, 0.95], fog: [0.74, 0.80, 0.86], fogFar: 300,
    sun: [1.0, 0.95, 0.85], ambient: 0.58, foliage: [0.14, 0.30, 0.16], foliage2: [0.18, 0.34, 0.18], trunk: [0.30, 0.22, 0.15],
    skyStyle: { style: 'wisps', cover: 0.3, scale: 1.6, cloud: [1.0, 1.0, 1.0] }, silhouette: 'alpine'
  },
  ridge: {
    name: 'Deadly Ridge',
    off: 'scree', hillAmp: 44, detailAmp: 1.0, offRough: 0.25, offWavy: 0.32,
    trees: 0.04, treeKind: 'pine', boulders: 0.14, bushes: 0.05,
    grass: [0.50, 0.42, 0.34], grass2: [0.44, 0.38, 0.30], cliff: [0.46, 0.38, 0.32],
    sky: [0.40, 0.38, 0.52], horizon: [0.95, 0.72, 0.52], fog: [0.84, 0.72, 0.62], fogFar: 280,
    sun: [1.0, 0.82, 0.62], ambient: 0.55, foliage: [0.20, 0.30, 0.14], foliage2: [0.26, 0.32, 0.16], trunk: [0.30, 0.22, 0.15],
    skyStyle: { style: 'storm', cover: 0.62, scale: 0.9, cloud: [0.95, 0.72, 0.58] }, silhouette: 'crags'
  },
  snow: {
    name: 'Extreme Expedition',
    off: 'deepsnow', hillAmp: 38, detailAmp: 0.6, offRough: 0.08, offWavy: 0.20,
    trees: 0.12, treeKind: 'snowpine', boulders: 0.06, bushes: 0,
    grass: [0.92, 0.94, 0.97], grass2: [0.86, 0.90, 0.95], cliff: [0.52, 0.55, 0.60],
    sky: [0.46, 0.60, 0.80], horizon: [0.88, 0.92, 0.97], fog: [0.86, 0.89, 0.93], fogFar: 240,
    sun: [0.96, 0.97, 1.0], ambient: 0.78, foliage: [0.20, 0.34, 0.26], foliage2: [0.86, 0.90, 0.94], trunk: [0.28, 0.22, 0.17],
    skyStyle: { style: 'overcast', cover: 0.7, scale: 1.2, cloud: [0.92, 0.95, 1.0] }, silhouette: 'snowpeaks', albedo: 0.86
  },
  desert: {
    name: 'Desert Storm',
    off: 'sand', hillAmp: 16, detailAmp: 0.35, offRough: 0.05, offWavy: 0.34,
    trees: 0.035, treeKind: 'desert', boulders: 0.05, bushes: 0.06,
    grass: [0.80, 0.66, 0.42], grass2: [0.86, 0.72, 0.48], cliff: [0.66, 0.46, 0.30],
    sky: [0.24, 0.52, 0.86], horizon: [0.96, 0.84, 0.62], fog: [0.92, 0.80, 0.60], fogFar: 320,
    sun: [1.0, 0.93, 0.78], ambient: 0.74, foliage: [0.30, 0.44, 0.22], foliage2: [0.42, 0.50, 0.26], trunk: [0.46, 0.36, 0.22],
    skyStyle: { style: 'haze', cover: 0.12, scale: 2.0, cloud: [1.0, 0.95, 0.85] }, silhouette: 'dunes', hot: 1, albedo: 0.78
  },
  jungle: {
    name: 'Jungle Expedition',
    off: 'grass', hillAmp: 20, detailAmp: 0.7, offRough: 0.14, offWavy: 0.28,
    trees: 0.78, treeKind: 'jungle', boulders: 0.03, bushes: 0.6,
    grass: [0.14, 0.36, 0.13], grass2: [0.20, 0.42, 0.14], cliff: [0.30, 0.32, 0.26],
    sky: [0.26, 0.56, 0.74], horizon: [0.74, 0.88, 0.82], fog: [0.62, 0.78, 0.70], fogFar: 190,
    sun: [1.0, 0.97, 0.82], ambient: 0.66, foliage: [0.08, 0.34, 0.12], foliage2: [0.16, 0.46, 0.14], trunk: [0.26, 0.20, 0.13],
    skyStyle: { style: 'cumulus', cover: 0.66, scale: 0.6, cloud: [0.96, 1.0, 0.96] }, silhouette: 'canopy'
  },
  volcano: {
    name: 'Volcanic Wasteland',
    off: 'ash', hillAmp: 40, detailAmp: 1.1, offRough: 0.24, offWavy: 0.30,
    trees: 0.02, treeKind: 'dead', boulders: 0.2, bushes: 0,
    grass: [0.17, 0.16, 0.16], grass2: [0.23, 0.20, 0.19], cliff: [0.11, 0.10, 0.10],
    sky: [0.13, 0.10, 0.12], horizon: [0.62, 0.26, 0.12], fog: [0.36, 0.22, 0.17], fogFar: 250,
    sun: [1.0, 0.62, 0.40], ambient: 0.50, foliage: [0.14, 0.12, 0.11], foliage2: [0.18, 0.15, 0.13], trunk: [0.12, 0.10, 0.09],
    skyStyle: { style: 'ash', cover: 0.82, scale: 0.8, cloud: [0.30, 0.22, 0.20] }, silhouette: 'volcano', hot: 0.7
  }
};
