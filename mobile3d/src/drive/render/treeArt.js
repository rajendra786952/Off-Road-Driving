// The foliage-card artwork (greyscale + alpha). Pure 2D-canvas drawing with no imports, so
// scripts/bake-assets.mjs can run it in Node; the game loads the baked result (see trees.js).
export const COLS = 4, ROWS = 2, CELL = 256;

export function rng(seed) { let a = seed >>> 0; return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** Greyscale + alpha artwork for every card. Luminance only: the region's foliage colour is applied per vertex. */
export function drawTreeAtlas(c) {
  c.width = COLS * CELL; c.height = ROWS * CELL;
  const g = c.getContext('2d');
  const grey = (l, a = 1) => `rgba(${l},${l},${l},${a})`;
  const at = (col, row, fn) => { g.save(); g.translate(col * CELL, row * CELL); g.beginPath(); g.rect(0, 0, CELL, CELL); g.clip(); fn(rng(col * 31 + row * 97 + 5)); g.restore(); };
  const leaf = (x, y, len, wid, ang, l) => {
    g.save(); g.translate(x, y); g.rotate(ang);
    g.fillStyle = grey(l); g.beginPath(); g.ellipse(len / 2, 0, len / 2, wid / 2, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = grey(Math.max(0, l - 60), 0.7); g.lineWidth = 1; g.beginPath(); g.moveTo(0, 0); g.lineTo(len, 0); g.stroke();
    g.restore();
  };
  // a fir bough: twig along +x from the trunk (left) to the tip (right), needles both sides, pointed at the tip
  const bough = (R, x0, y0, len, ang, wide) => {
    g.save(); g.translate(x0, y0); g.rotate(ang);
    g.strokeStyle = grey(95); g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(len, 0); g.stroke();
    for (let x = 4; x < len; x += 2.4) {
      const t = x / len, nl = wide * (0.35 + 0.65 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.62)) * (1 - t * 0.55);
      for (const sd of [-1, 1]) {
        g.strokeStyle = grey(150 + Math.floor(R() * 105)); g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x + nl * 0.55, sd * nl * (0.8 + R() * 0.3)); g.stroke();
      }
    }
    g.restore();
  };
  at(0, 0, (R) => {
    bough(R, 6, 128, 244, 0, 46);
    for (const [x, a, l] of [[40, -0.5, 150], [40, 0.5, 150], [95, -0.42, 120], [95, 0.42, 120], [150, -0.36, 80], [150, 0.36, 80]]) bough(R, x, 128, l, a, 34);
  });
  at(1, 0, (R) => {
    for (let i = 0; i < 150; i++) {
      const a = R() * 6.283, d = Math.sqrt(R()) * 108;
      leaf(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 20 + R() * 16, 9 + R() * 7, R() * 6.283, 135 + Math.floor(R() * 120));
    }
  });
  at(2, 0, (R) => {
    g.strokeStyle = grey(120); g.lineWidth = 4; g.beginPath(); g.moveTo(4, 128); g.lineTo(250, 128); g.stroke();
    for (let x = 10; x < 246; x += 5) {
      const t = x / 246, len = 96 * Math.sin(Math.min(1, t * 1.15 + 0.12) * Math.PI) + 14;
      for (const sd of [-1, 1]) leaf(x, 128, len, 7, sd * (0.95 - t * 0.35), 150 + Math.floor(R() * 100));
    }
  });
  at(3, 0, (R) => {
    for (let i = 0; i < 16; i++) { const a = (i / 16) * 6.283 + R() * 0.3; leaf(128 + Math.cos(a) * 10, 128 + Math.sin(a) * 10, 82 + R() * 34, 30 + R() * 16, a, 140 + Math.floor(R() * 110)); }
    for (let i = 0; i < 9; i++) { const a = R() * 6.283; leaf(128, 128, 50 + R() * 30, 24 + R() * 10, a, 190 + Math.floor(R() * 60)); }
  });
  // whole trees for the far LOD (trunk drawn dark so the foliage tint does not turn it bright green)
  at(0, 1, (R) => {
    g.fillStyle = grey(60); g.fillRect(122, 150, 12, 106);
    for (let tier = 0; tier < 9; tier++) {
      const y = 232 - tier * 25, w = 112 * (1 - tier / 10.5);
      for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) bough(R, 128, y - k * 5, w * (1 - k * 0.22), sd > 0 ? 0.42 + k * 0.1 : Math.PI - 0.42 - k * 0.1, 22);
    }
    bough(R, 128, 40, 34, -Math.PI / 2, 12);
  });
  at(1, 1, (R) => {
    g.fillStyle = grey(60); g.fillRect(118, 150, 20, 106);
    for (const [x, a] of [[128, -2.2], [128, -0.9]]) { g.strokeStyle = grey(60); g.lineWidth = 8; g.beginPath(); g.moveTo(x, 190); g.lineTo(x + Math.cos(a) * 60, 190 + Math.sin(a) * 60); g.stroke(); }
    for (let i = 0; i < 420; i++) {
      const a = R() * 6.283, d = Math.sqrt(R());
      const x = 128 + Math.cos(a) * d * 118, y = 100 + Math.sin(a) * d * 88;
      leaf(x, y, 13 + R() * 9, 6 + R() * 4, R() * 6.283, Math.floor((120 + R() * 110) * (0.72 + 0.28 * (1 - y / 190))));
    }
  });
  at(2, 1, (R) => {
    g.fillStyle = grey(60); g.beginPath(); g.moveTo(112, 256); g.lineTo(122, 70); g.lineTo(134, 70); g.lineTo(146, 256); g.fill();
    for (let i = 0; i < 380; i++) {
      const a = R() * 6.283, d = Math.sqrt(R());
      const x = 128 + Math.cos(a) * d * 124, y = 62 + Math.sin(a) * d * 46;
      leaf(x, y, 16 + R() * 12, 8 + R() * 6, R() * 6.283, Math.floor((120 + R() * 115) * (0.7 + 0.3 * (1 - y / 110))));
    }
    for (let i = 0; i < 70; i++) { const a = R() * 6.283, d = Math.sqrt(R()); leaf(176 + Math.cos(a) * d * 44, 132 + Math.sin(a) * d * 22, 14 + R() * 8, 7 + R() * 4, R() * 6.283, 120 + Math.floor(R() * 90)); }
  });
  return c;
}

