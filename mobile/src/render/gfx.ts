// Small helpers over the Skia imperative API. Paints, rects and shapes are
// cached so that drawing a frame allocates (almost) nothing.
import { PaintStyle, Skia, StrokeCap, StrokeJoin, type SkCanvas, type SkPaint, type SkPath, type SkPicture, type SkRect } from '@shopify/react-native-skia';

const fills = new Map<string, SkPaint>();
const strokes = new Map<string, SkPaint>();
const rects = new Map<string, SkRect>();

/** Solid fill paint. `alpha` 0..1. */
export function fill(color: string, alpha = 1): SkPaint {
  const key = alpha === 1 ? color : `${color}/${alpha}`;
  let p = fills.get(key);
  if (!p) {
    p = Skia.Paint();
    p.setAntiAlias(true);
    p.setColor(Skia.Color(color));
    if (alpha !== 1) p.setAlphaf(alpha);
    fills.set(key, p);
  }
  return p;
}

/** Fill without anti-aliasing: for large shapes that tile edge to edge (no hairline seams). */
export function hardFill(color: string): SkPaint {
  const key = `${color}/hard`;
  let p = fills.get(key);
  if (!p) {
    p = Skia.Paint();
    p.setAntiAlias(false);
    p.setColor(Skia.Color(color));
    fills.set(key, p);
  }
  return p;
}

export function stroke(color: string, width: number, alpha = 1): SkPaint {
  const key = `${color}/${width}/${alpha}`;
  let p = strokes.get(key);
  if (!p) {
    p = Skia.Paint();
    p.setAntiAlias(true);
    p.setStyle(PaintStyle.Stroke);
    p.setStrokeWidth(width);
    p.setStrokeCap(StrokeCap.Round);
    p.setStrokeJoin(StrokeJoin.Round);
    p.setColor(Skia.Color(color));
    if (alpha !== 1) p.setAlphaf(alpha);
    strokes.set(key, p);
  }
  return p;
}

/** Cached rect (sizes repeat: crates, planks, bars). */
export function rect(x: number, y: number, w: number, h: number): SkRect {
  const key = `${x},${y},${w},${h}`;
  let r = rects.get(key);
  if (!r) {
    if (rects.size > 600) rects.clear();
    r = Skia.XYWHRect(x, y, w, h);
    rects.set(key, r);
  }
  return r;
}

/** Uncached rect for values that change every frame. */
export function tmpRect(x: number, y: number, w: number, h: number): SkRect {
  return Skia.XYWHRect(x, y, w, h);
}

export function poly(points: number[], close = true): SkPath {
  const b = Skia.PathBuilder.Make();
  b.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) b.lineTo(points[i], points[i + 1]);
  if (close) b.close();
  return b.detach();
}

/** Rounded rectangle helper. */
export function rrect(c: SkCanvas, x: number, y: number, w: number, h: number, r: number, paint: SkPaint): void {
  c.drawRRect(Skia.RRectXY(rect(x, y, w, h), r, r), paint);
}

export function record(w: number, h: number, draw: (c: SkCanvas) => void, ox = 0, oy = 0): SkPicture {
  const rec = Skia.PictureRecorder();
  const c = rec.beginRecording(Skia.XYWHRect(ox, oy, w, h));
  draw(c);
  return rec.finishRecordingAsPicture();
}

export const DEG = 180 / Math.PI;

/** Darken (amount < 0) or lighten (amount > 0) a #rrggbb colour. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => {
    const out = amount < 0 ? v * (1 + amount) : v + (255 - v) * amount;
    return Math.max(0, Math.min(255, Math.round(out))).toString(16).padStart(2, '0');
  };
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}
