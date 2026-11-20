// Renders a parked car once into a PNG (as a data URI) so menus can show it with
// a plain <Image>. A live Skia canvas per car does not scale: every canvas owns a
// GPU context, and a garage strip full of them exhausts the limit (the browser
// then blanks the oldest ones; on phones it costs a texture per thumbnail).
import { Skia } from '@shopify/react-native-skia';
import { carExtent, drawParkedCar } from './car';
import { fill } from './gfx';
import type { VehicleSpec } from '../data/vehicles';

const cache = new Map<string, string | null>();
const MAX_CACHED = 260;

/**
 * PNG data URI of the car fitted into w x h points, drawn at `scale` pixels per
 * point. Returns null if the image could not be produced (the caller shows a
 * fallback).
 */
export function carImageUri(spec: VehicleSpec, w: number, h: number, scale = 2, shadow = true): string | null {
  const pw = Math.max(8, Math.round(w * scale));
  const ph = Math.max(8, Math.round(h * scale));
  const key = `${spec.id}|${spec.colors.main}|${pw}x${ph}|${shadow ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  let uri: string | null = null;
  try {
    const surface = Skia.Surface.Make(pw, ph); // CPU surface: no GPU context involved
    if (surface) {
      const c = surface.getCanvas();
      const e = carExtent(spec);
      const k = Math.min(pw / (e.half * 2), ph / (e.bottom - e.top)) * 0.9; // keeps the aspect ratio
      c.translate(pw / 2, ph / 2 - (k * (e.top + e.bottom)) / 2);
      c.scale(k, k);
      if (shadow) c.drawOval({ x: -e.half * 0.9, y: e.bottom - 5, width: e.half * 1.8, height: 10 }, fill('#000000', 0.28));
      drawParkedCar(c, spec);
      surface.flush();
      const image = surface.makeImageSnapshot();
      const b64 = image.encodeToBase64();
      if (b64 && b64.length > 100) uri = `data:image/png;base64,${b64}`;
      image.dispose?.();
      surface.dispose?.();
    }
  } catch {
    uri = null;
  }
  if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value as string);
  cache.set(key, uri);
  return uri;
}

/** Forget cached images (used by tests and after a failed render). */
export function clearCarImages(): void {
  cache.clear();
}
