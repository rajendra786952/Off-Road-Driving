// REGION 5 - EXTREME EXPEDITION
// Snow-covered mountains, ice, heavy snowfall, freezing weather, extreme terrain.
import { TrackBuilder } from '../core/track.js';
import { wander, switchbacks, esses, run, square } from './motifs.js';

/** 17. Snow Entry - snow-covered roads, light snowfall, slippery turns, low traction. */
export function snowEntry() {
  const t = new TrackBuilder({ id: 'snow-entry', name: 'Snow Entry', env: 'snow', weather: 'snow', time: 'day', seed: 1717, startY: 300 });
  t.set({ width: 6.4, surface: 'snow', rough: 0.05, wavy: 0.16, L: 4, R: -4 });
  t.go(70, 0, 0);
  t.note('Snow. Less than half the grip of dirt: double your braking distance and halve your steering.');
  wander(t, 240, { turn: 38, grade: 2 });
  t.note('Slippery bends. Brake in a straight line, turn in gently, feed the power on the way out.');
  esses(t, 5, 48, 60, 1);
  wander(t, 130, { turn: 36, grade: 3 });
  t.cp('Snow Gate');
  t.aim(30);
  t.set({ wavy: 0.26 });
  t.patch(160, 'deepsnow', { from: -1.4, to: -0.2, at: 20 });
  t.note('Snow drifts on the right. The packed line on the left is faster.');
  wander(t, 240, { turn: 40, grade: 0, amp: 3 });
  t.set({ wavy: 0.16 });
  t.ice(22, { at: 30 });
  t.note('Ice patch! No throttle, no brake, wheel straight - just roll over it.');
  t.go(80, 10, 0);
  wander(t, 130, { turn: 38, grade: 3 });
  t.spur(78, [[36, 20, 3], [40, -25, 5]], { name: 'Ski-hut cache', reward: 780, surface: 'snow' });
  t.cp('Drift Lane');
  // snowy hill
  t.aim(-15);
  t.note('A snowy climb. Momentum and a light foot - spinning tyres polish the snow into ice.');
  t.go(70, 8, 1);
  run(t, 130, 10);
  wander(t, 130, { turn: 38, grade: 2 });
  run(t, 110, -9);
  t.ice(18, { at: 10, from: -1.4, to: 0.1 });
  t.go(60, -30, -2);
  t.cp('White Hill');
  t.aim(20);
  t.rocks(60, 12, [0.2, 0.32]);
  wander(t, 220, { turn: 42, grade: 4, amp: 2 });
  t.patch(40, 'deepsnow');
  t.go(60, 15, 1);
  esses(t, 4, 46, 62, -3);
  t.spur(-76, [[36, -20, 2], [36, 25, 4]], { name: 'Trapper-line cache', reward: 780, surface: 'snow' });
  t.cp('Powder Bends');
  t.aim(50);
  t.set({ wavy: 0.24 });
  wander(t, 260, { turn: 40, grade: 3, amp: 3 });
  t.set({ wavy: 0.16 });
  t.ice(30, { at: 20, from: -0.3, to: 1.4 });
  t.note('Ice on the left half. Keep right.');
  t.go(90, -12, -1);
  t.log(30, { r: 0.18 });
  wander(t, 200, { turn: 38, grade: -4 });
  t.cp('Frost Hollow');
  t.aim(15);
  t.note('Frozen rise. Sheet ice right across the climb - studs bite, bare rubber needs a run-up.');
  t.go(70, 0, 0);
  t.ice(70, { at: 6 });
  run(t, 80, 8);
  t.anchor(1);
  esses(t, 4, 46, 58, 2);
  t.patch(120, 'deepsnow', { from: 0.1, to: 1.4, at: 10 });
  wander(t, 220, { turn: 40, grade: -3, amp: 2 });
  t.cp('Frozen Rise');
  t.patch(50, 'deepsnow', { at: 10 });
  run(t, 100, 8);
  wander(t, 300, { turn: 40, grade: 1, amp: 3 });
  t.go(50, 0, 0);
  return t.build();
}

/** 18. Frozen River - ice-covered sections, frozen river crossing, reduced grip, difficult braking. */
export function frozenRiver() {
  const t = new TrackBuilder({ id: 'frozen-river', name: 'Frozen River', env: 'snow', weather: 'clear', time: 'morning', seed: 1818, startY: 260 });
  t.set({ width: 6.4, surface: 'snow', rough: 0.05, wavy: 0.14, L: 4, R: -3 });
  t.go(70, 0, 0);
  t.note('The river is frozen solid. On ice the truck goes where it was already going - plan every move early.');
  wander(t, 180, { turn: 38, grade: -3 });
  /** flat frozen river bed: the trail drops onto the ice, runs along it and climbs out */
  const frozen = (len, o = {}) => {
    square(t, 24, -5);
    t.patch(len, 'ice', { from: -3, to: 3 });
    t.set({ width: o.width || 11, wavy: 0.03, rough: 0.02, L: 1.5, R: 1.5 });
    let left = len;
    let d = o.first || 1;
    while (left > 1) {
      const L = Math.min(left, o.seg || 50);
      t.go(L, (o.curve ?? 30) * d, 0);
      d = -d; left -= L;
    }
    t.set({ width: 6.4, wavy: 0.14, rough: 0.05, L: 4, R: -3 });
    t.ice(26, { at: -2 });
    t.go(40, 0, o.climb ?? 8);
    t.anchor(1, -4);
  };
  t.note('First ice: straight across. Gentle throttle, no steering, no brakes.');
  frozen(70, { curve: 0 });
  wander(t, 150, { turn: 38, grade: 2 });
  t.cp('First Ice');
  t.aim(25);
  wander(t, 130, { turn: 36, grade: -3 });
  t.note('The trail follows the frozen river. Long gentle curves - steer a little, early.');
  frozen(200, { curve: 26, seg: 50 });
  wander(t, 130, { turn: 38, grade: 3 });
  t.spur(78, [[36, 20, 2], [36, -25, 3]], { name: 'Ice-fisher cache', reward: 850, surface: 'snow' });
  t.cp('River Run');
  // braking test: downhill onto ice
  t.aim(-20);
  t.note('Downhill onto ice. Get your speed off on the snow - there is no braking once you are on the glass.');
  run(t, 110, -9);
  t.ice(36, { at: 6 });
  t.go(50, 0, -4);
  t.go(50, 60, 0);
  wander(t, 130, { turn: 38, grade: 2 });
  t.ice(26, { from: -1.4, to: 0, at: 10 });
  t.go(50, -40, 0);
  t.ice(26, { from: 0, to: 1.4, at: 10 });
  t.go(50, 40, 0);
  t.cp('Glass Hill');
  t.aim(15);
  wander(t, 120, { turn: 36, grade: -3 });
  t.note('Ice bends, with rocks frozen into the surface. Thread through at a crawl.');
  square(t, 24, -5);
  t.patch(150, 'ice', { from: -3, to: 3 });
  t.set({ width: 11, wavy: 0.03, rough: 0.02, L: 1.5, R: 1.5 });
  t.boulder(30, -0.4, 1.1).boulder(62, 0.4, 1.2).boulder(96, -0.35, 1.1).boulder(128, 0.4, 1.1);
  t.go(50, 22, 0).go(50, -30, 0).go(50, 22, 0);
  t.set({ width: 6.4, wavy: 0.14, rough: 0.05, L: 4, R: -3 });
  t.go(40, 0, 7);
  wander(t, 130, { turn: 38, grade: 3 });
  t.spur(-76, [[36, -20, 2], [34, 25, 4]], { name: 'Frozen-falls cache', reward: 850, surface: 'snow' });
  t.cp('Stone Ice');
  // icy climb: only the snow edge has grip
  t.aim(45);
  t.note('Icy climb. The centre is glass - put two wheels in the snow at the edge for grip.');
  t.ice(110, { from: -0.5, to: 1.4, at: 6 });
  run(t, 120, 7);
  wander(t, 120, { turn: 38, grade: 2 });
  frozen(140, { curve: 34, seg: 46, first: -1 });
  t.cp('Edge Climb');
  t.aim(-25);
  t.note('Black ice hill. Up one side, down the other - you need studs, a run-up, or the winch.');
  t.go(60, 0, 0);
  t.ice(150, { at: 4 });
  run(t, 76, 9);
  t.anchor(1);
  run(t, 76, -9);
  t.go(50, 55, 0);
  wander(t, 170, { turn: 38, grade: 2 });
  t.cp('Black Ice Hill');
  t.aim(10);
  esses(t, 4, 46, 58, -2);
  t.ice(24, { at: 8 });
  t.go(60, 0, -5);
  wander(t, 150, { turn: 38, grade: 2 });
  t.note('The widest crossing. Slight downhill on the far side - be slow before the bank.');
  frozen(110, { curve: 14, seg: 55, climb: -6 });
  t.go(50, 50, 0);
  wander(t, 260, { turn: 38, grade: 3, amp: 2 });
  t.go(50, 0, 0);
  return t.build();
}

/** 19. Blizzard Mountain - heavy snowfall, low visibility, steep snow climbs, extreme weather. */
export function blizzardMountain() {
  const t = new TrackBuilder({ id: 'blizzard-mountain', name: 'Blizzard Mountain', env: 'snow', weather: 'blizzard', time: 'day', seed: 1919, startY: 320 });
  t.set({ width: 5.8, surface: 'snow', rough: 0.06, wavy: 0.2, L: 9, R: -12 });
  t.go(70, 0, 0);
  t.note('Blizzard. You can see three truck lengths. Follow the gate posts and the map.');
  wander(t, 170, { turn: 36, grade: 5 });
  run(t, 120, 11);
  wander(t, 100, { turn: 34, grade: 4 });
  t.cp('Whiteout Gate');
  t.aim(25);
  switchbacks(t, 4, 80, 12, { r: 12, onLeg: (i) => { if (i % 2) t.anchor(1); } });
  wander(t, 100, { turn: 34, grade: 5 });
  t.cp('Buried Hairpins');
  // deep drifts
  t.aim(-20);
  t.note('Deep drifts. Keep moving - stop in powder on a slope and you are winching.');
  t.set({ surface: 'deepsnow', wavy: 0.28 });
  run(t, 110, 10);
  t.anchor(1);
  wander(t, 130, { turn: 36, grade: 6, seg: [26, 38] });
  t.anchor(-1);
  t.set({ surface: 'snow', wavy: 0.2 });
  wander(t, 100, { turn: 36, grade: 3 });
  t.spur(78, [[34, 20, 6], [34, -25, 8]], { name: 'Storm-shelter cache', reward: 950, surface: 'snow' });
  t.cp('Drift Field');
  // steep snow climb
  t.aim(15);
  t.note('The White Wall: steep, deep and blind. Low range, lockers, steady.');
  t.go(60, 0, 2);
  run(t, 90, 15);
  t.anchor(1);
  run(t, 80, 17, { surface: 'deepsnow' });
  t.anchor(-1);
  run(t, 60, 13);
  t.anchor(1);
  wander(t, 100, { turn: 34, grade: 3 });
  t.cp('The White Wall');
  // exposed shoulder: wind, ice, drop
  t.aim(50);
  t.set({ width: 5, L: 10, R: -28 });
  t.note('Exposed shoulder. Wind-polished ice near the edge - stay on the wall side.');
  t.ice(140, { from: -1.4, to: -0.1, at: 10 });
  wander(t, 170, { turn: 32, grade: 4, seg: [28, 40] });
  switchbacks(t, 3, 72, 13, { r: 15, first: -1, onLeg: () => t.anchor(-1) });
  t.spur(-76, [[34, -20, 5], [32, 20, 8]], { name: 'Weather-station cache', reward: 950, surface: 'snow' });
  t.cp('Wind Shoulder');
  // descent in the storm
  t.aim(0);
  t.set({ width: 5.8, L: 9, R: -12 });
  t.note('Now down the far side. Engine braking in low range; touch the brakes and you toboggan.');
  run(t, 100, -13);
  esses(t, 3, 44, 60, -9);
  t.patch(40, 'deepsnow');
  t.go(50, 10, -2);
  run(t, 60, -5);
  switchbacks(t, 3, 70, -12, { r: 14 });
  t.cp('Storm Descent');
  t.set({ surface: 'deepsnow', wavy: 0.26 });
  run(t, 90, 9);
  t.anchor(1);
  t.set({ surface: 'snow', wavy: 0.2 });
  wander(t, 260, { turn: 36, grade: 3, amp: 2 });
  t.go(50, 0, 0);
  return t.build();
}

/** 20. Extreme Summit - mountain climbing, ice + snow, dangerous descents, rock and snow obstacles. The finale. */
export function extremeSummit() {
  const t = new TrackBuilder({ id: 'extreme-summit', name: 'Extreme Summit', env: 'snow', weather: 'snow', time: 'dusk', seed: 2020, startY: 380 });
  t.set({ width: 5.6, surface: 'snow', rough: 0.07, wavy: 0.18, L: 10, R: -16 });
  t.go(70, 0, 0);
  t.note('The final expedition. Snow, ice, rock, cliffs and bridges - then the summit.');
  wander(t, 170, { turn: 36, grade: 6 });
  t.rocks(60, 18, [0.24, 0.4], { spread: 0.8 });
  run(t, 100, 13, { rough: 0.14 });
  t.anchor(1);
  t.cp('Base Camp');
  t.aim(20);
  switchbacks(t, 4, 78, 13, { r: 12 });
  t.ice(30, { at: 10, from: -1.4, to: 0.2 });
  wander(t, 130, { turn: 34, grade: 5 });
  t.cp('Ice Hairpins');
  // frozen gorge + bridge
  t.aim(-15);
  t.set({ width: 4.8, L: 14, R: -34 });
  t.note('A snow-covered bridge over the gorge. Square up, crawl, no wheelspin.');
  wander(t, 130, { turn: 30, grade: 3, seg: [28, 40] });
  square(t, 26);
  t.bridge(50, { width: 3.2, depth: 34 });
  t.go(50, 0, 2, { L: 0, R: 0, surface: 'wood' }).go(20, 0, 0);
  wander(t, 110, { turn: 32, grade: 6 });
  t.spur(80, [[30, 15, 6], [32, -20, 9]], { name: 'Gorge cache', reward: 1100, surface: 'snow', width: 4 });
  t.cp('Gorge Bridge');
  // rock garden under snow
  t.aim(25);
  t.set({ width: 5.6, L: 10, R: -16 });
  t.note('Rocks under the snow. You cannot see them all - feel for them.');
  t.rocks(80, 30, [0.3, 0.5], { clear: 0, spread: 0.9 });
  run(t, 90, 9, { rough: 0.2, wavy: 0.3 });
  t.anchor(-1);
  t.set({ surface: 'deepsnow', wavy: 0.28 });
  run(t, 100, 14);
  t.anchor(1);
  t.set({ surface: 'snow', wavy: 0.18 });
  wander(t, 110, { turn: 34, grade: 4 });
  t.cp('Buried Rocks');
  // dangerous descent into a frozen bowl, then out
  t.aim(60);
  t.note('Down into the frozen bowl. Ice at the bottom - be slow BEFORE you reach it.');
  run(t, 100, -15);
  t.go(40, -70, -5);
  run(t, 70, -12);
  square(t, 22, -4);
  t.patch(90, 'ice', { from: -3, to: 3 });
  t.go(90, 24, 0, { width: 11, wavy: 0.03, rough: 0.02, L: 2, R: 2 });
  t.note('And straight back out. Find the snow at the edges for grip.');
  t.ice(70, { from: -0.45, to: 0.45, at: 4 });
  run(t, 80, 9);
  t.anchor(1);
  t.spur(-76, [[32, -20, 4], [32, 20, 7]], { name: 'Bowl cache', reward: 1100, surface: 'snow', width: 4 });
  t.cp('Frozen Bowl');
  // cliff ledge with off-camber ice
  t.aim(30);
  t.set({ width: 4.6, L: 16, R: -40 });
  t.go(36, 8, 5, { bank: -3 });
  t.ice(70, { from: -1.4, to: -0.2, at: 4 });
  t.go(84, -10, 6, { bank: -7 });
  t.go(36, 8, 5, { bank: -3 });
  switchbacks(t, 3, 70, 14, { r: 12, first: -1, onLeg: () => t.anchor(-1) });
  t.cp('Ice Ledge');
  // high glacier: wide, featureless ice with rocks
  t.aim(-20);
  t.set({ width: 5.6, L: 10, R: -16 });
  wander(t, 120, { turn: 32, grade: 4 });
  t.note('The glacier. Wide open ice on a slope - slow hands, and mind the rocks.');
  square(t, 24, 2);
  t.patch(220, 'ice', { from: -3, to: 3 });
  t.boulder(40, 0.4, 1.2).boulder(84, -0.4, 1.2).boulder(130, 0.35, 1.3).boulder(176, -0.4, 1.2);
  const gl = { width: 11, wavy: 0.04, rough: 0.03, L: 2, R: -6 };
  t.go(60, 20, 3, gl).go(50, -28, 4, gl).go(60, 26, 3, gl).go(50, -18, 4, gl);
  t.anchor(1);
  t.set({ surface: 'deepsnow', wavy: 0.28 });
  run(t, 90, 13);
  t.anchor(-1);
  t.set({ surface: 'snow', wavy: 0.18 });
  switchbacks(t, 3, 70, 13, { r: 12, onLeg: () => t.anchor(1) });
  t.cp('Glacier');
  t.aim(15);
  t.set({ width: 4.8, L: 14, R: -34 });
  wander(t, 130, { turn: 30, grade: 5, seg: [28, 40] });
  square(t, 26);
  t.bridge(64, { width: 3.0, depth: 44 });
  t.go(64, 0, 4, { L: 0, R: 0, surface: 'wood' }).go(20, 0, 0);
  t.rocks(40, 20, [0.44, 0.64], { spread: 0.85 });
  run(t, 60, 11, { rough: 0.2 });
  t.anchor(1);
  wander(t, 120, { turn: 30, grade: 6 });
  t.cp('Sky Gorge');
  // summit ridge: drops both sides, rock steps, the last wall
  t.aim(10);
  t.set({ width: 4.4, surface: 'snow', L: -30, R: -30 });
  t.note('The summit ridge. One last wall between you and the top.');
  wander(t, 130, { turn: 26, grade: 8, seg: [28, 40] });
  t.rocks(50, 16, [0.28, 0.44], { clear: 0.1, spread: 0.8 });
  run(t, 70, 15, { rough: 0.16, surface: 'rock' });
  t.anchor(1);
  run(t, 60, 20, { surface: 'deepsnow' });
  t.anchor(-1);
  run(t, 60, 22);
  t.anchor(1);
  wander(t, 150, { turn: 24, grade: 6, seg: [28, 40] });
  t.go(60, 0, 1, { width: 8, L: -8, R: -8 });
  return t.build();
}

export const SNOW_TRACKS = [snowEntry, frozenRiver, blizzardMountain, extremeSummit];
