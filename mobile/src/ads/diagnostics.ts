// What the ads layer is doing right now, in plain words. Shown in Settings so a
// problem ("why are there no ads?") can be read off the phone's screen instead
// of needing a USB cable and a log.
import { useSyncExternalStore } from 'react';

export interface AdsStatus {
  /** Is the Google Mobile Ads native code part of this build? */
  native: string;
  /** Answer of Google's consent service. */
  consent: string;
  /** State of the SDK itself. */
  sdk: string;
  /** Which ad units are requested: Google's test units or the app's own. */
  units: string;
  banner: string;
  interstitial: string;
  rewarded: string;
}

let status: AdsStatus = {
  native: 'not checked yet',
  consent: 'not asked yet',
  sdk: 'not started',
  units: '-',
  banner: 'not requested yet',
  interstitial: 'not requested yet',
  rewarded: 'not requested yet',
};
const listeners = new Set<() => void>();

export function setAdsStatus(patch: Partial<AdsStatus>): void {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}

export function getAdsStatus(): AdsStatus {
  return status;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useAdsStatus(): AdsStatus {
  return useSyncExternalStore(subscribe, getAdsStatus, getAdsStatus);
}

/** A short, readable form of an SDK error: its code and message. */
export function describeAdError(error: unknown): string {
  const e = error as { code?: unknown; message?: unknown } | null;
  const code = e && e.code ? String(e.code) : '';
  const message = e && e.message ? String(e.message) : String(error ?? 'unknown error');
  return `failed: ${code ? `${code} - ` : ''}${message}`.slice(0, 200);
}
