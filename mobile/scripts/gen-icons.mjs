// Draws the app icon set (the game's green jeep climbing in the Red Canyon, with a "4x4" badge)
// and writes the PNG files into assets/. No image library: a small supersampled
// rasteriser and a PNG encoder on top of zlib.  Run:  node scripts/gen-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const S = 1024; // design size
const SS = 3; // samples per axis per pixel

// ---------------------------------------------------------------- shapes (inside tests in design space)
const circle = (cx, cy, r) => ({ box: [cx - r, cy - r, cx + r, cy + r], inside: (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r });
const seg = (x1, y1, x2, y2, w) => {
  const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy, h = w / 2;
  return {
    box: [Math.min(x1, x2) - h, Math.min(y1, y2) - h, Math.max(x1, x2) + h, Math.max(y1, y2) + h],
    inside: (x, y) => {
      const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2));
      return (x - x1 - t * dx) ** 2 + (y - y1 - t * dy) ** 2 <= h * h;
    },
  };
};
const poly = (pts) => {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return {
    box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    inside: (x, y) => {
      let c = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    },
  };
};
const rrect = (x, y, w, h, r) => ({
  box: [x, y, x + w, y + h],
  inside: (px, py) => {
    const qx = Math.max(x + r - px, 0, px - (x + w - r));
    const qy = Math.max(y + r - py, 0, py - (y + h - r));
    return px >= x && px <= x + w && py >= y && py <= y + h && qx * qx + qy * qy <= r * r;
  },
});
/** Place a shape: scale, rotate (degrees) and move it. */
const place = (shape, { x = 0, y = 0, scale = 1, rot = 0 }) => {
  const a = (rot * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const [x0, y0, x1, y1] = shape.box;
  const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([px, py]) => [x + scale * (px * cos - py * sin), y + scale * (px * sin + py * cos)]);
  return {
    box: [Math.min(...corners.map((c) => c[0])), Math.min(...corners.map((c) => c[1])), Math.max(...corners.map((c) => c[0])), Math.max(...corners.map((c) => c[1]))],
    inside: (px, py) => {
      const dx = (px - x) / scale, dy = (py - y) / scale;
      return shape.inside(dx * cos + dy * sin, -dx * sin + dy * cos);
    },
  };
};

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// ---------------------------------------------------------------- artwork
function truck(mono) {
  // the game's starter jeep: green open body, roll cage, helmeted driver, spare wheel, knobbly tyres
  const c = (h) => (mono ? '#ffffff' : h);
  const WY = 118; // wheel centre height
  const layers = [];
  if (!mono) layers.push([circle(-310, -18, 54), '#1c2026'], [circle(-310, -18, 26), '#9aa3ad']); // spare wheel
  layers.push(
    [seg(-36, -40, 14, -176, 18), c('#27303b')], // roll cage
    [seg(14, -176, 150, -152, 18), c('#27303b')],
    [seg(150, -152, 172, -40, 18), c('#27303b')],
    [rrect(-292, -44, 584, 112, 30), c('#3f9b4b')], // body
  );
  if (!mono) {
    layers.push(
      [rrect(-292, 22, 584, 46, 20), '#2c7438'], // lower body
      [rrect(-262, -32, 520, 14, 7), '#63bd6d'], // highlight
      [circle(84, -92, 42), '#ffc62b'], // helmet
      [rrect(92, -104, 42, 22, 8), '#27303b'], // visor
      [rrect(58, -58, 52, 22, 6), '#27303b'], // shoulders
      [rrect(262, -28, 26, 32, 8), '#fff08a'], // headlight
      [rrect(-290, -28, 18, 30, 6), '#e0463c'], // tail light
      [rrect(272, 30, 40, 30, 8), '#27303b'], // bumper
    );
  }
  for (const wx of [-176, 176]) {
    if (mono) {
      // a ring reads as a wheel in a one-colour icon
      layers.push([circle(wx, WY, 112), '#000000', 'cut'], [circle(wx, WY, 100), '#ffffff'], [circle(wx, WY, 50), '#000000', 'cut']);
    } else {
      layers.push([circle(wx, WY - 22, 118), '#1f5a2c'], [circle(wx, WY, 98), '#1c2026']); // wheel arch, tyre
      for (let i = 0; i < 14; i++) {
        const t = (i * Math.PI * 2) / 14;
        layers.push([circle(wx + Math.cos(t) * 99, WY + Math.sin(t) * 99, 13), '#1c2026']); // tread blocks
      }
      layers.push([circle(wx, WY, 56), '#c3cad3']);
      for (let i = 0; i < 6; i++) {
        const t = (i * Math.PI * 2) / 6 + 0.3;
        layers.push([seg(wx, WY, wx + Math.cos(t) * 50, WY + Math.sin(t) * 50, 12), '#3a3f48']);
      }
      layers.push([circle(wx, WY, 20), '#2b3238']);
    }
  }
  return layers;
}

/** "4x4" as thick strokes. Origin top-left, cap height 200. */
function badge(color, dx = 0, dy = 0) {
  const w = 44;
  const four = (x) => [seg(x + 112, 0, x + 112, 200, w), seg(x + 112, 0, x + 6, 132, w), seg(x + 6, 132, x + 150, 132, w)];
  const strokes = [...four(0), seg(196, 70, 286, 190, 38), seg(286, 70, 196, 190, 38), ...four(330)];
  return strokes.map((s) => [place(s, { x: dx, y: dy }), color]);
}
const BADGE_W = 480;

function scene(kind) {
  const layers = [];
  const bg = kind === 'icon' || kind === 'background';
  const fg = kind !== 'background';
  const mono = kind === 'mono';
  if (bg) {
    layers.push(
      [circle(770, 330, 250), '#ffe7a8', 0.25],
      [circle(770, 330, 160), '#ffe7a8'],
      [poly([[0, 560], [40, 430], [250, 430], [290, 560], [430, 560], [470, 380], [700, 380], [740, 560], [860, 560], [890, 470], [1024, 470], [1024, 1024], [0, 1024]]), '#dc9a68'],
      [poly([[0, 700], [120, 700], [150, 600], [380, 600], [420, 740], [560, 740], [600, 640], [840, 640], [880, 760], [1024, 760], [1024, 1024], [0, 1024]]), '#b8664a'],
    );
  }
  if (kind === 'icon') layers.push([poly([[0, 968], [1024, 788], [1024, 1024], [0, 1024]]), '#8f3f2c'], [poly([[0, 948], [1024, 768], [1024, 792], [0, 972]]), '#e59460']);
  if (fg) {
    // the adaptive-icon foreground must stay inside the middle two thirds
    const k = kind === 'icon' ? 1 : kind === 'splash' ? 0.92 : 0.6;
    const at = (x, y) => [512 + (x - 512) * k, 512 + (y - 512) * k];
    const [tx, ty] = at(512, kind === 'icon' ? 612 : 600);
    for (const [shape, color, mode] of truck(mono)) layers.push([place(shape, { x: tx, y: ty, scale: 1.14 * k, rot: kind === 'icon' ? -10 : -8 }), color, 1, mode]);
    const [bx, by] = at(512 - BADGE_W / 2, kind === 'icon' ? 96 : 60);
    if (!mono) for (const [shape, color] of badge('#2a1206')) layers.push([place(shape, { x: bx + 9 * k, y: by + 12 * k, scale: k }), color, 0.9]);
    for (const [shape, color] of badge(mono ? '#ffffff' : '#ffd23f')) layers.push([place(shape, { x: bx, y: by, scale: k }), color]);
  }
  return { layers, gradient: bg ? [hex('#c2553a'), hex('#eeb07c')] : null };
}

// ---------------------------------------------------------------- rasteriser
function render(kind, size) {
  const { layers, gradient } = scene(kind);
  const px = new Float32Array(size * size * 4); // premultiplied RGBA, 0..1
  if (gradient) {
    for (let y = 0; y < size; y++) {
      const t = y / (size - 1);
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        for (let c = 0; c < 3; c++) px[i + c] = (gradient[0][c] + (gradient[1][c] - gradient[0][c]) * t) / 255;
        px[i + 3] = 1;
      }
    }
  }
  const k = S / size;
  for (const [shape, color, alpha = 1, mode] of layers) {
    const [r, g, b] = hex(color).map((v) => v / 255);
    const x0 = Math.max(0, Math.floor(shape.box[0] / k)), x1 = Math.min(size - 1, Math.ceil(shape.box[2] / k));
    const y0 = Math.max(0, Math.floor(shape.box[1] / k)), y1 = Math.min(size - 1, Math.ceil(shape.box[3] / k));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        let hit = 0;
        for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) if (shape.inside((x + (sx + 0.5) / SS) * k, (y + (sy + 0.5) / SS) * k)) hit++;
        if (!hit) continue;
        const a = (hit / (SS * SS)) * alpha;
        const i = (y * size + x) * 4;
        if (mode === 'cut') {
          for (let c = 0; c < 4; c++) px[i + c] *= 1 - a; // punch a hole
        } else {
          px[i] = r * a + px[i] * (1 - a);
          px[i + 1] = g * a + px[i + 1] * (1 - a);
          px[i + 2] = b * a + px[i + 2] * (1 - a);
          px[i + 3] = a + px[i + 3] * (1 - a);
        }
      }
    }
  }
  const bytes = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const a = px[i * 4 + 3];
    for (let c = 0; c < 3; c++) bytes[i * 4 + c] = a > 0 ? Math.round(Math.min(1, px[i * 4 + c] / a) * 255) : 0;
    bytes[i * 4 + 3] = Math.round(a * 255);
  }
  return bytes;
}

// ---------------------------------------------------------------- PNG
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const b of body) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8);
  const len = Buffer.alloc(4), end = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  end.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([len, body, end]);
}
function writePng(name, kind, size) {
  const rgba = render(kind, size);
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const head = Buffer.alloc(13);
  head.writeUInt32BE(size, 0);
  head.writeUInt32BE(size, 4);
  head.set([8, 6, 0, 0, 0], 8);
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
  fs.writeFileSync(path.join(out, name), png);
  console.log(`${name}  ${size}x${size}  ${(png.length / 1024).toFixed(0)} KB`);
}

writePng('icon.png', 'icon', 1024);
writePng('android-icon-background.png', 'background', 512);
writePng('android-icon-foreground.png', 'foreground', 512);
writePng('android-icon-monochrome.png', 'mono', 432);
writePng('splash-icon.png', 'splash', 1024);
writePng('favicon.png', 'icon', 48);
