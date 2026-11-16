import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config/constants.js';
import { VEHICLES, displayStats } from '../config/vehicles.js';
import { MAX_UPGRADE, UPGRADE_KEYS, GEAR_KEYS, TIRE_IDS, upgradeCost } from '../core/saveModel.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import AudioSystem from '../systems/AudioSystem.js';
import { VEHICLE_TEX } from '../systems/TextureFactory.js';
import { makeText, makeButton, bindBack, menuBackdrop, fmtCoins } from '../systems/ui.js';
import { UPGRADE_INFO, GEAR_INFO, buildParams } from '../../drive/core/specs.js';
import { TIRES } from '../../drive/core/surfaces.js';

/**
 * Vehicle select + upgrades. Two tabs:
 *  - UPGRADES: six levelled upgrades (engine, tyres, suspension, fuel, lift kit, brakes)
 *  - TYRES & GEAR: tyre compounds, diff locks, winch
 * Every item changes the physics parameters used by the 3D expedition.
 */
export default class GarageScene extends Phaser.Scene {
  constructor() {
    super('GarageScene');
  }

  init(data) {
    this.from = (data && data.from) || 'MenuScene';
    this.tab = (data && data.tab) || 'upgrades';
  }

  create() {
    this.save = SaveSystem.data;
    this.audio = new AudioSystem(this, this.save.settings);
    this.index = Math.max(0, VEHICLES.findIndex((v) => v.id === this.save.selectedVehicle));

    menuBackdrop(this);
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x0e1a22, 0.55);

    makeText(this, GAME_W / 2, 36, 'GARAGE', { size: '40px', color: '#ffd23f' });
    const back = () => this.scene.start(this.from);
    makeButton(this, 90, 36, 130, 46, 'BACK', back, { color: 0x3a4a56, size: '22px', sfx: () => this.audio.click() });
    this.add.image(GAME_W - 150, 36, 'coin').setScale(1.1);
    this.coinText = makeText(this, GAME_W - 128, 36, '', { size: '26px', originX: 0, color: '#ffd23f' });

    this.layer = this.add.container(0, 0);
    this.render();
    bindBack(this, back);
  }

  render() {
    const L = this.layer;
    L.removeAll(true);
    const spec = VEHICLES[this.index];
    const owned = SaveSystem.isUnlocked(spec.id);
    const ups = SaveSystem.getUpgrades(spec.id);
    const gear = this.save.gear[spec.id];
    const tires = this.save.tires[spec.id];
    this.coinText.setText(fmtCoins(this.save.coins));
    const click = () => this.audio.click();

    // ---- left: vehicle preview -------------------------------------------
    const px = 235, py = 150;
    const wy = spec.body.h / 2 - 2 + spec.suspension.rest;
    const car = this.add.container(px, py).setScale(1.3);
    const { cx, cy, w, h } = VEHICLE_TEX;
    const struts = this.add.graphics();
    struts.lineStyle(5, 0x2b3238);
    [-1, 1].forEach((s) => [-1, 1].forEach((sp) =>
      struts.lineBetween(s * spec.wheel.base + sp * spec.suspension.spread, spec.body.h / 2 - 2, s * spec.wheel.base, wy)
    ));
    car.add([
      struts,
      ...[-1, 1].map((s) => this.add.image(s * spec.wheel.base, wy, `wheel_${spec.id}`)),
      this.add.image(0, 0, `veh_${spec.id}`).setOrigin(cx / w, cy / h)
    ]);
    if (!owned) car.list.forEach((o) => o.setTint && o.setTint(0x555a60));
    L.add(car);

    const arrow = (x, label, dir) => L.add(makeButton(this, x, py, 50, 70, label, () => {
      this.index = (this.index + dir + VEHICLES.length) % VEHICLES.length;
      this.render();
    }, { color: 0x3a4a56, size: '30px', sfx: click }));
    arrow(40, '<', -1);
    arrow(430, '>', 1);

    L.add(makeText(this, px, 236, spec.name.toUpperCase(), { size: '26px' }));
    L.add(makeText(this, px, 262, spec.desc, { size: '14px', bold: false, wrap: 400, strokeThickness: 3 }));

    // stat bars (classic) + real 3D numbers
    const stats = displayStats(spec, ups);
    Object.entries(stats).forEach(([name, v], i) => {
      const y = 296 + i * 22;
      L.add(makeText(this, 60, y, name, { size: '15px', originX: 0, strokeThickness: 3 }));
      L.add(this.add.rectangle(150, y, 250, 12, 0x16222b).setOrigin(0, 0.5));
      L.add(this.add.rectangle(150, y, 250 * v, 12, 0x55c26a).setOrigin(0, 0.5));
    });
    const P = buildParams(spec.id, ups, { ...gear, tire: tires.sel });
    const line1 = `${Math.round(P.power / 1000)} kW  •  ${P.mass} kg  •  ${Math.round(P.clearance * 100)} cm clearance`;
    const line2 = `${Math.round(P.travel * 100)} cm wheel travel  •  ${Math.round(P.fuelCap)} L  •  ${TIRES[P.tire].name}`;
    const line3 = `${P.difflock ? 'Diff locks' : 'Open diffs'}  •  ${P.winch ? 'Winch fitted' : 'No winch'}`;
    L.add(makeText(this, px, 392, line1, { size: '13px', bold: false, color: '#c9d6de', strokeThickness: 3 }));
    L.add(makeText(this, px, 410, line2, { size: '13px', bold: false, color: '#c9d6de', strokeThickness: 3 }));
    L.add(makeText(this, px, 428, line3, { size: '13px', bold: false, color: '#c9d6de', strokeThickness: 3 }));

    // buy / select
    let label, color, action;
    if (!owned) {
      label = `BUY  ${fmtCoins(spec.price)}`;
      color = this.save.coins >= spec.price ? 0xd9812b : 0x555a60;
      action = () => {
        if (SaveSystem.buyVehicle(spec)) { this.audio.buy(); this.render(); } else this.audio.deny();
      };
    } else if (this.save.selectedVehicle === spec.id) {
      label = 'SELECTED';
      color = 0x2f9e55;
      action = () => {};
    } else {
      label = 'SELECT';
      color = 0x2f6fa8;
      action = () => { SaveSystem.selectVehicle(spec.id); this.audio.click(); this.render(); };
    }
    L.add(makeButton(this, px, 486, 240, 46, label, action, { color, size: '22px' }));

    // ---- right: tabs -------------------------------------------------------
    const panel = this.add.image(712, 300, 'panel').setDisplaySize(476, 444);
    L.add(panel);
    const tab = (x, id, text) => {
      const b = makeButton(this, x, 100, 222, 38, text, () => { this.tab = id; this.render(); }, {
        color: this.tab === id ? 0x2f6fa8 : 0x25333d, size: '17px', sfx: click
      });
      L.add(b);
    };
    tab(596, 'upgrades', 'UPGRADES');
    tab(828, 'gear', 'TYRES & GEAR');
    if (!owned) {
      L.add(makeText(this, 712, 300, 'Buy this vehicle to equip it', { size: '20px', color: '#ffd23f' }));
      return;
    }

    const rowH = 61, y0 = 156;
    const row = (i, title, hint, btnLabel, btnColor, enabled, onBuy, pips) => {
      const y = y0 + i * rowH;
      L.add(makeText(this, 486, y - 13, title, { size: '18px', originX: 0 }));
      L.add(makeText(this, 486, y, hint, { size: '11px', originX: 0, bold: false, strokeThickness: 2, color: '#b8c7d2', wrap: 318, align: 'left', originY: 0 }));
      if (pips !== undefined) {
        for (let p = 0; p < MAX_UPGRADE; p++) {
          L.add(this.add.rectangle(700 + p * 16, y - 13, 13, 7, p < pips ? 0x55c26a : 0x34434e).setOrigin(0, 0.5));
        }
      }
      const btn = makeButton(this, 878, y, 124, 44, btnLabel, onBuy, { color: btnColor, size: '17px', onDisabled: () => this.audio.deny() });
      btn.setEnabled(enabled);
      L.add(btn);
    };
    const buy = (ok) => { if (ok) { this.audio.buy(); this.render(); } else this.audio.deny(); };

    if (this.tab === 'upgrades') {
      UPGRADE_KEYS.forEach((key, i) => {
        const level = ups[key];
        const maxed = level >= MAX_UPGRADE;
        const cost = maxed ? 0 : upgradeCost(key, level);
        const afford = !maxed && this.save.coins >= cost;
        row(i, UPGRADE_INFO[key].label, UPGRADE_INFO[key].hint, maxed ? 'MAX' : fmtCoins(cost),
          maxed ? 0x2f9e55 : afford ? 0xd9812b : 0x555a60, !maxed,
          () => buy(SaveSystem.buyUpgrade(spec.id, key)), level);
      });
    } else {
      let i = 0;
      for (const id of TIRE_IDS) {
        const t = TIRES[id];
        const has = tires.owned.includes(id);
        const sel = tires.sel === id;
        const afford = this.save.coins >= t.price;
        row(i++, t.name, t.desc, sel ? 'FITTED' : has ? 'FIT' : fmtCoins(t.price),
          sel ? 0x2f9e55 : has ? 0x2f6fa8 : afford ? 0xd9812b : 0x555a60, !sel,
          () => { if (has) { SaveSystem.selectTire(spec.id, id); this.audio.click(); this.render(); } else buy(SaveSystem.buyTire(spec.id, id, t.price)); });
      }
      for (const key of GEAR_KEYS) {
        const g = GEAR_INFO[key];
        const has = gear[key];
        const afford = this.save.coins >= g.price;
        row(i++, g.label, g.hint, has ? 'FITTED' : fmtCoins(g.price), has ? 0x2f9e55 : afford ? 0xd9812b : 0x555a60, !has,
          () => buy(SaveSystem.buyGear(spec.id, key, g.price)));
      }
    }
  }
}
