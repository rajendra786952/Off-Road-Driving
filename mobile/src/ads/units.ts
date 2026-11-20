// Ad unit ID helpers. No React Native imports, so they run in the unit tests.

export type AdKind = 'banner' | 'interstitial' | 'rewarded';
export type AdPlatform = 'android' | 'ios';

/** Google's documented demo ad units. Safe in debug builds; they never earn money. */
export const TEST_UNITS: Record<AdPlatform, Record<AdKind, string>> = {
  android: {
    banner: 'ca-app-pub-3940256099942544/9214589741',
    interstitial: 'ca-app-pub-3940256099942544/1033173712',
    rewarded: 'ca-app-pub-3940256099942544/5224354917',
  },
  ios: {
    banner: 'ca-app-pub-3940256099942544/2435281174',
    interstitial: 'ca-app-pub-3940256099942544/4411468910',
    rewarded: 'ca-app-pub-3940256099942544/1712485313',
  },
};

/** Publisher ID of Google's demo account: an ID under it is a test unit, not a real one. */
const TEST_PUBLISHER = 'ca-app-pub-3940256099942544';

/** A unit ID looks like ca-app-pub-<16 digits>/<digits>. */
export function isValidUnitId(id: string | undefined): id is string {
  return !!id && /^ca-app-pub-\d{16}\/\d{6,}$/.test(id.trim());
}

export function isTestUnitId(id: string): boolean {
  return id.trim().startsWith(TEST_PUBLISHER);
}

/** The unit to request: the production one when allowed and well-formed, else Google's test unit. */
export function resolveUnitId(kind: AdKind, os: AdPlatform, prod: string | undefined, useTest: boolean): string {
  if (!useTest && isValidUnitId(prod)) return prod.trim();
  return TEST_UNITS[os][kind];
}
