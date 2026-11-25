// Simulated ads for local development (browser build, Expo Go, any build without
// the AdMob native module). They exist so the ad layout, timing and reward flow can
// be seen and tested without a phone build. Release builds never use them.
import React, { useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export type SimOutcome = 'earned' | 'closed' | 'unavailable';

interface SimState {
  kind: 'interstitial' | 'rewarded' | null;
  secondsLeft: number;
}

/** Development controls (see src/dev/hooks.ts). */
export const adSimulator = {
  /** What the next simulated rewarded ad does. */
  rewarded: 'earned' as SimOutcome,
  /** true: no overlay, the ad "plays" for 300 ms (automated tests). */
  instant: false,
  /** Every simulated ad that was "shown", in order. */
  log: [] as string[],
};
if (__DEV__) (globalThis as Record<string, unknown>).__ttAds = adSimulator;

let state: SimState = { kind: null, secondsLeft: 0 };
let finish: ((o: SimOutcome) => void) | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();
const set = (next: SimState) => {
  state = next;
  listeners.forEach((l) => l());
};

const WATCH_SECONDS = 3;

/** Put a simulated full-screen ad on screen. Resolves when the player closes it. */
export function showSimulatedAd(kind: 'interstitial' | 'rewarded'): Promise<SimOutcome> {
  adSimulator.log.push(kind);
  if (adSimulator.instant) {
    return new Promise((r) => setTimeout(() => r(kind === 'rewarded' ? adSimulator.rewarded : 'closed'), 300));
  }
  return new Promise((resolve) => {
    finish = resolve;
    set({ kind, secondsLeft: WATCH_SECONDS });
    timer = setInterval(() => {
      if (state.secondsLeft <= 1 && timer) {
        clearInterval(timer);
        timer = null;
      }
      set({ ...state, secondsLeft: Math.max(0, state.secondsLeft - 1) });
    }, 1000);
  });
}

function close(skipped: boolean): void {
  const kind = state.kind;
  if (timer) clearInterval(timer);
  timer = null;
  const done = finish;
  finish = null;
  set({ kind: null, secondsLeft: 0 });
  done?.(kind === 'rewarded' ? (skipped ? 'closed' : adSimulator.rewarded) : 'closed');
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** Mounted once in App.tsx. Draws the simulated full-screen ad on top of everything. */
export function SimAdOverlay() {
  const s = useSyncExternalStore(subscribe, () => state, () => state);
  if (!s.kind) return null;
  const rewarded = s.kind === 'rewarded';
  const done = s.secondsLeft === 0;
  return (
    <View style={st.cover} accessibilityLabel="Advertisement">
      <Text style={st.tag}>{rewarded ? 'REWARDED AD' : 'AD'} · simulated (development build)</Text>
      <Text style={st.big}>Your ad plays here</Text>
      <Text style={st.sub}>{rewarded ? 'Watch to the end to get your reward.' : 'Interstitial between levels.'}</Text>
      <Pressable style={[st.btn, !done && st.btnOff]} disabled={!done} onPress={() => close(false)}>
        <Text style={st.btnText}>{done ? (rewarded ? 'CLAIM REWARD' : 'CLOSE AD') : `Wait ${s.secondsLeft}s`}</Text>
      </Pressable>
      {rewarded && !done ? (
        <Pressable onPress={() => close(true)} style={st.skip}>
          <Text style={st.skipText}>Skip (no reward)</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A banner-sized placeholder, drawn where the real banner goes. */
export function SimBanner() {
  return (
    <View accessibilityLabel="Advertisement" style={st.banner}>
      <Text style={st.bannerText}>AD BANNER (simulated · the real AdMob banner shows in a build of the app)</Text>
    </View>
  );
}

const st = StyleSheet.create({
  cover: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, backgroundColor: '#0b1620', alignItems: 'center', justifyContent: 'center', padding: 24 },
  tag: { color: '#ffd23f', fontWeight: '800', fontSize: 12, letterSpacing: 1, marginBottom: 14 },
  big: { color: '#fff', fontWeight: '900', fontSize: 32, marginBottom: 6 },
  sub: { color: '#9db1bf', fontSize: 14, marginBottom: 24 },
  btn: { backgroundColor: '#3fae5f', paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
  btnOff: { backgroundColor: '#33444f' },
  btnText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  skip: { marginTop: 14, padding: 8 },
  skipText: { color: '#9db1bf', fontSize: 12 },
  banner: { height: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1b2a35', borderTopWidth: 1, borderTopColor: '#2c4252' },
  bannerText: { color: '#9db1bf', fontSize: 12, fontWeight: '700' },
});
