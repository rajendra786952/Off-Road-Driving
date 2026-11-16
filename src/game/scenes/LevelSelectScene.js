import Phaser from 'phaser';
import { GAME_W } from '../config/constants.js';
import { LEVELS } from '../config/levels.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import AudioSystem from '../systems/AudioSystem.js';
import { makeText, makeButton, bindBack, menuBackdrop, fmtCoins } from '../systems/ui.js';

export default class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super('LevelSelectScene');
  }

  create() {
    const save = SaveSystem.data;
    const audio = new AudioSystem(this, save.settings);
    const sfx = () => audio.click();
    menuBackdrop(this);

    makeText(this, GAME_W / 2, 44, 'SELECT LEVEL', { size: '44px', color: '#ffd23f' });
    makeText(this, GAME_W / 2, 82, 'Complete each level to unlock the next world!', { size: '16px', color: '#8fc1e3', bold: false });
    makeButton(this, 90, 44, 130, 50, 'BACK', () => this.scene.start('MenuScene'), { color: 0x3a4a56, size: '22px', sfx });
    this.add.image(GAME_W - 150, 44, 'coin').setScale(1.1);
    makeText(this, GAME_W - 128, 44, fmtCoins(save.coins), { size: '26px', originX: 0, color: '#ffd23f' });

    const showLocked = (id) => {
      audio.deny();
      if (this.toast) this.toast.destroy();
      const msg = `Complete Level ${id - 1} to unlock Level ${id}!`;
      const t = makeText(this, GAME_W / 2, 114, msg, { size: '18px', color: '#ff7b72' }).setDepth(50);
      this.toast = t;
      this.tweens.add({ targets: t, alpha: 0, duration: 2000, delay: 800, onComplete: () => t.destroy() });
    };

    const cols = 5;
    const cw = 150, ch = 130, gx = 30;
    const startX = (GAME_W - (cols * cw + (cols - 1) * gx)) / 2 + cw / 2;

    LEVELS.forEach((lvl, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cw + gx);
      const y = 200 + row * (ch + 28) + ch / 2 - 28;
      const unlocked = SaveSystem.isLevelUnlocked(lvl.id);
      const stars = save.levels[lvl.id]?.stars || 0;
      const color = !unlocked ? 0x4a525a : stars > 0 ? 0x2f9e55 : 0x2f6fa8;

      const btn = makeButton(this, x, y, cw, ch, '', () => this.scene.start('LevelScene', { mode: 'career', levelId: lvl.id }), {
        color, sfx,
        onDisabled: () => showLocked(lvl.id)
      });
      btn.setEnabled(unlocked);
      btn.add(makeText(this, 0, -36, unlocked ? String(lvl.id) : 'LOCKED', { size: unlocked ? '40px' : '20px' }));
      btn.add(makeText(this, 0, 4, lvl.name, { size: '15px', bold: false, strokeThickness: 3, wrap: cw - 12 }));
      const themeLabel = lvl.theme === 'desert-storm' ? 'Desert' : lvl.theme === 'snow-mountain' ? 'Snow' : lvl.theme === 'jungle-expedition' ? 'Jungle' : 'Valley';
      const kmLabel = (lvl.length / 20 / 1000).toFixed(1) + ' km';
      btn.add(makeText(this, 0, 23, unlocked ? `${themeLabel} • ${kmLabel}` : `Need Lvl ${lvl.id - 1}`, {
        size: '12px', color: unlocked ? '#8fc1e3' : '#ff9b8a', bold: false, strokeThickness: 2
      }));
      if (unlocked) {
        const s = '\u2605'.repeat(stars) + '\u2606'.repeat(3 - stars);
        btn.add(makeText(this, 0, 44, s, { size: '24px', color: '#ffd23f' }));
      }
    });

    bindBack(this, () => this.scene.start('MenuScene'));
  }
}
