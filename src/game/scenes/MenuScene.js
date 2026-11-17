import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config/constants.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import AudioSystem from '../systems/AudioSystem.js';

import { makeText, makeButton, bindBack, menuBackdrop, fmtCoins } from '../systems/ui.js';
import { getVehicle } from '../config/vehicles.js';
import { VEHICLE_TEX } from '../systems/TextureFactory.js';

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    const save = SaveSystem.data;
    this.audio = new AudioSystem(this, save.settings);
    const sfx = () => this.audio.click();

    menuBackdrop(this);

    // Ground strip + driving showcase vehicle
    const gy = GAME_H - 70;
    this.add.rectangle(GAME_W / 2, gy + 35, GAME_W, 70, 0x7b5a3c).setDepth(1);
    this.add.rectangle(GAME_W / 2, gy + 6, GAME_W, 14, 0x4f9e3f).setDepth(1);
    this.buildShowcase(gy);

    makeText(this, GAME_W / 2, 68, 'TRAIL TORQUE', { size: '64px', color: '#ffd23f', strokeThickness: 8 });
    makeText(this, GAME_W / 2, 116, 'Classic 2D hill-climb', { size: '22px', bold: false });

    makeButton(this, GAME_W / 2, 186, 340, 64, 'MAIN MENU', () => this.game.events.emit('shell-home'), { color: 0x2f9e55, size: '28px', sfx });
    makeButton(this, GAME_W / 2 - 88, 276, 164, 50, 'CLASSIC 2D', () => this.scene.start('LevelSelectScene'), { color: 0x3f7a8c, size: '19px', sfx });
    makeButton(this, GAME_W / 2 + 88, 276, 164, 50, 'ENDLESS 2D', () => this.scene.start('LevelScene', { mode: 'endless' }), { color: 0xd9812b, size: '19px', sfx });
    makeButton(this, GAME_W / 2, 338, 340, 54, 'GARAGE', () => this.scene.start('GarageScene'), { color: 0x2f6fa8, sfx });
    makeButton(this, GAME_W / 2, 400, 340, 54, 'SETTINGS', () => this.scene.start('SettingsScene'), { color: 0x3a4a56, sfx });

    // Coins + best distance
    this.add.image(GAME_W - 150, 34, 'coin').setScale(1.1);
    makeText(this, GAME_W - 128, 34, fmtCoins(save.coins), { size: '26px', originX: 0, color: '#ffd23f' });
    if (save.bestDistance > 0) {
      makeText(this, GAME_W - 24, 68, `Best: ${save.bestDistance} m`, { size: '18px', originX: 1, bold: false });
    }

    // Quick audio toggle on top-left
    const snd = makeButton(this, 90, 44, 130, 46, '', () => {
      SaveSystem.setSetting('sound', !save.settings.sound);
      refreshSnd();
    }, { size: '17px', color: 0x3a4a56, sfx });
    const refreshSnd = () => {
      snd.setLabel(`SOUND: ${save.settings.sound ? 'ON' : 'OFF'}`);
      snd.list[0].setTint(save.settings.sound ? 0x2f9e55 : 0x555a60);
    };
    refreshSnd();

    makeText(this, 8, GAME_H - 6, 'v2.0 expedition', { size: '14px', bold: false, originX: 0, originY: 1, strokeThickness: 3 }).setDepth(5);

    bindBack(this, () => this.game.events.emit('shell-home'));
  }

  buildShowcase(groundY) {
    const spec = getVehicle(SaveSystem.data.selectedVehicle);
    const { cx, cy, w, h } = VEHICLE_TEX;
    const wy = spec.body.h / 2 - 2 + spec.suspension.rest;
    this.car = this.add.container(-150, groundY - wy - spec.wheel.r + 4).setDepth(2);
    const body = this.add.image(0, 0, `veh_${spec.id}`).setOrigin(cx / w, cy / h);
    this.wheelsMenu = [-1, 1].map((s) => this.add.image(s * spec.wheel.base, wy, `wheel_${spec.id}`));
    const struts = this.add.graphics();
    struts.lineStyle(5, 0x2b3238);
    [-1, 1].forEach((s) => [-1, 1].forEach((sp) =>
      struts.lineBetween(s * spec.wheel.base + sp * spec.suspension.spread, spec.body.h / 2 - 2, s * spec.wheel.base, wy)
    ));
    this.car.add([struts, ...this.wheelsMenu, body]);
    this.carRadius = spec.wheel.r;
  }

  update(time, delta) {
    if (!this.car) return;
    const speed = 150; // px/s
    this.car.x += (speed * delta) / 1000;
    if (this.car.x > GAME_W + 160) this.car.x = -160;
    this.car.y += Math.sin(time / 90) * 0.15;
    this.wheelsMenu.forEach((wh) => { wh.rotation += (speed * delta) / 1000 / this.carRadius; });
  }
}
