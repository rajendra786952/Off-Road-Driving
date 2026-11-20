// The one place the game talks to AdMob through. It owns the SDK start-up, one
// preloaded interstitial and one preloaded rewarded ad, the frequency rules and
// the "is a level being driven?" flag. Screens never touch the SDK directly.
//
// Guarantees:
//  - nothing is loaded or shown while a level is being driven;
//  - one full-screen ad at a time, and a call made while one is up is refused;
//  - every call resolves (never throws), so a missing network only means "no ad".
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { AdConfig } from './AdConfig';
import { AdFrequencyManager, type InterstitialTrigger } from './AdFrequencyManager';
import type { FullScreenHost, ShowOutcome } from './FullScreenAd';
import { InterstitialAd } from './InterstitialAd';
import { RewardedAd } from './RewardedAd';
import { initSdk } from './sdk';
import { setAudioActive } from '../audio/sound';

export type RewardedResult = ShowOutcome;

interface Snapshot {
  /** The SDK started and ads may be requested. */
  ready: boolean;
  /** A rewarded ad is loaded and can be shown right now. */
  rewardedReady: boolean;
  /** Banners may be on screen (never during a run). */
  bannersAllowed: boolean;
}

class Manager {
  private initStarted = false;
  private ready = false;
  private gameplay = false;
  private busy = false;
  private snapshot: Snapshot = { ready: false, rewardedReady: false, bannersAllowed: false };
  private readonly listeners = new Set<() => void>();
  private readonly frequency = new AdFrequencyManager(AdConfig.interstitial);
  private readonly host: FullScreenHost = {
    canLoad: () => this.ready && !this.gameplay,
    onChange: () => this.publish(),
    onPresented: (visible) => setAudioActive(!visible),
  };
  private readonly interstitial = new InterstitialAd(this.host);
  private readonly rewarded = new RewardedAd(this.host);

  /** Call once when the app starts. Safe to call again. */
  async init(): Promise<void> {
    if (this.initStarted || !AdConfig.enabled) return;
    this.initStarted = true;
    this.ready = await initSdk();
    this.publish();
    this.preload();
    // coming back to the app (or back online) is a good moment to fetch what is missing
    AppState.addEventListener('change', (state) => {
      if (state === 'active') this.preload();
    });
  }

  /** The driving screen calls this: true while the car is being driven. */
  setGameplayActive(active: boolean): void {
    if (this.gameplay === active) return;
    this.gameplay = active;
    this.publish();
    if (!active) this.preload();
  }

  onLevelCompleted(): void {
    this.frequency.onLevelCompleted();
  }

  onRunEnded(): void {
    this.frequency.onRunEnded();
  }

  /**
   * Show an interstitial if the frequency rules allow one and it is loaded.
   * Resolves when the ad has closed, or straight away if none was shown.
   */
  async maybeShowInterstitial(trigger: InterstitialTrigger): Promise<boolean> {
    if (!this.ready || this.gameplay || this.busy) return false;
    if (!this.frequency.shouldShowInterstitial(trigger)) return false;
    if (!this.interstitial.isReady()) {
      this.interstitial.load();
      return false;
    }
    this.busy = true;
    const outcome = await this.interstitial.show();
    this.busy = false;
    if (outcome === 'unavailable') return false;
    this.frequency.markInterstitialShown();
    return true;
  }

  /**
   * Show the rewarded ad. 'earned' means AdMob confirmed the reward and the ad
   * was closed; 'closed' means it was skipped; 'unavailable' means there was
   * nothing to show.
   */
  async showRewarded(): Promise<RewardedResult> {
    if (!this.ready || this.gameplay || this.busy) return 'unavailable';
    this.busy = true;
    this.publish();
    const outcome = await this.rewarded.show();
    this.busy = false;
    if (outcome !== 'unavailable') this.frequency.markRewardedShown();
    this.publish();
    return outcome;
  }

  private preload(): void {
    this.interstitial.load();
    this.rewarded.load();
  }

  private publish(): void {
    const next: Snapshot = {
      ready: this.ready,
      rewardedReady: this.ready && !this.gameplay && !this.busy && this.rewarded.isReady(),
      bannersAllowed: this.ready && !this.gameplay,
    };
    const s = this.snapshot;
    if (s.ready === next.ready && s.rewardedReady === next.rewardedReady && s.bannersAllowed === next.bannersAllowed) return;
    this.snapshot = next;
    this.listeners.forEach((l) => l());
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): Snapshot => this.snapshot;
}

export const AdMobManager = new Manager();

/** True while a rewarded ad is loaded: buttons that offer one show only then. */
export function useRewardedReady(): boolean {
  return useSyncExternalStore(AdMobManager.subscribe, () => AdMobManager.getSnapshot().rewardedReady, () => false);
}

export function useBannersAllowed(): boolean {
  return useSyncExternalStore(AdMobManager.subscribe, () => AdMobManager.getSnapshot().bannersAllowed, () => false);
}
