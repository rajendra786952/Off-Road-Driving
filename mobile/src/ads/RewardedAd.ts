// Rewarded ads: the player chooses to watch one for a reward. show() resolves to
// 'earned' only after AdMob has fired its reward event AND the ad was closed; a
// skipped ad resolves to 'closed', a missing one to 'unavailable'.
import { FullScreenAd, type FullScreenHost } from './FullScreenAd';

export class RewardedAd extends FullScreenAd {
  constructor(host: FullScreenHost) {
    super('rewarded', host);
  }
}
