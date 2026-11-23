// Builds the Play Store graphics for the 2D game from raw captures of the game scene.
//   node scripts/store-graphics.mjs
// It lives in this project only because @napi-rs/canvas is installed here.
// Input:  ../mobile/docs/store/graphics/raw/*.png  (1920 x 1080 scenes, and feature-base.png at 2048 x 1000)
// Output: ../mobile/docs/store/graphics/           (JPEG screenshots, feature graphic, 512 px icon)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '../../mobile/docs/store/graphics');
const raw = path.join(out, 'raw');

// Play wants JPEG or 24-bit PNG without transparency for screenshots and the feature graphic.
const jpeg = (canvas, name) => {
  fs.writeFileSync(path.join(out, name), canvas.toBuffer('image/jpeg', 98));
  console.log(name, canvas.width + ' x ' + canvas.height);
};

// ---- screenshots
const shots = fs.readdirSync(raw).filter((f) => f.startsWith('shot-')).sort();
for (const [i, file] of shots.entries()) {
  const img = await loadImage(path.join(raw, file));
  const c = createCanvas(1920, 1080);
  c.getContext('2d').drawImage(img, 0, 0, 1920, 1080);
  jpeg(c, `screenshot-${i + 1}.jpg`);
}

// ---- the same scenes at 1024 x 500 (cropped to that shape, then scaled down from the larger capture for sharp edges)
{
  const dir = path.join(out, '1024x500');
  fs.mkdirSync(dir, { recursive: true });
  for (const [i, file] of shots.entries()) {
    const img = await loadImage(path.join(raw, file));
    const c = createCanvas(1024, 500);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    // 1920 x 1080 is taller than 1024 x 500: keep the full width and the band the car drives in
    const srcH = (1920 * 500) / 1024;
    g.drawImage(img, 0, 80, 1920, srcH, 0, 0, 1024, 500);
    fs.writeFileSync(path.join(dir, `scene-${i + 1}-1024x500.jpg`), c.toBuffer('image/jpeg', 98));
    console.log(`1024x500/scene-${i + 1}-1024x500.jpg`);
  }
}

// ---- feature graphic, 1024 x 500
{
  const img = await loadImage(path.join(raw, 'feature-base.png'));
  const c = createCanvas(1024, 500);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, 1024, 500);
  // darker band behind the title so it reads on any sky
  const shade = g.createLinearGradient(0, 0, 0, 230);
  shade.addColorStop(0, 'rgba(8,14,20,0.62)');
  shade.addColorStop(1, 'rgba(8,14,20,0)');
  g.fillStyle = shade;
  g.fillRect(0, 0, 1024, 230);
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.lineJoin = 'round';
  const title = (text, y, size, fill) => {
    g.font = `900 ${size}px "Arial Black", Impact, Arial, sans-serif`;
    g.lineWidth = size * 0.16;
    g.strokeStyle = '#0e161d';
    g.strokeText(text, 512, y);
    g.fillStyle = fill;
    g.fillText(text, 512, y);
  };
  title('OFFROAD', 92, 78, '#ffffff');
  title('RACING 4x4', 168, 78, '#f2742b');
  jpeg(c, 'feature-graphic.jpg');
}

// ---- app icon, 512 x 512 (PNG, as Play requires)
{
  const img = await loadImage(path.join(here, '../../mobile/assets/icon.png'));
  const c = createCanvas(512, 512);
  c.getContext('2d').drawImage(img, 0, 0, 512, 512);
  fs.writeFileSync(path.join(out, 'icon-512.png'), c.toBuffer('image/png'));
  console.log('icon-512.png 512 x 512');
}
