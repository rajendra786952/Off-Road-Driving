// Sound effects, engine loop and background music (expo-audio). Everything is
// created lazily and every call is wrapped: a device without audio must never
// stop the game.
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

const FILES = {
  click: require('../../assets/audio/click.wav'),
  coin: require('../../assets/audio/coin.wav'),
  fuel: require('../../assets/audio/fuel.wav'),
  crash: require('../../assets/audio/crash.wav'),
  win: require('../../assets/audio/win.wav'),
  stunt: require('../../assets/audio/stunt.wav'),
  land: require('../../assets/audio/land.wav'),
  lowfuel: require('../../assets/audio/lowfuel.wav'),
  checkpoint: require('../../assets/audio/checkpoint.wav'),
  splash: require('../../assets/audio/splash.wav'),
  smash: require('../../assets/audio/smash.wav'),
  rockfall: require('../../assets/audio/rockfall.wav'),
} as const;

export type SfxName = keyof typeof FILES;

const VOLUME: Record<SfxName, number> = {
  click: 0.5, coin: 0.45, fuel: 0.6, crash: 0.9, win: 0.7, stunt: 0.6, land: 0.7,
  lowfuel: 0.5, checkpoint: 0.6, splash: 0.6, smash: 0.6, rockfall: 0.8,
};

let soundOn = true;
let musicOn = true;
let ready = false;
const sfx = new Map<SfxName, AudioPlayer>();
const lastPlayed = new Map<SfxName, number>();
let engine: AudioPlayer | null = null;
let music: AudioPlayer | null = null;
let engineRunning = false;
let engineStamp = 0;

function safe(fn: () => void): void {
  try {
    fn();
  } catch {
    // audio is never worth a crash
  }
}

/** Call once at start-up. */
export function initAudio(settings: { sound: boolean; music: boolean }): void {
  soundOn = settings.sound;
  musicOn = settings.music;
  if (ready) return;
  ready = true;
  setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
}

function player(name: SfxName): AudioPlayer | null {
  let p = sfx.get(name);
  if (!p) {
    safe(() => {
      p = createAudioPlayer(FILES[name]);
      p.volume = VOLUME[name];
      sfx.set(name, p);
    });
  }
  return p ?? null;
}

export function play(name: SfxName, minGapMs = 40): void {
  if (!soundOn) return;
  const now = Date.now();
  if (now - (lastPlayed.get(name) ?? 0) < minGapMs) return; // a row of coins must not stack up
  lastPlayed.set(name, now);
  const p = player(name);
  if (!p) return;
  safe(() => {
    p.seekTo(0).catch(() => {});
    p.play();
  });
}

// ------------------------------------------------------------------ engine
export function startEngine(): void {
  if (!soundOn || engineRunning) return;
  safe(() => {
    if (!engine) {
      engine = createAudioPlayer(require('../../assets/audio/engine.wav'));
      engine.loop = true;
      engine.shouldCorrectPitch = false; // pitch must rise with the revs
    }
    engine.volume = 0.18;
    engine.play();
    engineRunning = true;
  });
}

export function stopEngine(): void {
  if (!engineRunning) return;
  engineRunning = false;
  safe(() => engine?.pause());
}

/** speed01: 0..1 road speed, throttle: 0 or 1. Rate-limited so it costs almost nothing. */
export function updateEngine(speed01: number, throttle: number): void {
  if (!engineRunning || !engine) return;
  const now = Date.now();
  if (now - engineStamp < 110) return;
  engineStamp = now;
  safe(() => {
    engine!.setPlaybackRate(0.7 + speed01 * 0.95 + throttle * 0.25);
    engine!.volume = 0.14 + throttle * 0.16 + speed01 * 0.06;
  });
}

// ------------------------------------------------------------------ music
function syncMusic(): void {
  safe(() => {
    if (musicOn) {
      if (!music) {
        music = createAudioPlayer(require('../../assets/audio/music.wav'));
        music.loop = true;
        music.volume = 0.3;
      }
      music.play();
    } else {
      music?.pause();
    }
  });
}

/** Browsers only allow audio after a touch; calling this from the first press is harmless elsewhere. */
export function startMusic(): void {
  syncMusic();
}

export function setAudioSettings(settings: { sound: boolean; music: boolean }): void {
  soundOn = settings.sound;
  if (!soundOn) stopEngine();
  if (musicOn !== settings.music) {
    musicOn = settings.music;
    syncMusic();
  }
}

/** App went to the background / came back. */
export function setAudioActive(active: boolean): void {
  safe(() => {
    if (active) {
      if (musicOn) music?.play();
    } else {
      music?.pause();
      engine?.pause();
      engineRunning = false;
    }
  });
}
