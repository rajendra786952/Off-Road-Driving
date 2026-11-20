// Browser build: the Google Mobile Ads SDK is Android / iOS only, so there are no
// real ads here. In development the ads are simulated (a short pause, then
// "watched") so reward and frequency flows can be exercised in the browser; a
// production web build reports every ad as unavailable.
export type ShowOutcome = 'earned' | 'closed' | 'unavailable';

export interface FullScreenHost {
  canLoad(): boolean;
  onChange(): void;
  onPresented(visible: boolean): void;
}

/** Development controls for the simulated ads (see src/dev/hooks.ts). */
export const adSimulator = {
  /** What the next simulated rewarded ad does. */
  rewarded: 'earned' as ShowOutcome,
  /** Every simulated ad that was "shown", in order. */
  log: [] as string[],
};

if (__DEV__) (globalThis as Record<string, unknown>).__ttAds = adSimulator;

export class FullScreenAd {
  private showing = false;
  private readonly kind: 'interstitial' | 'rewarded';
  private readonly host: FullScreenHost;

  constructor(kind: 'interstitial' | 'rewarded', host: FullScreenHost) {
    this.kind = kind;
    this.host = host;
  }

  isReady(): boolean {
    return __DEV__ && !this.showing && this.host.canLoad();
  }

  isShowing(): boolean {
    return this.showing;
  }

  load(): void {
    this.host.onChange();
  }

  show(): Promise<ShowOutcome> {
    if (!this.isReady() || (this.kind === 'rewarded' && adSimulator.rewarded === 'unavailable')) return Promise.resolve('unavailable');
    this.showing = true;
    this.host.onPresented(true);
    adSimulator.log.push(this.kind);
    return new Promise((resolve) => {
      setTimeout(() => {
        this.showing = false;
        this.host.onPresented(false);
        this.host.onChange();
        resolve(this.kind === 'rewarded' ? adSimulator.rewarded : 'closed');
      }, 300);
    });
  }
}
