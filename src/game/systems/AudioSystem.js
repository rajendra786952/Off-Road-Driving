// Procedural sound effects + engine hum built on the Web Audio context that
// Phaser already unlocks on first touch. No audio files are required for v1;
// drop real files into public/assets/audio later and swap these calls.
export default class AudioSystem {
  constructor(scene, settings) {
    this.ctx = scene.sound && scene.sound.context ? scene.sound.context : null;
    this.settings = settings;
    this.engine = null;
  }

  get enabled() {
    return !!this.ctx && this.settings.sound !== false;
  }

  _resume() {
    if (this.ctx && this.ctx.state === 'suspended' && this.ctx.resume) this.ctx.resume();
  }

  _tone({ freq, freq2, dur = 0.15, type = 'sine', vol = 0.15, delay = 0 }) {
    if (!this.enabled) return;
    this._resume();
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freq2) osc.frequency.exponentialRampToValueAtTime(freq2, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  click() { this._tone({ freq: 520, freq2: 700, dur: 0.07, type: 'triangle', vol: 0.1 }); }
  coin() {
    this._tone({ freq: 880, dur: 0.07, type: 'square', vol: 0.06 });
    this._tone({ freq: 1320, dur: 0.12, type: 'square', vol: 0.06, delay: 0.06 });
  }
  fuel() {
    this._tone({ freq: 300, freq2: 600, dur: 0.18, type: 'triangle', vol: 0.14 });
    this._tone({ freq: 600, freq2: 900, dur: 0.18, type: 'triangle', vol: 0.12, delay: 0.14 });
  }
  win() {
    [523, 659, 784, 1047].forEach((f, i) =>
      this._tone({ freq: f, dur: 0.22, type: 'triangle', vol: 0.14, delay: i * 0.12 })
    );
  }
  buy() {
    this._tone({ freq: 660, dur: 0.08, type: 'square', vol: 0.07 });
    this._tone({ freq: 990, dur: 0.14, type: 'square', vol: 0.07, delay: 0.07 });
  }
  deny() { this._tone({ freq: 200, freq2: 140, dur: 0.18, type: 'sawtooth', vol: 0.08 }); }

  stunt() {
    [659, 880, 1174, 1760].forEach((f, i) =>
      this._tone({ freq: f, dur: 0.12, type: 'sine', vol: 0.12, delay: i * 0.06 })
    );
  }

  lowFuel() {
    this._tone({ freq: 520, dur: 0.08, type: 'sawtooth', vol: 0.08 });
    this._tone({ freq: 520, dur: 0.08, type: 'sawtooth', vol: 0.08, delay: 0.12 });
  }

  land(intensity = 0.5) {
    if (!this.enabled) return;
    const vol = Math.min(0.25, 0.08 + intensity * 0.15);
    this._tone({ freq: 95, freq2: 38, dur: 0.14, type: 'triangle', vol });
  }

  crash() {
    if (!this.enabled) return;
    this._resume();
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    const gain = ctx.createGain();
    gain.gain.value = 0.35;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start();
    this._tone({ freq: 140, freq2: 40, dur: 0.35, type: 'sawtooth', vol: 0.18 });
  }

  startEngine() {
    if (!this.enabled || this.engine) return;
    this._resume();
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 50;

    const oscSub = ctx.createOscillator();
    oscSub.type = 'triangle';
    oscSub.frequency.value = 25;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    const gain = ctx.createGain();
    gain.gain.value = 0;

    osc.connect(filter);
    oscSub.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    oscSub.start();
    this.engine = { osc, oscSub, gain };
  }

  /** @param speed01 0..1 forward speed, @param throttle 0..1 */
  updateEngine(speed01, throttle) {
    if (!this.engine) return;
    const t = this.ctx.currentTime;
    const baseFreq = 48 + speed01 * 115 + throttle * 32;
    this.engine.osc.frequency.setTargetAtTime(baseFreq, t, 0.08);
    this.engine.oscSub.frequency.setTargetAtTime(baseFreq * 0.5, t, 0.08);
    this.engine.gain.gain.setTargetAtTime(0.02 + throttle * 0.035, t, 0.09);
  }

  stopEngine() {
    if (!this.engine) return;
    const { osc, oscSub, gain } = this.engine;
    const t = this.ctx.currentTime;
    gain.gain.setTargetAtTime(0, t, 0.05);
    try { osc.stop(t + 0.3); } catch (e) { /* already stopped */ }
    try { if (oscSub) oscSub.stop(t + 0.3); } catch (e) { /* already stopped */ }
    this.engine = null;
  }
}
