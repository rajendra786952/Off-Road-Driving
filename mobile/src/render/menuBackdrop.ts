// A still landscape for behind the menus, in the colours of one environment:
// sky, sun or moon, two layers of hills (or skyline, dunes, peaks...) and a strip
// of road. Rendered once per environment and size into a PNG data URI, like the
// car pictures, so a menu shows it with a plain <Image>.
import { Skia, TileMode } from '@shopify/react-native-skia';
import { fill, shade } from './gfx';
import { BACKDROP_PERIOD, backdropPicture, type BackdropLayer } from './decor';
import { hashFloat } from '../core/rng';
import { THEMES, type ThemeId } from '../data/themes';

const cache = new Map<string, string | null>();

/** `variant` slides the mountains sideways, so each level card of a world shows a different stretch of scenery. */
export function menuBackdropUri(themeId: ThemeId, width: number, height: number, variant = 0): string | null {
  // a soft background does not need full resolution
  const w = Math.max(64, Math.min(1100, Math.round(width)));
  const h = Math.max(64, Math.round((w * height) / Math.max(1, width)));
  const key = `${themeId}|${w}x${h}|${variant}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  let uri: string | null = null;
  try {
    const th = THEMES[themeId];
    const surface = Skia.Surface.Make(w, h);
    if (surface) {
      const c = surface.getCanvas();
      const sky = Skia.Paint();
      sky.setShader(Skia.Shader.MakeLinearGradient({ x: 0, y: 0 }, { x: 0, y: h }, [Skia.Color(th.skyTop), Skia.Color(th.skyBottom)], null, TileMode.Clamp));
      c.drawRect({ x: 0, y: 0, width: w, height: h }, sky);

      const k = h / 520;
      if (th.night) {
        const star = fill('#ffffff', 0.8);
        for (let i = 0; i < 50; i++) c.drawCircle(hashFloat(5, i) * w, hashFloat(6, i) * h * 0.55, (0.8 + hashFloat(7, i) * 1.3) * k, star);
      }
      c.drawCircle(w * 0.8, h * 0.24, 78 * k, fill(th.sun, 0.16));
      c.drawCircle(w * 0.8, h * 0.24, 44 * k, fill(th.sun, 0.95));
      if (th.backdrop === 'volcano') c.drawCircle(w * 0.45, h * 0.62, 240 * k, fill('#ff5a1a', 0.2));

      const layer = (which: BackdropLayer, y: number, shift: number) => {
        const pic = backdropPicture(th.backdrop, which, th);
        const period = BACKDROP_PERIOD * k;
        for (let x = -shift * k; x < w; x += period) {
          c.save();
          c.translate(x, y);
          c.scale(k, k);
          c.drawPicture(pic);
          c.restore();
        }
      };
      layer(0, h * 0.58, 260 + variant * 110);
      layer(1, h * 0.66, 620 + variant * 190);
      layer(2, h * 0.74, 130 + variant * 300);

      // the road along the bottom
      c.drawRect({ x: 0, y: h * 0.78, width: w, height: h * 0.14 }, fill(th.dirt));
      c.drawRect({ x: 0, y: h * 0.78, width: w, height: 9 * k }, fill(th.grass));
      c.drawRect({ x: 0, y: h * 0.78, width: w, height: 3 * k }, fill(th.grassLight));
      c.drawRect({ x: 0, y: h * 0.78 + 34 * k, width: w, height: h }, fill(shade(th.dirtDeep, -0.1)));

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
  if (cache.size > 140) cache.clear();
  cache.set(key, uri);
  return uri;
}
