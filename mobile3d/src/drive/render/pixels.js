// A very small software canvas: just enough (filled rectangles with alpha, radial falloff) to
// build the few textures the game still makes at run time. Coordinates are canvas-style
// (y runs down); the bytes are stored bottom-up, the order a texture wants.
import { pixelTexture } from '../../platform/textures';

const hex = (s) => { const n = parseInt(s.slice(1), 16); return s.length === 4 ? [((n >> 8) & 15) * 17, ((n >> 4) & 15) * 17, (n & 15) * 17] : [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

export class Pixels {
  /** bg: '#rgb' / '#rrggbb' for an opaque fill, or null for fully transparent. */
  constructor(w, h, bg = null) {
    this.w = w; this.h = h;
    this.data = new Uint8Array(w * h * 4);
    if (bg) this.fillRect(0, 0, w, h, bg, 1);
  }

  fillRect(x, y, w, h, color, alpha = 1) {
    const [r, g, b] = typeof color === 'string' ? hex(color) : color;
    const x0 = Math.max(0, Math.round(x)), x1 = Math.min(this.w, Math.round(x + w));
    const y0 = Math.max(0, Math.round(y)), y1 = Math.min(this.h, Math.round(y + h));
    const d = this.data;
    for (let yy = y0; yy < y1; yy++) {
      let k = ((this.h - 1 - yy) * this.w + x0) * 4;
      for (let xx = x0; xx < x1; xx++, k += 4) {
        if (alpha >= 1) { d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = 255; continue; }
        // source-over on straight (not premultiplied) alpha
        const da = d[k + 3] / 255, oa = alpha + da * (1 - alpha);
        d[k] = (r * alpha + d[k] * da * (1 - alpha)) / oa;
        d[k + 1] = (g * alpha + d[k + 1] * da * (1 - alpha)) / oa;
        d[k + 2] = (b * alpha + d[k + 2] * da * (1 - alpha)) / oa;
        d[k + 3] = oa * 255;
      }
    }
  }

  texture(opts) { return pixelTexture(this.data, this.w, this.h, opts); }
}

/** White disc fading to transparent at the edge (dust and spray particles). */
export function softDot(size = 32) {
  const p = new Pixels(size, size), c = (size - 1) / 2, d = p.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const k = (y * size + x) * 4, t = Math.min(1, Math.max(0, (Math.hypot(x - c, y - c) - 1) / (size / 2 - 1)));
    d[k] = d[k + 1] = d[k + 2] = 255; d[k + 3] = (1 - t) * 255;
  }
  return p.texture({ srgb: true, repeat: false });
}
