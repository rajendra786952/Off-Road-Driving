// Browser build: no SDK. Development builds simulate ads (see FullScreenAd.web.ts).
import { setAdsStatus } from './diagnostics';

export async function initSdk(): Promise<boolean> {
  setAdsStatus({
    native: 'no (browser build)',
    consent: 'not needed here',
    sdk: __DEV__ ? 'simulated ads (development)' : 'off',
    banner: __DEV__ ? 'placeholder' : 'off',
    interstitial: __DEV__ ? 'simulated' : 'off',
    rewarded: __DEV__ ? 'simulated' : 'off',
  });
  return __DEV__;
}

export async function openAdInspector(): Promise<boolean> {
  return false;
}
