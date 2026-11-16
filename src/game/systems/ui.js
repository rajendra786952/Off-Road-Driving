import Phaser from 'phaser';
import { ensureRoundedTexture } from './TextureFactory.js';
import { GAME_W, GAME_H } from '../config/constants.js';

export const FONT = '"Trebuchet MS", "Segoe UI", Arial, sans-serif';

export function makeText(scene, x, y, str, opts = {}) {
  const t = scene.add.text(x, y, str, {
    fontFamily: FONT,
    fontSize: opts.size || '24px',
    color: opts.color || '#ffffff',
    fontStyle: opts.bold === false ? 'normal' : 'bold',
    stroke: opts.stroke ?? '#1b2a33',
    strokeThickness: opts.strokeThickness ?? 4,
    align: opts.align || 'center',
    wordWrap: opts.wrap ? { width: opts.wrap } : undefined
  });
  t.setOrigin(opts.originX ?? 0.5, opts.originY ?? 0.5);
  t.setResolution(2);
  return t;
}

/** Pin an object (or container + children) to the screen. */
export function fixed(obj) {
  obj.setScrollFactor(0);
  if (obj.list) obj.list.forEach((c) => fixed(c));
  return obj;
}

/**
 * Rounded, tappable button. Returns a Container with
 * `.setLabel(str)`, `.setEnabled(bool)`.
 */
export function makeButton(scene, x, y, w, h, label, onClick, opts = {}) {
  const color = opts.color ?? 0x2f6fa8;
  const key = `btn_${w}x${h}_${color.toString(16)}`;
  ensureRoundedTexture(scene, key, w, h, 14, color, 0xffffff, 3, 1);

  const img = scene.add.image(0, 0, key);
  const text = makeText(scene, 0, 0, label, { size: opts.size || '26px' });
  const c = scene.add.container(x, y, [img, text]);
  c.setSize(w, h);
  c.enabled = true;

  img.setInteractive({ useHandCursor: true });
  img.on('pointerdown', () => c.setScale(0.95));
  img.on('pointerout', () => c.setScale(1));
  img.on('pointerup', () => {
    c.setScale(1);
    if (!c.enabled) {
      if (opts.onDisabled) opts.onDisabled();
      return;
    }
    if (opts.sfx) opts.sfx();
    onClick();
  });

  c.setLabel = (s) => { text.setText(s); return c; };
  c.setEnabled = (on) => {
    c.enabled = on;
    c.setAlpha(on ? 1 : 0.55);
    return c;
  };
  if (opts.fixed) fixed(c);
  if (opts.depth !== undefined) c.setDepth(opts.depth);
  return c;
}

/** Full-screen dimmed overlay + centred panel. Returns the container so it can be destroyed. */
export function makePanel(scene, { title, lines = [], buttons = [], depth = 200, height = 340 }) {
  const items = [];
  const dim = scene.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.55);
  dim.setInteractive(); // swallow taps behind the panel
  items.push(dim);

  const panel = scene.add.image(GAME_W / 2, GAME_H / 2, 'panel');
  panel.setDisplaySize(560, height);
  items.push(panel);

  const top = GAME_H / 2 - height / 2;
  items.push(makeText(scene, GAME_W / 2, top + 44, title, { size: '40px', color: '#ffd23f' }));

  let y = top + 100;
  lines.forEach((ln) => {
    const spec = typeof ln === 'string' ? { text: ln } : ln;
    items.push(makeText(scene, GAME_W / 2, y, spec.text, { size: spec.size || '24px', color: spec.color || '#ffffff' }));
    y += spec.gap ?? 36;
  });

  const bw = buttons.length > 2 ? 160 : 200;
  const gap = 16;
  const total = buttons.length * bw + (buttons.length - 1) * gap;
  buttons.forEach((b, i) => {
    const bx = GAME_W / 2 - total / 2 + bw / 2 + i * (bw + gap);
    items.push(
      makeButton(scene, bx, top + height - 52, bw, 60, b.label, b.onClick, {
        color: b.color, size: '22px', sfx: b.sfx
      })
    );
  });

  const container = scene.add.container(0, 0, items);
  fixed(container);
  container.setDepth(depth);
  return container;
}

/** Android back button / ESC helper that cleans up after itself. */
export function bindBack(scene, handler) {
  const off = () => scene.game.events.off('android-back', handler);
  scene.game.events.on('android-back', handler);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
  scene.events.once(Phaser.Scenes.Events.DESTROY, off);
  if (scene.input.keyboard) scene.input.keyboard.on('keydown-ESC', handler);
}

export function fmtCoins(n) {
  return Number(n).toLocaleString('en-IN');
}

/** Simple themed backdrop used by menu-type scenes. */
export function menuBackdrop(scene, themeId = 'green-valley') {
  scene.add.image(0, 0, `sky_${themeId}`).setOrigin(0, 0);
  scene.add.image(GAME_W - 130, 100, `sun_${themeId}`).setAlpha(0.9);
  scene.add.tileSprite(0, 40, GAME_W, 512, `hills_far_${themeId}`).setOrigin(0, 0);
  const near = scene.add.tileSprite(0, 110, GAME_W, 512, `hills_near_${themeId}`).setOrigin(0, 0);
  near.tilePositionX = 300;
}
