// Deterministic coin / fuel placement. The world is split into cells of CELL px;
// every cell decides independently what it contains, so chunks can be streamed
// in any order and totals can be computed up-front for star ratings.
import { hashFloat } from './rng.js';

export const CELL = 600;
export const COIN_SPACING = 38;

/**
 * @param {{seed:number, coinRate:number, fuelInterval:number, fuelPhase:number}} cfg
 * @param {number} k cell index (cell 0 is the start area and stays empty)
 * @param {(x:number)=>number} surfaceY
 * @returns {{type:'coin'|'fuel', x:number, y:number}[]}
 */
export function pickupsForCell(cfg, k, surfaceY) {
  const out = [];
  if (k < 1) return out;

  const isFuel = k >= 3 && (k + cfg.fuelPhase) % cfg.fuelInterval === 0;
  if (isFuel) {
    const x = k * CELL + 200 + hashFloat(cfg.seed + 13, k) * 200;
    out.push({ type: 'fuel', x, y: surfaceY(x) - 46 });
    return out; // the can is the reward for this cell
  }

  if (hashFloat(cfg.seed + 12, k) < cfg.coinRate) {
    const n = 4 + Math.floor(hashFloat(cfg.seed + 14, k) * 4); // 4..7
    const startX = k * CELL + 60 + hashFloat(cfg.seed + 15, k) * 240;
    for (let i = 0; i < n; i++) {
      const x = startX + i * COIN_SPACING;
      const arc = Math.sin((i / (n - 1)) * Math.PI) * 34;
      out.push({ type: 'coin', x, y: surfaceY(x) - 42 - arc });
    }
  }
  return out;
}

export function countCoins(cfg, length) {
  let total = 0;
  const kMax = Math.floor((length - 120) / CELL);
  for (let k = 1; k <= kMax; k++) {
    for (const p of pickupsForCell(cfg, k, () => 0)) {
      if (p.type === 'coin' && p.x < length - 80) total++;
    }
  }
  return total;
}
