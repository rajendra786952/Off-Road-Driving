// All art is generated procedurally at boot, so the game runs with zero image
// files. Replace any texture key with a real PNG (this.load.image in
// BootScene) and nothing else needs to change.
import { THEMES } from '../config/themes.js';
import { VEHICLES } from '../config/vehicles.js';

export const VEHICLE_TEX = { w: 170, h: 100, cx: 85, cy: 62 };

function mix(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

function draw(scene, key, w, h, fn) {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  fn(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

function rotRect(cx, cy, w, h, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => ({
    x: cx + x * c - y * s,
    y: cy + x * s + y * c
  }));
}

export function ensureRoundedTexture(scene, key, w, h, r, fill, stroke, strokeW = 3, alpha = 1) {
  draw(scene, key, w, h, (g) => {
    g.fillStyle(fill, alpha);
    g.fillRoundedRect(strokeW, strokeW, w - strokeW * 2, h - strokeW * 2, r);
    if (stroke !== null && stroke !== undefined) {
      g.lineStyle(strokeW, stroke, 0.9);
      g.strokeRoundedRect(strokeW, strokeW, w - strokeW * 2, h - strokeW * 2, r);
    }
  });
}

// --------------------------------------------------------------------------
// Shared (theme independent) textures
// --------------------------------------------------------------------------
export function createCommonTextures(scene) {
  draw(scene, 'coin', 28, 28, (g) => {
    g.fillStyle(0xb8860b); g.fillCircle(14, 14, 13);
    g.fillStyle(0xffd23f); g.fillCircle(14, 14, 11);
    g.fillStyle(0xe8a900); g.fillCircle(14, 14, 7.5);
    g.fillStyle(0xffe27a); g.fillCircle(14, 14, 6);
    g.fillStyle(0xffffff, 0.7); g.fillCircle(9, 9, 2.5);
  });

  draw(scene, 'fuel_can', 32, 40, (g) => {
    g.fillStyle(0x7a1410); g.fillRoundedRect(4, 8, 24, 30, 5);
    g.fillStyle(0xd7261e); g.fillRoundedRect(5, 9, 22, 28, 5);
    g.fillStyle(0x7a1410); g.fillRect(8, 2, 8, 8); g.fillRect(16, 4, 8, 4);
    g.fillStyle(0xffd23f);
    g.fillTriangle(16, 16, 11, 26, 21, 26);
    g.fillCircle(16, 26, 5.5);
    g.fillStyle(0xffffff, 0.3); g.fillRoundedRect(7, 11, 4, 22, 2);
  });

  draw(scene, 'dust', 24, 24, (g) => {
    for (let i = 6; i >= 1; i--) {
      g.fillStyle(0xffffff, 0.09 * (7 - i) * 0.5 + 0.03);
      g.fillCircle(12, 12, i * 2);
    }
  });

  draw(scene, 'spark', 10, 10, (g) => {
    g.fillStyle(0xffe27a); g.fillCircle(5, 5, 4);
    g.fillStyle(0xffffff); g.fillCircle(5, 5, 2);
  });

  ensureRoundedTexture(scene, 'pedal', 190, 130, 22, 0x1d2a33, 0xffffff, 4, 0.9);
  ensureRoundedTexture(scene, 'pause_btn', 56, 56, 14, 0x1d2a33, 0xffffff, 3, 0.9);
  ensureRoundedTexture(scene, 'panel', 560, 340, 26, 0x16222b, 0x8fc1e3, 4, 0.96);

  draw(scene, 'finish_gate', 150, 260, (g) => {
    g.fillStyle(0x3a3f45); g.fillRect(6, 20, 10, 240); g.fillRect(134, 20, 10, 240);
    g.fillStyle(0x6a7078); g.fillRect(8, 20, 3, 240); g.fillRect(136, 20, 3, 240);
    const sq = 12;
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 11; x++) {
        g.fillStyle((x + y) % 2 === 0 ? 0x111111 : 0xffffff);
        g.fillRect(8 + x * sq, 22 + y * sq, sq, sq);
      }
    }
    g.fillStyle(0xd7261e); g.fillCircle(11, 14, 8); g.fillCircle(139, 14, 8);
  });

  // Vehicles
  VEHICLES.forEach((spec) => {
    createWheelTexture(scene, spec);
    createVehicleTexture(scene, spec);
  });
}

function createWheelTexture(scene, spec) {
  const r = spec.wheel.r;
  const size = r * 2 + 4;
  const c = size / 2;
  draw(scene, `wheel_${spec.id}`, size, size, (g) => {
    g.fillStyle(0x15181b); g.fillCircle(c, c, r);
    // tread blocks
    g.fillStyle(0x2c3238);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      g.fillPoints(rotRect(c + Math.cos(a) * (r - 2.5), c + Math.sin(a) * (r - 2.5), 6, 5, a), true);
    }
    g.fillStyle(0x23282d); g.fillCircle(c, c, r - 5);
    g.fillStyle(0xaab4bc); g.fillCircle(c, c, r * 0.58);
    g.fillStyle(0x6b757d); g.fillCircle(c, c, r * 0.44);
    // spokes (so rotation is visible)
    g.fillStyle(0xd5dde3);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.fillPoints(rotRect(c + Math.cos(a) * r * 0.3, c + Math.sin(a) * r * 0.3, r * 0.5, 3.5, a), true);
    }
    g.fillStyle(spec.colors.main); g.fillCircle(c, c, 3.5);
  });
}

function createVehicleTexture(scene, spec) {
  const { w: TW, h: TH, cx, cy } = VEHICLE_TEX;
  const { w, h } = spec.body;
  const col = spec.colors;
  const hx = cx + spec.head.x;
  const hy = cy - h / 2 - spec.head.lift;

  const driver = (g, helmet) => {
    g.fillStyle(0x2f3b46); g.fillRoundedRect(hx - 8, hy + 6, 16, 16, 4);
    g.fillStyle(0xf0c9a0); g.fillCircle(hx, hy, spec.head.r - 1);
    g.fillStyle(helmet); g.slice(hx, hy, spec.head.r + 1, Math.PI, 0, false); g.fillPath();
    g.fillStyle(0x1b1b1b); g.fillRect(hx + 1, hy - 1, 8, 3); // visor
  };

  draw(scene, `veh_${spec.id}`, TW, TH, (g) => {
    const L = cx - w / 2, R = cx + w / 2, T = cy - h / 2, B = cy + h / 2;

    if (spec.type === 'jeep') {
      g.fillStyle(col.dark); g.fillCircle(L - 6, cy - 2, 11); // spare tyre
      g.fillStyle(0x15181b); g.fillCircle(L - 6, cy - 2, 9); g.fillStyle(0x6b757d); g.fillCircle(L - 6, cy - 2, 4);
      driver(g, col.accent);
      g.lineStyle(4, col.dark); // roll cage
      g.beginPath(); g.moveTo(cx + 18, T); g.lineTo(cx + 28, T - 24); g.lineTo(cx - 28, T - 24); g.lineTo(cx - 38, T); g.strokePath();
      g.fillStyle(col.glass, 0.8); g.fillTriangle(cx + 18, T, cx + 27, T - 20, cx + 8, T); // windshield
      g.fillStyle(col.dark); g.fillRoundedRect(L - 2, B - 12, w + 4, 12, 4); // skid plate
      g.fillStyle(col.main); g.fillRoundedRect(L, T, w, h - 3, 8);
      g.fillStyle(col.accent); g.fillRect(L + 8, cy - 4, w - 22, 4);
      g.fillStyle(0xffe27a); g.fillCircle(R - 4, cy - 6, 4.5);
      g.fillStyle(0xd7261e); g.fillRect(L + 1, cy - 8, 4, 7);
    } else if (spec.type === 'pickup') {
      // bed (rear) + cab + hood
      g.fillStyle(col.dark); g.fillRoundedRect(L - 2, B - 12, w + 4, 12, 4);
      g.fillStyle(col.main); g.fillRoundedRect(L, T, w, h - 3, 7);
      g.fillStyle(col.dark); g.fillRect(L, T - 6, 6, 8); g.fillRect(cx - 24, T - 6, 5, 8); g.fillRect(L, T - 7, cx - 24 - L + 5, 3); // bed rails
      g.fillStyle(col.main);
      g.fillPoints([{ x: cx - 18, y: T }, { x: cx - 10, y: T - 30 }, { x: cx + 22, y: T - 30 }, { x: cx + 30, y: T }], true);
      g.fillStyle(col.glass, 0.9);
      g.fillPoints([{ x: cx - 12, y: T - 2 }, { x: cx - 6, y: T - 26 }, { x: cx + 19, y: T - 26 }, { x: cx + 25, y: T - 2 }], true);
      driver(g, col.accent);
      g.fillStyle(col.glass, 0.35);
      g.fillPoints([{ x: cx - 12, y: T - 2 }, { x: cx - 6, y: T - 26 }, { x: cx + 19, y: T - 26 }, { x: cx + 25, y: T - 2 }], true);
      g.fillStyle(col.accent); g.fillRect(L + 6, cy - 3, w - 18, 4);
      g.fillStyle(0xffe27a); g.fillCircle(R - 4, cy - 5, 5);
      g.fillStyle(0xd7261e); g.fillRect(L + 1, cy - 8, 4, 8);
      g.fillStyle(0x15181b); g.fillRect(R - 8, B - 12, 10, 6); // bull bar
    } else {
      // buggy
      g.lineStyle(4, 0x2a2e33); // tube cage
      g.beginPath(); g.moveTo(cx + 14, T); g.lineTo(cx + 18, T - 28); g.lineTo(cx - 22, T - 28); g.lineTo(cx - 26, T); g.strokePath();
      g.beginPath(); g.moveTo(cx - 2, T); g.lineTo(cx - 2, T - 28); g.strokePath();
      driver(g, col.accent);
      g.fillStyle(col.dark); g.fillRoundedRect(L - 2, B - 10, w + 4, 10, 4);
      g.fillStyle(col.main);
      g.fillPoints([{ x: L, y: T + 2 }, { x: R - 22, y: T - 2 }, { x: R + 4, y: cy - 2 }, { x: R, y: B - 3 }, { x: L, y: B - 3 }], true);
      g.fillStyle(col.accent); g.fillRect(L + 8, cy - 3, w - 34, 4);
      // rear wing
      g.fillStyle(col.dark); g.fillRect(L + 6, T - 14, 3, 16); g.fillRect(L + 22, T - 14, 3, 16);
      g.fillStyle(col.main); g.fillRoundedRect(L - 4, T - 20, 38, 7, 3);
      g.fillStyle(0xffe27a); g.fillCircle(R - 3, cy - 4, 4);
      g.fillStyle(0xd7261e); g.fillRect(L + 1, cy - 7, 4, 6);
    }
  });
}

// --------------------------------------------------------------------------
// Theme textures (sky, parallax hills, clouds, decor)
// --------------------------------------------------------------------------
export function createThemeTextures(scene, themeId) {
  const th = THEMES[themeId];
  const id = themeId;

  draw(scene, `sky_${id}`, 960, 540, (g) => {
    const bands = 54;
    for (let i = 0; i < bands; i++) {
      g.fillStyle(mix(th.skyTop, th.skyBottom, i / (bands - 1)));
      g.fillRect(0, i * 10, 960, 11);
    }
  });

  draw(scene, `sun_${id}`, 220, 220, (g) => {
    for (let i = 9; i >= 1; i--) {
      g.fillStyle(th.sun, 0.05 + (9 - i) * 0.02);
      g.fillCircle(110, 110, 30 + i * 8);
    }
    g.fillStyle(th.sun); g.fillCircle(110, 110, 34);
  });

  // Hill layers tile seamlessly: every sine has an integer number of periods over 1024px.
  const hills = (key, color, base, a1, k1, a2, k2, a3, k3, ph) =>
    draw(scene, key, 1024, 512, (g) => {
      g.fillStyle(color);
      const pts = [{ x: 0, y: 512 }];
      for (let x = 0; x <= 1024; x += 16) {
        const t = (x / 1024) * Math.PI * 2;
        pts.push({ x, y: base + Math.sin(t * k1 + ph) * a1 + Math.sin(t * k2 + ph * 2) * a2 + Math.sin(t * k3 + ph * 3) * a3 });
      }
      pts.push({ x: 1024, y: 512 });
      g.fillPoints(pts, true);
    });
  hills(`hills_far_${id}`, th.farHill, 210, 60, 2, 28, 5, 10, 11, 0.7);
  hills(`hills_near_${id}`, th.nearHill, 270, 36, 3, 18, 7, 8, 13, 2.1);

  draw(scene, 'cloud', 200, 80, (g) => {
    g.fillStyle(0xffffff, 0.92);
    g.fillCircle(55, 50, 28); g.fillCircle(95, 38, 34); g.fillCircle(135, 50, 28);
    g.fillRoundedRect(40, 46, 115, 30, 15);
    g.fillStyle(0xdbe9f3, 0.6); g.fillRoundedRect(46, 62, 106, 12, 6);
  });

  // Decor
  draw(scene, `decor_${id}_tree`, 90, 130, (g) => {
    g.fillStyle(th.trunk); g.fillRect(40, 70, 10, 60);
    g.fillStyle(mix(th.leaf, 0x000000, 0.2)); g.fillCircle(45, 52, 32);
    g.fillStyle(th.leaf); g.fillCircle(36, 44, 26); g.fillCircle(56, 42, 24);
    g.fillStyle(mix(th.leaf, 0xffffff, 0.2)); g.fillCircle(40, 36, 12);
  });
  draw(scene, `decor_${id}_pine`, 70, 140, (g) => {
    g.fillStyle(th.trunk); g.fillRect(31, 110, 8, 30);
    const c = mix(th.leaf, 0x000000, 0.1);
    g.fillStyle(c); g.fillTriangle(35, 4, 6, 50, 64, 50);
    g.fillStyle(mix(c, 0xffffff, 0.08)); g.fillTriangle(35, 30, 2, 82, 68, 82);
    g.fillStyle(mix(c, 0x000000, 0.1)); g.fillTriangle(35, 58, -2, 116, 72, 116);
  });
  draw(scene, `decor_${id}_bush`, 70, 40, (g) => {
    g.fillStyle(mix(th.bush, 0x000000, 0.2)); g.fillCircle(35, 28, 14); g.fillCircle(18, 30, 11); g.fillCircle(52, 30, 11);
    g.fillStyle(th.bush); g.fillCircle(30, 22, 13); g.fillCircle(46, 24, 11);
  });
  draw(scene, `decor_${id}_rock`, 64, 40, (g) => {
    g.fillStyle(mix(th.rock, 0x000000, 0.25));
    g.fillPoints([{ x: 2, y: 38 }, { x: 10, y: 14 }, { x: 30, y: 4 }, { x: 52, y: 16 }, { x: 62, y: 38 }], true);
    g.fillStyle(th.rock);
    g.fillPoints([{ x: 6, y: 36 }, { x: 14, y: 16 }, { x: 30, y: 8 }, { x: 44, y: 18 }, { x: 40, y: 36 }], true);
  });
}
