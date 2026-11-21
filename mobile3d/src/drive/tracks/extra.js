// Fifth track of each original region.
import { TrackBuilder } from '../core/track.js';
import { wander, switchbacks, esses, run, square } from './motifs.js';

/** 5. Hidden Forest Trail - an overgrown, half-forgotten trail driven from dusk into night. */
export function hiddenForest() {
  const t = new TrackBuilder({ id: 'hidden-forest', name: 'Hidden Forest Trail', env: 'forest', seed: 555, startY: 90 });
  t.set({ width: 4.6, surface: 'dirt', rough: 0.1, wavy: 0.22, L: 3, R: -3 });
  t.go(60, 0, 0);
  t.note('An old trail the forest has almost taken back. The sun is going down - you will finish by headlight.');
  wander(t, 230, { turn: 56, grade: 2, seg: [24, 38] });
  t.spur(78, [[34, 25, 3], [40, -35, 5], [30, 20, 2]], { name: 'Overgrown cache', reward: 180, surface: 'grass', rough: 0.16 });
  t.log(20, { r: 0.18 }).log(52, { r: 0.19, skew: 1.5 });
  wander(t, 150, { turn: 50, grade: 4 });
  t.cp('Lost Gate');
  // grassed-over section: the trail is the same colour as the forest floor
  t.aim(35);
  t.set({ surface: 'grass', wavy: 0.3 });
  t.note('The trail is grassed over here. Read the gap in the trees and the map.');
  wander(t, 300, { turn: 52, grade: 0, amp: 4, seg: [24, 38] });
  t.set({ surface: 'dirt', wavy: 0.22 });
  square(t, 22, -2);
  t.patch(30, 'wetrock');
  t.rocks(26, 8, [0.2, 0.3], { hr: 0.6 });
  t.ford(30, 0.5);
  t.patch(18, 'mud', { at: 30 });
  t.go(30, 0, 0).go(34, 12, 12);
  t.cp('Dusk Ford');
  t.aim(-10);
  t.set({ rough: 0.17, wavy: 0.28 });
  wander(t, 190, { turn: 54, grade: 6, seg: [22, 34] });
  t.set({ rough: 0.1, wavy: 0.22 });
  t.spur(-80, [[36, -25, -4], [36, 30, -6], [30, -15, -2]], { name: 'Hermit cache', reward: 180, surface: 'grass', rough: 0.16 });
  t.mud(34, { deep: true, from: -1.4, to: 0.2 });
  t.go(54, 20, 0);
  switchbacks(t, 3, 66, 15, { r: 11 });
  t.cp('Fading Light');
  // ravine: narrow shelf with a drop
  t.aim(30);
  t.set({ width: 4.2, L: 9, R: -14 });
  t.note('A shelf above a ravine, and it is getting dark. Slow down - you cannot avoid what you cannot see.');
  wander(t, 240, { turn: 42, grade: -5, amp: 2, seg: [26, 38] });
  t.log(24, { r: 0.18 });
  t.rocks(50, 12, [0.2, 0.32], { at: 40, spread: 0.7 });
  run(t, 100, -11);
  t.set({ width: 4.6, L: 3, R: -3 });
  t.cp('Ravine Shelf');
  t.aim(-25);
  t.mud(40);
  esses(t, 4, 42, 62, 1);
  t.spur(76, [[30, 20, 5], [34, -30, 8]], { name: 'Night-watch cache', reward: 180, surface: 'grass', rough: 0.16 });
  t.set({ surface: 'grass', wavy: 0.3 });
  wander(t, 240, { turn: 54, grade: 3, seg: [24, 36] });
  t.set({ surface: 'dirt', wavy: 0.22 });
  t.cp('Dark Wood');
  t.aim(10);
  t.log(26, { r: 0.19, skew: -1.5 }).log(60, { r: 0.18 });
  run(t, 90, 16);
  wander(t, 200, { turn: 52, grade: -4, seg: [24, 38] });
  square(t, 22, -2);
  t.ford(24, 0.4);
  t.go(24, 0, 0).go(30, -10, 10);
  t.cp('Moon Ford');
  t.set({ surface: 'grass', wavy: 0.3 });
  wander(t, 200, { turn: 52, grade: 2, seg: [24, 36] });
  t.set({ surface: 'dirt', wavy: 0.22 });
  t.mud(30);
  t.log(44, { r: 0.18 });
  wander(t, 300, { turn: 46, grade: 1, amp: 3 });
  t.go(50, 0, 0);
  return t.build();
}

/** 10. Swamp Survival - bog after bog, standing water, and a storm that keeps getting worse. */
export function swampSurvival() {
  const t = new TrackBuilder({ id: 'swamp-survival', name: 'Swamp Survival', env: 'mud', seed: 1001, startY: 48 });
  t.set({ width: 6, surface: 'mud', rough: 0.07, wavy: 0.22, L: 0.5, R: -0.5 });
  t.go(70, 0, 0, { surface: 'dirt' });
  t.note('The swamp. No firm ground for three kilometres, and the rain is coming. Keep moving; know where your next winch point is.');
  wander(t, 180, { turn: 44, grade: 0, amp: 1 });
  const bog = (len, o = {}) => {
    square(t, 20);
    if (o.bypass) t.bypass(len + 34, { side: o.bypass, offset: 12, width: 4.2, surface: 'deepmud', rough: 0.12, wavy: 0.3, at: -17, prefer: !!o.prefer });
    t.patch(len, o.surf || 'bog', { from: o.from ?? -1.4, to: o.to ?? 1.4 });
    t.go(len, o.turn || 0, 0, { wavy: 0.28 });
    t.anchor(o.side || 1, 5);
    t.go(26, 0, 0.5);
  };
  bog(16, { from: -1.4, to: 0.1 });
  t.note('Half the track is bog, half is merely mud. Choose well.');
  wander(t, 130, { turn: 42, grade: 0, amp: 1 });
  bog(24, { surf: 'deepmud' });
  t.cp('Reed Gate');
  t.aim(30);
  square(t, 22, -2);
  t.ford(80, 0.55, { bed: 'mud' });
  t.note('Standing water with a mud bottom. Steady crawl, no stopping.');
  t.go(80, 22, 0).go(34, 0, 6);
  t.anchor(1, -6);
  wander(t, 130, { turn: 44, grade: 0, amp: 1 });
  bog(20, { bypass: -1, prefer: true });
  t.spur(80, [[36, 20, 0], [40, -30, 0]], { name: 'Stilt-hut cache', reward: 320, surface: 'deepmud' });
  t.cp('Black Water');
  // causeway: narrow firm strip between two bogs
  t.aim(-15);
  t.note('The causeway: one truck-width of firm ground with bog either side.');
  t.set({ width: 7 });
  t.patch(200, 'bog', { from: -1.5, to: -0.42 });
  t.patch(200, 'bog', { from: 0.42, to: 1.5 });
  t.go(60, 16, 0, { surface: 'dirt' }).go(70, -26, 0, { surface: 'dirt' }).go(70, 18, 0, { surface: 'dirt' });
  t.set({ width: 6 });
  wander(t, 120, { turn: 42, grade: 0, amp: 1 });
  bog(30, { surf: 'deepmud', side: -1 });
  t.cp('Causeway');
  t.aim(25);
  square(t, 22, -2);
  t.rocks(34, 8, [0.2, 0.3], { hr: 0.6 });
  t.ford(44, 0.8, { bed: 'mud' });
  t.patch(26, 'deepmud', { at: 42 });
  t.go(44, 0, 0).go(38, 10, 11);
  t.anchor(-1, -6);
  wander(t, 140, { turn: 44, grade: 0, amp: 1 });
  bog(22, { from: -0.2, to: 1.4 });
  t.go(40, -20, 0);
  bog(22, { from: -1.4, to: 0.2, side: -1 });
  t.spur(-78, [[40, -25, 0], [36, 25, 0]], { name: 'Sunken-boat cache', reward: 320, surface: 'deepmud' });
  t.cp('Drowned Wood');
  t.aim(0);
  t.note('The Sump: thirty metres of the worst bog in the valley. The churned bypass is the sane line; the straight line is for lifted trucks with a winch.');
  bog(30, { bypass: 1, prefer: true });
  wander(t, 130, { turn: 44, grade: 1, amp: 1 });
  square(t, 22, -2);
  t.ford(60, 0.7, { bed: 'mud' });
  t.go(60, -20, 0).go(34, 0, 8);
  t.anchor(1, -6);
  t.cp('The Sump');
  bog(18, { surf: 'deepmud' });
  esses(t, 3, 44, 56, 0);
  bog(20, { side: -1 });
  wander(t, 240, { turn: 44, grade: 1, amp: 2 });
  t.go(50, 0, 0, { surface: 'dirt' });
  return t.build();
}

/** 15. Giant Rock Challenge - house-sized boulders, a 40 percent slab and the biggest rock garden in the range. */
export function giantRock() {
  const t = new TrackBuilder({ id: 'giant-rock', name: 'Giant Rock Challenge', env: 'rocky', seed: 1500, startY: 300 });
  t.set({ width: 6.4, surface: 'rock', rough: 0.13, wavy: 0.22, L: 8, R: -5 });
  t.go(70, 0, 0, { surface: 'gravel' });
  t.note('Giant country. Some rocks you climb, some you thread, some you go round. Deciding which is the whole game.');
  wander(t, 150, { turn: 40, grade: 4, extra: { surface: 'gravel' } });
  // giants: steer between
  square(t, 20);
  t.boulder(18, -0.55, 1.9, 2.4).boulder(40, 0.5, 2.2, 2.8).boulder(64, -0.5, 2.0, 2.6).boulder(88, 0.55, 2.3, 3.0).boulder(112, -0.5, 1.9, 2.4);
  t.go(130, 0, 3, { width: 10.5 });
  t.rocks(50, 22, [0.4, 0.62]);
  run(t, 60, 5, { rough: 0.22 });
  t.anchor(1);
  t.cp('The Giants');
  t.aim(25);
  t.note('The Slab: forty percent of bare rock. It grips - trust it, low range, do not stop.');
  t.go(40, 0, 4);
  run(t, 70, 40, { rough: 0.08, wavy: 0.1 });
  t.anchor(1);
  wander(t, 110, { turn: 38, grade: 4 });
  t.rocks(60, 30, [0.5, 0.74]);
  run(t, 70, 6, { rough: 0.25 });
  t.anchor(-1);
  t.spur(78, [[32, 20, 8], [34, -25, 11]], { name: 'Summit-cairn cache', reward: 480, surface: 'rock', rough: 0.2 });
  t.cp('The Slab');
  // squeeze: corridor between two giants with a ledge inside
  t.aim(-20);
  t.note('The Squeeze. Mirrors in, lockers on.');
  t.set({ width: 4.2, L: 11, R: 11 });
  t.rocks(26, 14, [0.46, 0.66], { at: 46 });
  wander(t, 150, { turn: 34, grade: 5, seg: [24, 34] });
  t.anchor(1);
  t.set({ width: 6.4, L: 8, R: -5 });
  wander(t, 110, { turn: 40, grade: 2 });
  t.cp('The Squeeze');
  // the field: 110 m of big rocks with a bypass
  t.aim(15);
  t.note('The Field: one hundred metres of big rock. There is a scree bypass. There is no shame in it.');
  square(t, 20, 2);
  t.bypass(134, { side: 1, offset: 14, width: 4.4, surface: 'scree', rough: 0.16, wavy: 0.32, at: -12 });
  t.rocks(110, 52, [0.56, 0.86], { hr: 0.66 });
  t.go(110, 0, 5, { rough: 0.24, wavy: 0.3 });
  t.anchor(-1, 4);
  wander(t, 120, { turn: 40, grade: 3 });
  t.cp('The Field');
  t.aim(50);
  // tilted giants: off-camber around boulders
  t.go(36, 10, 2, { bank: 5 });
  t.boulder(30, 0.5, 1.8, 2.2).boulder(70, -0.45, 1.8, 2.2);
  t.go(100, -12, 3, { bank: 13, width: 9.5, L: 11, R: -11 });
  t.go(36, 8, 2, { bank: 4 });
  t.rocks(56, 28, [0.5, 0.74]);
  run(t, 64, -7, { rough: 0.24 });
  t.spur(-76, [[34, -20, 6], [32, 25, 9]], { name: 'Balanced-rock cache', reward: 480, surface: 'rock', rough: 0.2 });
  t.cp('Tilted Giants');
  t.aim(10);
  t.note('Stair of ledges, each a little taller than the last.');
  for (let i = 0; i < 4; i++) {
    t.rocks(14, 9, [0.44 + i * 0.04, 0.6 + i * 0.05], { at: 8 });
    run(t, 46, 11, { rough: 0.2 });
    t.anchor(i % 2 ? 1 : -1);
  }
  wander(t, 120, { turn: 40, grade: 2 });
  t.cp('Giant Stair');
  t.boulder(26, 0.5, 2.1, 2.6).boulder(56, -0.5, 2.0, 2.6).boulder(86, 0.5, 2.2, 2.8);
  t.go(104, 0, -3, { width: 10.5 });
  t.rocks(50, 24, [0.48, 0.7]);
  run(t, 60, -6, { rough: 0.24 });
  t.cp('Last Giants');
  t.aim(-15);
  t.note('The Maze: giants so close together you must weave between them over rubble.');
  t.boulder(20, -0.45, 1.8, 2.4).boulder(44, 0.45, 2.0, 2.6).boulder(70, -0.4, 1.9, 2.4).boulder(96, 0.45, 2.1, 2.6);
  t.rocks(100, 30, [0.34, 0.52], { at: 6 });
  t.go(116, 0, 2, { width: 10.5, rough: 0.2 });
  t.anchor(1);
  run(t, 60, 30, { rough: 0.1 });
  t.anchor(-1);
  wander(t, 260, { turn: 42, grade: -3, extra: { surface: 'gravel' } });
  t.go(50, 0, 0, { surface: 'gravel' });
  return t.build();
}

/** 19. Narrow Mountain Road - kilometres of single-lane ledge, driven into the sunset. */
export function narrowRoad() {
  const t = new TrackBuilder({ id: 'narrow-road', name: 'Narrow Mountain Road', env: 'ridge', seed: 1900, startY: 520 });
  t.set({ width: 3.9, surface: 'gravel', rough: 0.09, wavy: 0.15, L: 22, R: -44 });
  t.go(70, 0, 0, { width: 6 });
  t.note('The old mule road. Under four metres wide for its whole length, and the sun will be in your eyes.');
  wander(t, 260, { turn: 34, grade: 5, seg: [28, 42] });
  t.rocks(40, 8, [0.18, 0.28], { spread: 0.5, clear: 0.3 });
  wander(t, 130, { turn: 30, grade: 7 });
  t.cp('Mule Road');
  t.aim(20);
  t.note('Hairpins with no room to swing. Use every centimetre, and reverse if you must.');
  run(t, 60, 6);
  switchbacks(t, 5, 66, 13, { r: 12 });
  wander(t, 110, { turn: 30, grade: 5 });
  t.cp('Mule Hairpins');
  // rock overhang: wall both sides briefly, then out onto the edge
  t.aim(-20);
  t.set({ L: 16, R: 14, width: 3.6 });
  wander(t, 130, { turn: 34, grade: 3, seg: [26, 36] });
  t.set({ L: 22, R: -50, width: 3.7 });
  t.note('Out of the cutting and straight onto the edge.');
  t.go(34, -8, -3, { bank: -3 });
  t.go(100, 10, -6, { bank: -7 });
  t.go(34, -6, -3, { bank: -3 });
  wander(t, 150, { turn: 32, grade: -7, seg: [28, 40] });
  t.spur(80, [[26, 15, 8], [30, -20, 12]], { name: 'Muleteer cache', reward: 640, surface: 'gravel', width: 3.6 });
  t.cp('The Cutting');
  t.aim(15);
  t.set({ surface: 'scree', wavy: 0.22 });
  run(t, 110, -15);
  t.go(38, 82, -5, { width: 5 });
  run(t, 90, -17);
  t.go(38, -82, -5, { width: 5 });
  t.set({ surface: 'gravel', wavy: 0.15 });
  square(t, 26);
  t.bridge(46, { width: 3.0, depth: 38 });
  t.go(46, 0, -2, { L: 0, R: 0 }).go(20, 0, 0);
  wander(t, 120, { turn: 30, grade: -4 });
  t.cp('Loose Edge');
  // the drop swaps sides; rockfall on the road
  t.aim(-25);
  t.set({ L: -46, R: 20 });
  t.note('Rockfall on a road with no shoulder. Wheels ON the rocks - there is nowhere else for them.');
  t.rocks(46, 22, [0.42, 0.62], { spread: 0.9 });
  run(t, 76, 6, { surface: 'rock', rough: 0.18 });
  t.anchor(1);
  wander(t, 200, { turn: 32, grade: 7, seg: [28, 40] });
  switchbacks(t, 3, 62, 14, { r: 10, first: -1 });
  t.spur(-78, [[28, -15, 7], [28, 20, 10]], { name: 'Shrine cache', reward: 640, surface: 'gravel', width: 3.6 });
  t.cp('Rockfall Ledge');
  t.aim(20);
  t.set({ width: 3.5, L: -50, R: 22 });
  t.note('The last ledge, into the setting sun.');
  wander(t, 260, { turn: 28, grade: 4, seg: [28, 40] });
  t.go(34, 8, 3, { bank: 4 });
  t.go(80, -10, 4, { bank: 8 });
  t.go(34, 6, 3, { bank: 3 });
  t.cp('Sunset Ledge');
  square(t, 26);
  t.bridge(56, { width: 2.9, depth: 44 });
  t.go(56, 0, 3, { L: 0, R: 0 }).go(20, 0, 0);
  wander(t, 240, { turn: 30, grade: 5, seg: [28, 40] });
  t.go(50, 0, 1, { width: 6 });
  return t.build();
}

/** 24. Ice Valley - a frozen lake, ice hills and a valley floor of glare ice under a clearing sky. */
export function iceValley() {
  const t = new TrackBuilder({ id: 'ice-valley', name: 'Ice Valley', env: 'snow', seed: 2400, startY: 240 });
  t.set({ width: 6.2, surface: 'snow', rough: 0.05, wavy: 0.16, L: 5, R: -4 });
  t.go(70, 0, 0);
  t.note('Ice Valley. The snow stops, the sky clears, and the temperature drops. Everything that was wet is now glass.');
  wander(t, 200, { turn: 38, grade: -4 });
  const sheet = (len, o = {}) => {
    t.patch(len, 'ice', { from: o.from ?? -3, to: o.to ?? 3 });
  };
  sheet(120);
  t.note('Valley floor ice with a gentle fall-line. Let the truck roll; correct early and small.');
  esses(t, 3, 40, 34, -3);
  wander(t, 130, { turn: 36, grade: 2 });
  t.cp('Glass Floor');
  // the lake
  t.aim(25);
  square(t, 24, -4);
  t.note('The frozen lake. No road - just markers across the ice. Thread the pressure ridges.');
  sheet(330);
  t.set({ width: 14, wavy: 0.03, rough: 0.02, L: 1, R: 1 });
  t.boulder(40, -0.35, 1.3).boulder(86, 0.35, 1.4).boulder(134, -0.3, 1.3).boulder(180, 0.35, 1.5).boulder(228, -0.35, 1.3).boulder(276, 0.3, 1.4);
  t.go(60, 18, 0).go(60, -30, 0).go(60, 26, 0).go(60, -22, 0).go(50, 24, 0).go(40, -10, 0);
  t.set({ width: 6.2, wavy: 0.16, rough: 0.05, L: 5, R: -4 });
  t.ice(24, { at: -2 });
  t.go(40, 0, 8);
  t.anchor(1, -4);
  wander(t, 120, { turn: 36, grade: 3 });
  t.spur(78, [[34, 20, 3], [36, -25, 5]], { name: 'Ice-camp cache', reward: 900, surface: 'snow' });
  t.cp('The Lake');
  // ice hills: up on the snow edge, down on glass
  t.aim(-20);
  t.note('Ice hills. Climb with two wheels in the snow at the edge; come down in low range and never touch the brake.');
  for (let i = 0; i < 3; i++) {
    t.ice(64, { from: i % 2 ? -0.4 : -1.4, to: i % 2 ? 1.4 : 0.4, at: 4 });
    run(t, 70, 8);
    t.anchor(i % 2 ? -1 : 1);
    sheet(60);
    run(t, 64, -8);
    t.go(36, i % 2 ? -40 : 40, 0);
  }
  t.cp('Ice Hills');
  t.aim(15);
  t.set({ surface: 'deepsnow', wavy: 0.28 });
  wander(t, 170, { turn: 38, grade: 5, seg: [26, 38] });
  t.anchor(1);
  t.set({ surface: 'snow', wavy: 0.16 });
  // frozen stream gully
  square(t, 24, -5);
  sheet(190);
  t.set({ width: 9, wavy: 0.04, rough: 0.03, L: 4, R: 4 });
  t.rocks(150, 16, [0.3, 0.5], { at: 20, spread: 0.8 });
  t.go(48, 28, -2).go(48, -40, -2).go(48, 34, -2).go(46, -22, -2);
  t.set({ width: 6.2, wavy: 0.16, rough: 0.05, L: 5, R: -4 });
  t.ice(22, { at: -2 });
  t.go(40, 0, 8);
  t.anchor(-1, -4);
  t.spur(-76, [[34, -20, 3], [34, 25, 4]], { name: 'Blue-ice cache', reward: 900, surface: 'snow' });
  t.cp('Frozen Gully');
  t.aim(40);
  t.set({ width: 5, L: 10, R: -26 });
  t.note('A ledge above the valley with black ice on the outside half. Stay inside.');
  t.ice(170, { from: -1.4, to: -0.05, at: 10 });
  wander(t, 200, { turn: 30, grade: 4, seg: [28, 40] });
  switchbacks(t, 3, 68, 12, { r: 12, onLeg: () => t.anchor(1) });
  t.set({ width: 6.2, L: 5, R: -4 });
  t.cp('Black Ledge');
  t.aim(-10);
  t.note('Crevasse field. Deep snow, hidden rocks, and one snow bridge across the big one.');
  t.set({ surface: 'deepsnow', wavy: 0.3 });
  t.rocks(120, 20, [0.3, 0.5], { at: 20, spread: 0.8 });
  wander(t, 190, { turn: 36, grade: 3, seg: [26, 38] });
  t.anchor(1);
  t.set({ surface: 'snow', wavy: 0.16 });
  square(t, 26);
  t.bridge(50, { width: 3.2, depth: 30 });
  t.go(50, 0, 1, { L: 0, R: 0, surface: 'wood' }).go(20, 0, 0);
  t.ice(90, { at: 6 });
  run(t, 100, -7);
  t.go(50, 50, 0);
  wander(t, 150, { turn: 36, grade: 2 });
  t.cp('Crevasse Field');
  sheet(80);
  esses(t, 2, 40, 30, -2);
  t.ice(60, { from: -0.45, to: 0.45, at: 6 });
  run(t, 70, 8);
  t.anchor(1);
  wander(t, 260, { turn: 38, grade: 2, amp: 2 });
  t.go(50, 0, 0);
  return t.build();
}
