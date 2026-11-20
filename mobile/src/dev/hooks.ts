// Debugging aids, installed in development builds only (see App.tsx).
import { Skia } from '@shopify/react-native-skia';
import { carExtent, drawParkedCar } from '../render/car';
import { PAINTS, VEHICLES, paintSpec } from '../data/vehicles';
import { carImageUri } from '../render/carImage';
import { commitSave, getState, navigate, startLevel } from '../state/store';

/** PNG (base64) with every `step`-th car, to review the artwork at a glance. */
function carSheet(start = 0, step = 1, columns = 10, rows = 5): string | undefined {
  const cw = 190;
  const chh = 120;
  const surface = Skia.Surface.Make(cw * columns, chh * rows);
  if (!surface) return undefined;
  const c = surface.getCanvas();
  const bg = Skia.Paint();
  bg.setColor(Skia.Color('#17232d'));
  c.drawPaint(bg);
  for (let i = 0; i < columns * rows; i++) {
    const spec = VEHICLES[start + i * step];
    if (!spec) break;
    const e = carExtent(spec);
    const k = Math.min(cw / (e.half * 2), chh / (e.bottom - e.top)) * 0.88;
    c.save();
    c.translate((i % columns) * cw + cw / 2, Math.floor(i / columns) * chh + chh / 2 - (k * (e.top + e.bottom)) / 2);
    c.scale(k, k);
    drawParkedCar(c, spec);
    c.restore();
  }
  surface.flush();
  return surface.makeImageSnapshot().encodeToBase64();
}

/** Render every car (and every paint) to an image; returns the ids that failed. */
function carImageCheck(): { total: number; failed: string[] } {
  const failed: string[] = [];
  let total = 0;
  for (const v of VEHICLES) {
    for (const p of PAINTS) {
      total++;
      const uri = carImageUri(paintSpec(v, p.id), 110, 50, 1, false);
      if (!uri) failed.push(`${v.id}/${p.id}`);
    }
  }
  return { total, failed };
}

export function installDevHooks(): void {
  (globalThis as Record<string, unknown>).__ttNav = { startLevel, navigate, commitSave, getState, carSheet, carImageCheck };
}
