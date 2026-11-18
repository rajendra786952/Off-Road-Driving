// Pure save-data model: defaults, migration and upgrade economy.
// (SaveSystem.js wraps this with Capacitor Preferences.)

export const SAVE_VERSION = 3;
export const MAX_UPGRADE = 8;   // levels 6-8 are the expensive late-game tiers
// clearance + brakes only matter in the 3D expedition; the classic 2D mode ignores them.
export const UPGRADE_KEYS = ['engine', 'tires', 'suspension', 'fuel', 'clearance', 'brakes'];
export const TIRE_IDS = ['at', 'mud', 'rock', 'snow'];
export const GEAR_KEYS = ['difflock', 'winch'];
export const PAINT_IDS = ['stock', 'sand', 'arctic', 'midnight', 'crimson', 'stealth', 'gold'];
export const VEHICLE_IDS = ['mountain-jeep', 'desert-pickup', 'rally-buggy', 'monster-truck'];
const STARTER = 'mountain-jeep';

export function defaultUpgrades() {
  return { engine: 1, tires: 1, suspension: 1, fuel: 1, clearance: 1, brakes: 1 };
}

export function defaultSave() {
  const upgrades = {};
  const gear = {};
  const tires = {};
  const paint = {};
  for (const id of VEHICLE_IDS) {
    paint[id] = { owned: ['stock'], sel: 'stock' };
    upgrades[id] = defaultUpgrades();
    gear[id] = { difflock: false, winch: false };
    tires[id] = { owned: ['at'], sel: 'at' };
  }
  return {
    version: SAVE_VERSION,
    coins: 0,
    bestDistance: 0,
    selectedVehicle: STARTER,
    unlockedVehicles: [STARTER],
    upgrades,
    gear, // { [vehicleId]: { difflock, winch } }
    tires, // { [vehicleId]: { owned: [tireId], sel: tireId } }
    paint, // { [vehicleId]: { owned: [paintId], sel: paintId } }
    resume: null, // run to pick up from its last checkpoint: { trackId, difficulty, mission, vehicle, cp, state }
    ghosts: {}, // best run per track for the ghost car: { [trackId]: { s: number[], d: number[] } }
    daily: { date: '', done: false }, // daily challenge already paid out for this date
    levels: {}, // classic 2D: { [levelId]: { stars, bestCoins } }
    tracks: {}, // 3D expedition: { [trackId]: { done, bestTime, medal, stars, objectives, caches, runs } }
    xp: 0,
    achievements: {}, // { [id]: true }
    settings: {
      sound: true,
      vibration: true,
      controlMode: 'pedals', // 'pedals' | 'splitscreen'
      steerMode: 'buttons', // 'buttons' | 'slider' | 'tilt'  (a gamepad always works)
      tutorialDone: false,
      showKeyHints: true,
      showFps: false,
      steerSens: 1,
      camShake: true,
      camera: 'chase',
      quality: 'auto',
      difficulty: 'standard'
    },
    stats: { runs: 0, totalCoins: 0, stunts: 0, distance: 0, driveTime: 0, recoveries: 0, tracksDone: 0, caches: 0, golds: 0, cleanRuns: 0, relics: 0, hardcore: 0, nightRuns: 0, cargoRuns: 0, dailies: 0 }
  };
}

const clampLevel = (n) => Math.min(MAX_UPGRADE, Math.max(1, Math.floor(Number(n) || 1)));

export function migrateSave(raw) {
  const base = defaultSave();
  if (!raw || typeof raw !== 'object') return base;

  const out = { ...base };
  out.coins = Math.max(0, Math.floor(Number(raw.coins) || 0));
  out.bestDistance = Math.max(0, Math.floor(Number(raw.bestDistance) || 0));
  out.settings = { ...base.settings, ...(raw.settings || {}) };
  out.stats = { ...base.stats, ...(raw.stats || {}) };

  // Upgrades: v1 was one flat object, v2 is per vehicle.
  const up = raw.upgrades && typeof raw.upgrades === 'object' ? raw.upgrades : {};
  const looksFlat = UPGRADE_KEYS.some((k) => typeof up[k] === 'number');
  for (const id of VEHICLE_IDS) {
    const src = looksFlat ? (id === STARTER ? up : {}) : up[id] || {};
    for (const key of UPGRADE_KEYS) out.upgrades[id][key] = clampLevel(src[key]);
  }

  // 3D equipment + tyres (new in v3; older saves simply get the defaults)
  for (const id of VEHICLE_IDS) {
    const g = raw.gear && raw.gear[id];
    if (g) for (const k of GEAR_KEYS) out.gear[id][k] = !!g[k];
    const t = raw.tires && raw.tires[id];
    if (t && Array.isArray(t.owned)) {
      out.tires[id].owned = [...new Set(['at', ...t.owned.filter((x) => TIRE_IDS.includes(x))])];
      out.tires[id].sel = out.tires[id].owned.includes(t.sel) ? t.sel : 'at';
    }
  }
  for (const id of VEHICLE_IDS) {
    const p = raw.paint && raw.paint[id];
    if (p && Array.isArray(p.owned)) {
      out.paint[id].owned = [...new Set(['stock', ...p.owned.filter((x) => PAINT_IDS.includes(x))])];
      out.paint[id].sel = out.paint[id].owned.includes(p.sel) ? p.sel : 'stock';
    }
  }
  const rs = raw.resume;
  out.resume = rs && typeof rs === 'object' && typeof rs.trackId === 'string' && rs.state && typeof rs.state === 'object' ? rs : null;
  out.ghosts = {};
  if (raw.ghosts && typeof raw.ghosts === 'object') {
    for (const [id, g] of Object.entries(raw.ghosts)) if (g && Array.isArray(g.s) && Array.isArray(g.d)) out.ghosts[id] = { s: g.s, d: g.d };
  }
  if (raw.daily && typeof raw.daily === 'object') out.daily = { date: String(raw.daily.date || ''), done: !!raw.daily.done };
  out.xp = Math.max(0, Math.floor(Number(raw.xp) || 0));
  out.achievements = {};
  if (raw.achievements && typeof raw.achievements === 'object') for (const k of Object.keys(raw.achievements)) out.achievements[k] = true;
  out.tracks = {};
  if (raw.tracks && typeof raw.tracks === 'object') {
    for (const [id, v] of Object.entries(raw.tracks)) {
      if (!v || typeof v !== 'object') continue;
      out.tracks[id] = {
        done: !!v.done,
        bestTime: Math.max(0, Number(v.bestTime) || 0),
        medal: Math.min(3, Math.max(0, Math.floor(Number(v.medal) || 0))),
        stars: Math.min(5, Math.max(0, Math.floor(Number(v.stars) || 0))),
        objectives: v.objectives && typeof v.objectives === 'object' ? { ...v.objectives } : {},
        caches: Array.isArray(v.caches) ? v.caches.map(Boolean) : [],
        relics: Array.isArray(v.relics) ? v.relics.map(Boolean) : [],
        diff: typeof v.diff === 'string' ? v.diff : '',
        runs: Math.max(0, Math.floor(Number(v.runs) || 0)),
        times: Array.isArray(v.times) ? v.times.filter((x) => x && x.t > 0).slice(0, 5).map((x) => ({ t: Number(x.t), v: String(x.v || ''), d: String(x.d || '') })) : []
      };
    }
  }

  // Vehicles
  const unlocked = Array.isArray(raw.unlockedVehicles) ? raw.unlockedVehicles : [];
  out.unlockedVehicles = [...new Set([STARTER, ...unlocked.filter((v) => VEHICLE_IDS.includes(v))])];
  out.selectedVehicle = out.unlockedVehicles.includes(raw.selectedVehicle) ? raw.selectedVehicle : STARTER;

  // Levels (v1 stored `completedLevels: number[]`)
  out.levels = {};
  if (raw.levels && typeof raw.levels === 'object') {
    for (const [id, v] of Object.entries(raw.levels)) {
      out.levels[id] = {
        stars: Math.min(3, Math.max(0, Math.floor(Number(v?.stars) || 0))),
        bestCoins: Math.max(0, Math.floor(Number(v?.bestCoins) || 0))
      };
    }
  }
  if (Array.isArray(raw.completedLevels)) {
    for (const id of raw.completedLevels) out.levels[id] = out.levels[id] || { stars: 1, bestCoins: 0 };
  }

  out.version = SAVE_VERSION;
  return out;
}

const BASE_COST = { engine: 200, tires: 150, suspension: 150, fuel: 120, clearance: 220, brakes: 140 };

/** Cost to upgrade from `level` to `level + 1`. */
export function upgradeCost(key, level) {
  return Math.round((BASE_COST[key] * Math.pow(1.7, level - 1)) / 10) * 10;
}
