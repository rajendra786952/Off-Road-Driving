// Generates every sound the game uses as small WAV files in assets/audio.
// The original game synthesised its sounds with Web Audio at run time; React
// Native has no Web Audio, so the same kind of sounds are rendered to files
// once, here. Run:  node scripts/gen-audio.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 22050;
const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'audio');
fs.mkdirSync(outDir, { recursive: true });

function wav(name, samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(path.join(outDir, `${name}.wav`), Buffer.concat([h, data]));
  console.log(`${name}.wav  ${(samples.length / SR).toFixed(2)}s  ${((data.length + 44) / 1024).toFixed(0)} KB`);
}

const buf = (sec) => new Float32Array(Math.round(sec * SR));
let seed = 1234;
const noise = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2147483648) - 1;
const sq = (p) => (p % 1 < 0.5 ? 1 : -1);
const saw = (p) => 2 * (p % 1) - 1;
const tri = (p) => 1 - 4 * Math.abs((p % 1) - 0.5);

/** Add a tone with an attack/decay envelope. */
function tone(out, { at = 0, dur, f0, f1 = f0, vol = 0.5, wave = Math.sin, attack = 0.005 }) {
  const start = Math.round(at * SR);
  const n = Math.round(dur * SR);
  let phase = 0;
  for (let i = 0; i < n && start + i < out.length; i++) {
    const t = i / n;
    const f = f0 + (f1 - f0) * t;
    phase += f / SR;
    const env = Math.min(1, i / (attack * SR)) * Math.pow(1 - t, 1.6);
    out[start + i] += (wave === Math.sin ? Math.sin(phase * 2 * Math.PI) : wave(phase)) * env * vol;
  }
}

function burst(out, { at = 0, dur, vol = 0.5, lp = 0.2, decay = 2 }) {
  const start = Math.round(at * SR);
  const n = Math.round(dur * SR);
  let y = 0;
  for (let i = 0; i < n && start + i < out.length; i++) {
    y += lp * (noise() - y);
    out[start + i] += y * Math.pow(1 - i / n, decay) * vol;
  }
}

// ---- effects
{ const o = buf(0.06); tone(o, { dur: 0.06, f0: 660, f1: 520, vol: 0.4, wave: tri }); wav('click', o); }
{ const o = buf(0.22); tone(o, { dur: 0.09, f0: 988, vol: 0.4, wave: sq }); tone(o, { at: 0.07, dur: 0.15, f0: 1319, vol: 0.4, wave: sq }); wav('coin', o); }
{ const o = buf(0.36); tone(o, { dur: 0.34, f0: 300, f1: 900, vol: 0.45, wave: tri }); tone(o, { at: 0.12, dur: 0.22, f0: 600, f1: 1400, vol: 0.2 }); wav('fuel', o); }
{ const o = buf(0.7); burst(o, { dur: 0.7, vol: 1.2, lp: 0.12, decay: 2.2 }); tone(o, { dur: 0.4, f0: 140, f1: 40, vol: 0.7, wave: saw }); wav('crash', o); }
{ const o = buf(1.1); [523, 659, 784, 1047].forEach((f, i) => tone(o, { at: i * 0.13, dur: 0.5, f0: f, vol: 0.3, wave: tri })); tone(o, { at: 0.52, dur: 0.55, f0: 1319, vol: 0.2 }); wav('win', o); }
{ const o = buf(0.42); [659, 831, 988].forEach((f, i) => tone(o, { at: i * 0.07, dur: 0.26, f0: f, vol: 0.3, wave: sq })); wav('stunt', o); }
{ const o = buf(0.26); tone(o, { dur: 0.22, f0: 110, f1: 45, vol: 0.9 }); burst(o, { dur: 0.16, vol: 0.5, lp: 0.08 }); wav('land', o); }
{ const o = buf(0.3); tone(o, { dur: 0.1, f0: 880, vol: 0.35, wave: sq }); tone(o, { at: 0.15, dur: 0.1, f0: 880, vol: 0.35, wave: sq }); wav('lowfuel', o); }
{ const o = buf(0.5); tone(o, { dur: 0.2, f0: 784, vol: 0.35, wave: tri }); tone(o, { at: 0.16, dur: 0.32, f0: 1175, vol: 0.35, wave: tri }); wav('checkpoint', o); }
{ const o = buf(0.5); burst(o, { dur: 0.5, vol: 0.9, lp: 0.35, decay: 1.6 }); tone(o, { dur: 0.3, f0: 500, f1: 180, vol: 0.15 }); wav('splash', o); }
{ const o = buf(0.3); burst(o, { dur: 0.3, vol: 1.1, lp: 0.5, decay: 3 }); tone(o, { dur: 0.08, f0: 320, f1: 120, vol: 0.5, wave: sq }); wav('smash', o); }
{ const o = buf(0.9); burst(o, { dur: 0.9, vol: 1.3, lp: 0.04, decay: 1.2 }); for (let i = 0; i < 6; i++) tone(o, { at: i * 0.13, dur: 0.12, f0: 90 - i * 6, f1: 50, vol: 0.4 }); wav('rockfall', o); }

// ---- engine: a seamless one-second loop; the game changes its playback rate with speed
{
  const o = buf(1);
  const f = 60; // whole number of cycles in one second = no click at the loop point
  for (let i = 0; i < o.length; i++) {
    const t = i / SR;
    const wob = 1 + 0.25 * Math.sin(2 * Math.PI * 12 * t);
    o[i] = (saw(f * t) * 0.34 + sq(f * 0.5 * t) * 0.2 + Math.sin(2 * Math.PI * f * 2 * t) * 0.16 + saw(f * 3 * t) * 0.07) * wob * 0.7;
  }
  // gentle low-pass so it rumbles rather than buzzes
  let y = 0;
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < o.length * 2; i++) { const k = i % o.length; y += 0.18 * (o[k] - y); if (i >= o.length || pass) o[k] = y; }
  wav('engine', o.map((v) => v * 2.2));
}

// ---- music: 8 bars at 112 bpm, loops seamlessly
{
  const beat = 60 / 112;
  const bars = 8;
  const o = buf(bars * 4 * beat);
  const N = (semi) => 220 * Math.pow(2, semi / 12);
  const chords = [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -1, 2], [0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]];
  const lead = [12, 15, 19, 15, 17, 15, 12, 10, 8, 12, 15, 12, 10, 8, 7, 10, 14, 10, 17, 14, 12, 10, 7, 5, 7, 11, 14, 11, 7, 5, 2, 7,
    12, 15, 19, 22, 19, 15, 12, 15, 8, 12, 15, 20, 15, 12, 8, 12, 15, 19, 22, 19, 22, 24, 22, 19, 14, 17, 22, 17, 14, 10, 14, 10];
  for (let bar = 0; bar < bars; bar++) {
    const c = chords[bar];
    for (let b = 0; b < 4; b++) {
      const at = (bar * 4 + b) * beat;
      tone(o, { at, dur: beat * 0.9, f0: N(c[0] - 24), vol: 0.34, wave: tri, attack: 0.01 }); // bass
      tone(o, { at: at + beat / 2, dur: beat * 0.4, f0: N(c[0] - 12), vol: 0.16, wave: tri });
      for (const s of c) tone(o, { at, dur: beat * 0.95, f0: N(s), vol: 0.045, wave: saw, attack: 0.03 }); // pad
      burst(o, { at, dur: 0.05, vol: b % 2 ? 0.5 : 0.22, lp: 0.9, decay: 3 }); // hat / snare
      if (b % 2 === 0) tone(o, { at, dur: 0.12, f0: 120, f1: 45, vol: 0.5 }); // kick
      for (let h = 0; h < 2; h++) {
        const s = lead[(bar * 8 + b * 2 + h) % lead.length];
        tone(o, { at: at + (h * beat) / 2, dur: beat * 0.46, f0: N(s), vol: 0.11, wave: sq, attack: 0.008 });
      }
    }
  }
  wav('music', o.map((v) => v * 0.9));
}
