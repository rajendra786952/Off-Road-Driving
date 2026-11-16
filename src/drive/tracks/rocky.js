// REGION 3 - ROCKY MOUNTAINS
// Large mountains, rocky terrain, steep climbs, dangerous descents, rock crawling.
import { TrackBuilder } from '../core/track.js';
import { wander, switchbacks, esses, run, square } from './motifs.js';

/** 9. Rocky Entrance - small and medium rocks, uneven terrain, suspension challenges, narrow paths. */
export function rockyEntrance() {
  const t = new TrackBuilder({ id: 'rocky-entrance', name: 'Rocky Entrance', env: 'rocky', weather: 'clear', time: 'morning', seed: 909, startY: 200 });
  t.set({ width: 6, surface: 'gravel', rough: 0.09, wavy: 0.18, L: 6, R: -6 });
  t.go(70, 0, 0);
  t.note('Rock country. Rocks punish speed: crawl, and place your tyres ON the rocks, not beside them.');
  wander(t, 200, { turn: 42, grade: 3 });
  t.rocks(90, 26, [0.18, 0.3]);
  wander(t, 130, { turn: 36, grade: 2 });
  t.cp('Gravel Gate');
  // suspension test: washboard + cross-axle bumps
  t.aim(30);
  t.set({ rough: 0.16, wavy: 0.34 });
  t.note('Cross-axle bumps. Opposite wheels drop at the same time - go slow and let the axles flex.');
  wander(t, 220, { turn: 40, grade: 2, seg: [22, 34] });
  t.set({ rough: 0.09, wavy: 0.18 });
  t.rocks(70, 18, [0.22, 0.36]);
  wander(t, 150, { turn: 40, grade: 5 });
  t.spur(78, [[36, 20, 6], [40, -25, 9]], { name: 'Prospector cache', reward: 380, surface: 'gravel', rough: 0.14 });
  t.cp('Washboard');
  // narrow rock corridor between walls
  t.aim(-15);
  t.set({ width: 4.6, surface: 'rock', L: 9, R: 9, rough: 0.14 });
  t.note('Narrow canyon. Walls both sides - mirrors in.');
  wander(t, 260, { turn: 48, grade: 3, amp: 2, seg: [24, 36] });
  t.rocks(60, 14, [0.24, 0.4], { clear: 0 });
  wander(t, 120, { turn: 40, grade: 4 });
  t.set({ width: 6, surface: 'gravel', L: 6, R: -6, rough: 0.09 });
  t.cp('Slot Canyon');
  // medium rock field with a bypass
  t.aim(20);
  t.note('Rock field. The direct line needs clearance; the loop to the right is longer but clear.');
  square(t, 22, 2);
  t.bypass(100, { side: -1, offset: 13, width: 4.4, surface: 'gravel', rough: 0.12, wavy: 0.24 });
  t.rocks(84, 30, [0.26, 0.44], { at: 8 });
  t.go(100, 0, 3, { surface: 'rock', rough: 0.16 });
  wander(t, 170, { turn: 42, grade: 6 });
  t.cp('Stone Field');
  // stepped climb
  t.aim(45);
  t.set({ surface: 'rock', rough: 0.15, wavy: 0.26 });
  t.note('Rock steps. Low range, ease each axle up, never rush a ledge.');
  esses(t, 3, 44, 50, 11);
  t.rocks(70, 18, [0.24, 0.38]);
  run(t, 90, 9);
  t.set({ surface: 'gravel', rough: 0.09, wavy: 0.18 });
  wander(t, 150, { turn: 40, grade: 2 });
  t.spur(-76, [[40, -20, 4], [36, 25, 7]], { name: 'Cairn cache', reward: 380, surface: 'gravel', rough: 0.14 });
  t.cp('The Steps');
  // dry river bed of rounded stones
  t.aim(-25);
  t.note('Dry river bed. Round stones roll under the tyres - slow and steady, low range.');
  t.set({ surface: 'riverbed', rough: 0.2, wavy: 0.3, width: 7, L: 3, R: 3 });
  t.rocks(200, 44, [0.3, 0.5], { at: 20 });
  wander(t, 250, { turn: 36, grade: 1, seg: [24, 36] });
  t.set({ surface: 'gravel', rough: 0.09, wavy: 0.18, width: 6, L: 6, R: -6 });
  wander(t, 140, { turn: 40, grade: 4 });
  t.cp('Dry Bed');
  t.aim(10);
  t.note('First real rock step. Lift and lockers make this easy - without them, pick your line and use momentum.');
  t.rocks(34, 16, [0.42, 0.6]);
  run(t, 60, 6, { surface: 'rock', rough: 0.16 });
  t.anchor(1);
  t.rocks(100, 28, [0.2, 0.36]);
  wander(t, 260, { turn: 46, grade: -4, amp: 3 });
  t.set({ rough: 0.15, wavy: 0.3 });
  wander(t, 160, { turn: 40, grade: -2, seg: [22, 34] });
  t.set({ rough: 0.09, wavy: 0.18 });
  t.boulder(30, -0.55, 1.2).boulder(64, 0.5, 1.3);
  t.note('Boulders in the road. Steer around - there is always a gap.');
  run(t, 100, 1);
  wander(t, 240, { turn: 42, grade: 3 });
  t.go(50, 0, 0);
  return t.build();
}

/** 10. Rock Crawler - large rocks, wheel lifting, technical crawling, difficult wheel placement. */
export function rockCrawler() {
  const t = new TrackBuilder({ id: 'rock-crawler', name: 'Rock Crawler', env: 'rocky', weather: 'clear', time: 'day', seed: 1010, startY: 260 });
  t.set({ width: 6.2, surface: 'rock', rough: 0.12, wavy: 0.22, L: 7, R: -4 });
  t.go(70, 0, 0, { surface: 'gravel' });
  t.note('Rock Crawler. Walking pace all the way. Diff locks stop a lifted wheel stealing your drive.');
  wander(t, 150, { turn: 40, grade: 3, extra: { surface: 'gravel' } });
  const garden = (len, n, size, o = {}) => {
    square(t, 20, 2);
    if (o.bypass) t.bypass(len + 24, { side: o.bypass, offset: 13, width: 4.4, surface: 'scree', rough: 0.16, wavy: 0.3, at: -12, prefer: !!o.prefer });
    t.rocks(len, n, size, { clear: o.clear, hr: o.hr ?? 0.7 });
    t.go(len, o.turn || 0, o.grade ?? 3, { rough: o.rough ?? 0.22, wavy: 0.3 });
    t.anchor(o.side || 1, 4);
  };
  garden(60, 28, [0.4, 0.6]);
  wander(t, 120, { turn: 40, grade: 3 });
  t.cp('First Garden');
  t.aim(25);
  t.note('Wheel-lift section. One wheel will hang in the air - keep the throttle gentle and steady.');
  t.set({ rough: 0.26, wavy: 0.4 });
  wander(t, 130, { turn: 36, grade: 4, seg: [20, 30] });
  t.set({ rough: 0.12, wavy: 0.22 });
  garden(70, 34, [0.5, 0.72], { side: -1, grade: 5, rough: 0.26 });
  wander(t, 110, { turn: 40, grade: 2 });
  t.spur(78, [[34, 20, 8], [36, -25, 10]], { name: 'Crawler cache', reward: 420, surface: 'rock', rough: 0.2 });
  t.cp('Hanging Wheel');
  // boulder slalom: steer between big rocks
  t.aim(-20);
  t.note('Boulder slalom. Too big to climb: thread the gaps, full lock if you must.');
  square(t, 20);
  t.boulder(16, -0.5, 1.3).boulder(34, 0.55, 1.4).boulder(54, -0.55, 1.3).boulder(74, 0.5, 1.5).boulder(94, -0.5, 1.3);
  t.go(110, 0, 2, { width: 8.4 });
  wander(t, 120, { turn: 40, grade: 4 });
  t.cp('Slalom');
  // the big one
  t.aim(15);
  t.note('The Staircase: big rocks on a climb. Needs lift, lockers and patience - or take the scree bypass.');
  garden(80, 38, [0.58, 0.88], { hr: 0.65, bypass: 1, prefer: false, grade: 8, rough: 0.22 });
  wander(t, 130, { turn: 40, grade: 3 });
  t.cp('The Staircase');
  t.aim(50);
  t.set({ rough: 0.24, wavy: 0.36 });
  wander(t, 150, { turn: 38, grade: -3, seg: [20, 30] });
  t.set({ rough: 0.12, wavy: 0.22 });
  garden(56, 26, [0.5, 0.72], { grade: -5, rough: 0.24 });
  t.log(24, { r: 0.22 });
  wander(t, 130, { turn: 42, grade: -2 });
  t.spur(-76, [[36, -20, 5], [34, 25, 9]], { name: 'High shelf cache', reward: 420, surface: 'rock', rough: 0.2 });
  t.cp('Down Garden');
  // off-camber slab
  t.aim(10);
  t.note('Tilted slab. Dry rock grips well - trust it, but keep your speed down.');
  t.go(36, 10, 2, { bank: 5 });
  t.rocks(70, 14, [0.3, 0.46], { at: 6, spread: 0.7 });
  t.go(90, -10, 3, { bank: 14, L: 10, R: -10 });
  t.go(36, 8, 2, { bank: 4 });
  garden(66, 32, [0.52, 0.76], { side: -1, grade: 6, rough: 0.26 });
  wander(t, 120, { turn: 40, grade: 2 });
  t.cp('Tilted Slab');
  t.set({ rough: 0.22, wavy: 0.34 });
  wander(t, 140, { turn: 38, grade: 3, seg: [20, 30] });
  t.set({ rough: 0.12, wavy: 0.22 });
  garden(50, 24, [0.5, 0.7], { grade: 4, rough: 0.24 });
  wander(t, 130, { turn: 42, grade: -2 });
  t.cp('Last Garden');
  t.aim(-15);
  t.note('The Notch: a rock corridor with a ledge in the middle. Square on, one axle at a time.');
  t.set({ width: 4.6, L: 8, R: 8 });
  t.rocks(30, 16, [0.5, 0.74], { at: 40 });
  wander(t, 150, { turn: 34, grade: 5, seg: [24, 34] });
  t.anchor(1);
  t.set({ width: 6.2, L: 7, R: -4 });
  wander(t, 220, { turn: 42, grade: -2, extra: { surface: 'gravel' } });
  t.go(50, 0, 0, { surface: 'gravel' });
  return t.build();
}

/** 11. Mountain Climb - steep uphill, rocky slopes, sharp turns, engine torque challenges. */
export function mountainClimb() {
  const t = new TrackBuilder({ id: 'mountain-climb', name: 'Mountain Climb', env: 'rocky', weather: 'overcast', time: 'day', seed: 1111, startY: 150 });
  t.set({ width: 5.6, surface: 'gravel', rough: 0.1, wavy: 0.18, L: 12, R: -14 });
  t.go(70, 0, 0);
  t.note('350 metres of climbing. Low range for the steep pitches, and watch the fuel - climbing drinks it.');
  wander(t, 150, { turn: 40, grade: 6 });
  run(t, 140, 14);
  wander(t, 100, { turn: 36, grade: 5 });
  t.cp('Lower Slopes');
  t.aim(20);
  switchbacks(t, 5, 84, 15, { r: 12 });
  t.rocks(50, 14, [0.22, 0.36]);
  wander(t, 110, { turn: 36, grade: 6 });
  t.cp('First Stack');
  // loose scree pitch: torque + traction
  t.aim(-20);
  t.note('Loose scree. Wheelspin digs you in - feed the power, do not stamp on it.');
  t.set({ surface: 'scree', wavy: 0.24 });
  run(t, 100, 18);
  t.anchor(1);
  run(t, 90, 20);
  t.anchor(-1);
  t.set({ surface: 'gravel', wavy: 0.18 });
  wander(t, 110, { turn: 40, grade: 5 });
  t.spur(80, [[34, 20, 10], [36, -25, 12]], { name: 'Eagle cache', reward: 460, surface: 'gravel', rough: 0.14 });
  t.cp('Scree Pitch');
  // rocky slope with sharp turns
  t.aim(30);
  t.set({ surface: 'rock', rough: 0.15 });
  esses(t, 5, 40, 66, 13);
  t.rocks(60, 18, [0.24, 0.4]);
  run(t, 80, 12);
  t.note('Boulder step on the climb. Lockers in, and do not lift off half way.');
  t.rocks(36, 18, [0.5, 0.72]);
  run(t, 60, 13, { rough: 0.22 });
  t.anchor(-1);
  t.set({ surface: 'gravel', rough: 0.1 });
  t.cp('Rock Bends');
  // the torque wall
  t.aim(0);
  t.note('The Torque Wall: 26 percent. First gear low, steady revs, no stopping.');
  t.go(50, 0, 3);
  run(t, 60, 26, { surface: 'rock', rough: 0.12 });
  t.anchor(1);
  run(t, 60, 38, { surface: 'rock', rough: 0.12 });
  t.anchor(-1);
  t.rocks(30, 14, [0.46, 0.66], { at: 6 });
  run(t, 50, 14, { surface: 'rock', rough: 0.2 });
  t.anchor(1);
  switchbacks(t, 4, 76, 16, { r: 11, first: -1 });
  wander(t, 100, { turn: 36, grade: 5 });
  t.spur(-78, [[36, -20, 8], [34, 25, 11]], { name: 'Col cache', reward: 460, surface: 'gravel', rough: 0.14 });
  t.cp('Torque Wall');
  // summit ridge
  t.aim(-30);
  t.set({ width: 5, L: -10, R: -16 });
  t.rocks(80, 20, [0.22, 0.38]);
  wander(t, 200, { turn: 42, grade: 9, amp: 2 });
  t.set({ surface: 'scree', wavy: 0.24 });
  run(t, 90, 19);
  t.anchor(-1);
  t.set({ surface: 'gravel', wavy: 0.18 });
  switchbacks(t, 3, 70, 14, { r: 12 });
  t.cp('Summit Ridge');
  wander(t, 200, { turn: 40, grade: 7, amp: 2 });
  t.go(50, 0, 1);
  return t.build();
}

/** 12. Mountain Descent - dangerous downhill, loose rocks, braking challenges, narrow mountain roads. */
export function mountainDescent() {
  const t = new TrackBuilder({ id: 'mountain-descent', name: 'Mountain Descent', env: 'rocky', weather: 'clear', time: 'dusk', seed: 1212, startY: 520 });
  t.set({ width: 5, surface: 'gravel', rough: 0.1, wavy: 0.18, L: 14, R: -26 });
  t.go(70, 0, 0);
  t.note('All downhill from here. Low range holds your speed on engine braking - brakes alone will lock and slide.');
  wander(t, 140, { turn: 38, grade: -6 });
  run(t, 130, -15);
  wander(t, 90, { turn: 34, grade: -5 });
  t.cp('High Road');
  t.aim(-20);
  switchbacks(t, 5, 80, -15, { r: 12, first: -1 });
  wander(t, 100, { turn: 36, grade: -6 });
  t.cp('Upper Hairpins');
  // loose scree chute
  t.aim(20);
  t.note('Scree chute. The surface moves under you: brake in a straight line, before the corner.');
  t.set({ surface: 'scree', wavy: 0.26 });
  run(t, 110, -19);
  t.go(44, 60, -8);
  run(t, 90, -18);
  t.go(44, -60, -8);
  t.set({ surface: 'gravel', wavy: 0.18 });
  t.rocks(60, 16, [0.2, 0.34]);
  wander(t, 110, { turn: 38, grade: -6 });
  t.spur(78, [[34, 20, -6], [36, -25, -9]], { name: 'Shepherd cache', reward: 500, surface: 'gravel', rough: 0.14 });
  t.cp('Scree Chute');
  // narrow ledge with loose rocks
  t.aim(-30);
  t.set({ width: 4.2, L: 16, R: -34 });
  t.note('Narrow ledge with a long drop. Hug the wall and mind the loose rocks.');
  t.rocks(150, 26, [0.18, 0.3], { spread: 0.8 });
  wander(t, 240, { turn: 40, grade: -9, amp: 2, seg: [26, 40] });
  t.set({ width: 5, L: 14, R: -26 });
  t.cp('The Ledge');
  // steepest pitch, straight into a hairpin
  t.aim(10);
  t.note('The Plunge: 26 percent down into a hairpin. Be at walking pace BEFORE the turn.');
  run(t, 100, -26, { surface: 'rock', rough: 0.12 });
  t.go(40, 100, -6);
  switchbacks(t, 4, 74, -16, { r: 11 });
  wander(t, 100, { turn: 36, grade: -5 });
  t.spur(-78, [[36, -20, -5], [34, 25, -8]], { name: 'Tarn cache', reward: 500, surface: 'gravel', rough: 0.14 });
  t.cp('The Plunge');
  // rock garden on a descent + off-camber
  t.aim(40);
  t.set({ surface: 'rock', rough: 0.16 });
  t.note('Rock chute. Ease down each drop on the brakes - a bounce here bends things.');
  t.rocks(80, 34, [0.46, 0.7]);
  run(t, 100, -13, { rough: 0.22 });
  t.go(36, -12, -6, { bank: -5 });
  t.go(90, 10, -8, { bank: -11 });
  t.go(36, -8, -6, { bank: -4 });
  t.set({ surface: 'scree', rough: 0.1, wavy: 0.26 });
  esses(t, 4, 42, 62, -13);
  t.set({ surface: 'gravel', wavy: 0.18 });
  t.cp('Loose Bends');
  switchbacks(t, 3, 70, -14, { r: 12, first: -1 });
  t.rocks(60, 14, [0.2, 0.34]);
  wander(t, 230, { turn: 42, grade: -7, amp: 2 });
  t.go(50, 0, -1);
  return t.build();
}

export const ROCKY_TRACKS = [rockyEntrance, rockCrawler, mountainClimb, mountainDescent];
