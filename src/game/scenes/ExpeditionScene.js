import Phaser from 'phaser';
import { GAME_W, GAME_H, DEBUG } from '../config/constants.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import AudioSystem from '../systems/AudioSystem.js';
import { makeText, makeButton, bindBack, menuBackdrop, fmtCoins } from '../systems/ui.js';
import { REGIONS } from '../../drive/tracks/regions.js';
import { TRACK_META } from '../../drive/tracks/meta.js';
import { WEATHER } from '../../drive/core/surfaces.js';
import { isTrackUnlocked, isRegionUnlocked, regionProgress, playerLevel, REGION_ORDER } from '../../drive/core/progress.js';
import { fmtTime } from '../../drive/core/session.js';
import { launchDrive } from '../../drive/launch.js';

const REGION_COLORS = { forest: 0x2f7d3a, mud: 0x7a5a32, rocky: 0x6a6f78, ridge: 0xa8562f, snow: 0x5f8fb8 };

/** Region + track selection for the 3D expedition. */
export default class ExpeditionScene extends Phaser.Scene {
  constructor() {
    super('ExpeditionScene');
  }

  init(data) {
    this.autoStart = data.autoStart || null;
    this.region = data.region || null;
  }

  create() {
    const save = SaveSystem.data;
    this.save = save;
    this.audio = new AudioSystem(this, save.settings);
    const sfx = () => this.audio.click();
    menuBackdrop(this);
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x0e1a22, 0.6);

    if (!this.region) {
      // open on the furthest unlocked region
      this.region = [...REGION_ORDER].reverse().find((r) => isRegionUnlocked(save, r)) || 'forest';
    }

    makeText(this, GAME_W / 2, 30, 'EXPEDITION', { size: '34px', color: '#ffd23f' });
    makeButton(this, 70, 30, 110, 42, 'BACK', () => this.scene.start('MenuScene'), { color: 0x3a4a56, size: '20px', sfx });
    makeButton(this, 196, 30, 120, 42, 'GARAGE', () => this.scene.start('GarageScene', { from: 'ExpeditionScene' }), { color: 0x2f6fa8, size: '20px', sfx });
    this.add.image(GAME_W - 150, 30, 'coin').setScale(1.0);
    makeText(this, GAME_W - 130, 30, fmtCoins(save.coins), { size: '24px', originX: 0, color: '#ffd23f' });
    makeText(this, GAME_W - 250, 30, `LVL ${playerLevel(save.xp)}`, { size: '20px', color: '#8fc1e3' });

    this.layer = this.add.container(0, 0);
    this.render();
    bindBack(this, () => this.scene.start('MenuScene'));

    if (this.autoStart && (DEBUG || isTrackUnlocked(save, this.autoStart))) {
      const id = this.autoStart;
      this.autoStart = null;
      this.time.delayedCall(60, () => launchDrive(this, id));
    }
  }

  toast(msg) {
    if (this.toastT) this.toastT.destroy();
    const t = makeText(this, GAME_W / 2, GAME_H - 22, msg, { size: '17px', color: '#ff9b8a' }).setDepth(50);
    this.toastT = t;
    this.tweens.add({ targets: t, alpha: 0, duration: 1600, delay: 1400, onComplete: () => t.destroy() });
  }

  render() {
    const L = this.layer, save = this.save;
    L.removeAll(true);
    const sfx = () => this.audio.click();

    // region tabs
    const tw = 180, gap = 8;
    const x0 = (GAME_W - (REGIONS.length * tw + (REGIONS.length - 1) * gap)) / 2 + tw / 2;
    REGIONS.forEach((r, i) => {
      const open = DEBUG || isRegionUnlocked(save, r.id);
      const sel = r.id === this.region;
      const pr = regionProgress(save, r.id);
      const b = makeButton(this, x0 + i * (tw + gap), 86, tw, 54, '', () => { this.region = r.id; this.render(); }, {
        color: !open ? 0x3a4046 : sel ? REGION_COLORS[r.id] : 0x25333d, sfx,
        onDisabled: () => { this.audio.deny(); this.toast(`Finish every ${REGIONS[i - 1].name} track to open ${r.name}`); }
      });
      b.setEnabled(open);
      b.add(makeText(this, 0, -9, r.name.toUpperCase(), { size: '14px', strokeThickness: 3 }));
      b.add(makeText(this, 0, 12, open ? `${pr.done}/${pr.total} complete` : 'LOCKED', { size: '13px', bold: false, strokeThickness: 2, color: open ? '#c9d6de' : '#ff9b8a' }));
      if (sel) b.add(this.add.rectangle(0, 25, tw - 20, 4, 0xffd23f));
      L.add(b);
    });

    const region = REGIONS.find((r) => r.id === this.region);
    L.add(makeText(this, GAME_W / 2, 132, region.desc, { size: '15px', bold: false, color: '#c9d6de', strokeThickness: 3 }));

    // track cards
    const list = TRACK_META.filter((t) => t.region === this.region);
    const cw = 218, ch = 300, cg = 14;
    const cx0 = (GAME_W - (4 * cw + 3 * cg)) / 2 + cw / 2;
    list.forEach((t, i) => {
      const n = TRACK_META.indexOf(t) + 1;
      const open = DEBUG || isTrackUnlocked(save, t.id);
      const rec = save.tracks[t.id];
      const x = cx0 + i * (cw + cg), y = 312;
      const b = makeButton(this, x, y, cw, ch, '', () => launchDrive(this, t.id), {
        color: !open ? 0x333a40 : rec?.done ? 0x244a35 : 0x23405a, sfx,
        onDisabled: () => { this.audio.deny(); this.toast(`Finish "${TRACK_META[n - 2].name}" first`); }
      });
      b.setEnabled(open);
      b.add(makeText(this, 0, -124, `TRACK ${n}`, { size: '14px', color: '#8fc1e3', strokeThickness: 2 }));
      b.add(makeText(this, 0, -98, t.name.toUpperCase(), { size: '19px', wrap: cw - 16 }));
      b.add(makeText(this, 0, -44, t.blurb, { size: '12px', bold: false, strokeThickness: 2, color: '#c9d6de', wrap: cw - 22 }));
      const w = WEATHER[t.weather];
      b.add(makeText(this, 0, 14, `${w.name} • ${t.time}`, { size: '13px', color: '#ffd23f', strokeThickness: 2 }));
      b.add(makeText(this, 0, 54, `Bring: ${t.rec}`, { size: '11px', bold: false, strokeThickness: 2, color: '#8fc1e3', wrap: cw - 16 }));
      b.add(makeText(this, 0, 34, `Gold ${fmtTime(t.par.gold)}  •  Reward ${t.reward}`, { size: '12px', bold: false, strokeThickness: 2 }));
      if (!open) {
        b.add(makeText(this, 0, 86, 'LOCKED', { size: '24px', color: '#ff9b8a' }));
      } else if (rec?.done) {
        const medal = ['', 'BRONZE', 'SILVER', 'GOLD'][rec.medal];
        b.add(makeText(this, 0, 74, `Best ${fmtTime(rec.bestTime)} ${medal}`, { size: '14px', color: '#8dff9b', strokeThickness: 2 }));
        b.add(makeText(this, 0, 99, '★'.repeat(rec.stars) + '☆'.repeat(Math.max(0, (rec.caches.length ? 4 : 3) - rec.stars)), { size: '22px', color: '#ffd23f' }));
        b.add(makeText(this, 0, 124, 'DRIVE AGAIN', { size: '16px' }));
      } else {
        b.add(makeText(this, 0, 96, 'START', { size: '26px', color: '#8dff9b' }));
      }
      L.add(b);
    });
    if (!list.length) L.add(makeText(this, GAME_W / 2, 300, 'Tracks for this region are being built.', { size: '20px', bold: false }));

    const done = TRACK_META.filter((t) => save.tracks[t.id]?.done).length;
    const km = (save.stats.distance / 1000).toFixed(1);
    L.add(makeText(this, GAME_W / 2, GAME_H - 46, `Tracks ${done}/${TRACK_META.length}  •  ${km} km driven  •  Achievements ${Object.keys(save.achievements).length}`, {
      size: '14px', bold: false, color: '#c9d6de', strokeThickness: 3
    }));
  }
}
