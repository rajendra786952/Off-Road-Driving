// Roadside decoration and far backdrops, all drawn with simple shapes.
import { Skia, type SkCanvas, type SkPath } from '@shopify/react-native-skia';
import { fill, poly, rrect, shade, stroke } from './gfx';
import { hashFloat } from '../core/rng';
import type { Backdrop, DecorType, Theme } from '../data/themes';

/** Draw one decoration with its base at (0, 0). Caller translates and scales. */
export function drawDecor(c: SkCanvas, type: DecorType, th: Theme, v: number): void {
  switch (type) {
    case 'tree':
      rrect(c, -5, -46, 10, 50, 3, fill(th.trunk));
      c.drawCircle(-14, -52, 20, fill(shade(th.leaf, -0.12)));
      c.drawCircle(14, -54, 19, fill(th.leaf));
      c.drawCircle(0, -70, 23, fill(shade(th.leaf, 0.1)));
      break;
    case 'pine':
      rrect(c, -4, -22, 8, 26, 2, fill(th.trunk));
      for (let i = 0; i < 3; i++) {
        const y = -18 - i * 22;
        const w = 30 - i * 6;
        c.drawPath(poly([-w, y, 0, y - 36, w, y]), fill(i % 2 ? shade(th.leaf, 0.08) : th.leaf));
      }
      if (th.id === 'snow') c.drawPath(poly([-10, -78, 0, -98, 10, -78]), fill('#ffffff', 0.9));
      break;
    case 'bush':
      c.drawCircle(-12, -8, 12, fill(shade(th.bush, -0.1)));
      c.drawCircle(10, -9, 13, fill(th.bush));
      c.drawCircle(0, -15, 13, fill(shade(th.bush, 0.1)));
      break;
    case 'rock':
      c.drawPath(poly([-20, 2, -15, -13, -3, -21, 12, -17, 21, -5, 19, 2]), fill(th.rock));
      c.drawPath(poly([-3, -21, 12, -17, 6, -9, -6, -11]), fill(shade(th.rock, 0.18)));
      break;
    case 'cactus':
      rrect(c, -6, -58, 12, 60, 6, fill(th.leaf));
      rrect(c, -22, -40, 9, 22, 4, fill(th.leaf));
      rrect(c, -22, -24, 18, 8, 4, fill(th.leaf));
      rrect(c, 13, -48, 9, 24, 4, fill(shade(th.leaf, -0.1)));
      rrect(c, 4, -30, 18, 8, 4, fill(shade(th.leaf, -0.1)));
      break;
    case 'palm': {
      const trunk = stroke(th.trunk, 8);
      c.drawLine(0, 2, 6, -30, trunk);
      c.drawLine(6, -30, 3, -64, trunk);
      const frond = stroke(th.leaf, 6);
      for (const [dx, dy] of [[-34, -8], [-26, -26], [30, -24], [36, -4], [2, -34], [-14, 6], [22, 8]]) c.drawLine(3, -64, 3 + dx, -64 + dy, frond);
      break;
    }
    case 'lamp':
      rrect(c, -2.5, -92, 5, 94, 2, fill('#4a4f5c'));
      rrect(c, -2, -94, 26, 5, 2, fill('#4a4f5c'));
      c.drawCircle(22, -86, 22, fill('#ffe680', 0.16));
      c.drawCircle(22, -88, 6, fill('#fff3b0'));
      break;
    case 'sign':
      rrect(c, -2, -40, 4, 42, 1, fill('#6b7078'));
      rrect(c, -15, -58, 30, 22, 3, fill(v > 0.5 ? '#f2c94c' : '#e8ecef'));
      c.drawPath(poly([-7, -42, 0, -54, 7, -42]), fill('#1c1e22'));
      break;
    case 'deadtree': {
      const s = stroke(shade(th.trunk, -0.1), 6);
      c.drawLine(0, 2, 2, -50, s);
      c.drawLine(2, -28, -18, -48, stroke(shade(th.trunk, -0.1), 4));
      c.drawLine(2, -40, 20, -62, stroke(shade(th.trunk, -0.1), 4));
      c.drawLine(2, -50, -6, -72, stroke(shade(th.trunk, -0.1), 3));
      break;
    }
    case 'reed':
      for (let i = -2; i <= 2; i++) {
        c.drawLine(i * 6, 2, i * 8, -34 - (i & 1) * 10, stroke(th.leaf, 2.5));
        rrect(c, i * 8 - 2.5, -46 - (i & 1) * 10, 5, 13, 2.5, fill(th.trunk));
      }
      break;
    case 'fence':
      for (const x of [-30, 0, 30]) rrect(c, x - 3, -30, 6, 32, 2, fill(th.trunk));
      rrect(c, -34, -24, 68, 5, 2, fill(shade(th.trunk, 0.15)));
      rrect(c, -34, -12, 68, 5, 2, fill(shade(th.trunk, 0.15)));
      break;
    case 'cone':
      c.drawPath(poly([-9, 0, 0, -26, 9, 0]), fill('#f2742b'));
      rrect(c, -6, -13, 12, 4, 1, fill('#ffffff'));
      rrect(c, -12, -2, 24, 4, 1, fill('#d9621f'));
      break;
  }
}

export const BACKDROP_PERIOD = 1400;

/** Silhouette of one backdrop layer over one period. y = 0 is the horizon, up is negative. */
export function backdropPath(kind: Backdrop, layer: 0 | 1): SkPath {
  const P = BACKDROP_PERIOD;
  const amp = layer === 0 ? 1 : 0.7;
  const seed = 900 + layer * 37;
  const b = Skia.PathBuilder.Make();
  b.moveTo(0, 700);
  const wave = (x: number, k: number, ph: number) => Math.sin((x / P) * Math.PI * 2 * k + ph);
  if (kind === 'skyline') {
    let x = 0;
    let i = 0;
    while (x < P) {
      const w = 46 + hashFloat(seed, i) * 50;
      const h = (70 + hashFloat(seed + 1, i) * 190) * amp;
      const x1 = Math.min(P, x + w);
      b.lineTo(x, -h);
      b.lineTo(x1, -h);
      b.lineTo(x1, -20 * amp);
      x = x1 + 6 + hashFloat(seed + 2, i) * 14;
      b.lineTo(Math.min(P, x), -20 * amp);
      i++;
    }
  } else if (kind === 'mesas') {
    let x = 0;
    let i = 0;
    b.lineTo(0, -30 * amp);
    while (x < P - 120) {
      const w = 110 + hashFloat(seed, i) * 150;
      const h = (60 + hashFloat(seed + 1, i) * 130) * amp;
      b.lineTo(x + 18, -h);
      b.lineTo(Math.min(P - 20, x + w), -h);
      b.lineTo(Math.min(P - 6, x + w + 16), -30 * amp);
      x += w + 40 + hashFloat(seed + 2, i) * 90;
      b.lineTo(Math.min(P, x), -30 * amp);
      i++;
    }
    b.lineTo(P, -30 * amp);
  } else if (kind === 'peaks' || kind === 'volcano') {
    const n = 12;
    for (let i = 0; i <= n; i++) {
      const k = i % n; // wraps, so the tile repeats without a seam
      let h = (i % 2 ? 150 + hashFloat(seed, k) * 110 : 50 + hashFloat(seed + 1, k) * 50) * amp;
      if (kind === 'volcano') h *= 0.6;
      b.lineTo((i / n) * P, -h);
    }
    if (kind === 'volcano' && layer === 0) {
      b.lineTo(P, 700);
      b.moveTo(P * 0.3, 700);
      b.lineTo(P * 0.3, 0);
      b.lineTo(P * 0.46, -250);
      b.lineTo(P * 0.56, -250);
      b.lineTo(P * 0.74, 0);
      b.lineTo(P * 0.74, 700);
    }
  } else {
    const dune = kind === 'dunes';
    for (let x = 0; x <= P; x += 20) {
      let h = dune
        ? 46 + 28 * wave(x, 3, seed) + 10 * wave(x, 7, 1)
        : 78 + 42 * wave(x, 2, seed) + 22 * wave(x, 5, 2) + 8 * wave(x, 11, 3);
      h *= amp;
      b.lineTo(x, -h);
      if (kind === 'treeline' && x < P) {
        const th = (26 + hashFloat(seed + 5, x) * 34) * amp;
        b.lineTo(x + 10, -h - th);
      }
    }
  }
  b.lineTo(P, 700);
  b.close();
  return b.detach();
}

/** Lit windows for the city skyline (one period). */
export function skylineWindows(layer: 0 | 1): SkPath {
  const b = Skia.PathBuilder.Make();
  const seed = 900 + layer * 37;
  const amp = layer === 0 ? 1 : 0.7;
  let x = 0;
  let i = 0;
  while (x < BACKDROP_PERIOD) {
    const w = 46 + hashFloat(seed, i) * 50;
    const h = (70 + hashFloat(seed + 1, i) * 190) * amp;
    for (let wy = 14; wy < h - 24; wy += 18) {
      for (let wx = 8; wx < w - 10; wx += 13) {
        if (hashFloat(seed + 9 + i, wx * 31 + wy) < 0.42 && x + wx + 6 < BACKDROP_PERIOD) b.addRect(Skia.XYWHRect(x + wx, -h + wy, 6, 8));
      }
    }
    x = Math.min(BACKDROP_PERIOD, x + w) + 6 + hashFloat(seed + 2, i) * 14;
    i++;
  }
  return b.detach();
}
