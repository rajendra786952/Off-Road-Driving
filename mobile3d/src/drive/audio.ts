// Driving audio. The browser version synthesised everything with Web Audio, which React Native
// does not have; this one plays short recorded clips with expo-audio and bends the pitch of an
// engine loop with the revs. Same interface as before, so the game loop did not change.
// Every call is wrapped: a device without audio must never stop the game.
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

const FILES = {
  engine: require('../../assets/audio/engine.wav'),
  click: require('../../assets/audio/click.wav'),
  coin: require('../../assets/audio/coin.wav'),
  crash: require('../../assets/audio/crash.wav'),
  win: require('../../assets/audio/win.wav'),
  land: require('../../assets/audio/land.wav'),
  alarm: require('../../assets/audio/lowfuel.wav'),
  checkpoint: require('../../assets/audio/checkpoint.wav'),
  splash: require('../../assets/audio/splash.wav'),
  smash: require('../../assets/audio/smash.wav'),
  rockfall: require('../../assets/audio/rockfall.wav'),
} as const;
type Clip = Exclude<keyof typeof FILES, 'engine'>;

const players = new Map<Clip, AudioPlayer>();
const lastPlayed = new Map<Clip, number>();
let modeSet = false;

function safe(fn: () => void): void {
  try {
    fn();
  } catch {
    // audio is never worth a crash
  }
}

let soundOn = true;
export function setSoundEnabled(on: boolean): void {
  soundOn = on;
}

/** One-shot clip. minGapMs stops a burst of the same event stacking up. */
export function playClip(name: Clip, volume = 0.6, minGapMs = 60): void {
  if (!soundOn) return;
  const now = Date.now();
  if (now - (lastPlayed.get(name) ?? 0) < minGapMs) return;
  lastPlayed.set(name, now);
  safe(() => {
    if (!modeSet) {
      modeSet = true;
      setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    }
    let p = players.get(name);
    if (!p) {
      p = createAudioPlayer(FILES[name]);
      players.set(name, p);
    }
    p.volume = Math.max(0, Math.min(1, volume));
    p.seekTo(0).catch(() => {});
    p.play();
  });
}

/** Menu sounds. */
export const sfx = {
  click: () => playClip('click', 0.4),
  buy: () => playClip('coin', 0.5),
  deny: () => playClip('alarm', 0.25, 200),
  go: () => playClip('checkpoint', 0.45),
};

interface AudioFrame {
  rpm01: number; throttle: number; speed: number; slip: number; water: number; grounded: boolean; strain: number;
}

export class DriveAudio {
  private on: boolean;
  private engine: AudioPlayer | null = null;
  private running = false;
  private stamp = 0;
  private wet = false;

  constructor(enabled: boolean) {
    this.on = enabled;
    setSoundEnabled(enabled);
  }

  start(): void {
    if (!this.on || this.running) return;
    safe(() => {
      if (!this.engine) {
        this.engine = createAudioPlayer(FILES.engine);
        this.engine.loop = true;
        this.engine.shouldCorrectPitch = false; // the pitch must rise with the revs
      }
      this.engine.volume = 0.16;
      this.engine.play();
      this.running = true;
    });
  }

  mute(): void {
    if (!this.running) return;
    this.running = false;
    safe(() => this.engine?.pause());
  }

  update(s: AudioFrame): void {
    if (!this.running || !this.engine) return;
    const now = Date.now();
    if (now - this.stamp < 100) return; // ten updates a second cost almost nothing
    this.stamp = now;
    safe(() => {
      this.engine!.setPlaybackRate(0.6 + s.rpm01 * 1.15);
      this.engine!.volume = Math.min(0.5, 0.12 + s.throttle * 0.16 + s.strain * 0.1);
    });
    // driving into water: one splash on the way in
    const wet = s.water > 0.12 && Math.abs(s.speed) > 2;
    if (wet && !this.wet) playClip('splash', 0.5, 900);
    this.wet = wet;
  }

  thump(v: number): void { if (this.on) playClip('land', Math.min(0.7, 0.15 + v * 0.08), 120); }
  scrape(v: number): void { if (this.on) playClip('smash', Math.min(0.35, 0.08 + v * 0.05), 250); }
  crash(v: number): void { if (this.on) playClip('crash', Math.min(0.9, 0.35 + v * 0.07), 150); }
  splash(): void { if (this.on) playClip('splash', 0.5, 400); }
  checkpoint(): void { if (this.on) playClip('checkpoint', 0.6); }
  finish(): void { if (this.on) playClip('win', 0.7); }
  cache(): void { if (this.on) playClip('coin', 0.55); }
  click(): void { if (this.on) playClip('click', 0.45); }
  winch(): void { if (this.on) playClip('click', 0.2, 150); }
  rumble(): void { if (this.on) playClip('rockfall', 0.8, 1500); }
  crack(): void { if (this.on) playClip('smash', 0.55, 120); }
  creak(): void { if (this.on) playClip('smash', 0.35, 600); }
  gust(): void {}
  flock(): void {}
  bonus(): void { if (this.on) playClip('coin', 0.4); }
  alarm(): void { if (this.on) playClip('alarm', 0.5, 800); }

  dispose(): void {
    this.running = false;
    const e = this.engine;
    this.engine = null;
    safe(() => {
      e?.pause();
      e?.remove();
    });
  }
}
