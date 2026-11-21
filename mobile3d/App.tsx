// Offroad Racing 4x4 3D: the app shell. React Native draws every menu; the drive screen hosts
// the Three.js game on a native GL surface.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Achievements, Garage, Home, Profile, Regions, Settings, Tracks, type Nav } from './src/screens/Menus';
import DriveScreen from './src/screens/DriveScreen';
import { Btn, C } from './src/ui/kit';
import { SaveSystem, useSave } from './src/state/save';
import { setSoundEnabled, sfx } from './src/drive/audio';
import { TRACK_META } from './src/drive/tracks/meta.js';
import type { DriveRequest, ExitAction } from './src/drive/launch';

interface Route { name: string; params: Record<string, string> }
const HOME: Route = { name: 'home', params: {} };

/** If a screen fails to draw, say so and offer the way home instead of leaving a black screen. */
class ScreenGuard extends React.Component<{ onHome(): void; children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error('Screen failed to draw:', error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: C.text, fontSize: 18, fontWeight: '900' }}>This screen could not be shown</Text>
        <Text style={{ color: C.dim, marginVertical: 10, textAlign: 'center' }}>{String(this.state.error.message || this.state.error)}</Text>
        <Btn kind="gold" label="Back to the main menu" onPress={() => { this.setState({ error: null }); this.props.onHome(); }} />
      </View>
    );
  }
}

export default function App() {
  const save = useSave();
  const [ready, setReady] = useState(false);
  const [route, setRoute] = useState<Route>(HOME);
  const [stack, setStack] = useState<Route[]>([]);
  const [drive, setDrive] = useState<{ key: number; request: DriveRequest; difficulty?: string } | null>(null);
  const driveKey = useRef(0);

  useEffect(() => {
    if (Platform.OS !== 'web') ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    SaveSystem.init().then((d) => {
      setSoundEnabled(d.settings.sound !== false);
      setReady(true);
    });
  }, []);
  useEffect(() => setSoundEnabled(save.settings.sound !== false), [save.settings.sound]);

  const go = useCallback((name: string, params: Record<string, string> = {}) => {
    setStack((s) => [...s, route]);
    setRoute({ name, params });
  }, [route]);
  const back = useCallback(() => {
    if (!stack.length) {
      if (route.name === 'home') BackHandler.exitApp();
      else setRoute(HOME);
      return;
    }
    setRoute(stack[stack.length - 1]);
    setStack(stack.slice(0, -1));
  }, [route, stack]);

  // Android back button in the menus (the drive screen handles its own)
  useEffect(() => {
    if (drive) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      sfx.click();
      back();
      return true;
    });
    return () => sub.remove();
  }, [back, drive]);

  const startDrive = useCallback((trackId: string, difficulty?: string, testVehicle?: string, extra: { resume?: boolean } = {}) => {
    setDrive({ key: ++driveKey.current, difficulty, request: { trackId, difficulty, testVehicle, resume: extra.resume ? SaveSystem.data.resume : null } });
  }, []);

  const onExit = useCallback((action: ExitAction, id: string) => {
    const cur = drive;
    const testVehicle = cur?.request.testVehicle;
    const difficulty = cur?.difficulty;
    const meta = TRACK_META.find((t) => t.id === id) || TRACK_META[0];
    const nextId = TRACK_META[TRACK_META.indexOf(meta) + 1]?.id;
    if (action === 'retry') { startDrive(id, difficulty, testVehicle); return; }
    if (testVehicle) { setDrive(null); setStack([HOME]); setRoute({ name: 'garage', params: { vehicle: testVehicle } }); return; }
    if (action === 'next' && nextId) { startDrive(nextId, difficulty); return; }
    setDrive(null);
    if (action === 'garage') {
      setStack([HOME, { name: 'tracks', params: { region: meta.region, track: id } }]);
      setRoute({ name: 'garage', params: {} });
    } else {
      const show = SaveSystem.data.tracks[id]?.done && nextId ? TRACK_META.find((t) => t.id === nextId) : undefined;
      const target = show && show.region !== meta.region ? show : meta;
      setStack([HOME, { name: 'regions', params: {} }]);
      setRoute({ name: 'tracks', params: { region: target.region, track: show && nextId ? nextId : id } });
    }
  }, [drive, startDrive]);

  if (__DEV__) (globalThis as unknown as { __nav: unknown }).__nav = { go, startDrive, save: SaveSystem };

  let body: React.ReactNode;
  if (!ready) body = <View style={{ flex: 1, backgroundColor: C.bg }} />;
  else if (drive) body = <DriveScreen key={drive.key} request={drive.request} onExit={onExit} />;
  else {
    const p: Nav = { go, back, save, params: route.params, onDrive: startDrive };
    body = (
      <ScreenGuard key={route.name + (route.params.region || '')} onHome={() => { setStack([]); setRoute(HOME); }}>
        {route.name === 'home' && <Home {...p} />}
        {route.name === 'regions' && <Regions {...p} />}
        {route.name === 'tracks' && <Tracks {...p} />}
        {route.name === 'garage' && <Garage {...p} />}
        {route.name === 'profile' && <Profile {...p} />}
        {route.name === 'achievements' && <Achievements {...p} />}
        {route.name === 'settings' && <Settings {...p} />}
      </ScreenGuard>
    );
  }
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <StatusBar hidden />
        {body}
      </View>
    </SafeAreaProvider>
  );
}
