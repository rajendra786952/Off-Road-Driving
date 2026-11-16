import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Haptics } from '@capacitor/haptics';
import { StatusBar } from '@capacitor/status-bar';
import { ScreenOrientation } from '@capacitor/screen-orientation';

export const isNative = Capacitor.isNativePlatform();

/** Native-only setup: landscape lock, immersive bars, Android back button. */
export async function initPlatform(game) {
  if (!isNative) return;

  try { await ScreenOrientation.lock({ orientation: 'landscape' }); } catch (e) { console.warn(e); }
  try { await StatusBar.hide(); } catch (e) { console.warn(e); }

  App.addListener('backButton', () => game.events.emit('android-back'));
  App.addListener('appStateChange', ({ isActive }) => {
    game.events.emit(isActive ? 'app-resume' : 'app-pause');
  });
}

export function exitApp() {
  if (isNative) App.exitApp();
}

export function vibrate(ms = 40) {
  if (isNative) {
    Haptics.vibrate({ duration: ms }).catch(() => {});
  } else if (navigator.vibrate) {
    navigator.vibrate(ms);
  }
}
