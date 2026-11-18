// Starts a 3D drive from the React shell. The drive scene owns its own DOM overlay
// and WebGL canvas; Phaser is asleep the whole time (see src/main.js).
import { DriveGame } from './DriveGame.js';
import { getTrackDef } from './tracks/index.js';
import { applyResult, applyAbandon, nextTrackId, isTrackUnlocked, dailyChallenge, todayStr } from './core/progress.js';
import { sunElevation } from './render/sky.js';
import { getVehicle, paintSpec } from '../game/config/vehicles.js';
import { SaveSystem } from '../game/systems/SaveSystem.js';
import { vibrate } from '../game/systems/platform.js';
import { DEBUG } from '../game/config/constants.js';

let active = null;

export function isDriving() { return !!active; }
export function driveBack() { if (active) active.back(); }
export function drivePause() { if (active && active.state === 'run') active.pause(); }

/**
 * @param o { trackId, difficulty, audioCtx, testVehicle?, mission? ('standard' | 'cargo'), resume? (save.resume entry),
 *            onExit(action, trackId) }   action = retry | next | garage | tracks
 */
export function launchDrive(o) {
  if (active) return;
  const save = SaveSystem.data;
  const def = getTrackDef(o.trackId);
  // a test drive borrows a vehicle the player does not own: stock setup, no rewards, no records
  const test = !!o.testVehicle;
  const resume = !test && o.resume && o.resume.trackId === o.trackId ? o.resume : null;
  const base = getVehicle(test ? o.testVehicle : resume && save.unlockedVehicles.includes(resume.vehicle) ? resume.vehicle : save.selectedVehicle);
  const vehicle = paintSpec(base, test ? 'stock' : save.paint[base.id].sel);
  const mission = resume ? resume.mission : o.mission === 'cargo' ? 'cargo' : 'standard';
  const difficulty = (resume && resume.difficulty) || o.difficulty || save.settings.difficulty || 'standard';
  // a fresh run replaces any run that was waiting to be resumed
  if (!test && !resume && save.resume) { save.resume = null; SaveSystem.persist(); }
  const dc = dailyChallenge(save);
  const daily = !test && dc.trackId === o.trackId && !dc.done ? dc.date : null;
  const container = document.getElementById('app') || document.body;
  active = new DriveGame({
    parent: container,
    def,
    vehicle,
    difficulty,
    mission,
    resume: resume ? resume.state : null,
    ghost: test ? null : save.ghosts[o.trackId],
    coach: !test,
    // each checkpoint stores the run, so closing the app or quitting loses at most the current section
    onCheckpoint: (state) => {
      if (test) return;
      save.resume = { trackId: o.trackId, difficulty, mission, vehicle: base.id, cp: state.cpNext, state };
      SaveSystem.persist();
    },
    ups: save.upgrades[vehicle.id],
    gear: { ...save.gear[vehicle.id], tire: save.tires[vehicle.id].sel },
    settings: save.settings,
    audioCtx: o.audioCtx || null,
    vibrate: (ms) => { if (save.settings.vibration) vibrate(ms); },
    onSettings: () => SaveSystem.persist(),
    hasNext: () => { if (test) return false; const n = nextTrackId(o.trackId); return !!n && (DEBUG || isTrackUnlocked(save, n)); },
    onFinish: (ss, score) => {
      if (test) return { coins: 0, lines: [{ text: 'Test drive: no rewards or records. Buy the vehicle in the garage to keep it.', color: '#8fc1e3' }] };
      const sum = applyResult(save, o.trackId, {
        time: score.time, medal: score.medal, stars: score.stars, objectives: score.objectives,
        recoveries: ss.recoveries, damage: ss.damage,
        cachesFound: ss.caches.map((c) => c.found), cacheRewards: ss.caches.map((c) => c.reward),
        relicsFound: ss.relics.map((c) => c.found),
        rewardMult: ss.diff.reward, difficulty: ss.diff.name, difficultyId: ss.diff.id,
        night: sunElevation(ss.hours[1]) < -0.05,
        distance: ss.distance, driveTime: ss.time,
        cargo: ss.mission === 'cargo' ? ss.cargo : undefined,
        daily: daily && !dailyChallenge(save).done ? daily : null,
        vehicle: base.name, date: todayStr()
      });
      save.resume = null;
      // a new best time becomes the ghost for the next attempt
      if (sum.newBest && ss.trace.s.length > 6) save.ghosts[o.trackId] = { s: ss.trace.s, d: ss.trace.d };
      SaveSystem.persist();
      return sum;
    },
    onExit: (action) => {
      const g = active;
      active = null;
      if (!test && g && g.session && !g.session.finished) {
        applyAbandon(save, { distance: g.session.distance, driveTime: g.session.time, recoveries: g.session.recoveries });
      }
      if (action === 'retry' && !test) save.resume = null;      // restarting from the start abandons the saved run
      SaveSystem.persist();
      o.onExit(action, o.trackId);
    }
  });
  window.__drive = active;
}
