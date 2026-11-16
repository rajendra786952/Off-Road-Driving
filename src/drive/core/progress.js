// Expedition progression (pure functions on the save object): unlock chain,
// rewards, XP, records and achievements. Unit tested in tests/drive.test.mjs.
import { TRACK_META } from '../tracks/meta.js';

export const REGION_ORDER = ['forest', 'mud', 'rocky', 'ridge', 'snow'];

export function trackIndex(id) { return TRACK_META.findIndex((t) => t.id === id); }
export function regionTracks(region) { return TRACK_META.filter((t) => t.region === region); }
export function isTrackDone(save, id) { return !!(save.tracks[id] && save.tracks[id].done); }

/** Tracks unlock in order; a region opens when every track of the previous region is done. */
export function isTrackUnlocked(save, id) {
  const i = trackIndex(id);
  if (i <= 0) return i === 0;
  return isTrackDone(save, TRACK_META[i - 1].id);
}
export function isRegionUnlocked(save, region) {
  const r = REGION_ORDER.indexOf(region);
  if (r <= 0) return r === 0;
  const prev = regionTracks(REGION_ORDER[r - 1]);
  return prev.length > 0 && prev.every((t) => isTrackDone(save, t.id));
}
export function regionProgress(save, region) {
  const list = regionTracks(region);
  return { done: list.filter((t) => isTrackDone(save, t.id)).length, total: list.length };
}
export function nextTrackId(id) {
  const i = trackIndex(id);
  return i >= 0 && i < TRACK_META.length - 1 ? TRACK_META[i + 1].id : null;
}
export function playerLevel(xp) { return Math.floor(Math.sqrt(xp / 120)) + 1; }

export const ACHIEVEMENTS = [
  { id: 'first-trail', name: 'First Trail', desc: 'Finish your first expedition track', test: (s) => s.stats.tracksDone >= 1 },
  { id: 'forest', name: 'Forest Ranger', desc: 'Complete every Forest Trails track', test: (s) => regionDone(s, 'forest') },
  { id: 'mud', name: 'Mud Runner', desc: 'Complete every Mud Valley track', test: (s) => regionDone(s, 'mud') },
  { id: 'rocky', name: 'Rock Crawler', desc: 'Complete every Rocky Mountains track', test: (s) => regionDone(s, 'rocky') },
  { id: 'ridge', name: 'Ridge Survivor', desc: 'Complete every Deadly Ridge track', test: (s) => regionDone(s, 'ridge') },
  { id: 'snow', name: 'Summiteer', desc: 'Complete every Extreme Expedition track', test: (s) => regionDone(s, 'snow') },
  { id: 'legend', name: 'Trail Torque Legend', desc: 'Complete all 20 tracks', test: (s) => TRACK_META.length >= 20 && TRACK_META.every((t) => isTrackDone(s, t.id)) },
  { id: 'gold', name: 'Golden Line', desc: 'Earn a gold medal', test: (s) => s.stats.golds >= 1 },
  { id: 'gold5', name: 'Podium Regular', desc: 'Earn 5 gold medals', test: (s) => Object.values(s.tracks).filter((t) => t.medal === 3).length >= 5 },
  { id: 'clean', name: 'Not a Scratch', desc: 'Finish a track with no recoveries and under 40% damage', test: (s) => s.stats.cleanRuns >= 1 },
  { id: 'caches', name: 'Explorer', desc: 'Find 10 supply caches', test: (s) => s.stats.caches >= 10 },
  { id: 'distance', name: 'Long Hauler', desc: 'Drive 100 km in expeditions', test: (s) => s.stats.distance >= 100000 }
];
function regionDone(save, region) {
  const list = regionTracks(region);
  return list.length > 0 && list.every((t) => isTrackDone(save, t.id));
}

/**
 * Apply a finished run to the save. Mutates `save`, returns a reward summary.
 * @param run { time, medal, stars, objectives:[{id,done}], recoveries, damage, cachesFound:boolean[], cacheRewards:number[], distance, driveTime }
 */
export function applyResult(save, trackId, run) {
  const meta = TRACK_META[trackIndex(trackId)];
  const prev = save.tracks[trackId] || { done: false, bestTime: 0, medal: 0, stars: 0, objectives: {}, caches: [], runs: 0 };
  const first = !prev.done;
  const lines = [];
  let coins = Math.round(meta.reward * (first ? 1 : 0.35));
  lines.push({ text: `${first ? 'Track reward' : 'Replay reward'}: +${coins}`, color: '#ffd23f' });
  const medalBonus = Math.round(meta.reward * [0, 0.1, 0.25, 0.5][run.medal] * (run.medal > prev.medal ? 1 : 0.2));
  if (medalBonus > 0) { coins += medalBonus; lines.push({ text: `${['', 'Bronze', 'Silver', 'Gold'][run.medal]} medal: +${medalBonus}`, color: '#ffd23f' }); }
  const clean = run.recoveries === 0 && run.damage < 40;
  if (clean) { const b = Math.round(meta.reward * 0.15); coins += b; lines.push({ text: `Clean run: +${b}`, color: '#8dff9b' }); }
  let cacheCoins = 0, newCaches = 0;
  const caches = run.cachesFound.map((f, i) => {
    const had = !!prev.caches[i];
    if (f && !had) { cacheCoins += run.cacheRewards[i]; newCaches++; }
    return had || f;
  });
  if (cacheCoins > 0) { coins += cacheCoins; lines.push({ text: `Supply caches: +${cacheCoins}`, color: '#8dff9b' }); }

  const objectives = { ...prev.objectives };
  let newObj = 0;
  for (const o of run.objectives) if (o.done && !objectives[o.id]) { objectives[o.id] = true; newObj++; }
  const xp = Math.round(meta.reward * (first ? 0.5 : 0.1)) + newObj * 40;
  const newBest = prev.bestTime === 0 || run.time < prev.bestTime;

  save.tracks[trackId] = {
    done: true,
    bestTime: newBest ? run.time : prev.bestTime,
    medal: Math.max(prev.medal, run.medal),
    stars: Object.keys(objectives).length,
    objectives,
    caches,
    runs: prev.runs + 1
  };
  save.coins += coins;
  save.xp += xp;
  const st = save.stats;
  st.totalCoins += coins;
  st.runs++;
  st.distance += run.distance;
  st.driveTime += run.driveTime;
  st.recoveries += run.recoveries;
  st.caches += newCaches;
  if (first) st.tracksDone++;
  if (run.medal === 3 && prev.medal < 3) st.golds++;
  if (clean) st.cleanRuns++;

  const unlockedAch = [];
  for (const a of ACHIEVEMENTS) {
    if (!save.achievements[a.id] && a.test(save)) { save.achievements[a.id] = true; unlockedAch.push(a); }
  }
  for (const a of unlockedAch) lines.push({ text: `Achievement: ${a.name}`, color: '#8fc1e3' });
  lines.push({ text: `Total: +${coins} coins, +${xp} XP`, color: '#ffd23f' });
  const next = nextTrackId(trackId);
  if (first && next) {
    const nm = TRACK_META[trackIndex(next)];
    lines.push({ text: nm.region !== meta.region ? `New region unlocked: ${nm.name}!` : `Unlocked: ${nm.name}`, color: '#8dff9b' });
  }
  return { coins, xp, first, newBest, lines, achievements: unlockedAch, next };
}

/** Record a run that was abandoned (stats only). */
export function applyAbandon(save, run) {
  save.stats.distance += run.distance;
  save.stats.driveTime += run.driveTime;
  save.stats.recoveries += run.recoveries;
}
