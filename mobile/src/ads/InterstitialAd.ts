// Interstitial ads: full-screen ads shown at natural breaks (after a level, when
// going back to the menus). When one may be shown is decided by AdFrequencyManager.
import { FullScreenAd, type FullScreenHost } from './FullScreenAd';

export class InterstitialAd extends FullScreenAd {
  constructor(host: FullScreenHost) {
    super('interstitial', host);
  }
}
