// Deterministic coin / fuel placement (same rules as the original game). The
// world is split into cells of CELL px; every cell decides independently what it
// contains, so chunks can be streamed and totals computed up-front for stars.
import { hashFloat } from './rng';
import { chasmAt, liquidAt, type Feature } from './features';

export const CELL = 600;
export const COIN_SPACING = 38;

export interface PickupConfig {
  seed: number;
  coinRate: number;
  fuelInterval: number;
  fuelPhase: number;
}

export interface PickupSpot {
  type: 'coin' | 'fuel';
  x: number;
  y: number;
}

export function pickupsForCell(
  cfg: PickupConfig,
  k: number,
  surfaceY: (x: number) => number,
  features: Feature[] = [],
): PickupSpot[] {
  const out: PickupSpot[] = [];
  if (k < 1) return out;

  /** Height a pickup floats at: over a hole it follows the jump, in a pit it sits on the liquid. */
  const floatY = (x: number, lift: number) => {
    const hole = chasmAt(features, x);
    if (hole) return surfaceY(hole.a - 30) - lift - 40;
    const pit = liquidAt(features, x);
    if (pit) return surfaceY(pit.a - 10) - lift + 6;
    return surfaceY(x) - lift;
  };

  const isFuel = k >= 3 && (k + cfg.fuelPhase) % cfg.fuelInterval === 0;
  if (isFuel) {
    let x = k * CELL + 200 + hashFloat(cfg.seed + 13, k) * 200;
    const blocked = chasmAt(features, x) || liquidAt(features, x);
    if (blocked) x = blocked.a - 140; // a fuel can is never out of reach
    out.push({ type: 'fuel', x, y: surfaceY(x) - 46 });
    return out; // the can is the reward for this cell
  }

  if (hashFloat(cfg.seed + 12, k) < cfg.coinRate) {
    const n = 4 + Math.floor(hashFloat(cfg.seed + 14, k) * 4); // 4..7
    const startX = k * CELL + 60 + hashFloat(cfg.seed + 15, k) * 240;
    for (let i = 0; i < n; i++) {
      const x = startX + i * COIN_SPACING;
      const arc = Math.sin((i / (n - 1)) * Math.PI) * 34;
      out.push({ type: 'coin', x, y: floatY(x, 42) - arc });
    }
  }
  return out;
}

export function countCoins(cfg: PickupConfig, length: number): number {
  let total = 0;
  const kMax = Math.floor((length - 120) / CELL);
  for (let k = 1; k <= kMax; k++) {
    for (const p of pickupsForCell(cfg, k, () => 0)) {
      if (p.type === 'coin' && p.x < length - 80) total++;
    }
  }
  return total;
}
