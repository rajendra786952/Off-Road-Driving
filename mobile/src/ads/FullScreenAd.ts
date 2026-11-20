// One preloaded full-screen ad (interstitial or rewarded) and its life cycle:
// load -> ready -> show -> closed -> load the next one. Used by InterstitialAd.ts
// and RewardedAd.ts. The browser build gets FullScreenAd.web.ts instead.
import type { InterstitialAd as SdkInterstitial, RewardedAd as SdkRewarded } from 'react-native-google-mobile-ads';
import { AdConfig, adUnitId } from './AdConfig';
import { gma } from './native';
import { describeAdError, setAdsStatus } from './diagnostics';

// Event names of the SDK (AdEventType / RewardedAdEventType). Written out here so
// this file needs nothing from the library until an ad is actually requested.
const EVENT = {
  LOADED: 'loaded',
  ERROR: 'error',
  OPENED: 'opened',
  CLOSED: 'closed',
  REWARDED_LOADED: 'rewarded_loaded',
  EARNED_REWARD: 'rewarded_earned_reward',
} as const;

export type ShowOutcome = 'earned' | 'closed' | 'unavailable';

export interface FullScreenHost {
  /** False while a level is being driven: nothing is loaded or shown then. */
  canLoad(): boolean;
  /** Ready state changed. */
  onChange(): void;
  /** An ad covered / uncovered the screen (the game mutes its audio). */
  onPresented(visible: boolean): void;
}

const MAX_AGE_MS = 50 * 60 * 1000; // a loaded ad expires after about an hour

export class FullScreenAd {
  private ad: SdkInterstitial | SdkRewarded | null = null;
  private ready = false;
  private loading = false;
  private showing = false;
  private earned = false;
  private loadedAt = 0;
  private failures = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private resolve: ((o: ShowOutcome) => void) | null = null;
  private readonly kind: 'interstitial' | 'rewarded';
  private readonly host: FullScreenHost;

  constructor(kind: 'interstitial' | 'rewarded', host: FullScreenHost) {
    this.kind = kind;
    this.host = host;
  }

  isReady(): boolean {
    return this.ready && !this.showing && Date.now() - this.loadedAt < MAX_AGE_MS;
  }

  isShowing(): boolean {
    return this.showing;
  }

  /** Request an ad if none is ready, loading or on screen. Safe to call often. */
  load(): void {
    if (this.showing || this.loading || !this.host.canLoad()) return;
    if (this.ready && Date.now() - this.loadedAt < MAX_AGE_MS) return;
    const lib = gma();
    if (!lib) return; // no AdMob native module in this build
    this.dispose();
    try {
      const unit = adUnitId(this.kind);
      const ad = this.kind === 'rewarded' ? lib.RewardedAd.createForAdRequest(unit) : lib.InterstitialAd.createForAdRequest(unit);
      this.ad = ad;
      this.loading = true;
      setAdsStatus({ [this.kind]: 'loading' });
      // one listener for every event of this ad instance
      (ad as SdkRewarded).addAdEventsListener(({ type, payload }) => this.onEvent(ad, type, payload));
      ad.load();
    } catch (e) {
      this.loading = false;
      setAdsStatus({ [this.kind]: describeAdError(e) });
      this.scheduleRetry();
    }
  }

  /** Show the preloaded ad. Resolves once it is closed, never rejects. */
  show(): Promise<ShowOutcome> {
    const ad = this.ad;
    if (!ad || !this.isReady()) {
      this.load();
      return Promise.resolve('unavailable');
    }
    return new Promise<ShowOutcome>((resolve) => {
      this.resolve = resolve;
      this.showing = true;
      this.earned = false;
      this.host.onChange();
      ad.show().catch(() => this.finish(ad, 'unavailable'));
    });
  }

  private onEvent(ad: SdkInterstitial | SdkRewarded, type: string, payload?: unknown): void {
    if (ad !== this.ad) return; // a late event from an ad that was already replaced
    switch (type) {
      case EVENT.LOADED:
      case EVENT.REWARDED_LOADED:
        this.loading = false;
        this.ready = true;
        this.loadedAt = Date.now();
        this.failures = 0;
        setAdsStatus({ [this.kind]: 'loaded, ready to show' });
        this.host.onChange();
        break;
      case EVENT.OPENED:
        this.host.onPresented(true);
        break;
      case EVENT.EARNED_REWARD:
        // AdMob confirmed the reward; it is handed over when the ad closes
        this.earned = true;
        break;
      case EVENT.CLOSED:
        this.finish(ad, this.earned ? 'earned' : 'closed');
        break;
      case EVENT.ERROR:
        if (this.showing) this.finish(ad, this.earned ? 'earned' : 'unavailable');
        else {
          this.loading = false;
          setAdsStatus({ [this.kind]: `${describeAdError(payload)} (will retry)` });
          this.dispose();
          this.host.onChange();
          this.scheduleRetry();
        }
        break;
    }
  }

  private finish(ad: SdkInterstitial | SdkRewarded, outcome: ShowOutcome): void {
    if (ad !== this.ad || !this.showing) return; // already handled: a reward is never delivered twice
    this.showing = false;
    this.host.onPresented(false);
    const resolve = this.resolve;
    this.resolve = null;
    this.dispose();
    this.host.onChange();
    resolve?.(outcome);
    this.load(); // have the next one ready
  }

  private scheduleRetry(): void {
    this.failures++;
    if (this.retry) clearTimeout(this.retry);
    this.retry = setTimeout(() => {
      this.retry = null;
      this.load();
    }, AdConfig.retryDelaySec(this.failures) * 1000);
  }

  private dispose(): void {
    const ad = this.ad;
    this.ad = null;
    this.ready = false;
    if (!ad) return;
    try {
      ad.removeAllListeners();
      ad.destroy();
    } catch {
      // nothing to clean up
    }
  }
}
