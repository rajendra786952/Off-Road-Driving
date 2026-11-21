// REGION 6 - DESERT STORM
// Sand dunes, rocky desert, dry valleys and heat. Engines overheat when worked hard at low speed.
import { TrackBuilder } from '../core/track.js';
import { wander, switchbacks, esses, run, square } from './motifs.js';

/** One dune: a soft climb, a sharp crest and a steep slip face. */
function dune(t, up, grade, o = {}) {
  t.go(up * 0.25, o.turn || 0, grade * 0.4);
  t.go(up * 0.75, 0, grade, { surface: 'deepsand' });
  t.go(14, 0, -2, { surface: 'deepsand' });
  t.go(up * 0.55, -(o.turn || 0), -(grade + 5), { surface: 'deepsand' });
  t.go(26, 0, -2);
}

/** 26. Desert Entry - sandy tracks, washboard, the first soft sand and small dunes. */
export function desertEntry() {
  const t = new TrackBuilder({ id: 'desert-entry', name: 'Desert Entry', env: 'desert', seed: 2600, startY: 140 });
  t.set({ width: 7.5, surface: 'gravel', rough: 0.06, wavy: 0.14, L: 1, R: -1 });
  t.go(80, 0, 0);
  t.note('The desert. Watch the TEMP bar: heavy throttle at crawling speed overheats the engine. Airflow cools it.');
  wander(t, 240, { turn: 36, grade: 1 });
  t.set({ rough: 0.13, wavy: 0.1 });
  t.note('Washboard. There is a speed where it smooths out - and a speed where it shakes the truck apart.');
  wander(t, 220, { turn: 26, grade: 0, amp: 1 });
  t.set({ rough: 0.06, wavy: 0.14 });
  t.cp('Trading Post');
  t.aim(30);
  t.set({ surface: 'sand', wavy: 0.24 });
  t.note('Sand. It drags at the wheels: carry momentum, steer gently, and do not stop on a slope.');
  wander(t, 260, { turn: 40, grade: 1, amp: 3 });
  t.patch(46, 'deepsand');
  t.go(60, 12, 0);
  t.anchor(1);
  wander(t, 130, { turn: 38, grade: 2 });
  t.spur(78, [[40, 20, 2], [40, -30, 3]], { name: 'Oasis cache', reward: 1000, surface: 'sand' });
  t.cp('Soft Sand');
  t.aim(-15);
  t.note('Your first dunes. Build speed on the firm approach, ease off at the crest - you cannot see the far side.');
  dune(t, 60, 11);
  dune(t, 70, 13, { turn: 14 });
  wander(t, 130, { turn: 36, grade: 0 });
  t.cp('Baby Dunes');
  t.aim(20);
  t.set({ surface: 'gravel', wavy: 0.16 });
  t.rocks(70, 16, [0.2, 0.34]);
  wander(t, 240, { turn: 40, grade: 3 });
  t.set({ surface: 'riverbed', rough: 0.16, wavy: 0.26, L: 4, R: 4 });
  t.note('A dry wadi. Loose stones and soft pockets.');
  t.patch(40, 'deepsand', { at: 60, from: -1.4, to: 0.1 });
  wander(t, 230, { turn: 34, grade: -1, seg: [26, 38] });
  t.set({ surface: 'sand', rough: 0.06, wavy: 0.24, L: 1, R: -1 });
  t.spur(-76, [[36, -20, 2], [40, 25, 3]], { name: 'Caravan cache', reward: 1000, surface: 'sand' });
  t.cp('Dry Wadi');
  t.aim(45);
  dune(t, 66, 12, { turn: -12 });
  t.patch(60, 'deepsand', { at: 20, from: -0.2, to: 1.4 });
  wander(t, 230, { turn: 40, grade: 0, amp: 3 });
  dune(t, 76, 14);
  t.cp('Dune Line');
  t.aim(10);
  t.set({ surface: 'gravel', wavy: 0.08, rough: 0.03, width: 12 });
  t.note('A salt flat. Flat out - this is where the engine cools.');
  run(t, 260, 0);
  t.set({ surface: 'gravel', wavy: 0.16, rough: 0.1, width: 7.5 });
  t.rocks(70, 26, [0.3, 0.48]);
  run(t, 90, 5, { surface: 'rock', rough: 0.18 });
  t.set({ surface: 'sand', wavy: 0.24, rough: 0.06 });
  dune(t, 70, 13, { turn: 12 });
  t.patch(60, 'deepsand', { at: 10 });
  wander(t, 170, { turn: 40, grade: 0, amp: 3 });
  t.anchor(1);
  t.cp('Salt Flat');
  t.set({ surface: 'gravel', wavy: 0.14 });
  wander(t, 330, { turn: 34, grade: 1 });
  t.go(60, 0, 0);
  return t.build();
}

/** 27. Sand Dune Challenge - the big dunes: long soft climbs, blind crests, bowls. */
export function sandDunes() {
  const t = new TrackBuilder({ id: 'sand-dunes', name: 'Sand Dune Challenge', env: 'desert', seed: 2700, startY: 150 });
  t.set({ width: 8, surface: 'sand', rough: 0.05, wavy: 0.2, L: 0, R: 0 });
  t.go(80, 0, 0);
  t.note('The sand sea. Every dune is the same lesson: momentum up, feather over the crest, low range down the slip face.');
  wander(t, 150, { turn: 34, grade: 1 });
  dune(t, 80, 15);
  dune(t, 90, 16, { turn: 16 });
  t.anchor(1);
  wander(t, 110, { turn: 34, grade: 0 });
  t.cp('First Crest');
  t.aim(30);
  t.note('The Bowl. Drop in, keep your speed across the bottom, and climb out the far wall without lifting.');
  run(t, 70, -17, { surface: 'deepsand' });
  t.go(70, 30, 0, { surface: 'deepsand', wavy: 0.12 });
  run(t, 80, 16, { surface: 'deepsand' });
  t.anchor(-1);
  wander(t, 110, { turn: 36, grade: 0 });
  dune(t, 96, 17);
  t.spur(78, [[40, 20, 6], [40, -25, 9]], { name: 'Dune-top cache', reward: 1100, surface: 'deepsand' });
  t.cp('The Bowl');
  // traverse along a dune face: off-camber soft sand
  t.aim(-15);
  t.note('Side-slope across a dune face. Soft sand slides downhill: steer slightly up-slope and keep moving.');
  t.go(36, 10, 2, { bank: 5 });
  t.go(120, -12, 2, { bank: 11, surface: 'deepsand', L: 9, R: -10 });
  t.go(36, 8, 1, { bank: 4 });
  dune(t, 84, 16, { turn: -14 });
  wander(t, 110, { turn: 34, grade: 0 });
  t.cp('Dune Face');
  t.aim(20);
  t.note('Three in a row with no run-up between them. Do not waste the speed you have.');
  for (let i = 0; i < 3; i++) {
    t.go(50, 0, 14, { surface: 'deepsand' });
    t.go(12, 0, -1, { surface: 'deepsand' });
    t.go(40, i % 2 ? 12 : -12, -17, { surface: 'deepsand' });
  }
  t.anchor(1);
  wander(t, 120, { turn: 34, grade: 0 });
  t.cp('Triple Crest');
  t.aim(50);
  t.note('The Great Dune: the tallest in the sea. Two hundred metres of soft climb.');
  t.go(90, 0, 2, { surface: 'gravel', wavy: 0.1 });
  run(t, 110, 15, { surface: 'deepsand' });
  t.anchor(1);
  run(t, 90, 18, { surface: 'deepsand' });
  t.anchor(-1);
  t.go(16, 0, -1, { surface: 'deepsand' });
  switchbacks(t, 3, 66, -15, { r: 13 });
  t.spur(-76, [[38, -20, 5], [36, 25, 8]], { name: 'Wind-carved cache', reward: 1100, surface: 'deepsand' });
  t.cp('The Great Dune');
  t.aim(15);
  dune(t, 80, 16, { turn: 12 });
  t.patch(80, 'deepsand', { at: 10 });
  wander(t, 200, { turn: 38, grade: 0, amp: 3 });
  dune(t, 70, 15);
  wander(t, 220, { turn: 34, grade: 0 });
  t.go(60, 0, 0, { surface: 'gravel' });
  return t.build();
}

/** 28. Lost Desert Trail - a faint trail, a sandstorm in the middle, and nothing to navigate by but the map. */
export function lostTrail() {
  const t = new TrackBuilder({ id: 'lost-trail', name: 'Lost Desert Trail', env: 'desert', seed: 2800, startY: 130 });
  t.set({ width: 5.6, surface: 'sand', rough: 0.05, wavy: 0.22, L: 0.5, R: -0.5 });
  t.go(80, 0, 0, { surface: 'gravel' });
  t.note('An unmarked trail, the same colour as the desert. Trust the map and the checkpoint gates.');
  wander(t, 300, { turn: 46, grade: 0, amp: 2 });
  t.spur(80, [[40, 25, 1], [44, -35, 2], [30, 20, 1]], { name: 'False-trail cache', reward: 1200, surface: 'sand' });
  wander(t, 160, { turn: 42, grade: 1 });
  t.cp('Last Marker');
  t.aim(-30);
  t.note('Dust on the horizon. A sandstorm is coming - get to the canyon.');
  t.patch(50, 'deepsand', { at: 30 });
  wander(t, 280, { turn: 48, grade: 0, amp: 3 });
  dune(t, 60, 12);
  t.spur(-80, [[44, -30, 1], [40, 30, 2]], { name: 'Buried-truck cache', reward: 1200, surface: 'sand' });
  t.cp('Storm Front');
  // slot canyon in the storm
  t.aim(20);
  t.set({ width: 4.8, surface: 'gravel', L: 12, R: 12, rough: 0.1 });
  t.note('The canyon. Walls you can touch on both sides, and you can barely see them.');
  wander(t, 300, { turn: 50, grade: 2, seg: [24, 36] });
  t.rocks(50, 14, [0.24, 0.4], { clear: 0 });
  wander(t, 130, { turn: 44, grade: 3 });
  t.set({ width: 5.6, surface: 'sand', L: 0.5, R: -0.5, rough: 0.05 });
  t.cp('The Canyon');
  t.aim(50);
  t.patch(70, 'deepsand', { at: 20, from: -1.4, to: 0 });
  wander(t, 260, { turn: 50, grade: 0, amp: 3 });
  dune(t, 70, 13, { turn: 14 });
  t.anchor(1);
  t.spur(78, [[36, 20, 3], [40, -25, 4]], { name: 'Storm-shelter cache', reward: 1200, surface: 'sand' });
  t.cp('Blind Dunes');
  t.aim(10);
  t.note('The storm is passing. The trail forks around a rock outcrop - both ways go through.');
  square(t, 22);
  t.bypass(110, { side: -1, offset: 15, width: 4.6, surface: 'deepsand', rough: 0.06, wavy: 0.3 });
  t.rocks(90, 30, [0.36, 0.56], { at: 10 });
  t.go(110, 0, 2, { surface: 'rock', rough: 0.18 });
  wander(t, 220, { turn: 46, grade: 1 });
  t.cp('Outcrop');
  t.aim(-25);
  t.note('A second canyon, drifted full of soft sand.');
  t.set({ width: 4.8, surface: 'deepsand', L: 11, R: 11, wavy: 0.26 });
  wander(t, 230, { turn: 46, grade: 2, seg: [24, 36] });
  t.anchor(1);
  t.set({ width: 5.6, surface: 'sand', L: 0.5, R: -0.5, wavy: 0.22 });
  dune(t, 76, 14);
  dune(t, 66, 13, { turn: -14 });
  t.spur(76, [[36, 20, 2], [36, -25, 3]], { name: 'Mirage cache', reward: 1200, surface: 'sand' });
  wander(t, 170, { turn: 46, grade: 0, amp: 3 });
  t.cp('Mirage');
  esses(t, 4, 46, 52, 0);
  t.patch(50, 'deepsand', { at: 10 });
  wander(t, 300, { turn: 44, grade: 0, amp: 2 });
  t.go(60, 0, 0, { surface: 'gravel' });
  return t.build();
}

/** 29. Rocky Desert Pass - a canyon pass: ledges, loose gravel descents and red rock walls. */
export function rockyPass() {
  const t = new TrackBuilder({ id: 'rocky-pass', name: 'Rocky Desert Pass', env: 'desert', seed: 2900, startY: 160 });
  t.set({ width: 5.4, surface: 'gravel', rough: 0.1, wavy: 0.18, L: 14, R: -12 });
  t.go(80, 0, 0, { L: 2, R: -2 });
  t.note('The pass through the red rock range. Climbing hard in this heat cooks the engine - pause on the flats and let it cool.');
  wander(t, 170, { turn: 40, grade: 6 });
  t.rocks(60, 20, [0.3, 0.46]);
  run(t, 90, 12, { surface: 'rock', rough: 0.16 });
  t.cp('Red Gate');
  t.aim(25);
  switchbacks(t, 4, 76, 15, { r: 12 });
  t.note('Ledges across the road. Square on, one axle at a time.');
  t.rocks(40, 22, [0.44, 0.66]);
  run(t, 70, 8, { surface: 'rock', rough: 0.22 });
  t.anchor(1);
  t.cp('Red Hairpins');
  t.aim(-20);
  t.set({ width: 4.4, L: 18, R: -34 });
  t.note('Shelf road. Loose gravel on the outside edge.');
  t.patch(180, 'scree', { from: -1.4, to: -0.2, at: 10 });
  wander(t, 220, { turn: 34, grade: 7, seg: [28, 40] });
  run(t, 80, 30, { surface: 'rock', rough: 0.12 });
  t.anchor(1);
  t.set({ width: 5.4, L: 14, R: -12 });
  t.spur(78, [[30, 15, 8], [32, -20, 11]], { name: 'Petroglyph cache', reward: 1300, surface: 'gravel', width: 4 });
  t.cp('The Shelf');
  // summit plateau then loose descent
  t.aim(30);
  t.set({ L: 2, R: -2, surface: 'sand', wavy: 0.26 });
  wander(t, 190, { turn: 40, grade: 1, amp: 3 });
  t.set({ surface: 'scree', wavy: 0.24, L: 14, R: -22 });
  t.note('Down the far side on marbles. Low range and engine braking; brake only in a straight line.');
  run(t, 110, -18);
  t.go(42, 70, -6);
  run(t, 90, -19);
  t.go(42, -70, -6);
  t.rocks(50, 24, [0.44, 0.64]);
  run(t, 70, -10, { surface: 'rock', rough: 0.22 });
  t.cp('Marble Chute');
  t.aim(-10);
  t.set({ width: 4.8, surface: 'gravel', L: 16, R: 16, wavy: 0.18 });
  t.boulder(30, -0.5, 1.4).boulder(64, 0.5, 1.5).boulder(98, -0.5, 1.4);
  t.go(120, 0, -4, { width: 8.6 });
  wander(t, 200, { turn: 44, grade: -5, seg: [24, 36] });
  switchbacks(t, 3, 70, -14, { r: 12, first: -1 });
  t.spur(-76, [[32, -15, -5], [32, 20, -8]], { name: 'Miner cache', reward: 1300, surface: 'gravel', width: 4 });
  t.cp('Narrows');
  t.aim(20);
  t.set({ width: 6, surface: 'riverbed', rough: 0.18, wavy: 0.28, L: 8, R: 8 });
  t.note('The wash at the foot of the pass: river stones and drifted sand.');
  t.rocks(150, 36, [0.3, 0.5], { at: 20 });
  t.patch(40, 'deepsand', { at: 120 });
  wander(t, 260, { turn: 38, grade: -2, seg: [24, 36] });
  t.anchor(1);
  t.cp('The Wash');
  t.set({ width: 5.4, L: 6, R: -6, surface: 'gravel', rough: 0.1, wavy: 0.18 });
  t.rocks(60, 20, [0.3, 0.48]);
  wander(t, 280, { turn: 40, grade: -4 });
  t.go(60, 0, 0, { L: 1, R: -1 });
  return t.build();
}

/** 30. Desert Survival - the long crossing: dunes, rock, soft sand and a storm, from afternoon into night. */
export function desertSurvival() {
  const t = new TrackBuilder({ id: 'desert-survival', name: 'Desert Survival', env: 'desert', seed: 3000, startY: 135 });
  t.set({ width: 6.4, surface: 'sand', rough: 0.05, wavy: 0.22, L: 0.5, R: -0.5 });
  t.go(80, 0, 0, { surface: 'gravel' });
  t.note('The long crossing. Fuel, heat and daylight are all running out. Checkpoints top up fuel and cool the engine.');
  wander(t, 220, { turn: 40, grade: 0, amp: 2 });
  dune(t, 80, 15);
  t.patch(70, 'deepsand', { at: 10 });
  wander(t, 150, { turn: 38, grade: 0 });
  t.cp('Mile Zero');
  t.aim(25);
  t.set({ surface: 'riverbed', rough: 0.17, wavy: 0.28, L: 5, R: 5 });
  t.rocks(160, 34, [0.3, 0.5], { at: 20 });
  wander(t, 230, { turn: 36, grade: 1, seg: [24, 36] });
  t.set({ surface: 'sand', rough: 0.05, wavy: 0.22, L: 0.5, R: -0.5 });
  dune(t, 90, 16, { turn: 14 });
  t.anchor(1);
  t.spur(78, [[40, 20, 2], [40, -30, 3]], { name: 'Well cache', reward: 1400, surface: 'sand' });
  t.cp('Stone River');
  t.aim(-20);
  t.note('Storm coming in. The next stretch is soft all the way - do not stop.');
  t.set({ surface: 'deepsand', wavy: 0.26 });
  wander(t, 230, { turn: 38, grade: 1, amp: 3 });
  t.anchor(1);
  t.set({ surface: 'sand', wavy: 0.22 });
  run(t, 80, -16, { surface: 'deepsand' });
  t.go(60, 26, 0, { surface: 'deepsand', wavy: 0.12 });
  run(t, 84, 16, { surface: 'deepsand' });
  t.anchor(-1);
  t.cp('Soft Sea');
  // rock range in the storm
  t.aim(30);
  t.set({ width: 4.8, surface: 'gravel', L: 14, R: -16, rough: 0.1 });
  switchbacks(t, 4, 72, 15, { r: 12 });
  t.rocks(44, 24, [0.44, 0.66]);
  run(t, 70, 9, { surface: 'rock', rough: 0.22 });
  t.anchor(1);
  run(t, 70, 32, { surface: 'rock', rough: 0.12 });
  t.anchor(-1);
  t.spur(-76, [[30, -15, 7], [32, 20, 10]], { name: 'Lookout cache', reward: 1400, surface: 'gravel', width: 4 });
  t.cp('Storm Range');
  t.aim(0);
  t.set({ surface: 'scree', wavy: 0.24 });
  run(t, 100, -18);
  t.go(42, -76, -6);
  run(t, 90, -17);
  t.go(42, 76, -6);
  t.set({ width: 6.4, surface: 'sand', L: 0.5, R: -0.5, rough: 0.05, wavy: 0.22 });
  t.cp('Dusk Descent');
  t.aim(40);
  t.note('Night. Dunes by headlight: the crest arrives before you see it.');
  dune(t, 76, 15);
  dune(t, 86, 17, { turn: -14 });
  t.anchor(1);
  t.patch(90, 'deepsand', { at: 10, from: -1.4, to: 0.2 });
  wander(t, 220, { turn: 42, grade: 0, amp: 3 });
  t.cp('Night Dunes');
  t.aim(15);
  for (let i = 0; i < 2; i++) {
    t.go(56, 0, 15, { surface: 'deepsand' });
    t.go(12, 0, -1, { surface: 'deepsand' });
    t.go(44, i ? -12 : 12, -17, { surface: 'deepsand' });
  }
  t.anchor(-1);
  wander(t, 300, { turn: 40, grade: 0, amp: 2 });
  t.go(60, 0, 0, { surface: 'gravel' });
  return t.build();
}

export const DESERT_TRACKS = [desertEntry, sandDunes, lostTrail, rockyPass, desertSurvival];
