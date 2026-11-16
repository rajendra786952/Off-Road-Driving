// Bridge between the Phaser menus and the Three.js drive scene.
// Phaser is put to sleep and its canvas hidden while driving; the 3D scene runs
// in its own overlay canvas. They never share a WebGL context.
import { DriveGame } from './DriveGame.js';
import { getTrackDef } from './tracks/index.js';
import { applyResult, applyAbandon, nextTrackId, isTrackUnlocked } from './core/progress.js';
import { getVehicle } from '../game/config/vehicles.js';
import { SaveSystem } from '../game/systems/SaveSystem.js';
import { vibrate } from '../game/systems/platform.js';

let active = null;

export function isDriving() { return !!active; }

/** Start a track. `scene` is the calling Phaser scene. */
export function launchDrive(scene, trackId) {
  if (active) return;
  const game = scene.game;
  const save = SaveSystem.data;
  const def = getTrackDef(trackId);
  const vehicle = getVehicle(save.selectedVehicle);
  const container = document.getElementById('app') || document.body;
  const phaserCanvas = game.canvas;

  const onBack = () => active && active.back();
  const onPause = () => active && active.state === 'run' && active.pause();
  const stopPhaser = () => {
    game.events.on('android-back', onBack);
    game.events.on('app-pause', onPause);
    game.loop.sleep();
    phaserCanvas.style.visibility = 'hidden';
  };
  const startPhaser = () => {
    game.events.off('android-back', onBack);
    game.events.off('app-pause', onPause);
    phaserCanvas.style.visibility = '';
    game.loop.wake();
  };

  scene.input.enabled = false;
  stopPhaser();
  const gearState = save.gear[vehicle.id];
  active = new DriveGame({
    parent: container,
    def,
    vehicle,
    ups: save.upgrades[vehicle.id],
    gear: { ...gearState, tire: save.tires[vehicle.id].sel },
    settings: save.settings,
    audioCtx: game.sound && game.sound.context ? game.sound.context : null,
    vibrate: (ms) => { if (save.settings.vibration) vibrate(ms); },
    onSettings: () => SaveSystem.persist(),
    hasNext: () => { const n = nextTrackId(trackId); return !!n && isTrackUnlocked(save, n); },
    onFinish: (ss, score) => {
      const sum = applyResult(save, trackId, {
        time: score.time, medal: score.medal, stars: score.stars, objectives: score.objectives,
        recoveries: ss.recoveries, damage: ss.damage,
        cachesFound: ss.caches.map((c) => c.found), cacheRewards: ss.caches.map((c) => c.reward),
        distance: ss.distance, driveTime: ss.time
      });
      SaveSystem.persist();
      return sum;
    },
    onExit: (action) => {
      const g = active;
      active = null;
      if (g && g.session && !g.session.finished) {
        applyAbandon(save, { distance: g.session.distance, driveTime: g.session.time, recoveries: g.session.recoveries });
      }
      SaveSystem.persist();
      startPhaser();
      scene.input.enabled = true;
      if (action === 'retry') { scene.scene.restart({ autoStart: trackId }); }
      else if (action === 'next') { scene.scene.restart({ autoStart: nextTrackId(trackId) }); }
      else if (action === 'garage') scene.scene.start('GarageScene', { from: 'ExpeditionScene' });
      else scene.scene.restart({ region: def.region });
    }
  });
  window.__drive = active;
}
