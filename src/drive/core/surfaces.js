// Terrain surface physics table. Every number here changes how the 4x4 drives.
//   grip  - tyre friction coefficient
//   roll  - rolling resistance (fraction of wheel load)
//   sink  - how far a tyre sinks in just by standing on it (m)
//   dig   - how much further a SPINNING tyre can dig itself in (m)
//   drag  - viscous drag per metre of sink (N s/m per wheel)
//   rough - extra high-frequency vibration (camera / audio only)
//   color - base vertex colour (linear-ish RGB 0..1)
export const SURFACES = {
  dirt:     { grip: 0.95, roll: 0.022, sink: 0.00, dig: 0.02, drag: 0,    rough: 0.25, color: [0.47, 0.35, 0.23] },
  gravel:   { grip: 0.85, roll: 0.030, sink: 0.01, dig: 0.03, drag: 0,    rough: 0.45, color: [0.52, 0.49, 0.44] },
  grass:    { grip: 0.78, roll: 0.045, sink: 0.02, dig: 0.03, drag: 25,   rough: 0.35, color: [0.30, 0.46, 0.20] },
  mud:      { grip: 0.52, roll: 0.085, sink: 0.08, dig: 0.17, drag: 170,  rough: 0.20, color: [0.29, 0.20, 0.13] },
  deepmud:  { grip: 0.40, roll: 0.115, sink: 0.13, dig: 0.20, drag: 340,  rough: 0.15, color: [0.21, 0.14, 0.09] },
  bog:      { grip: 0.30, roll: 0.170, sink: 0.20, dig: 0.26, drag: 540,  rough: 0.10, color: [0.16, 0.11, 0.07] },
  deepsand: { grip: 0.56, roll: 0.110, sink: 0.10, dig: 0.20, drag: 250,  rough: 0.10, color: [0.84, 0.70, 0.46] },
  ash:      { grip: 0.56, roll: 0.050, sink: 0.04, dig: 0.10, drag: 95,   rough: 0.20, color: [0.20, 0.19, 0.19] },
  lavarock: { grip: 0.98, roll: 0.025, sink: 0.00, dig: 0.00, drag: 0,    rough: 0.85, color: [0.10, 0.09, 0.09] },
  lava:     { grip: 0.65, roll: 0.075, sink: 0.05, dig: 0.00, drag: 180,  rough: 0.30, color: [2.2, 0.62, 0.10], hot: true },
  rock:     { grip: 1.05, roll: 0.018, sink: 0.00, dig: 0.00, drag: 0,    rough: 0.70, color: [0.48, 0.47, 0.46] },
  wetrock:  { grip: 0.68, roll: 0.018, sink: 0.00, dig: 0.00, drag: 0,    rough: 0.70, color: [0.33, 0.34, 0.36] },
  riverbed: { grip: 0.60, roll: 0.055, sink: 0.04, dig: 0.07, drag: 125,  rough: 0.60, color: [0.36, 0.33, 0.28] },
  sand:     { grip: 0.66, roll: 0.075, sink: 0.05, dig: 0.14, drag: 150,  rough: 0.15, color: [0.76, 0.66, 0.45] },
  snow:     { grip: 0.50, roll: 0.060, sink: 0.06, dig: 0.10, drag: 130,  rough: 0.15, color: [0.76, 0.82, 0.90] },
  deepsnow: { grip: 0.43, roll: 0.100, sink: 0.12, dig: 0.16, drag: 270,  rough: 0.10, color: [0.96, 0.97, 1.00] },
  ice:      { grip: 0.16, roll: 0.012, sink: 0.00, dig: 0.00, drag: 0,    rough: 0.05, color: [0.66, 0.80, 0.90] },
  wood:     { grip: 0.88, roll: 0.020, sink: 0.00, dig: 0.00, drag: 0,    rough: 0.55, color: [0.45, 0.33, 0.20] },
  scree:    { grip: 0.67, roll: 0.055, sink: 0.03, dig: 0.08, drag: 70,   rough: 0.80, color: [0.50, 0.46, 0.42] },
  asphalt:  { grip: 1.10, roll: 0.013, sink: 0.00, dig: 0.00, drag: 0,    rough: 0.06, color: [0.17, 0.17, 0.18] }
};
for (const [name, s] of Object.entries(SURFACES)) s.name = name;

export const SURFACE_LIST = Object.values(SURFACES);
SURFACE_LIST.forEach((s, i) => { s.id = i; });

/**
 * Tyre compounds. `grip` multiplies surface grip, `sink` multiplies how far the
 * tyre sinks (wide flotation tyres ride higher), `selfClean` is how much grip a
 * spinning tyre keeps in clogging surfaces.
 */
export const TIRES = {
  at: {
    name: 'All-Terrain', price: 0,
    desc: 'Balanced on everything, master of nothing.',
    grip: {}, sink: 1.0, dig: 1.0
  },
  mud: {
    name: 'Mud-Terrain', price: 1800,
    desc: 'Deep lugs bite in mud and wet grass. Noisy and vague on rock and ice.',
    grip: { mud: 1.5, deepmud: 1.6, bog: 1.6, deepsand: 1.2, ash: 1.15, grass: 1.2, riverbed: 1.15, sand: 1.1, rock: 0.9, wetrock: 0.88, ice: 0.85 },
    sink: 0.72, dig: 0.6
  },
  rock: {
    name: 'Rock Crawler', price: 2400,
    desc: 'Soft sticky compound. Clings to rock and wet stone, clogs fast in mud.',
    grip: { rock: 1.28, wetrock: 1.45, lavarock: 1.25, gravel: 1.15, scree: 1.25, riverbed: 1.2, wood: 1.15, mud: 0.85, deepmud: 0.8, snow: 0.9 },
    sink: 1.0, dig: 1.1
  },
  snow: {
    name: 'Studded Snow', price: 3000,
    desc: 'Studs and sipes for snow and ice. Wears out its welcome on dry rock.',
    grip: { snow: 1.5, deepsnow: 1.5, ice: 2.5, rock: 0.9, dirt: 0.95, mud: 0.95 },
    sink: 0.8, dig: 0.7
  }
};

export function tireGrip(tireId, surfaceName) {
  const t = TIRES[tireId] || TIRES.at;
  return t.grip[surfaceName] || 1;
}

/** Weather presets: grip multipliers per surface group + visibility. */
export const WEATHER = {
  clear:     { name: 'Clear',        grip: 1.0,  wet: 0,   fog: 1.0,  rain: 0,   snow: 0,   wind: 0.1 },
  overcast:  { name: 'Overcast',     grip: 1.0,  wet: 0,   fog: 0.8,  rain: 0,   snow: 0,   wind: 0.2 },
  rain:      { name: 'Rain',         grip: 0.86, wet: 0.6, fog: 0.65, rain: 0.5, snow: 0,   wind: 0.3 },
  heavyrain: { name: 'Heavy Rain',   grip: 0.74, wet: 1.0, fog: 0.45, rain: 1.0, snow: 0,   wind: 0.5 },
  fog:       { name: 'Fog',          grip: 0.95, wet: 0.2, fog: 0.28, rain: 0,   snow: 0,   wind: 0.1 },
  snow:      { name: 'Light Snow',   grip: 0.95, wet: 0,   fog: 0.6,  rain: 0,   snow: 0.4, wind: 0.3 },
  blizzard:  { name: 'Blizzard',     grip: 0.85, wet: 0,   fog: 0.22, rain: 0,   snow: 1.0, wind: 1.0 },
  sandstorm: { name: 'Sandstorm',    grip: 0.92, wet: 0,   fog: 0.26, rain: 0,   snow: 0,   wind: 1.0, dust: 1.0 },
  haze:      { name: 'Heat Haze',    grip: 1.0,  wet: 0,   fog: 0.7,  rain: 0,   snow: 0,   wind: 0.3, dust: 0.25 },
  mist:      { name: 'Jungle Mist',  grip: 0.93, wet: 0.5, fog: 0.5,  rain: 0.12, snow: 0,  wind: 0.1 },
  ashfall:   { name: 'Ash Fall',     grip: 0.9,  wet: 0,   fog: 0.42, rain: 0,   snow: 0,   wind: 0.4, ash: 1.0 }
};

/** Rain turns rock into wet rock and makes everything except snow/ice slicker. */
export function weatherSurface(surface, weather) {
  if (weather.wet > 0.4 && surface === SURFACES.rock) return SURFACES.wetrock;
  return surface;
}
