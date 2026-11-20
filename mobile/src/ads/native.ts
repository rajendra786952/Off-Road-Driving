// Access to react-native-google-mobile-ads that cannot crash the app.
//
// The library needs native code that only exists in a build of THIS app
// (`npx expo run:android`, EAS Build). Expo Go, and any build made before the
// library was added, do not contain it, and merely importing the library there
// throws "RNGoogleMobileAdsModule could not be found" before the game can start.
// So the library is never imported at the top of a file: it is required here, on
// first use, and only if its native module is present. Without it the game runs
// exactly the same, just with no ads.
import { TurboModuleRegistry } from 'react-native';

type Gma = typeof import('react-native-google-mobile-ads');

let cached: Gma | null | undefined;

/** The ads library, or null when this build has no AdMob native module. */
export function gma(): Gma | null {
  if (cached !== undefined) return cached;
  cached = null;
  try {
    if (TurboModuleRegistry.get('RNGoogleMobileAdsModule') != null) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cached = require('react-native-google-mobile-ads') as Gma;
    }
  } catch {
    cached = null;
  }
  return cached;
}

export function adsNativeAvailable(): boolean {
  return gma() !== null;
}
