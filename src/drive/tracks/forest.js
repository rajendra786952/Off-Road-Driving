// REGION 1 - FOREST TRAILS
// Dense forest, natural dirt roads, hills, small rivers and muddy paths.
import { TrackBuilder } from '../core/track.js';
import { wander, switchbacks, esses, run, square } from './motifs.js';

/** 1. Forest Entry - natural dirt road, small rocks, uneven ground, gentle climbs. */
export function forestEntry() {
  const t = new TrackBuilder({ id: 'forest-entry', name: 'Forest Entry', env: 'forest', weather: 'clear', time: 'morning', seed: 101, startY: 80 });
  t.set({ width: 7.5, surface: 'dirt', rough: 0.05, wavy: 0.1, L: 1.5, R: -1.5 });
  t.note('Steer on the left, pedals on the right. The brake pedal reverses once you have stopped.');
  t.go(80, 0, 0).go(60, 25, 1);
  wander(t, 260, { turn: 38, grade: 1.5, amp: 2 });
  t.note('Small rocks ahead. Slow down and put your wheels where you want them.');
  t.rocks(70, 14, [0.16, 0.26], { clear: 0.2 });
  wander(t, 160, { turn: 35, grade: 2 });
  t.cp('Trailhead');
  // rolling uneven ground
  t.set({ wavy: 0.24, rough: 0.08 });
  t.note('Uneven ground. Too fast and the suspension bottoms out - watch the damage bar.');
  wander(t, 380, { turn: 45, grade: 0, amp: 5 });
  t.spur(75, [[40, 20, 3], [50, -35, 6], [36, 15, 2]], { name: 'Ranger cache', reward: 120 });
  t.set({ wavy: 0.14, rough: 0.05 });
  t.aim(35);
  t.note('Gentle climb. Keep a steady throttle - momentum is your friend.');
  wander(t, 300, { turn: 42, grade: 7.5, amp: 1.5, extra: { L: 5, R: -5 } });
  wander(t, 120, { turn: 30, grade: 1 });
  t.cp('Lookout Rise');
  // descent with scattered rocks
  t.set({ wavy: 0.2 });
  t.rocks(110, 20, [0.18, 0.3]);
  wander(t, 280, { turn: 48, grade: -6, amp: 2 });
  t.set({ width: 6.5, wavy: 0.14 });
  t.log(30, { r: 0.15 });
  t.note('A fallen branch. Take it square-on and slowly so both front wheels climb together.');
  wander(t, 240, { turn: 45, grade: 0, amp: 3 });
  t.mud(26);
  t.note('Mud. Do not floor it - spinning wheels dig in. Carry a little speed and stay smooth.');
  t.go(50, 8, 0);
  wander(t, 150, { turn: 40, grade: 1 });
  t.cp('Mossy Hollow');
  // second climb, tighter
  t.aim(-25);
  t.set({ rough: 0.08, wavy: 0.18, L: 6, R: -6 });
  esses(t, 4, 46, 62, 8.5);
  t.set({ L: 2, R: -2 });
  t.rocks(80, 16, [0.2, 0.32], { clear: -0.3 });
  wander(t, 260, { turn: 44, grade: 1, amp: 4 });
  t.spur(-70, [[50, -25, -4], [44, 30, -3]], { name: 'Creek cache', reward: 120 });
  wander(t, 200, { turn: 40, grade: -5 });
  t.cp('Old Logging Road');
  t.set({ width: 7, wavy: 0.22 });
  t.log(40, { r: 0.17 });
  wander(t, 230, { turn: 46, grade: -1, amp: 3 });
  square(t, 26);
  t.ford(26, 0.35);
  t.note('Shallow stream. Cross slowly, then climb the far bank with steady throttle.');
  t.go(50, 0, 0);
  wander(t, 260, { turn: 44, grade: 4, amp: 2 });
  t.rocks(70, 14, [0.18, 0.3]);
  wander(t, 180, { turn: 40, grade: 2 });
  t.cp('Fern Ridge');
  t.aim(10);
  t.set({ L: 4, R: -4, wavy: 0.26 });
  wander(t, 300, { turn: 50, grade: -4, amp: 3 });
  t.mud(20, { from: -1.4, to: 0.1 });
  t.note('Mud on the right half only. Pick the dry line.');
  t.go(44, -6, 0);
  wander(t, 300, { turn: 42, grade: 2, amp: 3 });
  t.rocks(50, 10, [0.18, 0.28]);
  wander(t, 170, { turn: 30, grade: -1 });
  t.go(60, 0, 0);
  return t.build();
}

/** 2. Fallen Forest - fallen trees, narrow roads, roots, muddy turns, uneven terrain. */
export function fallenForest() {
  const t = new TrackBuilder({ id: 'fallen-forest', name: 'Fallen Forest', env: 'forest', weather: 'overcast', time: 'day', seed: 202, startY: 95 });
  t.set({ width: 5.6, surface: 'dirt', rough: 0.09, wavy: 0.18, L: 2, R: -2 });
  t.go(60, 0, 0);
  t.note('Storm damage: the trail is narrow and full of fallen timber.');
  wander(t, 220, { turn: 55, grade: 1, amp: 3 });
  t.log(18, { r: 0.18 }).log(46, { r: 0.2, skew: 1.2 });
  wander(t, 120, { turn: 40, grade: 2 });
  // root field
  t.set({ rough: 0.2, wavy: 0.3 });
  t.note('Tree roots. Crawl in low range (4L) and let the suspension work.');
  wander(t, 170, { turn: 50, grade: 3, amp: 2, seg: [22, 34] });
  t.set({ rough: 0.09, wavy: 0.18 });
  t.cp('Root Garden');
  // muddy turns
  t.aim(40);
  for (let i = 0; i < 4; i++) {
    t.mud(30, { at: 8 });
    t.go(46, i % 2 ? -70 : 70, i % 2 ? 2 : -2, { bank: i % 2 ? -3 : 3 });
    t.go(40, 0, 0);
  }
  t.log(20, { r: 0.19 });
  wander(t, 180, { turn: 52, grade: -2, amp: 3 });
  // log jam with a bypass
  t.note('Log jam. Three big trunks - or take the rough bypass on the left.');
  square(t, 24);
  t.bypass(74, { side: 1, offset: 11, width: 4.2, surface: 'grass', rough: 0.2, wavy: 0.3, prefer: true });
  t.log(24, { r: 0.33 }).log(34, { r: 0.36, skew: 1.5 }).log(46, { r: 0.33, skew: -1.2 });
  t.go(74, 0, 1);
  wander(t, 150, { turn: 45, grade: 4 });
  t.cp('Log Jam');
  // narrow uneven climb through dense trunks
  t.aim(0);
  t.set({ width: 4.8, wavy: 0.28, L: 5, R: -5 });
  wander(t, 240, { turn: 58, grade: 8, amp: 3, seg: [24, 38] });
  t.log(22, { r: 0.2, skew: 2 }).log(60, { r: 0.19 });
  wander(t, 150, { turn: 45, grade: 5 });
  t.spur(80, [[36, 30, 6], [40, -40, 9], [30, 20, 4]], { name: 'Woodcutter cache', reward: 150, rough: 0.16 });
  t.set({ width: 5.6, L: 2, R: -2 });
  wander(t, 160, { turn: 40, grade: -1 });
  t.cp('Splintered Rise');
  // off-camber sidehill with roots
  t.aim(-45);
  t.note('Off-camber sidehill. Stay slow and steer slightly uphill.');
  t.go(40, -20, -2, { bank: 4 });
  t.go(90, -10, -3, { bank: 13, rough: 0.14, L: 7, R: -7 });
  t.go(40, 15, -2, { bank: 4 });
  t.mud(24, { deep: true, from: -0.2, to: 1.4 });
  wander(t, 200, { turn: 55, grade: -5, amp: 2 });
  for (let i = 0; i < 5; i++) t.log(20 + i * 34, { r: 0.17 + (i % 3) * 0.04, skew: (i % 2 ? 1 : -1) * 1.4 });
  t.note('Timber ladder: five logs in a row. Keep your rhythm, one axle at a time.');
  run(t, 180, -1);
  wander(t, 140, { turn: 45, grade: 2 });
  t.cp('Timber Ladder');
  t.aim(-10);
  t.set({ rough: 0.18, wavy: 0.3 });
  wander(t, 150, { turn: 50, grade: 6, seg: [22, 34] });
  t.set({ rough: 0.09, wavy: 0.2 });
  t.mud(34);
  t.go(60, 30, 0);
  t.log(26, { r: 0.19 });
  wander(t, 230, { turn: 52, grade: -3, amp: 3 });
  t.spur(-75, [[44, -30, -3], [40, 35, -5]], { name: 'Hollow trunk cache', reward: 150 });
  t.cp('Mud Bend');
  t.set({ width: 5.2 });
  t.mud(22, { deep: true });
  t.log(40, { r: 0.18 }).log(70, { r: 0.19, skew: 1.5 });
  wander(t, 260, { turn: 55, grade: 3, amp: 4 });
  t.rocks(50, 10, [0.2, 0.3]);
  wander(t, 200, { turn: 45, grade: -2 });
  t.go(50, 0, 0);
  return t.build();
}

/** 3. River Crossing - shallow fords, wet rocks, water resistance, slippery banks. */
export function riverCrossing() {
  const t = new TrackBuilder({ id: 'river-crossing', name: 'River Crossing', env: 'forest', weather: 'clear', time: 'day', seed: 303, startY: 110 });
  t.set({ width: 6.5, surface: 'dirt', rough: 0.07, wavy: 0.16, L: 3, R: -1 });
  t.go(60, 0, 0);
  wander(t, 240, { turn: 45, grade: -4, amp: 2 });
  const crossing = (len, depth, o = {}) => {
    square(t, 22, -2);
    t.patch(14, 'mud', { at: -12 });                  // slippery entry bank
    if (o.rocks) t.rocks(len, o.rocks, [0.2, 0.34], { at: 0, hr: 0.6 });
    t.patch(len, 'wetrock', { at: 0 });
    t.ford(len, depth);
    t.patch(18, o.exit || 'mud', { at: len });        // slippery exit bank
    t.go(len, 0, 0);
    t.go(34, o.turn || 0, o.climb ?? 12);             // climb out
  };
  t.note('First river. Water slows you down - enter slowly, keep moving, do not stop mid-stream.');
  crossing(26, 0.4);
  wander(t, 260, { turn: 48, grade: 1, amp: 3 });
  t.cp('First Ford');
  t.aim(30);
  wander(t, 200, { turn: 45, grade: -3 });
  t.note('Wet rocks on the river bed. Grip is poor - no sudden steering.');
  crossing(34, 0.5, { rocks: 12, climb: 14 });
  wander(t, 150, { turn: 45, grade: 2 });
  t.spur(-80, [[40, -20, -4], [30, 25, -2]], { name: 'Fisher cache', reward: 160 });
  wander(t, 170, { turn: 45, grade: 4 });
  t.cp('Stony Ford');
  // riverside trail: off-camber bank above the water, wet rock slabs
  t.aim(70);
  t.set({ L: 6, R: -3, wavy: 0.24 });
  t.go(40, 10, -3, { bank: -4 });
  t.patch(120, 'wetrock', { at: 10 });
  t.rocks(110, 18, [0.2, 0.34], { at: 14 });
  t.go(130, 12, -1, { bank: -9, rough: 0.14 });
  t.go(40, -10, 0, { bank: -3 });
  t.set({ L: 3, R: -1, wavy: 0.16 });
  wander(t, 180, { turn: 46, grade: -2 });
  t.note('Deeper crossing. The exit bank is steep and muddy: build momentum before you leave the water.');
  crossing(40, 0.62, { exit: 'deepmud', climb: 16 });
  t.anchor(1, -10);
  wander(t, 200, { turn: 42, grade: 3 });
  t.cp('Otter Bank');
  t.aim(20);
  wander(t, 260, { turn: 50, grade: 5, amp: 3 });
  t.rocks(60, 12, [0.2, 0.3]);
  wander(t, 200, { turn: 46, grade: -6 });
  // twin fords close together
  crossing(24, 0.45, { climb: 8 });
  t.go(40, 25, -6);
  crossing(30, 0.55, { rocks: 10, climb: 15, turn: -20 });
  wander(t, 160, { turn: 40, grade: 2 });
  t.cp('Twin Fords');
  t.aim(-30);
  t.set({ wavy: 0.26 });
  wander(t, 300, { turn: 52, grade: 0, amp: 5 });
  t.spur(75, [[30, 20, -3], [36, -15, -2]], { name: 'Beaver dam cache', reward: 160 });
  t.set({ wavy: 0.16 });
  wander(t, 150, { turn: 40, grade: -4 });
  t.note('Last river: wide, with a diagonal line through the shallows. Aim for the gate on the far bank.');
  square(t, 24, -2);
  t.patch(60, 'wetrock');
  t.rocks(56, 16, [0.2, 0.36], { hr: 0.6 });
  t.ford(60, 0.6);
  t.patch(20, 'mud', { at: 60 });
  t.go(60, 0, 0).go(36, 15, 13);
  wander(t, 220, { turn: 42, grade: 3 });
  t.cp('Wide Water');
  wander(t, 260, { turn: 45, grade: -2, amp: 3 });
  t.go(50, 0, 0);
  return t.build();
}

/** 4. Deep Forest Challenge - dense forest, deep mud, steep dirt climbs, narrow paths, technical obstacles. */
export function deepForest() {
  const t = new TrackBuilder({ id: 'deep-forest', name: 'Deep Forest Challenge', env: 'forest', weather: 'fog', time: 'dusk', seed: 404, startY: 100 });
  t.set({ width: 5.2, surface: 'dirt', rough: 0.1, wavy: 0.22, L: 4, R: -4 });
  t.go(60, 0, 0);
  t.note('Deep forest in fog. Everything you have learned, back to back.');
  wander(t, 200, { turn: 55, grade: 2, amp: 3 });
  t.mud(40, { deep: true });
  t.note('Deep mud. Low range, steady throttle, no wheelspin. If you stop, reverse out and try with more speed.');
  t.go(60, 15, 0);
  t.anchor(-1);
  wander(t, 140, { turn: 45, grade: 3 });
  t.cp('Black Mire');
  // steep dirt climb with hairpins
  t.aim(20);
  t.note('Steep climb: 4L low range. Do not stop on the hairpins.');
  switchbacks(t, 4, 80, 17, { r: 12 });
  t.rocks(40, 9, [0.2, 0.32]);
  wander(t, 150, { turn: 45, grade: 4 });
  t.cp('Hairpin Hill');
  // narrow technical: logs + rocks + roots
  t.set({ width: 4.4, rough: 0.13, wavy: 0.24 });
  t.log(20, { r: 0.2 }).log(64, { r: 0.19, skew: 1.6 });
  t.rocks(60, 12, [0.2, 0.3], { at: 26 });
  wander(t, 170, { turn: 55, grade: 1, seg: [22, 34] });
  t.set({ rough: 0.1, wavy: 0.22 });
  t.spur(80, [[40, 25, 8], [44, -30, 12], [30, 10, 5]], { name: 'Hunter cache', reward: 200, rough: 0.18 });
  // steep descent into a mud bowl
  t.aim(-30);
  t.note('Steep descent. Low range and stay off the brakes - let the engine hold you.');
  run(t, 120, -20);
  t.mud(50, { deep: true });
  t.bypass(60, { side: -1, offset: 10, width: 4, surface: 'grass', rough: 0.22, wavy: 0.3, at: -4 });
  t.go(56, -10, 0);
  t.anchor(1);
  run(t, 90, 15);
  t.cp('Mud Bowl');
  // long off-camber + deep mud combination
  t.aim(10);
  t.go(40, 20, 2, { bank: 5 });
  t.mud(46, { from: -1.4, to: -0.1, at: 10 });
  t.go(90, 15, 3, { bank: 12, L: 8, R: -8 });
  t.go(40, -15, 2, { bank: 4 });
  wander(t, 200, { turn: 55, grade: 6, amp: 2 });
  t.log(18, { r: 0.19 });
  t.note('Big trunk on a climb. Approach at an angle so one wheel climbs at a time.');
  run(t, 70, 12);
  wander(t, 130, { turn: 45, grade: 2 });
  t.cp('Trunk Hill');
  // ford into deep mud exit
  t.aim(50);
  wander(t, 180, { turn: 50, grade: -6 });
  square(t, 22, -2);
  t.ford(30, 0.6);
  t.patch(30, 'mud', { at: 28 });
  t.go(30, 0, 0).go(40, 10, 12);
  t.anchor(1, -8);
  wander(t, 170, { turn: 50, grade: 4 });
  t.spur(-78, [[36, -25, -5], [40, 30, -8]], { name: 'Trapper cache', reward: 200, rough: 0.18 });
  // final: steepest climb of the region
  t.aim(15);
  t.set({ width: 4.6 });
  t.note('The Wall: the steepest climb in the forest. Momentum, low range, and commit.');
  run(t, 60, 6);
  run(t, 90, 24, { rough: 0.14 });
  t.anchor(1);
  switchbacks(t, 3, 64, 16, { r: 11, first: -1 });
  t.cp('The Wall');
  t.set({ width: 5.2 });
  t.mud(30);
  t.log(50, { r: 0.18 }).log(76, { r: 0.19, skew: -1.4 });
  wander(t, 240, { turn: 55, grade: -3, amp: 4 });
  t.rocks(60, 14, [0.22, 0.36]);
  wander(t, 220, { turn: 48, grade: -5 });
  t.mud(36, { deep: true, from: -1.4, to: 0.3 });
  t.go(60, -20, 0);
  wander(t, 160, { turn: 40, grade: 1 });
  t.go(50, 0, 0);
  return t.build();
}

export const FOREST_TRACKS = [forestEntry, fallenForest, riverCrossing, deepForest];
