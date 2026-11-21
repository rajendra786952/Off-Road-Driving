// REGION 4 - DEADLY RIDGE
// Mountain cliffs, narrow roads, steep slopes, sharp turns, high-risk driving.
import { TrackBuilder } from '../core/track.js';
import { wander, switchbacks, esses, run, square } from './motifs.js';

/** 13. Ridge Entry - narrow mountain roads, steep slopes, dangerous edges, difficult turns. */
export function ridgeEntry() {
  const t = new TrackBuilder({ id: 'ridge-entry', name: 'Ridge Entry', env: 'ridge', weather: 'clear', time: 'dusk', seed: 1313, startY: 400 });
  t.set({ width: 5, surface: 'gravel', rough: 0.09, wavy: 0.16, L: 18, R: -32 });
  t.go(70, 0, 0);
  t.note('Deadly Ridge. The right side is a cliff. A fall means a recovery and a time penalty - precision beats speed.');
  wander(t, 220, { turn: 38, grade: 5, seg: [28, 42] });
  t.rocks(50, 10, [0.18, 0.28], { spread: 0.6 });
  wander(t, 120, { turn: 36, grade: 8 });
  t.cp('Cliff Road');
  t.aim(25);
  t.note('Blind bends on the edge. Slow before you turn, not during.');
  esses(t, 5, 44, 64, 6);
  run(t, 110, 14);
  wander(t, 110, { turn: 36, grade: 4 });
  t.cp('Edge Bends');
  // the drop swaps sides
  t.aim(-20);
  t.set({ L: -30, R: 16 });
  t.note('The drop is on your LEFT now.');
  wander(t, 240, { turn: 40, grade: -7, amp: 2, seg: [28, 42] });
  t.go(40, 70, -4);
  run(t, 90, -15);
  t.spur(-80, [[30, -15, 6], [36, 20, 10]], { name: 'Ledge cache', reward: 540, surface: 'gravel', rough: 0.14, width: 4 });
  t.cp('Switch Side');
  // narrowing
  t.aim(15);
  t.set({ width: 4.2, L: 18, R: -36 });
  t.note('The road narrows to one truck wide.');
  wander(t, 220, { turn: 36, grade: 6, amp: 2, seg: [28, 40] });
  t.rocks(60, 10, [0.18, 0.3], { spread: 0.5, clear: 0 });
  switchbacks(t, 3, 72, 14, { r: 12 });
  t.cp('Narrows');
  // steep slopes
  t.aim(50);
  t.set({ width: 4.8 });
  run(t, 100, 18, { surface: 'rock' });
  t.anchor(1);
  wander(t, 120, { turn: 38, grade: 3 });
  run(t, 110, -17, { surface: 'scree' });
  t.go(44, -80, -5);
  wander(t, 120, { turn: 36, grade: -4 });
  t.spur(78, [[34, 15, 8], [30, -20, 11]], { name: 'Overlook cache', reward: 540, surface: 'gravel', rough: 0.14, width: 4 });
  t.cp('Steep Shoulder');
  // rockfall debris on the ledge
  t.aim(30);
  t.note('Rockfall debris across the ledge. No way round: climb it, slowly, wheels on the big stones.');
  t.rocks(44, 22, [0.46, 0.68]);
  run(t, 70, 5, { surface: 'rock', rough: 0.2 });
  t.anchor(1);
  wander(t, 150, { turn: 36, grade: 6, seg: [28, 40] });
  switchbacks(t, 4, 70, 15, { r: 11, first: -1 });
  t.cp('Debris Field');
  t.aim(-25);
  t.set({ width: 4.2, surface: 'scree', wavy: 0.22 });
  t.note('Loose descent along the edge. Brake early; the scree keeps sliding after you stop braking.');
  run(t, 110, -16);
  t.go(40, 78, -5);
  run(t, 90, -15);
  t.go(40, -78, -5);
  t.set({ surface: 'gravel', wavy: 0.16 });
  wander(t, 130, { turn: 34, grade: -3 });
  t.cp('Sliding Edge');
  t.aim(10);
  t.set({ width: 4.4, L: -34, R: 18 });
  esses(t, 4, 42, 60, 4);
  t.rocks(60, 12, [0.2, 0.32], { spread: 0.6 });
  wander(t, 240, { turn: 38, grade: 5, amp: 2, seg: [28, 42] });
  t.go(50, 0, 1);
  return t.build();
}

/** 14. Cliff Bridge - narrow wooden bridges, missing road sections with bypasses, precision, approach angles. */
export function cliffBridge() {
  const t = new TrackBuilder({ id: 'cliff-bridge', name: 'Cliff Bridge', env: 'ridge', weather: 'overcast', time: 'day', seed: 1414, startY: 420 });
  t.set({ width: 5.2, surface: 'gravel', rough: 0.08, wavy: 0.14, L: 14, R: -26 });
  t.go(70, 0, 0);
  t.note('Wooden bridges with no rails. Line up early, crawl across, keep the wheel straight.');
  wander(t, 160, { turn: 38, grade: 3 });
  const bridge = (len, width, depth, o = {}) => {
    square(t, 26, 0);
    if (o.approach) { t.go(30, o.approach, 0); t.go(16, 0, 0); }
    t.bridge(len, { width, depth, rails: !!o.rails });
    t.go(len, 0, o.grade || 0, { L: 0, R: 0 });
    t.go(20, 0, 0);
  };
  bridge(30, 3.6, 16, { rails: true });
  wander(t, 150, { turn: 38, grade: 4 });
  t.cp('First Span');
  t.aim(30);
  wander(t, 120, { turn: 36, grade: -3 });
  t.note('Bridge straight out of a bend. Get square to it before your front wheels touch the planks.');
  bridge(44, 3.3, 22, { approach: -55 });
  wander(t, 140, { turn: 38, grade: 5 });
  t.spur(80, [[30, 20, 5], [34, -20, 8]], { name: 'Bridge-keeper cache', reward: 600, surface: 'gravel', width: 4 });
  t.cp('Dogleg Span');
  // missing road with a bypass
  t.aim(-15);
  t.note('Rockfall! The road ahead is gone. Take the rough track up the left bank.');
  square(t, 24);
  t.bypass(90, { side: 1, offset: 12, width: 4.2, surface: 'scree', rough: 0.16, wavy: 0.28, dy: 3, prefer: true });
  t.boulder(30, -0.6, 1.6).boulder(32, 0.4, 1.7).boulder(46, -0.1, 1.8).boulder(58, 0.6, 1.6).boulder(60, -0.6, 1.5);
  t.go(90, 0, 2, { L: 6 });
  wander(t, 130, { turn: 36, grade: 3 });
  t.cp('Rockfall');
  t.aim(20);
  t.note('A climbing bridge. Momentum on wet-looking planks - no wheelspin.');
  bridge(52, 3.1, 26, { grade: 7 });
  wander(t, 120, { turn: 38, grade: 4 });
  esses(t, 3, 42, 60, 5);
  bridge(36, 3.0, 20, { approach: 50 });
  wander(t, 120, { turn: 36, grade: -4 });
  t.cp('High Spans');
  // second washout: the bypass is on the cliff side
  t.aim(50);
  t.note('Another washout. The detour hangs over the drop this time - slowly.');
  square(t, 24);
  t.bypass(80, { side: -1, offset: 10, width: 3.8, surface: 'scree', rough: 0.14, wavy: 0.24, dy: -2, prefer: true });
  t.boulder(28, 0.5, 1.6).boulder(30, -0.4, 1.7).boulder(44, 0.1, 1.8).boulder(54, -0.5, 1.6);
  t.go(80, 0, 1, { R: -12 });
  wander(t, 130, { turn: 38, grade: 5 });
  t.spur(-78, [[32, -20, 6], [30, 20, 9]], { name: 'Rope-way cache', reward: 600, surface: 'gravel', width: 4 });
  t.cp('Washout');
  t.aim(15);
  t.note('The Long Span: seventy metres, three metres wide, descending. Do not look down.');
  bridge(70, 3.0, 34, { grade: -5 });
  wander(t, 130, { turn: 38, grade: 3 });
  bridge(40, 2.9, 24, { approach: -45, grade: 4 });
  t.cp('The Long Span');
  t.aim(-20);
  t.set({ width: 4.4, L: 20, R: -36 });
  t.note('Cliff shelf between the gorges. Narrow, and the bridges come straight out of the bends.');
  wander(t, 200, { turn: 34, grade: 6, seg: [28, 40] });
  t.rocks(36, 18, [0.44, 0.64]);
  run(t, 60, 8, { surface: 'rock', rough: 0.18 });
  t.anchor(1);
  bridge(34, 3.0, 26, { approach: 60 });
  switchbacks(t, 3, 66, 14, { r: 11 });
  bridge(60, 2.9, 36, { grade: 6 });
  t.cp('Shelf Spans');
  t.aim(15);
  t.set({ width: 5.2, L: 14, R: -26 });
  wander(t, 150, { turn: 38, grade: -3 });
  bridge(48, 2.9, 28, { approach: 40 });
  t.rocks(50, 10, [0.18, 0.3], { spread: 0.6 });
  wander(t, 220, { turn: 38, grade: 4, amp: 2 });
  t.go(50, 0, 0);
  return t.build();
}

/** 15. Deadly Pass - sharp cliffside turns, very narrow roads, steep downhill, obstacle combinations. */
export function deadlyPass() {
  const t = new TrackBuilder({ id: 'deadly-pass', name: 'Deadly Pass', env: 'ridge', weather: 'fog', time: 'day', seed: 1515, startY: 560 });
  t.set({ width: 4.4, surface: 'gravel', rough: 0.1, wavy: 0.16, L: 20, R: -40 });
  t.go(70, 0, 0);
  t.note('Deadly Pass in fog. You will not see the corner until you are in it. Crawl.');
  wander(t, 170, { turn: 38, grade: -5, seg: [26, 40] });
  switchbacks(t, 4, 72, -15, { r: 11, first: -1 });
  wander(t, 100, { turn: 34, grade: -5 });
  t.cp('Fog Gate');
  t.aim(25);
  t.set({ width: 4, surface: 'scree', wavy: 0.22 });
  t.note('Loose scree, cliff edge, downhill. Every input gentle.');
  run(t, 100, -17);
  t.go(40, 75, -6);
  run(t, 80, -19);
  t.go(40, -75, -6);
  t.set({ width: 4.4, surface: 'gravel', wavy: 0.16 });
  t.rocks(60, 14, [0.2, 0.34], { spread: 0.7 });
  wander(t, 110, { turn: 36, grade: -6 });
  t.cp('Scree Corners');
  // off-camber tilting towards the drop + rocks
  t.aim(-15);
  t.note('The road tilts toward the drop, with rocks on the safe side. Choose: rocks, or edge.');
  t.go(36, -10, -3, { bank: -4 });
  t.rocks(90, 16, [0.26, 0.4], { at: 4, spread: 0.5, clear: -0.5 });
  t.go(100, 12, -5, { bank: -9 });
  t.go(36, -8, -3, { bank: -3 });
  wander(t, 110, { turn: 36, grade: -4 });
  t.spur(80, [[30, 15, 8], [32, -20, 11]], { name: 'Smuggler cache', reward: 660, surface: 'gravel', width: 3.8 });
  t.cp('Tilt');
  // the narrowest
  t.aim(30);
  t.set({ width: 3.6, L: 24, R: -46 });
  t.note('The Knife: barely wider than the truck.');
  wander(t, 200, { turn: 30, grade: -8, amp: 2, seg: [28, 40] });
  t.go(40, 85, -5, { width: 5 });
  run(t, 90, -18);
  t.go(40, -85, -5, { width: 5 });
  t.set({ width: 4.4, L: 20, R: -40 });
  t.cp('The Knife');
  // combos: log + rocks on a descent, then a bridge
  t.aim(0);
  t.log(30, { r: 0.2 });
  t.rocks(60, 14, [0.22, 0.36], { at: 44, spread: 0.7 });
  run(t, 120, -13);
  square(t, 24);
  t.bridge(40, { width: 3.1, depth: 30 });
  t.go(40, 0, -4, { L: 0, R: 0 }).go(20, 0, 0);
  switchbacks(t, 3, 68, -15, { r: 11 });
  t.spur(-78, [[30, -15, 7], [30, 20, 10]], { name: 'Hermit cache', reward: 660, surface: 'gravel', width: 3.8 });
  t.cp('Broken Stair');
  t.aim(15);
  t.note('Boulder choke. Rocks wall to wall on a downhill - feather the brakes, let the tyres climb.');
  t.rocks(50, 26, [0.46, 0.7]);
  run(t, 80, -10, { surface: 'rock', rough: 0.2 });
  wander(t, 150, { turn: 34, grade: -6, seg: [26, 38] });
  switchbacks(t, 3, 66, -15, { r: 11, first: -1 });
  t.cp('Boulder Choke');
  t.aim(-30);
  t.set({ surface: 'scree', wavy: 0.22 });
  esses(t, 4, 40, 64, -11);
  t.set({ surface: 'gravel', wavy: 0.16 });
  t.boulder(24, 0.55, 1.2).boulder(52, -0.5, 1.2);
  run(t, 90, -8, { width: 6.4 });
  wander(t, 220, { turn: 36, grade: -6, amp: 2 });
  t.go(50, 0, -1);
  return t.build();
}

/** 16. Final Ridge - extremely narrow trails, rocky terrain, dangerous climbing, recovery challenges. */
export function finalRidge() {
  const t = new TrackBuilder({ id: 'final-ridge', name: 'Final Ridge', env: 'ridge', weather: 'clear', time: 'dusk', seed: 1616, startY: 480 });
  t.set({ width: 4.4, surface: 'rock', rough: 0.12, wavy: 0.18, L: -34, R: -34 });
  t.go(70, 0, 0, { L: 6, R: -20 });
  t.note('The spine of the ridge. Drops on BOTH sides, rock under the wheels, and it only goes up.');
  wander(t, 180, { turn: 30, grade: 7, seg: [28, 42] });
  t.rocks(60, 16, [0.24, 0.38], { spread: 0.7 });
  run(t, 90, 13);
  t.anchor(1);
  t.cp('The Spine');
  t.aim(20);
  t.note('Rock steps on the crest. Lockers on, low range, and keep it dead centre.');
  t.rocks(70, 30, [0.46, 0.68], { spread: 0.85 });
  run(t, 80, 14, { rough: 0.22 });
  t.anchor(-1);
  wander(t, 150, { turn: 28, grade: 6, seg: [28, 40] });
  t.spur(70, [[26, 10, -4], [28, -10, -6]], { name: 'Crest cache', reward: 720, surface: 'rock', width: 3.8 });
  t.cp('Crest Steps');
  // steep wall with anchors
  t.aim(-10);
  t.note('The Headwall: 28 percent on bare rock. Winch posts every pitch - use them.');
  run(t, 70, 24);
  t.anchor(1);
  run(t, 60, 38);
  t.anchor(-1);
  run(t, 50, 24);
  t.anchor(1);
  wander(t, 110, { turn: 28, grade: 5 });
  t.cp('Headwall');
  // knife edge with a bridge between two peaks
  t.aim(30);
  t.set({ width: 3.8 });
  wander(t, 150, { turn: 26, grade: 3, seg: [28, 40] });
  square(t, 26);
  t.bridge(56, { width: 3.0, depth: 40 });
  t.go(56, 0, 3, { L: 0, R: 0 }).go(20, 0, 0);
  t.rocks(50, 12, [0.24, 0.38], { spread: 0.6 });
  wander(t, 130, { turn: 28, grade: 8 });
  t.cp('Sky Bridge');
  // off-camber rock with a tight turn
  t.aim(60);
  t.set({ width: 4.4 });
  t.go(36, 10, 6, { bank: 5 });
  t.go(80, 14, 9, { bank: 11, rough: 0.16 });
  t.go(36, -10, 6, { bank: 4 });
  t.go(40, 80, 4, { width: 5.4 });
  t.rocks(60, 26, [0.5, 0.72], { spread: 0.85 });
  run(t, 70, 13, { rough: 0.22 });
  t.anchor(1);
  t.spur(-70, [[26, -10, -3], [28, 10, -5]], { name: 'Summit-register cache', reward: 720, surface: 'rock', width: 3.8 });
  t.cp('Tilted Crest');
  // a dip between two peaks: steep down, bridge, steep up
  t.aim(0);
  t.note('The Saddle: down the far side of the peak, over the gap, and straight back up.');
  run(t, 90, -18);
  wander(t, 110, { turn: 24, grade: -6, seg: [26, 36] });
  square(t, 26);
  t.bridge(44, { width: 2.9, depth: 36 });
  t.go(44, 0, 0, { L: 0, R: 0 }).go(20, 0, 0);
  run(t, 70, 20);
  t.anchor(1);
  t.rocks(40, 20, [0.46, 0.68], { spread: 0.85 });
  run(t, 60, 12, { rough: 0.22 });
  t.anchor(-1);
  wander(t, 130, { turn: 26, grade: 7, seg: [26, 38] });
  t.cp('The Saddle');
  // final push
  t.aim(30);
  t.note('Last pitch. Everything the ridge has, in one climb.');
  t.set({ width: 3.8 });
  wander(t, 130, { turn: 26, grade: 9, seg: [26, 38] });
  t.rocks(50, 24, [0.48, 0.7], { spread: 0.85 });
  run(t, 60, 14, { rough: 0.22 });
  t.anchor(-1);
  run(t, 60, 34);
  t.anchor(1);
  wander(t, 170, { turn: 26, grade: 5, seg: [28, 40] });
  t.go(50, 0, 1, { width: 6 });
  return t.build();
}

export const RIDGE_TRACKS = [ridgeEntry, cliffBridge, deadlyPass, finalRidge];
