// Turns the source art in assets/source into what the phone build loads: raw RGBA pixel files
// (assets/game/*.bin) plus src/platform/assetIndex.ts, which lists every bundled file.
//
// Why: the game was written for a browser, where textures were decoded and resized with a 2D
// canvas. React Native has no canvas, so the decoding, resizing and the canvas-drawn artwork
// (tree foliage cards, gate banners) are done here, once, on the developer's machine.
// Rows are stored bottom-up, the order WebGL wants. Run with:  npm run bake
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { drawTreeAtlas } from '../src/drive/render/treeArt.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'assets/source');
const OUT = path.join(root, 'assets/game');
const PACK = 'Trail_Torque_Balanced_Asset_Pack';
fs.mkdirSync(OUT, { recursive: true });

const info = {};
const files = {};

/** Canvas pixels (top-down) -> bottom-up bytes. */
function flipped(ctx, w, h) {
  const px = ctx.getImageData(0, 0, w, h).data, row = w * 4, out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) out.set(px.subarray(y * row, y * row + row), (h - 1 - y) * row);
  return { out, px };
}
function write(key, bytes, meta) {
  fs.writeFileSync(path.join(OUT, key + '.bin'), bytes);
  info[key] = meta;
  files[key] = `../../assets/game/${key}.bin`;
  console.log(`${key}.bin  ${(bytes.length / 1048576).toFixed(2)} MB`);
}
async function image(key, file, size) {
  const img = await loadImage(path.join(SRC, file));
  const w = size || img.width, h = size || img.height;
  const cv = createCanvas(w, h), g = cv.getContext('2d');
  g.drawImage(img, 0, 0, w, h);
  const { out, px } = flipped(g, w, h);
  write(key, out, { w, h });
  return px;
}

// ---- ground photos: eight layers packed into one colour array and one normal array
const LAYERS = ['grass', 'dirt', 'mud', 'rock', 'gravel', 'sand', 'snow', 'forest'];
const PACK_GROUND = ['grass', 'dirt', 'mud', 'rock', 'gravel', 'sand', 'asphalt'];
const S = 512, SN = 256;
const mean = {};
async function ground(prefix, fileOf) {
  const pack = async (size, pick) => {
    const cv = createCanvas(size, size), g = cv.getContext('2d');
    const data = new Uint8Array(size * size * 4 * LAYERS.length);
    const means = [];
    for (let i = 0; i < LAYERS.length; i++) {
      const img = await loadImage(path.join(SRC, fileOf(LAYERS[i])[pick]));
      g.clearRect(0, 0, size, size);
      g.drawImage(img, 0, 0, size, size);
      const { out, px } = flipped(g, size, size);
      data.set(out, i * size * size * 4);
      // average colour in linear light: the terrain shader divides by it so only the layer's detail remains
      let r = 0, gg = 0, b = 0, n = 0;
      for (let k = 0; k < px.length; k += 4 * 37) { r += Math.pow(px[k] / 255, 2.2); gg += Math.pow(px[k + 1] / 255, 2.2); b += Math.pow(px[k + 2] / 255, 2.2); n++; }
      means.push([r / n, gg / n, b / n].map((v) => Number(v.toFixed(5))));
    }
    return { data, means };
  };
  const c = await pack(S, 0), nm = await pack(SN, 1);
  write(prefix + '_c', c.data, { w: S, h: S, layers: LAYERS.length });
  write(prefix + '_n', nm.data, { w: SN, h: SN, layers: LAYERS.length });
  mean[prefix] = c.means;
}
await ground('ground', (n) => [`textures/ground/${n}_diff.jpg`, `textures/ground/${n}_nor.jpg`]);
// the pack has seven ground textures: its asphalt takes the snow slot and its grass doubles as forest floor
await ground('pack_ground', (n) => {
  const p = n === 'snow' ? 'asphalt' : n === 'forest' ? 'grass' : PACK_GROUND.includes(n) ? n : 'dirt';
  return [`${PACK}/textures/ground/${p}_color.jpg`, `${PACK}/textures/ground/${p}_normal.png`];
});

// ---- bark: the trunk material divides out the photo's average brightness
const barkGain = {};
for (const name of ['pine', 'broad', 'palm']) {
  await image('bark_' + name, `textures/trees/bark_${name}.jpg`, 512);
  const img = await loadImage(path.join(SRC, `textures/trees/bark_${name}.jpg`));
  const cv = createCanvas(16, 16), g = cv.getContext('2d');
  g.drawImage(img, 0, 0, 16, 16);
  const px = g.getImageData(0, 0, 16, 16).data;
  let lum = 0;
  for (let k = 0; k < px.length; k += 4) lum += Math.pow((px[k] + px[k + 1] + px[k + 2]) / 765, 2.2);
  lum = Math.max(0.03, lum / (px.length / 4));
  barkGain[name] = Number(Math.min(2.5, 0.17 / lum).toFixed(4));
}

// ---- asset pack textures
await image('pack_facade', `${PACK}/textures/buildings/office_facade.jpg`, 512);
await image('pack_water_normal', `${PACK}/textures/water/water_normal.png`, 256);
await image('pack_water_color', `${PACK}/textures/water/water_foam_color.png`, 512);

// ---- artwork that used to be drawn at run time
{
  const cv = drawTreeAtlas(createCanvas(4, 4));
  const { out } = flipped(cv.getContext('2d'), cv.width, cv.height);
  write('tree_atlas', out, { w: cv.width, h: cv.height });
}
const banner = (key, text, bg) => {
  const c = createCanvas(256, 48), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 48);
  if (text === '#') {
    for (let y = 0; y < 3; y++) for (let x = 0; x < 16; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#eee'; g.fillRect(x * 16, y * 16, 16, 16); }
  } else {
    g.fillStyle = '#fff'; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 128, 25);
  }
  write(key, flipped(g, 256, 48).out, { w: 256, h: 48 });
};
banner('banner_finish', '#', '#fff');
banner('banner_start', 'START', '#2f9e55');
for (let i = 1; i <= 12; i++) banner('banner_cp' + i, `CHECKPOINT ${i}`, '#c8771a');

// ---- models are bundled as they are
const models = {};
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.glb')) models[e.name.replace('.glb', '')] = '../../' + path.relative(root, p).replace(/\\/g, '/');
  }
};
walk(path.join(SRC, PACK, 'models'));

const req = (o) => Object.entries(o).map(([k, v]) => `  ${JSON.stringify(k)}: require(${JSON.stringify(v)}),`).join('\n');
fs.mkdirSync(path.join(root, 'src/platform'), { recursive: true });
fs.writeFileSync(path.join(root, 'src/platform/assetIndex.ts'), `// Generated by scripts/bake-assets.mjs. Do not edit: run "npm run bake".
export interface RawInfo { w: number; h: number; layers?: number }

/** Raw RGBA pixel files (rows bottom-up). */
export const RAW_FILES: Record<string, number> = {
${req(files)}
};
export const RAW_INFO: Record<string, RawInfo> = ${JSON.stringify(info)};

/** Asset-pack models (GLB), by name. */
export const MODEL_FILES: Record<string, number> = {
${req(models)}
};

/** Average colour of each ground layer, in linear light. */
export const GROUND_MEAN: Record<string, number[][]> = ${JSON.stringify(mean)};
/** Brightness correction for each bark photo. */
export const BARK_GAIN: Record<string, number> = ${JSON.stringify(barkGain)};
`);
console.log('wrote src/platform/assetIndex.ts');
