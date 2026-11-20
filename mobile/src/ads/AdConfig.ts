// Every AdMob setting in one place.
//
// Ad unit IDs come from EXPO_PUBLIC_ADMOB_* environment variables (see
// .env.example). Nothing production-specific is written in the source: when a
// variable is missing, or in a development build, Google's public test units are
// used, which always fill and can be clicked safely.
//
// The AdMob *app* IDs are not here: they belong to the native project and are
// injected at build time by app.config.js from ADMOB_ANDROID_APP_ID /
// ADMOB_IOS_APP_ID.
import { Platform } from 'react-native';

import { resolveUnitId, isValidUnitId, type AdKind, type AdPlatform } from './units';

export type { AdKind } from './units';

// Expo only inlines process.env.EXPO_PUBLIC_* when each one is written out in full.
const PROD_UNITS: Record<AdPlatform, Record<AdKind, string | undefined>> = {
  android: {
    banner: process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER,
    interstitial: process.env.EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL,
    rewarded: process.env.EXPO_PUBLIC_ADMOB_ANDROID_REWARDED,
  },
  ios: {
    banner: process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER,
    interstitial: process.env.EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL,
    rewarded: process.env.EXPO_PUBLIC_ADMOB_IOS_REWARDED,
  },
};

const flag = (v: string | undefined, fallback: boolean) => (v === undefined || v === '' ? fallback : v === '1' || v === 'true');
const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) && n >= 0 ? n : fallback;
};

const platform: AdPlatform = Platform.OS === 'ios' ? 'ios' : 'android';

/** Test ads are forced in development and whenever EXPO_PUBLIC_ADMOB_USE_TEST_ADS=1. */
export const USE_TEST_ADS = __DEV__ || flag(process.env.EXPO_PUBLIC_ADMOB_USE_TEST_ADS, false);

export function adUnitId(kind: AdKind): string {
  return resolveUnitId(kind, platform, PROD_UNITS[platform][kind], USE_TEST_ADS);
}

/** True when a release build would fall back to test units because an ID is missing. */
export function missingProductionIds(): AdKind[] {
  return (['banner', 'interstitial', 'rewarded'] as AdKind[]).filter((k) => !isValidUnitId(PROD_UNITS[platform][k]));
}

export const AdConfig = {
  /** Master switch: EXPO_PUBLIC_ADMOB_ENABLED=0 builds the game with no ads at all. */
  enabled: flag(process.env.EXPO_PUBLIC_ADMOB_ENABLED, true),

  interstitial: {
    /** Offer an interstitial after this many completed levels. */
    everyNLevels: num(process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_EVERY_LEVELS, 3),
    /** Never two full-screen ads closer together than this (rewarded ads count). */
    minIntervalSec: num(process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_MIN_INTERVAL_SEC, 120),
    /** No interstitial this soon after the app starts. */
    startGraceSec: 60,
    /** Going back to the menus from a run can show one after this many runs without an ad. */
    menuReturnAfterRuns: 2,
    /** Hard cap per app session. */
    maxPerSession: 12,
  },

  /** Seconds to wait before retrying a failed load: 30 s, 1 min, 2 min ... capped at 5 min. */
  retryDelaySec: (failures: number) => Math.min(300, 30 * Math.pow(2, Math.max(0, failures - 1))),

  /**
   * Audience. Set EXPO_PUBLIC_ADMOB_CHILD_DIRECTED=1 if the store listing targets
   * children: ads are then requested as child-directed and rated G.
   */
  childDirected: flag(process.env.EXPO_PUBLIC_ADMOB_CHILD_DIRECTED, false),

  /** Device IDs that always get test ads, comma separated (from the SDK's log line). */
  testDevices: (process.env.EXPO_PUBLIC_ADMOB_TEST_DEVICES ?? '').split(',').map((s: string) => s.trim()).filter(Boolean),
};
