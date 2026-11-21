// One run of the 3D game: a GL surface the game draws into, with the HUD and the touch
// controls laid over it. The game itself (src/drive/DriveGame.js) knows nothing about React.
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, BackHandler, Platform, View } from 'react-native';
import GLSurface from '../ui/GLSurface';
import DriveHud from './DriveHud';
import DriveControls from './DriveControls';
import { HudBridge } from '../drive/hudBridge';
import { launchDrive, resolveQuality, type DriveRequest, type ExitAction } from '../drive/launch';
import { QUALITY } from '../drive/render/world.js';
import { SaveSystem } from '../state/save';
import type { GL } from '../platform/gl';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function DriveScreen({ request, onExit }: { request: DriveRequest; onExit(action: ExitAction, trackId: string): void }) {
  const bridge = useMemo(() => new HudBridge(), []);
  const game = useRef<any>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const state = useSyncExternalStore(bridge.subscribe, bridge.getState, bridge.getState);
  const exit = useRef(onExit);
  exit.current = onExit;

  const quality = resolveQuality(SaveSystem.data.settings.quality);
  // the phone presets were written as CSS pixel ratios; a browser tab keeps its own
  const pixelRatio = Platform.OS === 'web' ? 2 : (QUALITY as any)[quality].pixelRatio;

  const onContext = (gl: GL, w: number, h: number) => {
    setSize({ w, h });
    game.current = launchDrive(request, { gl, width: w, height: h, hud: bridge, onExit: (a, id) => exit.current(a, id) });
  };

  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      const g = game.current;
      if (g && g.state !== 'loading') g.back();
      else exit.current('tracks', request.trackId);
      return true;
    });
    // a phone call or the home button pauses the run
    const app = AppState.addEventListener('change', (s) => {
      if (s !== 'active' && game.current && game.current.state === 'run') game.current.pause();
    });
    return () => {
      back.remove();
      app.remove();
      game.current?.dispose();
      game.current = null;
      bridge.dispose();
    };
  }, [bridge, request.trackId]);

  return (
    <View style={{ flex: 1, backgroundColor: '#0b1217' }}>
      <GLSurface
        pixelRatio={pixelRatio}
        onContext={onContext}
        onResize={(w, h) => {
          setSize({ w, h });
          game.current?.resize(w, h);
        }}
      />
      {size.w > 0 && state.running && !state.loading && !state.panel && !state.failed && (
        <DriveControls bridge={bridge} game={game} state={state} width={size.w} height={size.h} />
      )}
      {size.w > 0 && <DriveHud bridge={bridge} state={state} height={size.h} onQuit={() => { game.current?.dispose(); exit.current('tracks', request.trackId); }} />}
    </View>
  );
}
