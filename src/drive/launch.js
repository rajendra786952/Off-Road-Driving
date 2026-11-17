// Starts a 3D drive from the React shell. The drive scene owns its own DOM overlay
// and WebGL canvas; Phaser is asleep the whole time (see src/main.js).
import { DriveGame } from './DriveGame.js';
import { getTrackDef } from './tracks/index.js';
import { applyResult, applyAbandon, nextTrackId, isTrackUnlocked } from './core/progress.js';
import { sunElevation } from './render/sky.js';
import { getVehicle } from '../game/config/vehicles.js';
import { SaveSystem } from '../game/systems/SaveSystem.js';
import { vibrate } from '../game/systems/platform.js';
import { DEBUG } from '../game/config/constants.js';

let active = null;

export function isDriving() { return !!active; }
export function driveBack() { if (active) active.back(); }
export function drivePause() { if (active && active.state === 'run') active.pause(); }

/**
 * @param o { trackId, difficulty, audioCtx, onExit(action, trackId) }   action = retry | next | garage | tracks
 */
export function launchDrive(o) {
  if (active) return;
  const save = SaveSystem.data;
  const def = getTrackDef(o.trackId);
  const vehicle = getVehicle(save.selectedVehicle);
  const container = document.getElementById('app') || document.body;
  active = new DriveGame({
    parent: container,
    def,
    vehicle,
    difficulty: o.difficulty || save.settings.difficulty || 'standard',
    ups: save.upgrades[vehicle.id],
    gear: { ...save.gear[vehicle.id], tire: save.tires[vehicle.id].sel },
    settings: save.settings,
    audioCtx: o.audioCtx || null,
    vibrate: (ms) => { if (save.settings.vibration) vibrate(ms); },
    onSettings: () => SaveSystem.persist(),
    hasNext: () => { const n = nextTrackId(o.trackId); return !!n && (DEBUG || isTrackUnlocked(save, n)); },
    onFinish: (ss, score) => {
      const sum = applyResult(save, o.trackId, {
        time: score.time, medal: score.medal, stars: score.stars, objectives: score.objectives,
        recoveries: ss.recoveries, damage: ss.damage,
        cachesFound: ss.caches.map((c) => c.found), cacheRewards: ss.caches.map((c) => c.reward),
        relicsFound: ss.relics.map((c) => c.found),
        rewardMult: ss.diff.reward, difficulty: ss.diff.name, difficultyId: ss.diff.id,
        night: sunElevation(ss.hours[1]) < -0.05,
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
      o.onExit(action, o.trackId);
    }
  });
  window.__drive = active;
}
