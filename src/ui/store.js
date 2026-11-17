// Tiny bridge between the save system and React: a subscribe/notify store,
// an event bus for shell events (hardware back, classic mode) and UI sounds.
import { useEffect, useReducer } from 'react';
import { SaveSystem } from '../game/systems/SaveSystem.js';

const subs = new Set();
export const store = {
  notify() { subs.forEach((f) => f()); },
  subscribe(f) { subs.add(f); return () => subs.delete(f); }
};

/** Re-render when the save changes. Components read SaveSystem.data directly. */
export function useSave() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => store.subscribe(force), []);
  return SaveSystem.data;
}

/** Run a SaveSystem mutation and refresh the UI. Returns the mutation's result. */
export function act(fn) {
  const r = fn(SaveSystem);
  store.notify();
  return r;
}

const handlers = {};
export const bus = {
  on(ev, fn) { (handlers[ev] = handlers[ev] || new Set()).add(fn); return () => handlers[ev].delete(fn); },
  emit(ev, arg) { if (handlers[ev]) handlers[ev].forEach((f) => f(arg)); }
};

let ctxGetter = () => null;
export function setAudio(getter) { ctxGetter = getter; }
function tone(freq, freq2, dur, vol, type = 'triangle', delay = 0) {
  const ctx = ctxGetter();
  if (!ctx || SaveSystem.data.settings.sound === false) return;
  if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (freq2) o.frequency.exponentialRampToValueAtTime(freq2, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + dur + 0.03);
}
export const sfx = {
  click: () => tone(520, 700, 0.07, 0.08),
  buy: () => { tone(660, 0, 0.08, 0.07, 'square'); tone(990, 0, 0.14, 0.07, 'square', 0.07); },
  deny: () => tone(200, 140, 0.18, 0.07, 'sawtooth'),
  go: () => { tone(392, 0, 0.1, 0.08); tone(587, 0, 0.16, 0.08, 'triangle', 0.09); }
};
