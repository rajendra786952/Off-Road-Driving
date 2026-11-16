// REGION 2 - MUD VALLEY
// Deep mud, muddy hills, waterlogged roads, slippery terrain.
import { TrackBuilder } from '../core/track.js';
import { wander, switchbacks, esses, run, square } from './motifs.js';

/** 5. Muddy Entrance - shallow mud, slippery turns, mud tracks, small obstacles. */
export function muddyEntrance() {
  const t = new TrackBuilder({ id: 'muddy-entrance', name: 'Muddy Entrance', env: 'mud', weather: 'overcast', time: 'day', seed: 505, startY: 60 });
  t.set({ width: 7, surface: 'dirt', rough: 0.06, wavy: 0.16, L: 1, R: -1 });
  t.go(70, 0, 0);
  t.note('Mud Valley. Grip is half what you are used to: brake early, steer early, stay smooth.');
  wander(t, 200, { turn: 42, grade: -2 });
  t.mud(90);
  wander(t, 110, { turn: 30, grade: 0, amp: 1 });
  wander(t, 150, { turn: 45, grade: 1 });
  t.cp('Valley Gate');
  // slippery mud bends
  t.aim(30);
  t.note('Mud on the bends. Slow in, gentle throttle out - a sliding truck does not steer.');
  for (let i = 0; i < 5; i++) {
    t.mud(44, { at: 6 });
    t.go(52, i % 2 ? -68 : 68, 0);
    t.go(34, 0, i % 2 ? 2 : -2);
  }
  t.rocks(60, 10, [0.16, 0.24]);
  wander(t, 200, { turn: 44, grade: 2 });
  t.cp('Slick Bends');
  // deep ruts ("mud tracks")
  t.set({ wavy: 0.3, surface: 'mud' });
  t.note('Rutted mud tracks. Let the ruts guide you and keep the wheels turning.');
  wander(t, 260, { turn: 36, grade: 0, amp: 2 });
  t.set({ wavy: 0.16, surface: 'dirt' });
  t.log(24, { r: 0.15 });
  wander(t, 170, { turn: 44, grade: 3 });
  t.spur(78, [[40, 25, 2], [44, -30, 1]], { name: 'Farm cache', reward: 220, surface: 'mud' });
  wander(t, 140, { turn: 40, grade: -3 });
  t.cp('Rut Road');
  // muddy hill
  t.aim(-20);
  t.note('A muddy hill. Build speed on the firm ground before the climb.');
  t.go(70, 10, 0);
  t.mud(80, { at: 10 });
  run(t, 110, 9);
  wander(t, 160, { turn: 44, grade: -1 });
  t.mud(50, { from: -1.4, to: 0 });
  t.go(60, -25, 0);
  t.mud(50, { from: 0, to: 1.4 });
  t.go(60, 25, 0);
  wander(t, 150, { turn: 40, grade: -4 });
  t.cp('Greasy Hill');
  // small water + mud combinations
  t.aim(25);
  square(t, 22);
  t.ford(22, 0.3, { bed: 'mud' });
  t.go(40, 0, 0);
  t.set({ surface: 'mud', wavy: 0.24 });
  esses(t, 4, 44, 55, 0);
  t.set({ surface: 'dirt', wavy: 0.16 });
  t.rocks(50, 9, [0.16, 0.26]);
  wander(t, 220, { turn: 45, grade: 2 });
  t.spur(-75, [[36, -20, 0], [40, 30, 2]], { name: 'Drover cache', reward: 220, surface: 'mud' });
  t.cp('Splash Meadow');
  t.mud(110);
  t.log(60, { r: 0.16 });
  wander(t, 150, { turn: 34, grade: 0, amp: 1 });
  t.mud(40, { deep: true, from: -1.4, to: 0.2 });
  t.note('Deep mud on the right. The left edge is firmer.');
  t.go(60, 20, 0);
  wander(t, 280, { turn: 46, grade: 1, amp: 3 });
  t.mud(60);
  wander(t, 160, { turn: 36, grade: -1 });
  t.go(50, 0, 0);
  return t.build();
}

/** 6. Deep Mud Pit - deep mud, wheel spin, traction loss, difficult recovery. */
export function deepMudPit() {
  const t = new TrackBuilder({ id: 'deep-mud-pit', name: 'Deep Mud Pit', env: 'mud', weather: 'rain', time: 'day', seed: 606, startY: 55 });
  t.set({ width: 6.5, surface: 'dirt', rough: 0.06, wavy: 0.18, L: 1, R: -1 });
  t.go(70, 0, 0);
  t.note('Deep mud ahead. Low range, steady throttle. Spinning tyres dig holes - if you sink, winch or reverse out.');
  wander(t, 170, { turn: 42, grade: -1 });
  const pit = (len, o = {}) => {
    square(t, 20);
    if (o.bypass) t.bypass(len + 30, { side: o.bypass, offset: 11, width: 4.2, surface: 'mud', rough: 0.14, wavy: 0.3, at: -15, prefer: !!o.prefer });
    t.patch(len, o.surf || 'deepmud');
    t.go(len * 0.5, 0, -1.5, { wavy: 0.26 }).go(len * 0.5, 0, 1.5, { wavy: 0.26 });
    t.anchor(o.side || 1, 6);
    t.go(30, o.turn || 0, 1);
  };
  pit(26);
  wander(t, 150, { turn: 44, grade: 0 });
  pit(38, { side: -1 });
  wander(t, 130, { turn: 40, grade: 1 });
  t.cp('Twin Pits');
  t.aim(35);
  t.mud(70);
  wander(t, 150, { turn: 46, grade: 0, amp: 2 });
  t.note('The Bog. Bottomless. Only a fast run or the winch gets you across - or take the churned bypass.');
  pit(22, { surf: 'bog', bypass: 1, prefer: true, side: -1 });
  wander(t, 170, { turn: 44, grade: 2 });
  t.spur(80, [[40, 20, 0], [40, -30, 0]], { name: 'Sunken cache', reward: 260, surface: 'mud' });
  t.cp('The Bog');
  // long churned field: mud with deep stripes - line choice
  t.aim(-10);
  t.set({ surface: 'mud', wavy: 0.26 });
  t.note('Churned field. Darker stripes are deeper - weave between them.');
  for (let i = 0; i < 4; i++) {
    t.patch(46, 'deepmud', { from: i % 2 ? -1.4 : 0.15, to: i % 2 ? -0.15 : 1.4, at: 4 });
    t.go(54, i % 2 ? 14 : -14, 0);
  }
  t.set({ surface: 'dirt', wavy: 0.18 });
  wander(t, 150, { turn: 44, grade: 1 });
  pit(46, { turn: 20 });
  wander(t, 120, { turn: 40, grade: 0 });
  t.cp('Churned Field');
  // pit on a slope: needs momentum uphill
  t.aim(30);
  t.note('Mud on a climb. If you lose momentum, back down and try again faster.');
  t.go(60, 10, 0);
  t.patch(50, 'deepmud', { at: 12 });
  run(t, 80, 8);
  t.anchor(1);
  wander(t, 170, { turn: 44, grade: -2 });
  pit(30, { side: -1, turn: -25 });
  t.log(20, { r: 0.18 });
  wander(t, 130, { turn: 40, grade: 0 });
  t.cp('Slope Pit');
  t.aim(0);
  t.mud(60);
  esses(t, 3, 46, 58, 0);
  pit(54, { bypass: -1 });
  t.spur(-78, [[36, -25, 0], [44, 25, 1]], { name: 'Tractor cache', reward: 260, surface: 'mud' });
  wander(t, 170, { turn: 44, grade: 1 });
  pit(34, { turn: 15 });
  t.cp('Long Pit');
  t.set({ surface: 'mud', wavy: 0.24 });
  wander(t, 200, { turn: 40, grade: 0, amp: 2 });
  t.set({ surface: 'dirt', wavy: 0.18 });
  pit(40, { side: -1 });
  wander(t, 200, { turn: 42, grade: 1 });
  t.go(50, 0, 0);
  return t.build();
}

/** 7. Waterlogged Valley - deep water crossings, muddy slopes, uneven riverbanks, water resistance. */
export function waterloggedValley() {
  const t = new TrackBuilder({ id: 'waterlogged-valley', name: 'Waterlogged Valley', env: 'mud', weather: 'rain', time: 'day', seed: 707, startY: 70 });
  t.set({ width: 6.5, surface: 'dirt', rough: 0.07, wavy: 0.18, L: 3, R: -1 });
  t.go(70, 0, 0);
  t.note('The valley is flooded. Deep water kills engine power - wade slowly and never stop in the deep.');
  wander(t, 170, { turn: 42, grade: -4 });
  const wade = (len, depth, o = {}) => {
    square(t, 22, -3);
    t.patch(16, 'mud', { at: -14 });
    if (o.rocks) t.rocks(len - 8, o.rocks, [0.2, 0.32], { at: 4, hr: 0.6 });
    t.ford(len, depth, { bed: o.bed || 'riverbed' });
    t.patch(26, o.exit || 'mud', { at: len - 2 });
    t.go(len, o.bend || 0, 0);
    t.go(40, 0, o.climb ?? 12);
    t.anchor(o.side || 1, -6);
  };
  wade(34, 0.6);
  wander(t, 170, { turn: 44, grade: 1 });
  t.cp('First Wade');
  t.aim(-30);
  wander(t, 150, { turn: 44, grade: -3 });
  t.note('Deeper. Stay in the middle of the track - the edges drop away.');
  wade(44, 0.78, { climb: 14, side: -1 });
  wander(t, 150, { turn: 42, grade: 2 });
  // uneven riverbank: off-camber mud beside the water
  t.note('Riverbank traverse: off-camber and greasy. Slide here and you are swimming.');
  t.set({ L: 5, R: -3, wavy: 0.3 });
  t.go(40, 12, -2, { bank: -4 });
  t.patch(120, 'mud', { at: 8 });
  t.go(130, -14, 0, { bank: -10, rough: 0.12 });
  t.go(40, 10, 1, { bank: -3 });
  t.set({ L: 3, R: -1, wavy: 0.18 });
  wander(t, 120, { turn: 40, grade: 2 });
  t.cp('Greasy Bank');
  // the long wade
  t.aim(10);
  wander(t, 140, { turn: 42, grade: -4 });
  t.note('Flooded road: 90 metres of water. Hold a steady crawl - a bow wave helps, a splash does not.');
  square(t, 22, -2);
  t.ford(92, 0.52, { bed: 'mud' });
  t.go(92, 18, 0);
  t.go(40, 0, 9);
  wander(t, 150, { turn: 42, grade: 3 });
  t.spur(78, [[36, 20, -3], [30, -20, -2]], { name: 'Flood cache', reward: 300, surface: 'mud' });
  t.cp('Flooded Road');
  // muddy slopes
  t.aim(40);
  t.note('Muddy slope out of the valley. Low range, and use the winch post if you stall.');
  t.patch(90, 'mud', { at: 6 });
  run(t, 100, 13);
  t.anchor(1);
  wander(t, 140, { turn: 44, grade: 0 });
  t.patch(80, 'mud', { at: 6 });
  run(t, 90, -14);
  wade(40, 0.82, { rocks: 10, climb: 15, exit: 'deepmud' });
  wander(t, 140, { turn: 42, grade: 1 });
  t.cp('Mud Slide');
  t.aim(0);
  wade(30, 0.7, { bend: 20, climb: 10 });
  t.go(40, -20, -8);
  wade(36, 0.75, { climb: 13, side: -1 });
  wander(t, 160, { turn: 44, grade: 2 });
  t.spur(-76, [[40, -20, -2], [34, 25, -3]], { name: 'Heron cache', reward: 300, surface: 'mud' });
  t.cp('Twin Channels');
  t.set({ wavy: 0.28 });
  t.mud(80);
  wander(t, 220, { turn: 46, grade: 0, amp: 3 });
  t.set({ wavy: 0.18 });
  t.note('Last crossing: the deepest. Engine power will fade - commit and keep the revs up.');
  wade(48, 0.9, { climb: 14, exit: 'deepmud' });
  wander(t, 220, { turn: 40, grade: 2 });
  t.go(50, 0, 0);
  return t.build();
}

/** 8. Mud Mountain - steep muddy climbs, slippery descents, tight turns, difficult recovery. */
export function mudMountain() {
  const t = new TrackBuilder({ id: 'mud-mountain', name: 'Mud Mountain', env: 'mud', weather: 'heavyrain', time: 'day', seed: 808, startY: 60 });
  t.set({ width: 5.8, surface: 'mud', rough: 0.08, wavy: 0.2, L: 5, R: -5 });
  t.go(70, 0, 0, { surface: 'dirt' });
  t.note('Mud Mountain in a downpour. Every climb is greasy, every descent is a slide. Use the winch posts.');
  wander(t, 160, { turn: 44, grade: 3, extra: { surface: 'dirt' } });
  run(t, 120, 11);
  t.anchor(1);
  wander(t, 110, { turn: 40, grade: 3 });
  t.cp('Foothill');
  t.aim(25);
  switchbacks(t, 4, 78, 12, { r: 12, onLeg: (i) => { if (i % 2) t.anchor(1); } });
  wander(t, 120, { turn: 40, grade: 3 });
  t.cp('Greasy Hairpins');
  // slippery descent with tight turns
  t.aim(-25);
  t.note('Descent in mud. Low range, tiny brake inputs - locked wheels slide straight on.');
  run(t, 90, -13);
  esses(t, 3, 44, 62, -9);
  run(t, 70, -12);
  t.patch(40, 'deepmud');
  t.go(50, 15, 0);
  t.anchor(-1);
  wander(t, 120, { turn: 42, grade: 2 });
  t.spur(80, [[36, 20, 5], [40, -30, 8]], { name: 'Landslip cache', reward: 340 });
  t.cp('Slide Gully');
  // the big climb
  t.aim(10);
  t.note('The Big Greasy: a long steep mud climb. Momentum first, winch second.');
  t.go(70, 0, 1, { surface: 'dirt' });
  run(t, 90, 15);
  t.anchor(1);
  run(t, 80, 17);
  t.anchor(-1);
  run(t, 60, 12);
  t.anchor(1);
  wander(t, 110, { turn: 40, grade: 2 });
  t.cp('The Big Greasy');
  // off-camber mud shelf
  t.aim(45);
  t.go(40, 12, 2, { bank: 4 });
  t.go(110, 14, 3, { bank: 10, L: 8, R: -9 });
  t.go(40, -12, 2, { bank: 3 });
  switchbacks(t, 3, 70, 13, { r: 12, first: -1, onLeg: () => t.anchor(-1) });
  t.spur(-78, [[40, -25, 4], [36, 25, 7]], { name: 'Summit hut cache', reward: 340 });
  t.cp('High Shelf');
  // long slippery way down
  t.aim(0);
  t.note('All the way down. Stay slow - there is no stopping a slide once it starts.');
  switchbacks(t, 4, 72, -12, { r: 12 });
  t.patch(36, 'deepmud');
  t.go(50, -10, -2);
  t.anchor(1);
  run(t, 100, -14);
  esses(t, 2, 46, 58, -6);
  t.cp('Mud Chute');
  t.patch(44, 'deepmud', { at: 10 });
  run(t, 90, 9);
  t.anchor(-1);
  wander(t, 240, { turn: 46, grade: -3, amp: 3 });
  t.go(50, 0, 0, { surface: 'dirt' });
  return t.build();
}

export const MUD_TRACKS = [muddyEntrance, deepMudPit, waterloggedValley, mudMountain];
