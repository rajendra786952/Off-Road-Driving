import { Preferences } from '@capacitor/preferences';
import { defaultSave, migrateSave, MAX_UPGRADE, upgradeCost } from '../core/saveModel.js';
import { UNLOCK_ALL_TRACKS } from '../config/constants.js';

// Capacitor Preferences = native SharedPreferences on Android, and falls back to
// localStorage in the browser, so the same code works in `npm run dev`.
const SAVE_KEY = 'trailTorqueSave';

let writeQueue = Promise.resolve();

export const SaveSystem = {
  /** Always the live, in-memory save. Mutate through the helpers below. */
  data: defaultSave(),

  async init() {
    try {
      const result = await Preferences.get({ key: SAVE_KEY });
      this.data = migrateSave(result.value ? JSON.parse(result.value) : null);
    } catch (error) {
      console.error('Save load failed, starting fresh', error);
      this.data = defaultSave();
    }
    return this.data;
  },

  /** Serialised writes so two quick saves can never land out of order. */
  persist() {
    const json = JSON.stringify(this.data);
    writeQueue = writeQueue
      .then(() => Preferences.set({ key: SAVE_KEY, value: json }))
      .catch((error) => console.error('Save write failed', error));
    return writeQueue;
  },

  async reset() {
    this.data = defaultSave();
    writeQueue = writeQueue.then(() => Preferences.remove({ key: SAVE_KEY })).catch(() => {});
    return writeQueue;
  },

  // ---- coins -----------------------------------------------------------
  addCoins(n) {
    if (n <= 0) return;
    this.data.coins += n;
    this.data.stats.totalCoins += n;
  },

  // ---- vehicles / upgrades ---------------------------------------------
  getUpgrades(vehicleId) {
    return this.data.upgrades[vehicleId];
  },

  isUnlocked(vehicleId) {
    return this.data.unlockedVehicles.includes(vehicleId);
  },

  buyVehicle(vehicle) {
    if (this.isUnlocked(vehicle.id) || this.data.coins < vehicle.price) return false;
    this.data.coins -= vehicle.price;
    this.data.unlockedVehicles.push(vehicle.id);
    this.data.selectedVehicle = vehicle.id;
    this.persist();
    return true;
  },

  selectVehicle(vehicleId) {
    if (!this.isUnlocked(vehicleId)) return false;
    this.data.selectedVehicle = vehicleId;
    this.persist();
    return true;
  },

  buyUpgrade(vehicleId, key) {
    if (!this.isUnlocked(vehicleId)) return false;
    const ups = this.data.upgrades[vehicleId];
    const level = ups[key];
    if (level >= MAX_UPGRADE) return false;
    const cost = upgradeCost(key, level);
    if (this.data.coins < cost) return false;
    this.data.coins -= cost;
    ups[key] = level + 1;
    this.persist();
    return true;
  },

  /** One-off equipment for the 3D expedition (diff locks, winch). */
  buyGear(vehicleId, key, price) {
    const g = this.data.gear[vehicleId];
    if (!this.isUnlocked(vehicleId) || !g || g[key] || this.data.coins < price) return false;
    this.data.coins -= price;
    g[key] = true;
    this.persist();
    return true;
  },

  buyTire(vehicleId, tireId, price) {
    const t = this.data.tires[vehicleId];
    if (!this.isUnlocked(vehicleId) || !t || t.owned.includes(tireId) || this.data.coins < price) return false;
    this.data.coins -= price;
    t.owned.push(tireId);
    t.sel = tireId;
    this.persist();
    return true;
  },

  buyPaint(vehicleId, paintId, price) {
    const p = this.data.paint[vehicleId];
    if (!this.isUnlocked(vehicleId) || !p || p.owned.includes(paintId) || this.data.coins < price) return false;
    this.data.coins -= price;
    p.owned.push(paintId);
    p.sel = paintId;
    this.persist();
    return true;
  },

  selectPaint(vehicleId, paintId) {
    const p = this.data.paint[vehicleId];
    if (!p || !p.owned.includes(paintId)) return false;
    p.sel = paintId;
    this.persist();
    return true;
  },

  selectTire(vehicleId, tireId) {
    const t = this.data.tires[vehicleId];
    if (!t || !t.owned.includes(tireId)) return false;
    t.sel = tireId;
    this.persist();
    return true;
  },

  // ---- progress --------------------------------------------------------
  isLevelUnlocked(levelId) {
    if (UNLOCK_ALL_TRACKS) return true;
    return levelId === 1 || (this.data.levels[levelId - 1]?.stars || 0) > 0;
  },

  recordLevel(levelId, stars, coinsCollected) {
    const prev = this.data.levels[levelId] || { stars: 0, bestCoins: 0 };
    this.data.levels[levelId] = {
      stars: Math.max(prev.stars, stars),
      bestCoins: Math.max(prev.bestCoins, coinsCollected)
    };
    this.data.stats.runs++;
    this.persist();
  },

  recordEndless(distance) {
    this.data.stats.runs++;
    if (distance > this.data.bestDistance) this.data.bestDistance = Math.floor(distance);
    this.persist();
  },

  setSetting(key, value) {
    this.data.settings[key] = value;
    this.persist();
  }
};
