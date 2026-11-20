// App state: the save, the current screen, and persistence. A tiny external
// store read through selectors, so a component re-renders only when the slice
// it uses changes (the game screen never re-renders for a coin).
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SAVE_KEY, defaultSave, migrateSave, type SaveData, type Settings } from './save';

export type Route =
  | { name: 'home' }
  | { name: 'levels'; world?: number }
  | { name: 'garage' }
  | { name: 'settings' }
  | { name: 'game'; levelId: number; run: number };

export interface AppState {
  loaded: boolean;
  save: SaveData;
  route: Route;
}

let state: AppState = { loaded: false, save: defaultSave(), route: { name: 'home' } };
const listeners = new Set<() => void>();

function set(next: Partial<AppState>): void {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export function getState(): AppState {
  return state;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
}

// ------------------------------------------------------------- persistence
let writeTimer: ReturnType<typeof setTimeout> | null = null;

function persist(): void {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    AsyncStorage.setItem(SAVE_KEY, JSON.stringify(state.save)).catch(() => {});
  }, 250);
}

export async function loadSave(): Promise<void> {
  let save = defaultSave();
  try {
    const raw = await AsyncStorage.getItem(SAVE_KEY);
    if (raw) save = migrateSave(JSON.parse(raw));
  } catch {
    // unreadable save: start fresh rather than crash on launch
  }
  set({ save, loaded: true });
}

/** Replace the save (used by every action) and write it to storage. */
export function commitSave(save: SaveData | null): boolean {
  if (!save) return false;
  set({ save });
  persist();
  return true;
}

export function updateSettings(patch: Partial<Settings>): void {
  commitSave({ ...state.save, settings: { ...state.save.settings, ...patch } });
}

export function resetProgress(): void {
  commitSave({ ...defaultSave(), settings: state.save.settings });
}

// ------------------------------------------------------------- navigation
let runCounter = 0;

export function navigate(route: Route): void {
  set({ route });
}

export function startLevel(levelId: number): void {
  set({ route: { name: 'game', levelId, run: ++runCounter } });
}

/** Where the hardware back button leads from each screen. */
export function goBack(): boolean {
  const r = state.route;
  if (r.name === 'home') return false;
  if (r.name === 'game') navigate({ name: 'levels' });
  else navigate({ name: 'home' });
  return true;
}
