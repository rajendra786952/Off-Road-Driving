// Frame pacing rules (src/core/pacing.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { FramePacer, resetPacingMemory } from '../src/core/pacing';

/** Feed the pacer animation-frame callbacks `every` ms apart; returns how many frames it drew. */
function run(p: FramePacer, every: number, callbacks: number, start = 0): { drawn: number; switched: boolean; end: number } {
  let drawn = 0;
  let switched = false;
  let t = start;
  for (let i = 0; i < callbacks; i++, t += every) {
    const dt = p.begin(t);
    if (dt === 0) continue;
    drawn++;
    if (p.observe(dt)) switched = true;
  }
  return { drawn, switched, end: t };
}

test('a 60 Hz screen draws every callback and stays at 60 when frames are on time', () => {
  resetPacingMemory();
  const p = new FramePacer('auto');
  const r = run(p, 1000 / 60, 1200);
  assert.equal(r.drawn, 1200);
  assert.equal(p.target, 60);
  assert.equal(r.switched, false);
});

test('a 120 Hz screen is drawn at 60, a 90 Hz screen never faster than 60', () => {
  resetPacingMemory();
  assert.equal(run(new FramePacer('60'), 1000 / 120, 1200).drawn, 600);
  const at90 = run(new FramePacer('60'), 1000 / 90, 900).drawn; // ten seconds
  assert.ok(at90 <= 601 && at90 >= 440, `drew ${at90} frames in ten seconds`);
});

test('auto drops to a steady 30 when the phone keeps missing 60, and remembers it for the next run', () => {
  resetPacingMemory();
  const p = new FramePacer('auto');
  // a phone that manages about 45: frames alternate between one and two refreshes
  let t = 0;
  let switchedAt = -1;
  for (let i = 0; i < 600 && switchedAt < 0; i++) {
    t += i % 2 ? 33.4 : 16.7;
    const dt = p.begin(t);
    if (dt && p.observe(dt)) switchedAt = t;
  }
  assert.equal(p.target, 30);
  assert.ok(switchedAt > 1500 && switchedAt < 9000, `switched after ${Math.round(switchedAt)} ms`);
  // from now on every second 60 Hz callback is drawn
  assert.equal(run(p, 1000 / 60, 600, t + 16.7).drawn, 300);
  assert.equal(new FramePacer('auto').target, 30);
  assert.equal(new FramePacer('60').target, 60, 'the player can still force 60');
});

test('a few slow frames (a level loading, a notification) do not trigger the switch', () => {
  resetPacingMemory();
  const p = new FramePacer('auto');
  let t = 0;
  for (let i = 0; i < 2400; i++) {
    t += i % 20 === 0 ? 50 : 16.7; // one hitch in twenty frames
    const dt = p.begin(t);
    if (dt) p.observe(dt);
  }
  assert.equal(p.target, 60);
});

test('"30" always draws 30, and a pause is not counted as a long frame', () => {
  resetPacingMemory();
  const p = new FramePacer('30');
  assert.equal(run(p, 1000 / 60, 600).drawn, 300);
  p.resume();
  assert.ok(Math.abs(p.begin(99999) - 1000 / 60) < 0.01);
});
