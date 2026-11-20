// Starts the Google Mobile Ads SDK: asks for consent where the law requires it
// (Google's User Messaging Platform), applies the audience settings, initialises.
import mobileAds, { AdsConsent, MaxAdContentRating } from 'react-native-google-mobile-ads';
import { AdConfig } from './AdConfig';

/** Resolves to true when ads may be requested. Never throws. */
export async function initSdk(): Promise<boolean> {
  try {
    // Shows Google's consent form only if one is required and configured in the
    // AdMob console; fails quietly without a connection.
    await AdsConsent.gatherConsent();
  } catch {
    // offline, or no consent message set up: fall through to the stored answer
  }
  try {
    const info = await AdsConsent.getConsentInfo();
    if (info.canRequestAds === false) return false;
  } catch {
    // consent state unknown: the SDK itself will refuse requests if it must
  }
  try {
    await mobileAds().setRequestConfiguration({
      maxAdContentRating: AdConfig.childDirected ? MaxAdContentRating.G : MaxAdContentRating.PG,
      ...(AdConfig.childDirected ? { tagForChildDirectedTreatment: true } : {}),
      ...(AdConfig.testDevices.length ? { testDeviceIdentifiers: AdConfig.testDevices } : {}),
    });
    await mobileAds().initialize();
    return true;
  } catch {
    return false;
  }
}
