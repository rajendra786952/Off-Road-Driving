// Roadside decoration and the layered far backdrops, all drawn in code.
// Decoration is shaded in two tones (lit from the sun, upper right) and given a soft ground shadow.
// Each backdrop layer is recorded ONCE into a picture (gradient, haze, snow caps, trees, waterfalls,
// lava...) and then only moved: three layers cost three draw calls a frame.
import { ClipOp, Skia, TileMode, type SkCanvas, type SkImage, type SkPath, type SkPicture } from '@shopify/react-native-skia';
import { fill, mix, poly, record, rrect, shade, stroke } from './gfx';
import { hashFloat } from '../core/rng';
import type { Backdrop, DecorType, Theme } from '../data/themes';

const shadow = (c: SkCanvas, w: number, h = 5) => c.drawOval(Skia.XYWHRect(-w / 2, -h / 2 + 3, w, h), fill('#000000', 0.22));

/** Draw one decoration with its base at (0, 0). Caller translates and scales. */
export function drawDecor(c: SkCanvas, type: DecorType, th: Theme, v: number): void {
  switch (type) {
    case 'tree': {
      shadow(c, 70, 8);
      rrect(c, -5, -46, 10, 50, 3, fill(th.trunk));
      rrect(c, 1, -46, 4, 50, 2, fill(shade(th.trunk, -0.3), 0.7)); // shaded side of the trunk
      c.drawCircle(-14, -52, 20, fill(shade(th.leaf, -0.2)));
      c.drawCircle(15, -54, 19, fill(shade(th.leaf, -0.08)));
      c.drawCircle(0, -70, 23, fill(th.leaf));
      c.drawCircle(-5, -62, 15, fill(shade(th.leaf, 0.1)));
      c.drawCircle(6, -78, 11, fill(shade(th.leaf, 0.24), 0.85)); // sunlit top
      c.drawCircle(12, -70, 5, fill(shade(th.leaf, 0.32), 0.7));
      break;
    }
    case 'pine': {
      shadow(c, 54, 7);
      rrect(c, -4, -22, 8, 26, 2, fill(th.trunk));
      for (let i = 0; i < 4; i++) {
        const y = -14 - i * 21;
        const w = 32 - i * 6.5;
        const tip = y - 34;
        c.drawPath(poly([-w, y, 0, tip, w, y]), fill(shade(th.leaf, -0.14 + i * 0.04)));
        c.drawPath(poly([0, tip, w, y, 1, y]), fill(shade(th.leaf, 0.1 + i * 0.03))); // lit right half
        c.drawPath(poly([-w, y, -w * 0.4, y - 5, w * 0.2, y]), fill('#000000', 0.12)); // tier underside
      }
      if (th.id === 'snow' || th.id === 'mountains') {
        for (let i = 0; i < 4; i++) {
          const y = -14 - i * 21;
          const w = 32 - i * 6.5;
          c.drawPath(poly([-w * 0.62, y - 12, 0, y - 36, w * 0.62, y - 12, w * 0.2, y - 17, -w * 0.25, y - 11]), fill('#ffffff', th.id === 'snow' ? 0.95 : 0.55));
        }
      }
      break;
    }
    case 'bush':
      shadow(c, 56, 6);
      c.drawCircle(-12, -8, 12, fill(shade(th.bush, -0.18)));
      c.drawCircle(10, -9, 13, fill(shade(th.bush, -0.06)));
      c.drawCircle(0, -15, 13, fill(th.bush));
      c.drawCircle(-3, -18, 7, fill(shade(th.bush, 0.2), 0.8));
      c.drawCircle(9, -12, 3, fill('#ffffff', th.id === 'countryside' ? 0.5 : 0));
      break;
    case 'rock':
      shadow(c, 54, 6);
      c.drawPath(poly([-20, 2, -15, -13, -3, -21, 12, -17, 21, -5, 19, 2]), fill(shade(th.rock, -0.12)));
      c.drawPath(poly([-3, -21, 12, -17, 21, -5, 19, 2, 4, 2, 2, -9]), fill(shade(th.rock, -0.28), 0.7)); // shadow facet
      c.drawPath(poly([-15, -13, -3, -21, 6, -12, -8, -8]), fill(shade(th.rock, 0.2)));
      c.drawPath(poly([-3, -21, 12, -17, 6, -9, -6, -11]), fill(shade(th.rock, 0.3), 0.8));
      break;
    case 'cactus': {
      shadow(c, 56, 6);
      const lit = shade(th.leaf, 0.14);
      const dark = shade(th.leaf, -0.18);
      rrect(c, -6, -58, 12, 60, 6, fill(th.leaf));
      rrect(c, 0, -56, 6, 58, 3, fill(dark, 0.7));
      rrect(c, -4, -56, 3, 54, 1.5, fill(lit, 0.9));
      rrect(c, -22, -40, 9, 22, 4, fill(th.leaf));
      rrect(c, -22, -24, 18, 8, 4, fill(th.leaf));
      rrect(c, -20, -38, 3, 18, 1.5, fill(lit, 0.8));
      rrect(c, 13, -48, 9, 24, 4, fill(dark));
      rrect(c, 4, -30, 18, 8, 4, fill(dark));
      if (v > 0.55) c.drawCircle(0, -60, 3.5, fill('#ff6fa0')); // a flower
      break;
    }
    case 'palm': {
      shadow(c, 50, 6);
      c.drawLine(0, 2, 6, -30, stroke(th.trunk, 9));
      c.drawLine(6, -30, 3, -64, stroke(th.trunk, 8));
      c.drawLine(0, 2, 6, -30, stroke(shade(th.trunk, 0.2), 3));
      for (let r = 0; r < 4; r++) c.drawLine(-3, -12 - r * 13, 8, -14 - r * 13, stroke(shade(th.trunk, -0.35), 2, 0.6)); // trunk rings
      const fronds: [number, number][] = [[-38, -4], [-30, -26], [32, -26], [38, -2], [2, -36], [-16, 8], [22, 10]];
      fronds.forEach(([dx, dy], i) => {
        const x = 3 + dx;
        const y = -64 + dy;
        c.drawLine(3, -64, x, y, stroke(i % 2 ? shade(th.leaf, -0.1) : th.leaf, 7));
        c.drawLine(3, -64, x * 0.92 + 0.3, y * 0.92 - 4.5, stroke(shade(th.leaf, 0.25), 2.5, 0.85));
      });
      c.drawCircle(1, -62, 4, fill('#4a3322'));
      c.drawCircle(7, -60, 4, fill('#5a3d24'));
      break;
    }
    case 'lamp':
      rrect(c, -2.5, -92, 5, 94, 2, fill('#3a3f4c'));
      rrect(c, 0, -92, 2.5, 94, 1, fill('#6a7080', 0.6));
      rrect(c, -2, -94, 26, 5, 2, fill('#3a3f4c'));
      c.drawCircle(22, -80, 34, fill('#ffe680', 0.08));
      c.drawCircle(22, -86, 22, fill('#ffe680', 0.16));
      c.drawCircle(22, -88, 6, fill('#fff3b0'));
      c.drawPath(poly([22, -84, 2, 2, 48, 2]), fill('#ffe680', 0.07)); // light cone on the road
      break;
    case 'sign':
      rrect(c, -2, -40, 4, 42, 1, fill('#6b7078'));
      rrect(c, -15, -58, 30, 22, 3, fill(v > 0.5 ? '#f2c94c' : '#e8ecef'));
      rrect(c, -13, -56, 26, 18, 2, stroke('#1c1e22', 1.2, 0.6));
      c.drawPath(poly([-7, -42, 0, -54, 7, -42]), fill('#1c1e22'));
      break;
    case 'deadtree': {
      const s = stroke(shade(th.trunk, -0.1), 6);
      shadow(c, 40, 5);
      c.drawLine(0, 2, 2, -50, s);
      c.drawLine(2, -28, -18, -48, stroke(shade(th.trunk, -0.1), 4));
      c.drawLine(2, -40, 20, -62, stroke(shade(th.trunk, -0.1), 4));
      c.drawLine(2, -50, -6, -72, stroke(shade(th.trunk, -0.1), 3));
      c.drawLine(2, -46, 14, -58, stroke(shade(th.trunk, 0.2), 1.5, 0.8));
      c.drawLine(-18, -48, -26, -58, stroke(shade(th.trunk, -0.1), 2.5));
      c.drawLine(20, -62, 28, -66, stroke(shade(th.trunk, -0.1), 2.5));
      break;
    }
    case 'reed':
      for (let i = -2; i <= 2; i++) {
        c.drawLine(i * 6, 2, i * 8, -34 - (i & 1) * 10, stroke(i & 1 ? shade(th.leaf, 0.12) : th.leaf, 2.5));
        rrect(c, i * 8 - 2.5, -46 - (i & 1) * 10, 5, 13, 2.5, fill(th.trunk));
      }
      break;
    case 'fence':
      for (const x of [-30, 0, 30]) {
        rrect(c, x - 3, -30, 6, 32, 2, fill(th.trunk));
        rrect(c, x + 1, -30, 2, 32, 1, fill(shade(th.trunk, -0.3), 0.6));
      }
      rrect(c, -34, -24, 68, 5, 2, fill(shade(th.trunk, 0.15)));
      rrect(c, -34, -12, 68, 5, 2, fill(shade(th.trunk, 0.15)));
      break;
    case 'cone':
      c.drawPath(poly([-9, 0, 0, -26, 9, 0]), fill('#f2742b'));
      c.drawPath(poly([0, -26, 9, 0, 1, 0]), fill('#c9561a', 0.7));
      rrect(c, -6, -13, 12, 4, 1, fill('#ffffff'));
      rrect(c, -12, -2, 24, 4, 1, fill('#d9621f'));
      break;
  }
}

// ------------------------------------------------------------------ backdrops

export const BACKDROP_PERIOD = 1400;
export type BackdropLayer = 0 | 1 | 2;
/** How tall each layer's mountains are, relative to the tallest (the farthest). */
const AMP: Record<BackdropLayer, number> = { 0: 1, 1: 0.78, 2: 0.55 };

interface Building {
  x: number;
  w: number;
  h: number;
}

function buildings(layer: BackdropLayer): Building[] {
  const seed = 900 + layer * 37;
  const amp = AMP[layer];
  const out: Building[] = [];
  let x = 0;
  let i = 0;
  while (x < BACKDROP_PERIOD) {
    const w = 46 + hashFloat(seed, i) * 50;
    const h = (70 + hashFloat(seed + 1, i) * 190) * amp;
    out.push({ x, w: Math.min(w, BACKDROP_PERIOD - x), h });
    x = Math.min(BACKDROP_PERIOD, x + w) + 6 + hashFloat(seed + 2, i) * 14;
    i++;
  }
  return out;
}

/** Ridge line of one layer over one period, as x, y pairs. y = 0 is the horizon, up is negative. */
function ridge(kind: Backdrop, layer: BackdropLayer): number[] {
  const P = BACKDROP_PERIOD;
  const amp = AMP[layer];
  const seed = 900 + layer * 37;
  const pts: number[] = [];
  const wave = (x: number, k: number, ph: number) => Math.sin((x / P) * Math.PI * 2 * k + ph);
  if (kind === 'skyline') {
    for (const b of buildings(layer)) pts.push(b.x, -b.h, b.x + b.w, -b.h);
  } else if (kind === 'mesas') {
    let x = 0;
    let i = 0;
    pts.push(0, -30 * amp);
    while (x < P - 120) {
      const w = 110 + hashFloat(seed, i) * 150;
      const h = (60 + hashFloat(seed + 1, i) * 130) * amp;
      pts.push(x + 18, -h, Math.min(P - 20, x + w), -h, Math.min(P - 6, x + w + 16), -30 * amp);
      x += w + 40 + hashFloat(seed + 2, i) * 90;
      pts.push(Math.min(P, x), -30 * amp);
      i++;
    }
    pts.push(P, -30 * amp);
  } else if (kind === 'peaks' || kind === 'volcano') {
    const n = 12;
    for (let i = 0; i <= n; i++) {
      const k = i % n; // wraps, so the tile repeats without a seam
      let h = (i % 2 ? 150 + hashFloat(seed, k) * 110 : 50 + hashFloat(seed + 1, k) * 50) * amp;
      if (kind === 'volcano') h *= 0.6;
      pts.push((i / n) * P, -h);
    }
  } else {
    const dune = kind === 'dunes';
    for (let x = 0; x <= P; x += 20) {
      const h = (dune ? 46 + 28 * wave(x, 3, seed) + 10 * wave(x, 7, 1) : 78 + 42 * wave(x, 2, seed) + 22 * wave(x, 5, 2) + 8 * wave(x, 11, 3)) * amp;
      pts.push(x, -h);
    }
  }
  return pts;
}

function heightAt(pts: number[], x: number): number {
  for (let i = 0; i + 3 < pts.length; i += 2) {
    if (x >= pts[i] && x <= pts[i + 2]) {
      const t = pts[i + 2] === pts[i] ? 0 : (x - pts[i]) / (pts[i + 2] - pts[i]);
      return pts[i + 1] + (pts[i + 3] - pts[i + 1]) * t;
    }
  }
  return pts[pts.length - 1];
}

function ridgePath(pts: number[]): SkPath {
  const P = BACKDROP_PERIOD;
  // 4 px past the end: the next tile overlaps it, so there is never a hairline between tiles
  return poly([0, 800, ...pts, P + 4, pts[pts.length - 1], P + 4, 800]);
}

/** One layer of far scenery for one period of its tile. y = 0 is the horizon. */
export function backdropPicture(kind: Backdrop, layer: BackdropLayer, th: Theme): SkPicture {
  const P = BACKDROP_PERIOD;
  const amp = AMP[layer];
  const seed = 900 + layer * 37;
  const pts = ridge(kind, layer);
  const body = ridgePath(pts);
  // far layers fade towards the sky colour (atmospheric haze), near layers keep their own colour
  const haze = [0.48, 0.26, 0.05][layer];
  const base = layer === 0 ? th.farHill : layer === 1 ? mix(th.farHill, th.nearHill, 0.55) : th.nearHill;
  const top = mix(base, th.skyBottom, haze);
  const bottom = mix(base, th.skyBottom, Math.min(0.85, haze + 0.38));
  const dark = shade(base, th.night ? 0.12 : -0.22);
  const lit = shade(base, th.night ? 0.3 : 0.28);

  return record(P + 8, 1300, (c) => {
    const grad = Skia.Paint();
    grad.setAntiAlias(true);
    grad.setShader(Skia.Shader.MakeLinearGradient({ x: 0, y: -320 * amp }, { x: 0, y: 110 }, [Skia.Color(top), Skia.Color(bottom)], null, TileMode.Clamp));
    c.drawPath(body, grad);

    // shading that must stay inside the mountain is clipped to it; trees, towers and the volcano cone stand above the ridge
    const clipped = kind === 'peaks' || kind === 'mesas' || kind === 'dunes';
    if (clipped) {
      c.save();
      c.clipPath(body, ClipOp.Intersect, true);
    }

    if (kind === 'peaks') {
      const n = 12;
      const snowy = th.id === 'snow' || (th.id === 'mountains' && layer < 2);
      for (let i = 1; i < n; i += 2) {
        const px = pts[i * 2];
        const py = pts[i * 2 + 1];
        const lx = pts[(i - 1) * 2];
        const ly = pts[(i - 1) * 2 + 1];
        const rx = pts[(i + 1) * 2];
        const ry = pts[(i + 1) * 2 + 1];
        c.drawPath(poly([px, py, lx, ly, lx, 60, px + (rx - px) * 0.1, 60]), fill(dark, 0.45)); // shaded flank
        if (snowy) {
          const k = 0.26 + hashFloat(seed + 4, i) * 0.1;
          const ax = px + (lx - px) * k;
          const ay = py + (ly - py) * k;
          const bx = px + (rx - px) * k;
          const by = py + (ry - py) * k;
          const mx = (ax + bx) / 2;
          const cap = poly([px, py, bx, by, mx + (bx - mx) * 0.45, by - 9 - hashFloat(seed + 6, i) * 8, mx, by + 6, mx - (mx - ax) * 0.5, ay - 8, ax, ay]);
          c.drawPath(cap, fill(th.id === 'snow' ? '#ffffff' : '#f2f6fa', 0.92 - layer * 0.08));
          c.drawPath(poly([px, py, ax, ay, mx - (mx - ax) * 0.5, ay - 8, px - (px - ax) * 0.15, py + (ay - py) * 0.55]), fill(shade('#c8d8ea', -0.05), 0.5)); // cap shadow
        }
      }
    } else if (kind === 'mesas') {
      for (let y = -240; y < 60; y += 22) c.drawRect(Skia.XYWHRect(0, y, P + 8, 9 + hashFloat(seed + 2, y) * 6), fill(hashFloat(seed + 3, y) > 0.5 ? dark : lit, 0.22));
      for (let i = 2; i + 3 < pts.length - 2; i += 6) c.drawPath(poly([pts[i], pts[i + 1], pts[i], 60, pts[i] + 36, 60, pts[i] + 18, pts[i + 1]]), fill(dark, 0.3)); // shaded cliff faces
    } else if (kind === 'volcano') {
      if (layer === 0) {
        // the cone: dark, with glowing lava running down it and smoke over the crater
        const cone = poly([P * 0.2, 60, P * 0.42, -255, P * 0.58, -255, P * 0.82, 60]);
        c.drawPath(cone, fill(mix(th.farHill, '#1a0d12', 0.55)));
        c.drawPath(poly([P * 0.42, -255, P * 0.2, 60, P * 0.45, 60]), fill('#000000', 0.25));
        c.drawOval(Skia.XYWHRect(P * 0.42, -264, P * 0.16, 18), fill('#ff9a3a'));
        c.drawCircle(P * 0.5, -266, 70, fill('#ff6a1a', 0.2));
        // two lava streams that widen and cool as they run down the cone
        const streams: [number, number][][] = [
          [[P * 0.475, -256], [P * 0.468, -200], [P * 0.474, -140], [P * 0.462, -80], [P * 0.465, -10]],
          [[P * 0.535, -256], [P * 0.545, -190], [P * 0.538, -130], [P * 0.552, -60]],
        ];
        for (const st of streams) {
          for (let i = 0; i + 1 < st.length; i++) {
            const k = i / st.length;
            c.drawLine(st[i][0], st[i][1], st[i + 1][0], st[i + 1][1], stroke('#ff5a1a', 12 + i * 3, 0.2));
            c.drawLine(st[i][0], st[i][1], st[i + 1][0], st[i + 1][1], stroke(k < 0.5 ? '#ffd27a' : '#ff9a3a', 4.5 - i * 0.6, 0.95 - k * 0.25));
          }
        }
        for (let i = 0; i < 7; i++) c.drawCircle(P * 0.5 + i * 22 - 20, -290 - i * 38, 26 + i * 10, fill('#2a1a22', 0.34 - i * 0.03)); // smoke
      }
      for (let i = 0; i < 5; i++) {
        const gx = hashFloat(seed + 7, i) * P;
        c.drawCircle(gx, 20, 60 + hashFloat(seed + 8, i) * 40, fill('#ff5a1a', 0.07)); // ember haze
      }
    } else if (kind === 'treeline') {
      const dkTree = mix(mix(base, '#04140a', th.night ? 0.4 : 0.34), th.skyBottom, haze * 0.7);
      const midTree = mix(mix(base, '#04140a', 0.18), th.skyBottom, haze * 0.7);
      // each tree is drawn three times, one tile to the left and right too, so the canopy that overhangs the edge of a tile continues in the next one
      for (const dx of [-P, 0, P]) {
      c.save();
      c.translate(dx, 0);
      for (let x = 4; x < P; x += 11 + hashFloat(seed + 11, x) * 12) {
        const gy = heightAt(pts, x) + 4;
        const h = (38 + hashFloat(seed + 12, x) * 46) * (0.7 + amp * 0.5);
        const w = h * 0.34;
        const col = hashFloat(seed + 13, x) > 0.5 ? dkTree : midTree;
        if (th.id === 'forest') {
          for (let t = 0; t < 3; t++) c.drawPath(poly([x - w * (1 - t * 0.2), gy - h * (0.12 + t * 0.26), x, gy - h * (0.62 + t * 0.2), x + w * (1 - t * 0.2), gy - h * (0.12 + t * 0.26)]), fill(col));
          c.drawPath(poly([x, gy - h, x - w * 0.5, gy - h * 0.55, x + w * 0.5, gy - h * 0.55]), fill(col));
        } else {
          // rounded canopies (jungle, marsh) with a trunk
          rrect(c, x - 1.5, gy - h * 0.5, 3, h * 0.5, 1, fill(dkTree));
          c.drawCircle(x, gy - h * 0.62, w * 1.05, fill(col));
          c.drawCircle(x - w * 0.7, gy - h * 0.45, w * 0.7, fill(dkTree));
          c.drawCircle(x + w * 0.4, gy - h * 0.82, w * 0.7, fill(shade(col, 0.1)));
        }
      }
      c.restore();
      }
      if (th.id === 'jungle' && layer < 2) {
        // two waterfalls dropping off the ridge, with spray at the foot
        for (const fx of [P * 0.22 + layer * 160, P * 0.68 - layer * 120]) {
          const gy = heightAt(pts, fx) + 10;
          const len = 120 - layer * 40;
          const fall = Skia.Paint();
          fall.setShader(Skia.Shader.MakeLinearGradient({ x: 0, y: gy }, { x: 0, y: gy + len }, [Skia.Color('#ffffff'), Skia.Color('#bfeeff')], null, TileMode.Clamp));
          fall.setAlphaf(0.72);
          c.drawRect(Skia.XYWHRect(fx - 7, gy, 14, len), fall);
          c.drawRect(Skia.XYWHRect(fx - 2, gy, 3, len), fill('#ffffff', 0.7));
          c.drawCircle(fx, gy + len, 17, fill('#ffffff', 0.5));
          c.drawCircle(fx + 12, gy + len + 4, 12, fill('#ffffff', 0.4));
          c.drawCircle(fx - 12, gy + len + 3, 11, fill('#ffffff', 0.4));
        }
      }
    } else if (kind === 'skyline') {
      for (const b of buildings(layer)) {
        c.drawRect(Skia.XYWHRect(b.x, -b.h, 5, b.h + 60), fill(lit, 0.2)); // lit edge
        if (layer < 2 && hashFloat(seed + 21, b.x) > 0.45) {
          const neon = hashFloat(seed + 22, b.x) > 0.5 ? '#ff3d9a' : '#38e1ff';
          c.drawRect(Skia.XYWHRect(b.x - 4, -b.h - 6, b.w + 8, 14), fill(neon, 0.18));
          c.drawRect(Skia.XYWHRect(b.x, -b.h - 1, b.w, 3.4), fill(neon, 0.95));
        }
        if (b.h > 170 * amp && layer < 2) {
          c.drawLine(b.x + b.w / 2, -b.h, b.x + b.w / 2, -b.h - 34, stroke('#40466a', 2));
          c.drawCircle(b.x + b.w / 2, -b.h - 34, 3, fill('#ff4a4a'));
          c.drawCircle(b.x + b.w / 2, -b.h - 34, 9, fill('#ff4a4a', 0.25));
        }
      }
      const wins = Skia.PathBuilder.Make();
      for (const b of buildings(layer)) {
        for (let wy = 14; wy < b.h - 24; wy += 18) {
          for (let wx = 8; wx < b.w - 10; wx += 13) {
            if (hashFloat(seed + 9 + b.x, wx * 31 + wy) < 0.42 && b.x + wx + 6 < P) wins.addRect(Skia.XYWHRect(b.x + wx, -b.h + wy, 6, 8));
          }
        }
      }
      c.drawPath(wins.detach(), fill('#ffd98a', layer === 2 ? 0.8 : layer === 1 ? 0.62 : 0.45));
    } else if (kind === 'dunes') {
      for (let i = 0; i < 3; i++) {
        const y0 = -10 - i * 14;
        c.drawPath(poly([0, y0, P * 0.3, y0 - 6, P * 0.6, y0 + 2, P, y0 - 4, P, y0 + 4, P * 0.6, y0 + 8, P * 0.3, y0, 0, y0 + 6]), fill(dark, 0.1)); // wind ripples
      }
    }
    if (clipped) c.restore();
    // mist pooling at the foot of the layer, kept inside the layer
    c.save();
    c.clipPath(body, ClipOp.Intersect, true);
    const mist = Skia.Paint();
    mist.setShader(Skia.Shader.MakeLinearGradient({ x: 0, y: -40 }, { x: 0, y: 90 }, [Skia.Color(th.skyBottom + '00'), Skia.Color(th.skyBottom)], null, TileMode.Clamp));
    mist.setAlphaf(0.4 - layer * 0.1);
    c.drawRect(Skia.XYWHRect(0, -40, P + 8, 130), mist);
    c.restore();

    // light catching the top edge of the ridge
    if (kind !== 'skyline' && kind !== 'mesas') c.drawPath(poly(pts, false), stroke(lit, 2.2, 0.38 - layer * 0.08));
  }, 0, -500);
}

/** Most a backdrop can reach above its horizon (the smoke over the volcano), and how far each layer reaches below it. */
export const BACKDROP_TOP = 480;
const BACKDROP_DEPTH = [200, 220, 240];

export interface BackdropImage {
  image: SkImage;
  /** how far above the horizon the image reaches: draw it at y = -top */
  top: number;
}

/**
 * One backdrop layer drawn ONCE into a texture. The layers are far away and hazy, so one pixel per world unit is
 * plenty; drawing a texture costs one quad, where replaying the picture would repeat several hundred shapes every
 * frame (which a weak phone GPU notices). Returns null if no surface could be made (callers fall back to the picture).
 */
export function backdropImage(kind: Backdrop, layer: BackdropLayer, th: Theme): BackdropImage | null {
  const pic = backdropPicture(kind, layer, th);
  // no taller than the layer's own mountains and trees: empty sky above them would be drawn for nothing every frame
  const reach = -Math.min(...ridge(kind, layer).filter((_, i) => i % 2 === 1));
  const margin = kind === 'volcano' && layer === 0 ? 360 : kind === 'treeline' ? 190 : kind === 'skyline' ? 70 : 40;
  const top = Math.min(BACKDROP_TOP, Math.ceil(reach + margin));
  const surface = Skia.Surface.Make(BACKDROP_PERIOD + 8, top + BACKDROP_DEPTH[layer]);
  if (!surface) return null;
  const c = surface.getCanvas();
  c.translate(0, top);
  c.drawPicture(pic);
  surface.flush();
  const image = surface.makeImageSnapshot();
  surface.dispose?.();
  return { image, top };
}

/** A soft cloud, 1 unit = the cloud's base radius. Recorded once; the sky draws it scaled and moved. */
export function cloudPicture(th: Theme): SkPicture {
  const dusk = th.id === 'canyon' || th.id === 'volcano';
  const body = dusk ? mix(th.skyBottom, '#ffffff', 0.35) : '#ffffff';
  const under = dusk ? mix(th.skyBottom, '#6a2a2a', 0.45) : '#c9d6e6';
  return record(300, 140, (c) => {
    const blobs: [number, number, number][] = [[0, 0, 1], [1.1, -0.35, 1.2], [2.3, 0, 0.95], [0.6, 0.3, 0.9], [1.7, 0.3, 0.9]];
    for (const [x, y, r] of blobs) c.drawCircle(x * 26, y * 26 + 6, r * 26, fill(under, 0.55)); // shaded underside
    for (const [x, y, r] of blobs) c.drawCircle(x * 26, y * 26, r * 26, fill(body, 0.9));
  }, -40, -60);
}

/** Dark grass or rocks along the bottom edge of the screen that scroll faster than the ground. */
export function foregroundPicture(th: Theme): SkPicture {
  const P = 900;
  const col = mix(th.dirtDeep, '#000000', 0.62);
  const leaf = mix(th.grass, '#000000', 0.62);
  const tufts = th.id !== 'desert' && th.id !== 'canyon' && th.id !== 'volcano' && th.id !== 'city' && th.id !== 'snow';
  return record(P + 8, 120, (c) => {
    const b = Skia.PathBuilder.Make();
    b.moveTo(0, 120);
    b.lineTo(0, 70);
    if (tufts) {
      for (let x = 0; x < P; x += 13) {
        const h = 22 + hashFloat(5, x) * 34;
        b.lineTo(x + 3, 70 - h);
        b.lineTo(x + 8, 74);
      }
    } else {
      for (let x = 0; x < P; x += 90 + hashFloat(6, x) * 110) {
        const w = 40 + hashFloat(7, x) * 70;
        const h = 18 + hashFloat(8, x) * 30;
        b.lineTo(x, 72);
        b.quadTo(x + w * 0.4, 72 - h * 1.4, x + w * 0.7, 72 - h * 0.4);
        b.quadTo(x + w * 0.9, 72 - h * 0.1, x + w, 72);
      }
    }
    b.lineTo(P + 8, 70);
    b.lineTo(P + 8, 120);
    b.close();
    c.drawPath(b.detach(), fill(tufts ? leaf : col, 0.92));
    c.drawRect(Skia.XYWHRect(0, 80, P + 8, 40), fill(col));
  }, 0, 0);
}
