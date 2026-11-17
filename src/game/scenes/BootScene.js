import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config/constants.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { createCommonTextures, createThemeTextures } from '../systems/TextureFactory.js';
import { makeText } from '../systems/ui.js';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    this.cameras.main.setBackgroundColor('#1b2a33');
    makeText(this, GAME_W / 2, GAME_H / 2, 'TRAIL TORQUE', { size: '48px', color: '#ffd23f' });
    makeText(this, GAME_W / 2, GAME_H / 2 + 50, 'Loading...', { size: '20px', bold: false });

    // Everything is procedural; if you add real art, load it in preload() above.
    SaveSystem.init().then(() => {
      createCommonTextures(this);
      createThemeTextures(this, 'green-valley');
      this.scene.stop();
      this.game.events.emit('boot-ready');
    });
  }
}
