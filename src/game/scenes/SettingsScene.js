import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config/constants.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import AudioSystem from '../systems/AudioSystem.js';
import { isNative, vibrate } from '../systems/platform.js';
import { makeText, makeButton, bindBack, menuBackdrop, fmtCoins } from '../systems/ui.js';

export default class SettingsScene extends Phaser.Scene {
  constructor() {
    super('SettingsScene');
  }

  create() {
    this.save = SaveSystem.data;
    this.audio = new AudioSystem(this, this.save.settings);
    const sfx = () => this.audio.click();

    menuBackdrop(this);
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x0e1a22, 0.65);

    // Header
    makeText(this, GAME_W / 2, 44, 'SETTINGS', { size: '44px', color: '#ffd23f' });
    makeButton(this, 90, 44, 130, 50, 'BACK', () => this.scene.start('MenuScene'), {
      color: 0x3a4a56, size: '22px', sfx
    });
    this.add.image(GAME_W - 150, 44, 'coin').setScale(1.1);
    makeText(this, GAME_W - 128, 44, fmtCoins(this.save.coins), { size: '26px', originX: 0, color: '#ffd23f' });

    // Panel backdrop for settings
    const panel = this.add.image(GAME_W / 2, GAME_H / 2 + 20, 'panel').setDisplaySize(720, 390);

    const isTouch = isNative || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const platformLabel = isNative ? 'Android App' : isTouch ? 'Mobile Web' : 'Desktop Browser';

    // Platform Info badge
    makeText(this, GAME_W / 2, 114, `Platform: ${platformLabel}`, {
      size: '16px', color: '#8fc1e3', bold: false
    });

    const startY = 148;
    const rowGap = 42;
    const labelX = GAME_W / 2 - 280;
    const btnX = GAME_W / 2 + 160;

    // 1. Audio Sound
    makeText(this, labelX, startY, 'Sound Effects', { size: '22px', originX: 0 });
    const sndBtn = makeButton(this, btnX, startY, 200, 38, '', () => {
      const next = !this.save.settings.sound;
      SaveSystem.setSetting('sound', next);
      if (next) this.audio.click();
      refresh();
    }, { size: '18px' });

    // 2. Vibration / Haptics
    makeText(this, labelX, startY + rowGap, 'Haptic Feedback', { size: '22px', originX: 0 });
    const vibBtn = makeButton(this, btnX, startY + rowGap, 200, 38, '', () => {
      const next = !this.save.settings.vibration;
      SaveSystem.setSetting('vibration', next);
      if (next) vibrate(80);
      sfx();
      refresh();
    }, { size: '18px' });

    // 3. Controller Mode (Pedals vs Split-Screen)
    makeText(this, labelX, startY + rowGap * 2, 'Touch Controls', { size: '22px', originX: 0 });
    const ctrlBtn = makeButton(this, btnX, startY + rowGap * 2, 200, 38, '', () => {
      const current = this.save.settings.controlMode || 'pedals';
      const next = current === 'pedals' ? 'splitscreen' : 'pedals';
      SaveSystem.setSetting('controlMode', next);
      sfx();
      refresh();
    }, { size: '17px' });

    // 4. Desktop Key Badges / Hints
    makeText(this, labelX, startY + rowGap * 3, 'Keyboard Hints', { size: '22px', originX: 0 });
    const hintsBtn = makeButton(this, btnX, startY + rowGap * 3, 200, 38, '', () => {
      const next = !this.save.settings.showKeyHints;
      SaveSystem.setSetting('showKeyHints', next);
      sfx();
      refresh();
    }, { size: '18px' });

    // 5. FPS / Performance Counter
    makeText(this, labelX, startY + rowGap * 4, 'Show Performance (FPS)', { size: '22px', originX: 0 });
    const fpsBtn = makeButton(this, btnX, startY + rowGap * 4, 200, 38, '', () => {
      const next = !this.save.settings.showFps;
      SaveSystem.setSetting('showFps', next);
      sfx();
      refresh();
    }, { size: '18px' });

    // 6. 3D graphics quality
    makeText(this, labelX, startY + rowGap * 5, '3D Graphics Quality', { size: '22px', originX: 0 });
    const QUAL = ['auto', 'low', 'medium', 'high'];
    const qBtn = makeButton(this, btnX, startY + rowGap * 5, 200, 38, '', () => {
      const cur = QUAL.indexOf(this.save.settings.quality || 'auto');
      SaveSystem.setSetting('quality', QUAL[(cur + 1) % QUAL.length]);
      sfx();
      refresh();
    }, { size: '18px' });

    // 7. 3D steering sensitivity
    makeText(this, labelX, startY + rowGap * 6, '3D Steering Speed', { size: '22px', originX: 0 });
    const SENS = [0.7, 1, 1.35];
    const sBtn = makeButton(this, btnX, startY + rowGap * 6, 200, 38, '', () => {
      const cur = SENS.findIndex((v) => Math.abs(v - (this.save.settings.steerSens || 1)) < 0.1);
      SaveSystem.setSetting('steerSens', SENS[(cur + 1) % SENS.length]);
      sfx();
      refresh();
    }, { size: '18px' });

    // 8. Reset Game Data
    let armed = false;
    const resetBtn = makeButton(this, GAME_W / 2, 468, 260, 40, 'RESET GAME DATA', async () => {
      if (!armed) {
        armed = true;
        resetBtn.setLabel('CONFIRM RESET?');
        this.time.delayedCall(3500, () => { armed = false; resetBtn.setLabel('RESET GAME DATA'); });
        return;
      }
      await SaveSystem.reset();
      this.audio.deny();
      this.scene.start('MenuScene');
    }, { color: 0x7a2a2a, size: '18px' });

    const refresh = () => {
      const s = this.save.settings;
      sndBtn.setLabel(s.sound ? 'SOUND: ON' : 'SOUND: OFF');
      sndBtn.list[0].setTint(s.sound ? 0x2f9e55 : 0x555a60);

      vibBtn.setLabel(s.vibration ? 'VIBRATION: ON' : 'VIBRATION: OFF');
      vibBtn.list[0].setTint(s.vibration ? 0x2f9e55 : 0x555a60);

      const isPedals = s.controlMode !== 'splitscreen';
      ctrlBtn.setLabel(isPedals ? 'PEDALS' : 'SPLIT TOUCH');
      ctrlBtn.list[0].setTint(isPedals ? 0x2f6fa8 : 0xd9812b);

      hintsBtn.setLabel(s.showKeyHints ? 'HINTS: ON' : 'HINTS: OFF');
      hintsBtn.list[0].setTint(s.showKeyHints ? 0x2f9e55 : 0x555a60);

      fpsBtn.setLabel(s.showFps ? 'FPS: ON' : 'FPS: OFF');
      fpsBtn.list[0].setTint(s.showFps ? 0x2f9e55 : 0x555a60);

      qBtn.setLabel(`QUALITY: ${(s.quality || 'auto').toUpperCase()}`);
      qBtn.list[0].setTint(0x2f6fa8);
      const sens = s.steerSens || 1;
      sBtn.setLabel(`STEERING: ${sens < 0.9 ? 'SLOW' : sens > 1.2 ? 'FAST' : 'NORMAL'}`);
      sBtn.list[0].setTint(0x2f6fa8);
    };

    refresh();
    bindBack(this, () => this.scene.start('MenuScene'));
  }
}
