// App shell: loads the save, then shows one screen at a time with a short
// transition. The game is small enough that a route value in the store is all
// the navigation it needs.
import React, { useEffect } from 'react';
import { ActivityIndicator, AppState, BackHandler, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { goBack, loadSave, getState, useStore } from './src/state/store';
import { installDevHooks } from './src/dev/hooks';
import { initAudio, setAudioActive } from './src/audio/sound';
import { AdMobManager } from './src/ads/AdMobManager';
import { NoticeHost } from './src/ui/notice';
import { C, Transition } from './src/ui/kit';
import HomeScreen from './src/screens/HomeScreen';
import LevelsScreen from './src/screens/LevelsScreen';
import GarageScreen from './src/screens/GarageScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import GameScreen from './src/screens/GameScreen';

// debugging aid (development builds only)
if (__DEV__) installDevHooks();

export default function App() {
  const loaded = useStore((s) => s.loaded);
  const route = useStore((s) => s.route);

  useEffect(() => {
    loadSave().then(() => {
      initAudio(getState().save.settings);
      // ads start after the game is usable; a failure here only means no ads
      AdMobManager.init();
    });
    const app = AppState.addEventListener('change', (state) => setAudioActive(state === 'active'));
    // the game screen installs its own handler on top of this one
    const back = BackHandler.addEventListener('hardwareBackPress', () => goBack());
    return () => {
      app.remove();
      back.remove();
    };
  }, []);

  let screen: React.ReactNode;
  let key: string = route.name;
  if (!loaded) screen = <View style={st.center}><ActivityIndicator color={C.gold} size="large" /></View>;
  else if (route.name === 'game') {
    key = `game-${route.run}`; // a new run is a new screen: fresh world, fresh state
    screen = <GameScreen key={key} levelId={route.levelId} />;
  } else if (route.name === 'levels') screen = <LevelsScreen />;
  else if (route.name === 'garage') screen = <GarageScreen />;
  else if (route.name === 'settings') screen = <SettingsScreen />;
  else screen = <HomeScreen />;

  return (
    <SafeAreaProvider>
      <View style={st.root}>
        <StatusBar hidden />
        <Transition id={key}>{screen}</Transition>
        <NoticeHost />
      </View>
    </SafeAreaProvider>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
