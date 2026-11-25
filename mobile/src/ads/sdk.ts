// Starts the Google Mobile Ads SDK: asks for consent where the law requires it
// (Google's User Messaging Platform), applies the audience settings, initialises.
import { AdConfig } from './AdConfig';
import { describeAdError, setAdsStatus } from './diagnostics';
import { gma } from './native';

/** Resolves to true when ads may be requested. Never throws. */
export async function initSdk(): Promise<boolean> {
  const lib = gma();
  if (!lib) {
    // Expo Go, or a build without the AdMob native code: no ads, the game still runs
    if (__DEV__) {
      // development: simulated ads, so the layout and reward flow can be seen in Expo Go
      setAdsStatus({ native: 'no (Expo Go or an old build)', sdk: 'simulated ads (development)', banner: 'placeholder', interstitial: 'simulated', rewarded: 'simulated' });
      return true;
    }
    setAdsStatus({ native: 'no (Expo Go or an old build): ads are off', sdk: 'off' });
    return false;
  }
  setAdsStatus({ native: 'yes', sdk: 'starting' });
  const { AdsConsent, MaxAdContentRating } = lib;
  const mobileAds = lib.default;

  let consentNote = '';
  try {
    // Shows Google's consent form only if one is required and configured in the
    // AdMob console.
    await AdsConsent.gatherConsent();
  } catch (e) {
    // Offline, or no consent message has been created for this app ID yet. That
    // is not a "no" from the player, so it must not switch the ads off.
    consentNote = ` (consent service: ${describeAdError(e).replace('failed: ', '')})`;
  }
  try {
    const info = await AdsConsent.getConsentInfo();
    setAdsStatus({ consent: `${info.status}, can request ads: ${info.canRequestAds ? 'yes' : 'no'}${consentNote}` });
    // Ads are held back only when consent is definitely required and has not been
    // given. "Unknown" (no answer from the service) lets the SDK decide: it serves
    // limited ads on its own where it must.
    if (info.status === 'REQUIRED' && !info.canRequestAds) {
      setAdsStatus({ sdk: 'waiting: the player has not answered the consent form' });
      return false;
    }
  } catch (e) {
    setAdsStatus({ consent: `unknown${consentNote || ` (${describeAdError(e)})`}` });
  }

  try {
    await mobileAds().setRequestConfiguration({
      maxAdContentRating: AdConfig.childDirected ? MaxAdContentRating.G : MaxAdContentRating.PG,
      ...(AdConfig.childDirected ? { tagForChildDirectedTreatment: true } : {}),
      ...(AdConfig.testDevices.length ? { testDeviceIdentifiers: AdConfig.testDevices } : {}),
    });
    await mobileAds().initialize();
    setAdsStatus({ sdk: 'ready' });
    return true;
  } catch (e) {
    setAdsStatus({ sdk: describeAdError(e) });
    return false;
  }
}

/** Google's built-in tool that shows every ad unit and why a request failed. */
export async function openAdInspector(): Promise<boolean> {
  const lib = gma();
  if (!lib) return false;
  try {
    await lib.default().openAdInspector();
    return true;
  } catch {
    return false;
  }
}
