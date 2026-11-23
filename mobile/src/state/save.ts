// Pure save-data model: defaults, migration and the economy rules. No React and
// no storage here (store.ts wraps it), so it can be unit-tested.
import { LEVEL_COUNT, getLevel } from '../data/levels';
import {
  MAX_UPGRADE, PAINTS, STARTER_ID, UPGRADE_KEYS, adUnlockCost, defaultUpgrades, getVehicle, upgradeCost,
  type UpgradeKey, type Upgrades,
} from '../data/vehicles';
import type { RunResult } from '../core/world';

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'trail-torque-2d-save';

export type ControlMode = 'pedals' | 'splitscreen';

/** How often frames are drawn: auto drops to a steady 30 on a phone that cannot hold 60. */
export type FrameRate = 'auto' | '60' | '30';

export interface Settings {
  sound: boolean;
  music: boolean;
  vibration: boolean;
  controlMode: ControlMode;
  showFps: boolean;
  frameRate: FrameRate;
}

export interface SaveData {
  version: number;
  coins: number;
  selectedVehicle: string;
  unlockedVehicles: string[];
  upgrades: Record<string, Upgrades>;
  paint: Record<string, { owned: string[]; sel: string }>;
  levels: Record<number, { stars: number; bestCoins: number }>;
  settings: Settings;
  stats: { runs: number; wins: number; totalCoins: number; distance: number };
  /** Progress earned by watching rewarded ads. */
  ads: {
    /** Ads watched towards each ad-unlockable vehicle. */
    cars: Record<string, number>;
    /** Levels opened with an ad instead of by finishing the one before. */
    levels: number[];
    /** Rewarded ads completed in total. */
    watched: number;
  };
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    coins: 0,
    selectedVehicle: STARTER_ID,
    unlockedVehicles: [STARTER_ID],
    upgrades: {},
    paint: {},
    levels: {},
    settings: { sound: true, music: true, vibration: true, controlMode: 'pedals', showFps: false, frameRate: 'auto' },
    stats: { runs: 0, wins: 0, totalCoins: 0, distance: 0 },
    ads: { cars: {}, levels: [], watched: 0 },
  };
}

const int = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) => Math.min(max, Math.max(min, Math.floor(Number(v) || 0)));

/** Accepts anything read from storage and returns a valid save. */
export function migrateSave(raw: unknown): SaveData {
  const base = defaultSave();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, any>;
  const out = base;
  out.coins = int(r.coins);
  if (r.settings && typeof r.settings === 'object') {
    out.settings = {
      sound: r.settings.sound !== false,
      music: r.settings.music !== false,
      vibration: r.settings.vibration !== false,
      controlMode: r.settings.controlMode === 'splitscreen' ? 'splitscreen' : 'pedals',
      showFps: !!r.settings.showFps,
      frameRate: r.settings.frameRate === '60' || r.settings.frameRate === '30' ? r.settings.frameRate : 'auto',
    };
  }
  if (r.stats && typeof r.stats === 'object') {
    out.stats = { runs: int(r.stats.runs), wins: int(r.stats.wins), totalCoins: int(r.stats.totalCoins), distance: int(r.stats.distance) };
  }
  const unlocked: string[] = Array.isArray(r.unlockedVehicles) ? r.unlockedVehicles : [];
  out.unlockedVehicles = [...new Set([STARTER_ID, ...unlocked.filter((id) => typeof id === 'string' && getVehicle(id).id === id)])];
  out.selectedVehicle = out.unlockedVehicles.includes(r.selectedVehicle) ? r.selectedVehicle : STARTER_ID;
  if (r.upgrades && typeof r.upgrades === 'object') {
    for (const id of out.unlockedVehicles) {
      const src = r.upgrades[id];
      if (!src || typeof src !== 'object') continue;
      const u = defaultUpgrades();
      for (const k of UPGRADE_KEYS) u[k] = int(src[k], 1, MAX_UPGRADE);
      out.upgrades[id] = u;
    }
  }
  if (r.paint && typeof r.paint === 'object') {
    for (const id of out.unlockedVehicles) {
      const p = r.paint[id];
      if (!p || !Array.isArray(p.owned)) continue;
      const owned = [...new Set(['stock', ...p.owned.filter((x: unknown) => PAINTS.some((q) => q.id === x))])] as string[];
      out.paint[id] = { owned, sel: owned.includes(p.sel) ? p.sel : 'stock' };
    }
  }
  if (r.ads && typeof r.ads === 'object') {
    if (r.ads.cars && typeof r.ads.cars === 'object') {
      for (const [id, n] of Object.entries<any>(r.ads.cars)) if (adUnlockCost(getVehicle(id)) > 0 && getVehicle(id).id === id) out.ads.cars[id] = int(n, 0, 99);
    }
    if (Array.isArray(r.ads.levels)) out.ads.levels = [...new Set<number>(r.ads.levels.map((n: unknown) => int(n, 0, LEVEL_COUNT)).filter((n: number) => n > 1))];
    out.ads.watched = int(r.ads.watched);
  }
  if (r.levels && typeof r.levels === 'object') {
    for (const [key, v] of Object.entries<any>(r.levels)) {
      const id = int(key, 0, LEVEL_COUNT);
      if (id < 1 || !v) continue;
      out.levels[id] = { stars: int(v.stars, 0, 3), bestCoins: int(v.bestCoins) };
    }
  }
  return out;
}

// ---------------------------------------------------------------- queries
export function upgradesOf(save: SaveData, id: string): Upgrades {
  return save.upgrades[id] ?? defaultUpgrades();
}
export function paintOf(save: SaveData, id: string): { owned: string[]; sel: string } {
  return save.paint[id] ?? { owned: ['stock'], sel: 'stock' };
}
export function isLevelUnlocked(save: SaveData, levelId: number): boolean {
  return levelId <= 1 || (save.levels[levelId - 1]?.stars ?? 0) > 0 || save.ads.levels.includes(levelId);
}
export function highestUnlocked(save: SaveData): number {
  let n = 1;
  while (n < LEVEL_COUNT && isLevelUnlocked(save, n + 1)) n++;
  return n;
}
/**
 * The one level a rewarded ad may open: the first locked one. 0 when nothing
 * qualifies: everything is open, or the level the player is on was itself opened
 * by an ad (skip one level at a time; finish it before skipping another).
 */
export function adUnlockableLevel(save: SaveData): number {
  const current = highestUnlocked(save);
  if (current >= LEVEL_COUNT || save.ads.levels.includes(current)) return 0;
  return current + 1;
}
export function totalStars(save: SaveData): number {
  let s = 0;
  for (const v of Object.values(save.levels)) s += v.stars;
  return s;
}
export function completedLevels(save: SaveData): number {
  return Object.values(save.levels).filter((v) => v.stars > 0).length;
}

// ---------------------------------------------------------------- actions (each returns a new save, or null if not allowed)
export function buyVehicle(save: SaveData, id: string): SaveData | null {
  const v = getVehicle(id);
  if (v.id !== id || save.unlockedVehicles.includes(id) || save.coins < v.price) return null;
  return { ...save, coins: save.coins - v.price, unlockedVehicles: [...save.unlockedVehicles, id], selectedVehicle: id };
}

export function selectVehicle(save: SaveData, id: string): SaveData | null {
  if (!save.unlockedVehicles.includes(id) || save.selectedVehicle === id) return null;
  return { ...save, selectedVehicle: id };
}

export function buyUpgrade(save: SaveData, id: string, key: UpgradeKey): SaveData | null {
  if (!save.unlockedVehicles.includes(id)) return null;
  const ups = upgradesOf(save, id);
  const level = ups[key];
  if (level >= MAX_UPGRADE) return null;
  const cost = upgradeCost(key, level);
  if (save.coins < cost) return null;
  return { ...save, coins: save.coins - cost, upgrades: { ...save.upgrades, [id]: { ...ups, [key]: level + 1 } } };
}

/** Buys the paint if needed, then applies it. */
export function choosePaint(save: SaveData, id: string, paintId: string): SaveData | null {
  if (!save.unlockedVehicles.includes(id)) return null;
  const paint = PAINTS.find((p) => p.id === paintId);
  if (!paint) return null;
  const cur = paintOf(save, id);
  if (cur.owned.includes(paintId)) {
    if (cur.sel === paintId) return null;
    return { ...save, paint: { ...save.paint, [id]: { ...cur, sel: paintId } } };
  }
  if (save.coins < paint.price) return null;
  return { ...save, coins: save.coins - paint.price, paint: { ...save.paint, [id]: { owned: [...cur.owned, paintId], sel: paintId } } };
}

// ---------------------------------------------------------------- rewarded-ad grants
// Each returns the new save, or null if the reward does not apply (already
// owned, already unlocked...), so a reward can never be granted twice.

/** Coins for the "free coins" ad: grows with the player's progress. */
export function freeCoinsAmount(save: SaveData): number {
  return 400 + highestUnlocked(save) * 20;
}

export function grantCoins(save: SaveData, amount: number): SaveData | null {
  const n = Math.floor(amount);
  if (!(n > 0)) return null;
  return { ...save, coins: save.coins + n, stats: { ...save.stats, totalCoins: save.stats.totalCoins + n }, ads: { ...save.ads, watched: save.ads.watched + 1 } };
}

/** One ad watched towards a vehicle; the last one unlocks and selects it. */
export function grantCarAd(save: SaveData, id: string): { save: SaveData; unlocked: boolean; watched: number; needed: number } | null {
  const spec = getVehicle(id);
  const needed = adUnlockCost(spec);
  if (spec.id !== id || needed <= 0 || save.unlockedVehicles.includes(id)) return null;
  const watched = Math.min(needed, (save.ads.cars[id] ?? 0) + 1);
  const unlocked = watched >= needed;
  const ads = { ...save.ads, cars: { ...save.ads.cars, [id]: watched }, watched: save.ads.watched + 1 };
  return {
    save: unlocked ? { ...save, ads, unlockedVehicles: [...save.unlockedVehicles, id], selectedVehicle: id } : { ...save, ads },
    unlocked,
    watched,
    needed,
  };
}

export function grantLevelAd(save: SaveData, levelId: number): SaveData | null {
  if (levelId !== adUnlockableLevel(save)) return null;
  return { ...save, ads: { ...save.ads, levels: [...save.ads.levels, levelId], watched: save.ads.watched + 1 } };
}

export interface Reward {
  coinValue: number;
  /** Coins for the flips landed, paid at the finish line. */
  flipBonus: number;
  bonus: number;
  firstTime: boolean;
  total: number;
  stars: number;
  newBest: boolean;
  unlockedNext: boolean;
}

/** Bank the coins of a finished (or abandoned) run and record level progress. */
export function recordRun(save: SaveData, levelId: number, result: RunResult): { save: SaveData; reward: Reward } {
  const level = getLevel(levelId);
  const prev = save.levels[levelId];
  const firstTime = !(prev && prev.stars > 0);
  const bonus = result.win ? (firstTime ? level.bonus : Math.round(level.bonus * 0.25)) : 0;
  const flipBonus = result.win ? result.flipBonus : 0;
  const total = result.coinValue + bonus + flipBonus;
  const levels = { ...save.levels };
  if (result.win) {
    levels[levelId] = { stars: Math.max(prev?.stars ?? 0, result.stars), bestCoins: Math.max(prev?.bestCoins ?? 0, result.coins) };
  }
  return {
    save: {
      ...save,
      coins: save.coins + total,
      levels,
      stats: {
        runs: save.stats.runs + 1,
        wins: save.stats.wins + (result.win ? 1 : 0),
        totalCoins: save.stats.totalCoins + total,
        distance: save.stats.distance + result.distance,
      },
    },
    reward: {
      coinValue: result.coinValue,
      flipBonus,
      bonus,
      firstTime,
      total,
      stars: result.stars,
      newBest: result.win && result.stars > (prev?.stars ?? 0),
      unlockedNext: result.win && firstTime && levelId < LEVEL_COUNT,
    },
  };
}
