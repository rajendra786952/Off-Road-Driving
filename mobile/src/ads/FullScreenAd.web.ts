// Browser build: the Google Mobile Ads SDK is Android / iOS only, so there are no
// real ads here. In development the ads are simulated on screen (see simAd.tsx) so
// layout, timing and the reward flow can be seen; a production web build reports
// every ad as unavailable.
import { showSimulatedAd, adSimulator } from './simAd';

export type ShowOutcome = 'earned' | 'closed' | 'unavailable';
export { adSimulator };

export interface FullScreenHost {
  canLoad(): boolean;
  onChange(): void;
  onPresented(visible: boolean): void;
}

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

  async show(): Promise<ShowOutcome> {
    if (!this.isReady() || (this.kind === 'rewarded' && adSimulator.rewarded === 'unavailable')) return 'unavailable';
    this.showing = true;
    this.host.onPresented(true);
    const outcome = await showSimulatedAd(this.kind);
    this.showing = false;
    this.host.onPresented(false);
    this.host.onChange();
    return outcome;
  }
}
