// REGION 9 - GRAND TOUR
// Five stand-alone tracks, one per landscape, open from the first launch and
// finishable in a stock vehicle. Shorter and more varied than the expedition
// tracks: each packs its landscape's signature features into about three kilometres.
import { TrackBuilder } from '../core/track.js';
import { wander, switchbacks, esses, run, square } from './motifs.js';

/** 41. Forest Trail - narrow pine trails, muddy dirt, fallen trees, wooden bridges, streams. */
export function tourForest() {
  const t = new TrackBuilder({ id: 'tour-forest', name: 'Forest Trail', env: 'forest', weather: 'clear', time: 'morning', seed: 4101, startY: 90 });
  t.set({ width: 6.6, surface: 'dirt', rough: 0.05, wavy: 0.12, L: 2, R: -2 });
  t.go(70, 0, 0).go(50, -20, 1);
  wander(t, 240, { turn: 42, grade: 2, amp: 2 });
  t.note('A narrow forest path. Trees and logs beside the trail are solid - stay between them.');
  t.set({ width: 5.2, wavy: 0.18 });
  esses(t, 4, 44, 55, 1);
  t.log(26, { r: 0.16 });
  wander(t, 150, { turn: 40, grade: 0 });
  t.cp('Pine Gate');
  // down to the first stream and a wooden bridge
  t.aim(30);
  t.set({ width: 6, L: 5, R: -5 });
  wander(t, 200, { turn: 44, grade: -5, amp: 2 });
  t.mud(30, { from: -1.4, to: 0.2 });
  t.note('Mud on the right. The left half is firm.');
  t.go(56, 10, -1);
  square(t, 26);
  t.bridge(34, { width: 3.6, depth: 9, rails: true });
  t.go(34, 0, 0).go(30, 0, 0);
  t.spur(70, [[44, 20, 3], [40, -30, 4]], { name: 'Woodcutter cache', reward: 150 });
  wander(t, 170, { turn: 40, grade: 3 });
  t.cp('Mill Bridge');
  // rolling hills and valleys with rocks
  t.aim(-20);
  t.set({ width: 6.4, wavy: 0.28, rough: 0.08, L: 3, R: -3 });
  t.rocks(90, 18, [0.18, 0.3], { clear: 0.2 });
  wander(t, 300, { turn: 46, grade: 4, amp: 5 });
  t.go(60, 30, 6, { bank: 5 });
  t.go(60, -34, 5, { bank: -5 });
  wander(t, 140, { turn: 36, grade: 0 });
  t.cp('Fern Hollow');
  // stream crossing, then an optional shortcut over a rocky rise
  t.aim(15);
  t.set({ wavy: 0.16, rough: 0.05 });
  wander(t, 180, { turn: 40, grade: -4 });
  square(t, 24);
  t.ford(24, 0.4);
  t.note('A shallow stream. Cross slowly and power out up the far bank.');
  t.go(46, 0, 1);
  t.bypass(120, { side: -1, offset: 13, width: 4.2, surface: 'gravel', rough: 0.14, wavy: 0.2, dy: 2.5, at: 20 });
  t.note('The gravel track on the right is shorter but rough. The main trail goes round.');
  wander(t, 260, { turn: 44, grade: 1, amp: 3 });
  t.log(30, { r: 0.18 });
  t.spur(-72, [[46, -22, -3], [40, 28, -2]], { name: 'Hunter cache', reward: 150 });
  wander(t, 150, { turn: 38, grade: 2 });
  t.cp('Stream Bend');
  // the dark woods: tight, muddy, then a second bridge to the finish
  t.aim(-10);
  t.set({ width: 5.4, wavy: 0.2, L: 6, R: -6 });
  esses(t, 5, 42, 58, -2);
  t.mud(24);
  t.go(50, -8, 0);
  wander(t, 220, { turn: 44, grade: 3, amp: 2 });
  t.cp('Dark Woods');
  t.set({ width: 6.4, L: 2, R: -2 });
  square(t, 26);
  t.bridge(40, { width: 3.6, depth: 12, rails: true });
  t.go(40, 0, 0).go(30, 0, 0);
  wander(t, 260, { turn: 40, grade: -2, amp: 2 });
  t.rocks(50, 10, [0.16, 0.26]);
  wander(t, 130, { turn: 30, grade: 0 });
  t.go(60, 0, 0);
  return t.build();
}

/** 42. Desert Adventure - dunes, a slot canyon, dry rocky pass, a stone bridge. */
export function tourDesert() {
  const t = new TrackBuilder({ id: 'tour-desert', name: 'Desert Adventure', env: 'desert', weather: 'haze', time: 'day', seed: 4202, startY: 60 });
  t.set({ width: 8, surface: 'sand', rough: 0.03, wavy: 0.2, L: 0, R: 0 });
  t.go(80, 0, 0).go(60, 18, 0);
  t.note('Sand drags at the wheels and the engine runs hot. Keep rolling - stopping in soft sand digs you in.');
  wander(t, 260, { turn: 36, grade: 1, amp: 3 });
  // dune field: long soft waves
  t.set({ wavy: 0.5, width: 9 });
  run(t, 120, 9);
  run(t, 90, -8);
  run(t, 110, 10);
  t.patch(60, 'deepsand', { from: -1.4, to: 0, at: 10 });
  t.note('Deep sand on the right. Stay on the packed line.');
  run(t, 100, -9);
  t.cp('Dune Sea');
  // dry wash with rocks
  t.aim(35);
  t.set({ surface: 'gravel', wavy: 0.14, rough: 0.1, width: 7, L: 3, R: 3 });
  t.rocks(100, 22, [0.2, 0.34], { clear: -0.2 });
  wander(t, 280, { turn: 44, grade: 2, amp: 2 });
  t.spur(74, [[50, 18, 4], [44, -30, 6]], { name: 'Prospector cache', reward: 180, surface: 'sand' });
  wander(t, 120, { turn: 34, grade: 3 });
  t.cp('Dry Wash');
  // slot canyon: high walls both sides, tight bends
  t.aim(-10);
  t.set({ surface: 'dirt', width: 5, wavy: 0.1, rough: 0.07, L: 16, R: 16 });
  t.note('The canyon. Narrow, twisting and blind - the chevrons mark the tight bends.');
  esses(t, 6, 46, 62, 1.5);
  wander(t, 160, { turn: 46, grade: 2 });
  t.cp('Slot Canyon');
  // out over the rim on a stone bridge, then the rocky pass with banked hairpins
  t.aim(25);
  t.set({ surface: 'rock', width: 6.4, L: 8, R: -10, rough: 0.1, wavy: 0.12 });
  wander(t, 150, { turn: 38, grade: 6 });
  square(t, 26, 2);
  t.bridge(46, { width: 4, depth: 18, rails: true });
  t.go(46, 0, 0).go(30, 0, 1);
  switchbacks(t, 3, 70, 11, { r: 14 });
  t.spur(-70, [[40, -20, 3], [46, 26, 5]], { name: 'Rim cache', reward: 180, surface: 'rock' });
  wander(t, 130, { turn: 36, grade: 2 });
  t.cp('Red Rim');
  // descent back to the sand
  t.aim(0);
  t.set({ surface: 'gravel', L: 4, R: -6, wavy: 0.16 });
  t.go(60, 26, -7, { bank: 5 });
  t.go(70, -40, -8, { bank: -6 });
  t.go(60, 30, -7, { bank: 5 });
  wander(t, 200, { turn: 40, grade: -5 });
  t.cp('Last Descent');
  t.set({ surface: 'sand', width: 8.5, wavy: 0.4, L: 0, R: 0 });
  run(t, 110, 7);
  run(t, 100, -7);
  wander(t, 200, { turn: 34, grade: 0, amp: 3 });
  t.go(70, 0, 0);
  return t.build();
}

/** 43. Mountain Expedition - switchback climb, cliff ledge, railed bridges over deep valleys, snow line. */
export function tourMountain() {
  const t = new TrackBuilder({ id: 'tour-mountain', name: 'Mountain Expedition', env: 'rocky', weather: 'clear', time: 'day', seed: 4303, startY: 160 });
  t.set({ width: 6.6, surface: 'gravel', rough: 0.08, wavy: 0.12, L: 4, R: -4 });
  t.go(70, 0, 0).go(60, 20, 3);
  wander(t, 200, { turn: 40, grade: 5, amp: 2 });
  t.note('A mountain road. High range stalls on the steep ramps - use low range (4L) to climb.');
  switchbacks(t, 4, 74, 12, { r: 13 });
  wander(t, 110, { turn: 34, grade: 4 });
  t.cp('First Hairpins');
  // cliff ledge: wall on the left, a long drop on the right
  t.aim(40);
  t.set({ width: 5, L: 14, R: -22, rough: 0.07, wavy: 0.08 });
  t.note('The ledge. Rock wall on your left, nothing on your right. Fences only guard the bends.');
  wander(t, 300, { turn: 34, grade: 4, amp: 1.5, minR: 20 });
  t.rocks(50, 10, [0.18, 0.28], { clear: 0.3 });
  t.go(60, 12, 3);
  t.cp('The Ledge');
  // first valley bridge
  t.aim(10);
  t.set({ width: 6, L: 6, R: -8 });
  wander(t, 140, { turn: 38, grade: 3 });
  square(t, 28, 1);
  t.bridge(56, { width: 3.8, depth: 30, rails: true });
  t.go(56, 0, 0).go(30, 0, 2);
  t.spur(76, [[40, 24, 5], [44, -30, 7], [30, 10, 3]], { name: 'Summit hut cache', reward: 200, surface: 'gravel' });
  // rock garden on the pass
  t.set({ surface: 'rock', rough: 0.14, wavy: 0.2, width: 7, L: 3, R: -3 });
  t.rocks(110, 26, [0.22, 0.38], { clear: 0.1 });
  wander(t, 240, { turn: 42, grade: 6, amp: 3 });
  t.cp('High Pass');
  // descent: banked hairpins, a second bridge
  t.aim(-25);
  t.set({ surface: 'gravel', rough: 0.08, wavy: 0.12, width: 6.2, L: 8, R: -12 });
  t.note('Downhill. Low range gives engine braking - let it hold the truck back.');
  switchbacks(t, 3, 70, -12, { r: 13, first: -1 });
  wander(t, 150, { turn: 38, grade: -5 });
  square(t, 26, -1);
  t.bridge(44, { width: 3.6, depth: 24, rails: true });
  t.go(44, 0, 0).go(30, 0, -1);
  t.cp('Eagle Bridge');
  t.aim(-5);
  t.spur(-70, [[44, -24, -3], [40, 28, -2]], { name: 'Miner cache', reward: 200, surface: 'gravel' });
  t.go(60, -28, -6, { bank: -5 });
  t.go(64, 36, -7, { bank: 6 });
  wander(t, 240, { turn: 42, grade: -6, amp: 2 });
  t.cp('Tree Line');
  t.set({ L: 3, R: -3, width: 7 });
  wander(t, 260, { turn: 40, grade: -3, amp: 2 });
  t.go(70, 0, 0);
  return t.build();
}

/** 44. Swamp Adventure - waterlogged ground, mud, ponds and river crossings, fallen trees, a causeway. */
export function tourSwamp() {
  const t = new TrackBuilder({ id: 'tour-swamp', name: 'Swamp Adventure', env: 'mud', weather: 'overcast', time: 'day', seed: 4404, startY: 40 });
  t.set({ width: 6.6, surface: 'dirt', rough: 0.05, wavy: 0.14, L: 1, R: -1 });
  t.go(70, 0, 0).go(50, -18, 0);
  wander(t, 220, { turn: 40, grade: 0, amp: 1.5 });
  t.note('Mud. Carry a little speed and stay smooth - spinning wheels dig holes.');
  t.mud(40, { from: -0.2, to: 1.4 });
  t.go(70, 12, 0);
  t.mud(30, { from: -1.4, to: 0.2 });
  t.go(60, -14, 0);
  wander(t, 130, { turn: 38, grade: 0 });
  t.cp('Reed Gate');
  // the first ponds
  t.aim(25);
  t.set({ wavy: 0.2 });
  square(t, 22);
  t.ford(30, 0.45);
  t.note('A pond. Slow in, steady through, and keep the revs up on the way out.');
  t.go(50, 0, 0);
  wander(t, 170, { turn: 42, grade: 0, amp: 2 });
  t.log(24, { r: 0.17 });
  t.spur(72, [[40, 22, 1], [44, -28, 1]], { name: 'Fisher cache', reward: 160 });
  square(t, 22);
  t.ford(36, 0.55);
  t.go(50, 0, 1);
  wander(t, 120, { turn: 36, grade: 1 });
  t.cp('Twin Ponds');
  // causeway: a narrow firm line with deep mud either side, or the long way round
  t.aim(-15);
  t.set({ width: 7.5, L: 0, R: 0, wavy: 0.1 });
  t.patch(150, 'deepmud', { from: 0.25, to: 1.4, at: 10 });
  t.patch(150, 'deepmud', { from: -1.4, to: -0.25, at: 10 });
  t.note('The causeway: firm ground down the middle, deep mud on both sides. Hold the centre.');
  run(t, 170, 0);
  wander(t, 160, { turn: 40, grade: 1 });
  t.cp('The Causeway');
  // narrow overgrown trail with logs and a river
  t.aim(20);
  t.set({ width: 5.4, wavy: 0.22, rough: 0.07, L: 2, R: -2 });
  esses(t, 4, 44, 56, 0);
  t.log(22, { r: 0.18 });
  t.mud(26);
  t.go(60, 10, 0);
  square(t, 22);
  t.ford(40, 0.6);
  t.note('The river. The deepest crossing - do not stop in the middle.');
  t.go(50, 0, 1);
  t.spur(-70, [[44, -20, 1], [40, 30, 2]], { name: 'Trapper cache', reward: 160 });
  wander(t, 150, { turn: 38, grade: 1 });
  t.cp('River Bank');
  // drier ground, a rise, then one last wet stretch to the finish
  t.aim(-5);
  t.set({ width: 6.6, wavy: 0.26 });
  wander(t, 220, { turn: 42, grade: 3, amp: 3 });
  t.go(60, 28, 2, { bank: 4 });
  t.go(60, -30, -2, { bank: -4 });
  wander(t, 160, { turn: 38, grade: -3 });
  t.cp('Dry Rise');
  t.mud(34, { from: -1.4, to: 0.1 });
  t.go(64, 8, 0);
  square(t, 22);
  t.ford(26, 0.4);
  t.go(50, 0, 0);
  wander(t, 240, { turn: 38, grade: 0, amp: 2 });
  t.go(60, 0, 0);
  return t.build();
}

/** 45. Snow Expedition - snowy forest, a frozen lake, deep drifts, a rocky pass and a mountain bridge. */
export function tourSnow() {
  const t = new TrackBuilder({ id: 'tour-snow', name: 'Snow Expedition', env: 'snow', weather: 'snow', time: 'day', seed: 4505, startY: 280 });
  t.set({ width: 6.8, surface: 'snow', rough: 0.05, wavy: 0.16, L: 3, R: -3 });
  t.go(70, 0, 0).go(50, 16, 1);
  t.note('Snow has half the grip of dirt. Brake early and in a straight line. Follow the orange poles.');
  wander(t, 260, { turn: 36, grade: 2, amp: 2 });
  esses(t, 4, 50, 50, 1);
  wander(t, 120, { turn: 34, grade: 2 });
  t.cp('Snow Forest');
  // frozen lake: flat, wide, glass ice with a snow line down one side
  t.aim(30);
  t.set({ width: 11, wavy: 0.03, rough: 0.02, L: 0, R: 0 });
  wander(t, 100, { turn: 30, grade: -3 });
  t.ice(230, { from: -0.35, to: 1.4, at: 20 });
  t.note('The frozen lake. Ice on the left has almost no grip - the snow strip on the right steers and stops.');
  run(t, 270, 0);
  t.spur(70, [[40, 20, 1], [44, -26, 2]], { name: 'Ice-fisher cache', reward: 220, surface: 'snow' });
  wander(t, 110, { turn: 34, grade: 2 });
  t.cp('Frozen Lake');
  // deep drifts with a packed bypass
  t.aim(-10);
  t.set({ width: 7, wavy: 0.3, L: 2, R: -2 });
  t.patch(110, 'deepsnow', { at: 20 });
  t.bypass(130, { side: 1, offset: 12, width: 4.4, surface: 'snow', rough: 0.06, wavy: 0.14, at: 10 });
  t.note('Deep drifts ahead. Low range and steady throttle, or take the packed track on the left.');
  wander(t, 260, { turn: 40, grade: 3, amp: 3 });
  t.cp('The Drifts');
  // rocky pass: climb on banked bends, rocks under the snow
  t.aim(25);
  t.set({ width: 6, wavy: 0.14, rough: 0.09, L: 9, R: -12 });
  t.go(60, 28, 8, { bank: 5 });
  t.go(66, -36, 9, { bank: -6 });
  t.rocks(80, 16, [0.2, 0.32], { clear: 0.2 });
  wander(t, 200, { turn: 38, grade: 7, amp: 2 });
  t.ice(20, { at: 10, from: -1.4, to: 0 });
  t.go(60, 10, 3);
  t.cp('Rocky Pass');
  // bridge over the gorge, then the long descent through the trees
  t.aim(0);
  t.set({ L: 5, R: -6 });
  square(t, 28, 1);
  t.bridge(48, { width: 3.8, depth: 26, rails: true });
  t.go(48, 0, 0).go(30, 0, -1);
  t.spur(-72, [[44, -22, -2], [40, 28, -3]], { name: 'Rescue hut cache', reward: 220, surface: 'snow' });
  t.note('Downhill on snow. Low range, no sudden braking - let the engine hold you back.');
  switchbacks(t, 3, 68, -11, { r: 14 });
  wander(t, 140, { turn: 36, grade: -4 });
  t.cp('Gorge Bridge');
  t.set({ width: 7, L: 3, R: -3, wavy: 0.2 });
  wander(t, 280, { turn: 38, grade: -3, amp: 2 });
  t.ice(18, { at: 6 });
  t.go(60, -8, 0);
  wander(t, 120, { turn: 30, grade: 0 });
  t.go(60, 0, 0);
  return t.build();
}

export const TOUR_TRACKS = [tourForest, tourDesert, tourMountain, tourSwamp, tourSnow];
