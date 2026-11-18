// Expedition progression (pure functions on the save object): unlock chain,
// rewards, XP, records and achievements. Unit tested in tests/drive.test.mjs.
import { TRACK_META } from '../tracks/meta.js';
import { REGIONS } from '../tracks/regions.js';

export const REGION_ORDER = ['forest', 'mud', 'rocky', 'ridge', 'snow', 'desert', 'jungle', 'volcano'];
/** Regions outside the expedition chain: always open, their tracks unlock in order within the region. */
const OPEN = new Set(REGIONS.filter((r) => r.open).map((r) => r.id));
const expedition = () => TRACK_META.filter((t) => !OPEN.has(t.region));

export function trackIndex(id) { return TRACK_META.findIndex((t) => t.id === id); }
export function regionTracks(region) { return TRACK_META.filter((t) => t.region === region); }
export function isTrackDone(save, id) { return !!(save.tracks[id] && save.tracks[id].done); }

/** Tracks unlock in order; a region opens when every track of the previous region is done. */
export function isTrackUnlocked(save, id) {
  const i = trackIndex(id);
  if (i <= 0) return i === 0;
  // the first track of an open region needs nothing; the rest of it unlocks in order
  if (OPEN.has(TRACK_META[i].region) && TRACK_META[i - 1].region !== TRACK_META[i].region) return true;
  return isTrackDone(save, TRACK_META[i - 1].id);
}
export function isRegionUnlocked(save, region) {
  if (OPEN.has(region)) return true;
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

/** Local calendar date as YYYY-MM-DD. */
export function todayStr(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

/**
 * Daily challenge: one of the player's unlocked tracks, picked from the date, paying a one-off bonus
 * the first time it is finished that day. Returns { date, trackId, bonus, done }.
 */
export function dailyChallenge(save, date = todayStr()) {
  const open = TRACK_META.filter((t) => isTrackUnlocked(save, t.id));
  let h = 2166136261;
  for (let i = 0; i < date.length; i++) h = Math.imul(h ^ date.charCodeAt(i), 16777619) >>> 0;
  const t = open[h % open.length];
  return { date, trackId: t.id, bonus: Math.round(t.reward * 1.0) + 500, done: !!(save.daily && save.daily.date === date && save.daily.done) };
}

export const ACHIEVEMENTS = [
  { id: 'first-trail', name: 'First Trail', desc: 'Finish your first expedition track', test: (s) => s.stats.tracksDone >= 1 },
  { id: 'forest', name: 'Forest Ranger', desc: 'Complete every Forest Trails track', test: (s) => regionDone(s, 'forest') },
  { id: 'mud', name: 'Mud Runner', desc: 'Complete every Mud Valley track', test: (s) => regionDone(s, 'mud') },
  { id: 'rocky', name: 'Rock Crawler', desc: 'Complete every Rocky Mountains track', test: (s) => regionDone(s, 'rocky') },
  { id: 'ridge', name: 'Ridge Survivor', desc: 'Complete every Deadly Ridge track', test: (s) => regionDone(s, 'ridge') },
  { id: 'snow', name: 'Summiteer', desc: 'Complete every Extreme Expedition track', test: (s) => regionDone(s, 'snow') },
  { id: 'desert', name: 'Dune Rider', desc: 'Complete every Desert Storm track', test: (s) => regionDone(s, 'desert') },
  { id: 'jungle', name: 'Pathfinder', desc: 'Complete every Jungle Expedition track', test: (s) => regionDone(s, 'jungle') },
  { id: 'volcano', name: 'Fire Walker', desc: 'Complete every Volcanic Wasteland track', test: (s) => regionDone(s, 'volcano') },
  { id: 'legend', name: 'Trail Torque Legend', desc: 'Complete all 40 expedition tracks', test: (s) => expedition().length >= 40 && expedition().every((t) => isTrackDone(s, t.id)) },
  { id: 'tour', name: 'Grand Tourer', desc: 'Complete every Grand Tour track', test: (s) => regionDone(s, 'tour') },
  { id: 'relics', name: 'Relic Hunter', desc: 'Find 30 hidden relics', test: (s) => (s.stats.relics || 0) >= 30 },
  { id: 'hardcore', name: 'No Safety Net', desc: 'Finish a track on Hardcore', test: (s) => (s.stats.hardcore || 0) >= 1 },
  { id: 'night', name: 'Night Owl', desc: 'Finish a track that ends after dark', test: (s) => (s.stats.nightRuns || 0) >= 1 },
  { id: 'gold', name: 'Golden Line', desc: 'Earn a gold medal', test: (s) => s.stats.golds >= 1 },
  { id: 'gold5', name: 'Podium Regular', desc: 'Earn 5 gold medals', test: (s) => Object.values(s.tracks).filter((t) => t.medal === 3).length >= 5 },
  { id: 'clean', name: 'Not a Scratch', desc: 'Finish a track with no recoveries and under 40% damage', test: (s) => s.stats.cleanRuns >= 1 },
  { id: 'caches', name: 'Explorer', desc: 'Find 10 supply caches', test: (s) => s.stats.caches >= 10 },
  { id: 'cargo', name: 'Courier', desc: 'Finish a cargo run with the load at least 90% intact', test: (s) => (s.stats.cargoRuns || 0) >= 1 },
  { id: 'daily', name: 'Regular', desc: 'Complete 5 daily challenges', test: (s) => (s.stats.dailies || 0) >= 5 },
  { id: 'distance', name: 'Long Hauler', desc: 'Drive 100 km in expeditions', test: (s) => s.stats.distance >= 100000 }
];
const DIFF_RANK = { casual: 1, standard: 2, hardcore: 3 };
function regionDone(save, region) {
  const list = regionTracks(region);
  return list.length > 0 && list.every((t) => isTrackDone(save, t.id));
}

/**
 * Apply a finished run to the save. Mutates `save`, returns a reward summary.
 * @param run { time, medal, stars, objectives:[{id,done}], recoveries, damage, cachesFound:boolean[], cacheRewards:number[], distance, driveTime,
 *              cargo? (0..100, cargo runs only), daily? (date string when this run is today's unfinished daily challenge), vehicle?, date? }
 */
export function applyResult(save, trackId, run) {
  const meta = TRACK_META[trackIndex(trackId)];
  const prev = { done: false, bestTime: 0, medal: 0, stars: 0, objectives: {}, caches: [], relics: [], runs: 0, diff: '', ...(save.tracks[trackId] || {}) };
  const mult = run.rewardMult || 1;
  const first = !prev.done;
  const lines = [];
  let coins = Math.round(meta.reward * (first ? 1 : 0.35) * mult);
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
  let newRelics = 0;
  const relics = (run.relicsFound || []).map((f, i) => { const had = !!(prev.relics || [])[i]; if (f && !had) newRelics++; return had || f; });
  if (newRelics > 0) { const rc = newRelics * 80; coins += rc; lines.push({ text: `Hidden relics x${newRelics}: +${rc}`, color: '#8dff9b' }); }
  if (mult !== 1) lines.push({ text: `${run.difficulty} difficulty: rewards x${mult}`, color: '#8fc1e3' });
  if (run.cargo !== undefined) {
    const cb = Math.round(meta.reward * 0.6 * (run.cargo / 100) * mult);
    coins += cb;
    lines.push({ text: run.cargo > 0 ? `Cargo delivered ${Math.round(run.cargo)}% intact: +${cb}` : 'Cargo destroyed: no delivery bonus', color: run.cargo >= 70 ? '#8dff9b' : '#ffcf8f' });
  }
  if (run.daily) {
    const db = Math.round(meta.reward * 1.0) + 500;
    coins += db;
    lines.push({ text: `Daily challenge: +${db}`, color: '#ffd23f' });
    save.daily = { date: run.daily, done: true };
  }
  // the workshop bill: damage costs a share of what the track pays (never more than the run earned)
  const bill = Math.min(coins, Math.round(meta.reward * 0.3 * Math.min(100, run.damage) / 100));
  if (bill > 0) { coins -= bill; lines.push({ text: `Repairs (${Math.round(run.damage)}% damage): -${bill}`, color: '#ff9b8f' }); }

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
    relics,
    diff: DIFF_RANK[run.difficultyId] > (DIFF_RANK[prev.diff] || 0) ? run.difficultyId : prev.diff,
    runs: prev.runs + 1,
    // personal leaderboard: the five best times on this track
    times: [...(prev.times || []), { t: run.time, v: run.vehicle || '', d: run.date || '' }].sort((a, b) => a.t - b.t).slice(0, 5)
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
  st.relics = (st.relics || 0) + newRelics;
  if (run.difficultyId === 'hardcore') st.hardcore = (st.hardcore || 0) + 1;
  if (run.night) st.nightRuns = (st.nightRuns || 0) + 1;
  if (run.cargo !== undefined && run.cargo >= 90) st.cargoRuns = (st.cargoRuns || 0) + 1;
  if (run.daily) st.dailies = (st.dailies || 0) + 1;
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
  if (first && next && !(OPEN.has(TRACK_META[trackIndex(next)].region) && TRACK_META[trackIndex(next)].region !== meta.region)) {
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
