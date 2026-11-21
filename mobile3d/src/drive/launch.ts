// Starts a 3D drive on a GL surface: picks the vehicle and setup from the save, wires the
// run's results back into it. The drive screen (src/screens/DriveScreen.tsx) calls this once
// its GL context exists.
import { Platform } from 'react-native';
import { DriveGame } from './DriveGame.js';
import type { HudBridge } from './hudBridge';
import { getTrackDef } from './tracks/index.js';
import { applyResult, applyAbandon, nextTrackId, isTrackUnlocked, UNLOCK_ALL_TRACKS, dailyChallenge, todayStr } from './core/progress.js';
import { sunElevation } from './render/sky.js';
import { getVehicle, paintSpec } from '../game/config/vehicles.js';
import { SaveSystem, type Save } from '../state/save';
import { vibrate } from '../platform/haptics';
import type { GL } from '../platform/gl';

export type ExitAction = 'retry' | 'next' | 'garage' | 'tracks';

export interface DriveRequest {
  trackId: string;
  difficulty?: string;
  /** A test drive borrows a vehicle the player does not own: stock setup, no rewards, no records. */
  testVehicle?: string;
  resume?: Save['resume'];
}

export interface DriveHost {
  gl: GL;
  width: number;
  height: number;
  hud: HudBridge;
  onExit(action: ExitAction, trackId: string): void;
}

/** "auto" means Medium on a phone and High in a desktop browser. */
export function resolveQuality(setting: string | undefined): 'low' | 'medium' | 'high' {
  if (setting === 'low' || setting === 'medium' || setting === 'high') return setting;
  return Platform.OS === 'web' ? 'high' : 'medium';
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function launchDrive(o: DriveRequest, host: DriveHost): DriveGame {
  const save = SaveSystem.data;
  const def = getTrackDef(o.trackId);
  const test = !!o.testVehicle;
  const resume = !test && o.resume && o.resume.trackId === o.trackId ? o.resume : null;
  const base = getVehicle(test ? o.testVehicle : resume && save.unlockedVehicles.includes(resume.vehicle) ? resume.vehicle : save.selectedVehicle);
  const vehicle = paintSpec(base, test ? 'stock' : save.paint[base.id].sel);
  const difficulty = (resume && resume.difficulty) || o.difficulty || save.settings.difficulty || 'standard';
  // a fresh run replaces any run that was waiting to be resumed
  if (!test && !resume && save.resume) { save.resume = null; SaveSystem.persist(); }
  const dc = dailyChallenge(save as any);
  const daily = !test && dc.trackId === o.trackId && !dc.done ? dc.date : null;
  let game: DriveGame | null = null;
  game = new DriveGame({
    gl: host.gl,
    width: host.width,
    height: host.height,
    hud: host.hud,
    quality: resolveQuality(save.settings.quality),
    def,
    vehicle,
    difficulty,
    resume: resume ? resume.state : null,
    ghost: test ? null : save.ghosts[o.trackId],
    coach: !test,
    // each checkpoint stores the run, so closing the app or quitting loses at most the current section
    onCheckpoint: (state: any) => {
      if (test) return;
      save.resume = { trackId: o.trackId, difficulty, vehicle: base.id, cp: state.cpNext, state };
      SaveSystem.persist();
    },
    ups: save.upgrades[vehicle.id],
    gear: { ...save.gear[vehicle.id], tire: save.tires[vehicle.id].sel },
    settings: save.settings,
    vibrate: (ms: number) => { if (save.settings.vibration) vibrate(ms); },
    onSettings: () => SaveSystem.persist(),
    hasNext: () => { if (test) return false; const n = nextTrackId(o.trackId); return !!n && (UNLOCK_ALL_TRACKS || isTrackUnlocked(save as any, n)); },
    onFinish: (ss: any, score: any) => {
      if (test) return { coins: 0, lines: [{ text: 'Test drive: no rewards or records. Buy the vehicle in the garage to keep it.', color: '#8fc1e3' }] };
      const sum = applyResult(save as any, o.trackId, {
        time: score.time, medal: score.medal, stars: score.stars, objectives: score.objectives,
        recoveries: ss.recoveries, damage: ss.damage,
        cachesFound: ss.caches.map((c: any) => c.found), cacheRewards: ss.caches.map((c: any) => c.reward),
        relicsFound: ss.relics.map((c: any) => c.found),
        rewardMult: ss.diff.reward, difficulty: ss.diff.name, difficultyId: ss.diff.id,
        night: sunElevation(ss.hours[1]) < -0.05,
        distance: ss.distance, driveTime: ss.time,
        challenges: ss.hazards ? ss.hazards.summary() : null,
        daily: daily && !dailyChallenge(save as any).done ? daily : null,
        vehicle: base.name, date: todayStr(),
      } as any);
      save.resume = null;
      // a new best time becomes the ghost for the next attempt
      if (sum.newBest && ss.trace.s.length > 6) save.ghosts[o.trackId] = { s: ss.trace.s, d: ss.trace.d };
      SaveSystem.persist();
      return sum;
    },
    onExit: (action: ExitAction) => {
      const g: any = game;
      if (!test && g && g.session && !g.session.finished) {
        applyAbandon(save as any, { distance: g.session.distance, driveTime: g.session.time, recoveries: g.session.recoveries });
      }
      if (action === 'retry' && !test) save.resume = null; // restarting from the start abandons the saved run
      SaveSystem.persist();
      SaveSystem.refresh();
      host.onExit(action, o.trackId);
    },
  });
  if (__DEV__) (globalThis as any).__drive = game;
  return game;
}
