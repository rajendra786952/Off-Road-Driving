// Procedural driving audio (Web Audio, no files): engine tied to RPM and load,
// tyre/surface noise, mud + water, wind, rain / blizzard, suspension and impacts.
export class DriveAudio {
  constructor(ctx, enabled) {
    this.ctx = enabled ? ctx : null;
    this.nodes = [];
    if (!this.ctx) return;
    const c = this.ctx;
    if (c.state === 'suspended' && c.resume) c.resume();
    this.master = c.createGain();
    this.master.gain.value = 0;
    this.master.connect(c.destination);

    // engine: two detuned saws + sub through a low-pass that opens with load
    this.engGain = c.createGain(); this.engGain.gain.value = 0.0;
    this.engFilter = c.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 300; this.engFilter.Q.value = 1.2;
    this.osc = ['sawtooth', 'sawtooth', 'triangle'].map((type, i) => {
      const o = c.createOscillator(); o.type = type; o.frequency.value = 40;
      const g = c.createGain(); g.gain.value = i === 2 ? 0.9 : 0.5;
      o.connect(g); g.connect(this.engFilter); o.start();
      this.nodes.push(o);
      return o;
    });
    // a fourth voice an octave up adds the mechanical rasp of a loaded engine
    this.rasp = c.createOscillator(); this.rasp.type = 'square'; this.rasp.frequency.value = 80;
    this.raspGain = c.createGain(); this.raspGain.gain.value = 0;
    this.rasp.connect(this.raspGain); this.raspGain.connect(this.engFilter); this.rasp.start();
    this.nodes.push(this.rasp);
    // soft clipping gives the tone some grit instead of a clean synth buzz
    const shaper = c.createWaveShaper();
    const curve = new Float32Array(257);
    for (let i = 0; i < 257; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 2.6) * 0.85; }
    shaper.curve = curve;
    this.engFilter.connect(shaper); shaper.connect(this.engGain); this.engGain.connect(this.master);
    // exhaust pulse: the level throbs at the firing rate, strongest at idle (the 'lumpy' diesel idle)
    this.pulse = c.createOscillator(); this.pulse.type = 'sine'; this.pulse.frequency.value = 9;
    this.pulseGain = c.createGain(); this.pulseGain.gain.value = 0.02;
    this.pulse.connect(this.pulseGain); this.pulseGain.connect(this.engGain.gain); this.pulse.start();
    this.nodes.push(this.pulse);
    this.ambT = 1.5; this.cricketT = 0;

    // shared noise buffer
    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const noise = (type, freq, q = 0.7) => {
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.master); src.start(0, Math.random() * 1.5);
      this.nodes.push(src);
      return { f, g };
    };
    this.tyre = noise('bandpass', 900, 0.6);
    this.slip = noise('bandpass', 1700, 1.4);
    this.mud = noise('lowpass', 320, 0.9);
    this.water = noise('highpass', 2400, 0.5);
    this.wind = noise('lowpass', 420, 0.4);
    this.rain = noise('highpass', 3200, 0.3);
    this.buf = buf;
    this.t = 0;
  }

  start() { if (this.ctx) this.master.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.15); }
  mute() { if (this.ctx) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08); }

  /** @param s {rpm01, throttle, speed, slip, surface, water, strain, weather} */
  update(s) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, k = 0.06;
    const f = 34 + s.rpm01 * 132;
    this.osc[0].frequency.setTargetAtTime(f, t, k);
    this.osc[1].frequency.setTargetAtTime(f * 1.505, t, k);
    this.osc[2].frequency.setTargetAtTime(f * 0.5, t, k);
    // strain (slow + heavy throttle) makes the engine growl: lower cutoff, more gain
    this.engFilter.frequency.setTargetAtTime(240 + s.rpm01 * 900 + s.throttle * 500 - s.strain * 180, t, k);
    this.engGain.gain.setTargetAtTime(0.05 + s.throttle * 0.075 + s.strain * 0.05, t, k);
    this.rasp.frequency.setTargetAtTime(f * 2.01, t, k);
    this.raspGain.gain.setTargetAtTime(0.05 + s.throttle * 0.16 + s.strain * 0.1, t, k);
    this.pulse.frequency.setTargetAtTime(f * 0.25, t, k);
    this.pulseGain.gain.setTargetAtTime(0.03 * (1 - s.rpm01 * 0.75) + s.strain * 0.02, t, k);
    this._ambience(s);

    const sp = Math.min(1, Math.abs(s.speed) / 22);
    const rough = s.surface.rough;
    const soft = s.surface.sink > 0.05 ? 1 : 0;
    this.tyre.f.frequency.setTargetAtTime(500 + rough * 900 + sp * 500, t, 0.1);
    this.tyre.g.gain.setTargetAtTime(s.grounded ? sp * (0.05 + rough * 0.12) * (1 - soft * 0.6) : 0, t, 0.08);
    const sl = Math.min(1, Math.abs(s.slip) / 7);
    this.slip.g.gain.setTargetAtTime(s.grounded && !soft ? sl * 0.09 * (s.surface.grip < 0.3 ? 0.3 : 1) : 0, t, 0.05);
    this.mud.g.gain.setTargetAtTime(soft && s.grounded ? Math.min(0.2, 0.04 + sl * 0.16 + sp * 0.1) : 0, t, 0.08);
    this.water.g.gain.setTargetAtTime(Math.min(0.14, s.water * (0.05 + sp * 0.5)), t, 0.1);
    const w = s.weather;
    this.wind.g.gain.setTargetAtTime(0.012 + sp * 0.05 + w.wind * 0.09, t, 0.3);
    this.wind.f.frequency.setTargetAtTime(300 + w.wind * 500 + sp * 300 + Math.sin(t * 0.7) * 120 * w.wind, t, 0.3);
    this.rain.g.gain.setTargetAtTime(w.rain * 0.07 + w.snow * 0.012, t, 0.5);
  }

  /** Life in the landscape: birdsong in wooded regions by day, crickets after dark. Quiet in rain and storms. */
  _ambience(s) {
    const dt = s.dt || 0.016, w = s.weather, day = s.day ?? 1;
    const wooded = s.env === 'ridges' || s.env === 'canopy' || s.env === 'rolling' || s.env === 'alpine';
    const calm = w.rain < 0.3 && w.snow < 0.3 && w.wind < 0.8;
    this.ambT -= dt;
    if (this.ambT <= 0) {
      const busy = s.env === 'canopy' ? 0.45 : 1;
      this.ambT = (1.4 + Math.random() * 3.6) * busy;
      if (wooded && calm && day > 0.45) {
        // a short phrase of chirps: each note sweeps up or down
        const base = 2100 + Math.random() * 2200, n = 2 + Math.floor(Math.random() * 4), up = Math.random() < 0.5;
        const vol = 0.012 + Math.random() * 0.014;
        for (let i = 0; i < n; i++) this._tone(base * (1 + i * 0.04), base * (up ? 1.25 : 0.82), 0.07 + Math.random() * 0.05, vol, 'sine', i * (0.09 + Math.random() * 0.04));
      }
    }
    this.cricketT -= dt;
    if (this.cricketT <= 0) {
      this.cricketT = 0.42 + Math.random() * 0.1;
      if (calm && day < 0.3 && (wooded || s.env === 'dunes')) for (let i = 0; i < 3; i++) this._tone(4500, 4450, 0.035, 0.006, 'sine', i * 0.05);
    }
  }

  _burst(freq, dur, vol, type = 'lowpass') {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.buf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random()); src.stop(t + dur + 0.02);
  }
  _tone(freq, freq2, dur, vol, type = 'triangle', delay = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (freq2) o.frequency.exponentialRampToValueAtTime(freq2, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.03);
  }

  thump(v) { this._burst(160, 0.14, Math.min(0.35, 0.06 + v * 0.05)); this._tone(70, 38, 0.12, Math.min(0.3, v * 0.05)); }
  scrape(v) { this._burst(1300, 0.2, Math.min(0.2, 0.05 + v * 0.04), 'bandpass'); }
  crash(v) { this._burst(700, 0.45, Math.min(0.6, 0.2 + v * 0.05)); this._tone(120, 40, 0.3, 0.25, 'sawtooth'); }
  splash() { this._burst(2600, 0.5, 0.22, 'highpass'); }
  checkpoint() { [523, 659, 784].forEach((f, i) => this._tone(f, 0, 0.2, 0.13, 'triangle', i * 0.1)); }
  finish() { [523, 659, 784, 1047, 1319].forEach((f, i) => this._tone(f, 0, 0.28, 0.14, 'triangle', i * 0.12)); }
  cache() { [880, 1175, 1568].forEach((f, i) => this._tone(f, 0, 0.14, 0.11, 'sine', i * 0.07)); }
  click() { this._tone(520, 700, 0.07, 0.09); }
  winch() { this._tone(180, 170, 0.12, 0.05, 'square'); }

  dispose() {
    if (!this.ctx) return;
    this.mute();
    const nodes = this.nodes, master = this.master;
    setTimeout(() => { nodes.forEach((n) => { try { n.stop(); } catch (e) { /* stopped */ } }); master.disconnect(); }, 250);
  }
}
