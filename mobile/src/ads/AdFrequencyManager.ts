// Decides WHEN an interstitial may be shown. Pure logic with an injectable clock,
// so the rules are unit-tested without any SDK.
//
// Rules:
//  - never during the first `startGraceSec` of a session;
//  - never within `minIntervalSec` of the previous full-screen ad (an interstitial
//    or a rewarded ad the player chose to watch);
//  - "levelComplete": only once `everyNLevels` levels have been completed since
//    the last interstitial;
//  - "menuReturn": only once `menuReturnAfterRuns` runs have ended since the last
//    full-screen ad;
//  - at most `maxPerSession` per session.

export type InterstitialTrigger = 'levelComplete' | 'menuReturn';

export interface FrequencyRules {
  everyNLevels: number;
  minIntervalSec: number;
  startGraceSec: number;
  menuReturnAfterRuns: number;
  maxPerSession: number;
}

export class AdFrequencyManager {
  private readonly rules: FrequencyRules;
  private readonly now: () => number;
  private sessionStart: number;
  private lastFullScreen = -Infinity;
  private levelsSinceAd = 0;
  private runsSinceAd = 0;
  private shown = 0;

  constructor(rules: FrequencyRules, now: () => number = Date.now) {
    this.rules = rules;
    this.now = now;
    this.sessionStart = now();
  }

  /** A level was finished successfully. */
  onLevelCompleted(): void {
    this.levelsSinceAd++;
  }

  /** A run ended in any way (win, crash, quit). */
  onRunEnded(): void {
    this.runsSinceAd++;
  }

  shouldShowInterstitial(trigger: InterstitialTrigger): boolean {
    const t = this.now();
    const r = this.rules;
    if (this.shown >= r.maxPerSession) return false;
    if (t - this.sessionStart < r.startGraceSec * 1000) return false;
    if (t - this.lastFullScreen < r.minIntervalSec * 1000) return false;
    if (trigger === 'levelComplete') return this.levelsSinceAd >= Math.max(1, r.everyNLevels);
    return this.runsSinceAd >= Math.max(1, r.menuReturnAfterRuns);
  }

  /** An interstitial was actually displayed. */
  markInterstitialShown(): void {
    this.shown++;
    this.lastFullScreen = this.now();
    this.levelsSinceAd = 0;
    this.runsSinceAd = 0;
  }

  /** The player watched a rewarded ad: don't follow it with an interstitial. */
  markRewardedShown(): void {
    this.lastFullScreen = this.now();
    this.runsSinceAd = 0;
  }

  get interstitialsShown(): number {
    return this.shown;
  }
}
