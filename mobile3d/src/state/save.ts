// The save: one JSON document in AsyncStorage (the browser version used Capacitor Preferences),
// the mutations the menus use, and a tiny subscribe/notify store so React re-renders on change.
// The data model itself (defaults, migration, upgrade prices) is the unchanged src/game/core/saveModel.js.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { defaultSave, migrateSave, MAX_UPGRADE, upgradeCost } from '../game/core/saveModel.js';

const SAVE_KEY = 'trailTorque3dSave';

export interface TrackRecord {
  done: boolean; bestTime: number; medal: number; stars: number; objectives: Record<string, boolean>;
  caches: boolean[]; relics: boolean[]; diff: string; runs: number; times: { t: number; v: string; d: string }[];
}
export interface Settings {
  sound: boolean; vibration: boolean; steerMode: 'buttons' | 'slider' | 'tilt'; tutorialDone: boolean; showFps: boolean;
  steerSens: number; camShake: boolean; camera: string; quality: 'auto' | 'low' | 'medium' | 'high'; difficulty: string;
  hud: 'simple' | 'full'; [key: string]: unknown;
}
export interface Save {
  version: number; coins: number; xp: number; selectedVehicle: string; unlockedVehicles: string[];
  upgrades: Record<string, Record<string, number>>;
  gear: Record<string, Record<string, boolean>>;
  tires: Record<string, { owned: string[]; sel: string }>;
  paint: Record<string, { owned: string[]; sel: string }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resume: { trackId: string; difficulty: string; vehicle: string; cp: number; state: any } | null;
  ghosts: Record<string, { s: number[]; d: number[] }>;
  daily: { date: string; done: boolean };
  tracks: Record<string, TrackRecord>;
  achievements: Record<string, boolean>;
  settings: Settings;
  stats: Record<string, number>;
}

let data = defaultSave() as unknown as Save;
let version = 0;
let writeQueue: Promise<unknown> = Promise.resolve();
const subs = new Set<() => void>();

function notify(): void {
  version++;
  subs.forEach((f) => f());
}

export const SaveSystem = {
  /** Always the live, in-memory save. Mutate through the helpers below (or call persist + refresh). */
  get data(): Save {
    return data;
  },

  async init(): Promise<Save> {
    try {
      const raw = await AsyncStorage.getItem(SAVE_KEY);
      data = migrateSave(raw ? JSON.parse(raw) : null) as unknown as Save;
    } catch (error) {
      console.warn('Save load failed, starting fresh', error);
      data = defaultSave() as unknown as Save;
    }
    // ultra needs bloom and 4K shadows, which the phone build does not have
    if ((data.settings.quality as string) === 'ultra') data.settings.quality = 'high';
    notify();
    return data;
  },

  /** Serialised writes so two quick saves can never land out of order. */
  persist(): Promise<unknown> {
    const json = JSON.stringify(data);
    writeQueue = writeQueue.then(() => AsyncStorage.setItem(SAVE_KEY, json)).catch((error) => console.warn('Save write failed', error));
    return writeQueue;
  },

  /** The game changed the save directly (a finished run, a checkpoint): redraw the menus. */
  refresh(): void {
    notify();
  },

  async reset(): Promise<void> {
    data = defaultSave() as unknown as Save;
    writeQueue = writeQueue.then(() => AsyncStorage.removeItem(SAVE_KEY)).catch(() => {});
    notify();
    await writeQueue;
  },

  isUnlocked(vehicleId: string): boolean {
    return data.unlockedVehicles.includes(vehicleId);
  },

  buyVehicle(vehicle: { id: string; price: number }): boolean {
    if (this.isUnlocked(vehicle.id) || data.coins < vehicle.price) return false;
    data.coins -= vehicle.price;
    data.unlockedVehicles.push(vehicle.id);
    data.selectedVehicle = vehicle.id;
    this.persist();
    return true;
  },

  selectVehicle(vehicleId: string): boolean {
    if (!this.isUnlocked(vehicleId)) return false;
    data.selectedVehicle = vehicleId;
    this.persist();
    return true;
  },

  buyUpgrade(vehicleId: string, key: string): boolean {
    if (!this.isUnlocked(vehicleId)) return false;
    const ups = data.upgrades[vehicleId];
    const level = ups[key];
    if (level >= MAX_UPGRADE) return false;
    const cost = upgradeCost(key, level);
    if (data.coins < cost) return false;
    data.coins -= cost;
    ups[key] = level + 1;
    this.persist();
    return true;
  },

  /** One-off equipment (diff locks, winch). */
  buyGear(vehicleId: string, key: string, price: number): boolean {
    const g = data.gear[vehicleId];
    if (!this.isUnlocked(vehicleId) || !g || g[key] || data.coins < price) return false;
    data.coins -= price;
    g[key] = true;
    this.persist();
    return true;
  },

  buyTire(vehicleId: string, tireId: string, price: number): boolean {
    const t = data.tires[vehicleId];
    if (!this.isUnlocked(vehicleId) || !t || t.owned.includes(tireId) || data.coins < price) return false;
    data.coins -= price;
    t.owned.push(tireId);
    t.sel = tireId;
    this.persist();
    return true;
  },

  selectTire(vehicleId: string, tireId: string): boolean {
    const t = data.tires[vehicleId];
    if (!t || !t.owned.includes(tireId)) return false;
    t.sel = tireId;
    this.persist();
    return true;
  },

  buyPaint(vehicleId: string, paintId: string, price: number): boolean {
    const p = data.paint[vehicleId];
    if (!this.isUnlocked(vehicleId) || !p || p.owned.includes(paintId) || data.coins < price) return false;
    data.coins -= price;
    p.owned.push(paintId);
    p.sel = paintId;
    this.persist();
    return true;
  },

  selectPaint(vehicleId: string, paintId: string): boolean {
    const p = data.paint[vehicleId];
    if (!p || !p.owned.includes(paintId)) return false;
    p.sel = paintId;
    this.persist();
    return true;
  },

  setSetting(key: string, value: unknown): void {
    data.settings[key] = value;
    this.persist();
  },
};

/** Run a SaveSystem mutation and refresh the UI. Returns the mutation's result. */
export function act<T>(fn: (s: typeof SaveSystem) => T): T {
  const r = fn(SaveSystem);
  notify();
  return r;
}

/** Re-render when the save changes. The returned object is the live save. */
export function useSave(): Save {
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => version,
    () => version,
  );
  return data;
}
