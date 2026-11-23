// The driving screen. The physics and the drawing run in one requestAnimationFrame
// loop outside React: React only renders the HUD (a few times per second), the
// pedals and the pause / result panels, so playing never re-renders the tree.
import React, { memo, useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { Animated, AppState, BackHandler, Dimensions, Platform, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { Canvas, Picture, Skia, type SkPicture } from '@shopify/react-native-skia';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { GameWorld, type GameEvent, type RunResult } from '../core/world';
import { MAX_STEPS_PER_FRAME, PHYSICS_STEP, PX_PER_METER, SPAWN_X } from '../core/constants';
import { SceneRenderer } from '../render/scene';
import { botControls, newBot } from '../core/bot';
import { FramePacer } from '../core/pacing';
import { LEVEL_COUNT, getLevel } from '../data/levels';
import { THEMES } from '../data/themes';
import { getVehicle, paintSpec } from '../data/vehicles';
import { paintOf, recordRun, upgradesOf, type Reward } from '../state/save';
import { commitSave, getState, navigate, startLevel } from '../state/store';
import { play, startEngine, stopEngine, updateEngine } from '../audio/sound';
import { AdMobManager, useRewardedReady } from '../ads/AdMobManager';
import type { InterstitialTrigger } from '../ads/AdFrequencyManager';
import { watchAdForReward } from '../ads/rewards';
import { grantCoins } from '../state/save';
import { Bar, Btn, C, Coins, Stars, fmt, s as ks } from '../ui/kit';
import { StuntHud } from './StuntHud';

type Phase = 'playing' | 'paused' | 'result';

interface Hud {
  fuel: number;
  coins: number;
  progress: number;
  metres: number;
  speed: number;
  fps: number;
  perf: string;
}

/** Measured in the game loop, shown with "Show frame rate": what one frame costs on this phone. */
interface Perf {
  fps: number;
  /** ms per physics step and ms to build one frame's drawing, averaged over the last half second */
  physics: number;
  draw: number;
  /** longest gap between two frames in that half second */
  worst: number;
  target: number;
}

const END_TEXT: Record<string, { title: string; tip: string }> = {
  crash: { title: 'CRASHED', tip: 'Line the car up with the ground before you land: BACK FLIP lifts the nose, FRONT FLIP drops it.' },
  fuel: { title: 'OUT OF FUEL', tip: 'Grab fuel cans to keep going!' },
  fell: { title: 'FELL IN', tip: 'Take broken roads at full speed.' },
  hit: { title: 'ROCKFALL', tip: 'Wait for the rocks to land, then drive on.' },
};

function buzz(kind: 'light' | 'heavy'): void {
  if (!getState().save.settings.vibration || Platform.OS === 'web') return;
  Haptics.impactAsync(kind === 'heavy' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

// ------------------------------------------------------------------ toast
interface ToastHandle {
  show(text: string, color?: string): void;
}
const Toast = memo(
  forwardRef<ToastHandle>(function Toast(_, ref) {
    const [msg, setMsg] = useState({ text: '', color: C.greenHi });
    const a = useRef(new Animated.Value(0)).current;
    useImperativeHandle(ref, () => ({
      show(text, color = C.greenHi) {
        setMsg({ text, color });
        a.stopAnimation();
        a.setValue(0);
        Animated.sequence([
          Animated.timing(a, { toValue: 1, duration: 160, useNativeDriver: true }),
          Animated.delay(900),
          Animated.timing(a, { toValue: 0, duration: 320, useNativeDriver: true }),
        ]).start();
      },
    }));
    return (
      <Animated.View pointerEvents="none" style={[st.toast, { opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}>
        <Text style={[st.toastText, { color: msg.color }]}>{msg.text}</Text>
      </Animated.View>
    );
  }),
);

// ------------------------------------------------------------------ HUD
const HudView = memo(function HudView({ worldRef, perfRef, title, showFps }: { worldRef: React.RefObject<GameWorld | null>; perfRef: React.RefObject<Perf>; title: string; showFps: boolean }) {
  const insets = useSafeAreaInsets();
  const [hud, setHud] = useState<Hud>({ fuel: 1, coins: 0, progress: 0, metres: 0, speed: 0, fps: 0, perf: '' });
  useEffect(() => {
    const id = setInterval(() => {
      const w = worldRef.current;
      if (!w) return;
      const p = perfRef.current;
      const next: Hud = {
        fuel: Math.round((w.fuel / w.fuelMax) * 50) / 50,
        coins: Math.floor(w.runCoins),
        progress: Math.round(w.progress * 100) / 100,
        metres: Math.max(0, Math.floor((w.vehicle.x - SPAWN_X) / PX_PER_METER)),
        speed: Math.round(Math.abs(w.speed) * 3.6 * 3),
        fps: showFps ? Math.round(p.fps) : 0,
        perf: showFps ? `physics ${p.physics.toFixed(1)} ms  draw ${p.draw.toFixed(1)} ms  worst ${Math.round(p.worst)} ms  target ${p.target}` : '',
      };
      setHud((h) => (h.fuel === next.fuel && h.coins === next.coins && h.progress === next.progress && h.metres === next.metres && h.speed === next.speed && h.fps === next.fps && h.perf === next.perf ? h : next));
      // five times a second is plenty for a fuel bar, and every update is a React render on the game's thread
    }, 200);
    return () => clearInterval(id);
  }, [worldRef, perfRef, showFps]);

  const w = worldRef.current;
  const low = hud.fuel < 0.25;
  return (
    <View pointerEvents="none" style={[st.hud, { top: insets.top + 8, left: insets.left + 12, right: insets.right + 64 }]}>
      <View style={st.hudLeft}>
        <View style={ks.row}>
          <Text style={st.hudLabel}>FUEL</Text>
          <View style={st.fuelBar}>
            <Bar value={hud.fuel} color={low ? '#e0463c' : hud.fuel < 0.5 ? '#f0b429' : '#55c26a'} height={14} />
          </View>
        </View>
        <View style={[ks.row, { marginTop: 6 }]}>
          <Coins value={hud.coins} size={18} />
          {w ? <Text style={st.hudDim}> / {w.totalCoins}</Text> : null}
        </View>
      </View>
      <View style={st.hudMid}>
        <Text style={st.hudTitle} numberOfLines={1}>{title}</Text>
        <View style={st.progress}>
          <Bar value={hud.progress} color={C.gold} height={8} />
        </View>
        <Text style={st.hudDim}>
          {hud.metres} m{w ? ` / ${Math.floor((w.finishX - SPAWN_X) / PX_PER_METER)} m` : ''}   {hud.speed} km/h{showFps ? `   ${hud.fps} fps` : ''}
        </Text>
        {showFps ? <Text style={st.hudPerf}>{hud.perf}</Text> : null}
      </View>
    </View>
  );
});

// ------------------------------------------------------------------ pedals
const Pedal = memo(function Pedal({ label, value, side, faint }: { label: string; value: Animated.Value; side: 'left' | 'right'; faint: boolean }) {
  const insets = useSafeAreaInsets();
  const edge = side === 'left' ? { left: insets.left + 22 } : { right: insets.right + 22 };
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        st.pedal,
        edge,
        { bottom: insets.bottom + 18, backgroundColor: side === 'left' ? '#b8412f' : '#2f9e55' },
        { opacity: value.interpolate({ inputRange: [0, 1], outputRange: [faint ? 0.3 : 0.6, 0.98] }), transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [1, 0.93] }) }] },
      ]}
    >
      <Text style={st.pedalText}>{label}</Text>
    </Animated.View>
  );
});

// ------------------------------------------------------------------ flip buttons
const FLIP_BTN_W = 100;
/** Distance from the screen edge to the flip button: the pedal (22 + 132) and a gap. */
const FLIP_EDGE = 164;
/** Rotates the car while it is in the air (front: nose down, back: nose up). Does nothing on the ground. */
const FlipButton = memo(function FlipButton({ label, value, side }: { label: string; value: Animated.Value; side: 'left' | 'right' }) {
  const insets = useSafeAreaInsets();
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        st.flipBtn,
        side === 'left' ? { left: insets.left + FLIP_EDGE } : { right: insets.right + FLIP_EDGE },
        { bottom: insets.bottom + 18, opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.62, 1] }), transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [1, 0.92] }) }] },
      ]}
    >
      <Text style={st.flipBtnText}>{label}</Text>
    </Animated.View>
  );
});

// ------------------------------------------------------------------ screen
export default function GameScreen({ levelId }: { levelId: number }) {
  const level = getLevel(levelId);
  const insets = useSafeAreaInsets();
  const settings = getState().save.settings;

  const worldRef = useRef<GameWorld | null>(null);
  const rendererRef = useRef<SceneRenderer | null>(null);
  const perfRef = useRef<Perf>({ fps: 60, physics: 0, draw: 0, worst: 0, target: 60 });
  const pacerRef = useRef<FramePacer | null>(null);
  // starts from the window size so the first frame can be drawn before layout reports back
  const size = useRef({ w: Dimensions.get('window').width, h: Dimensions.get('window').height });
  const controls = useRef({ gas: false, brake: false, keyGas: false, keyBrake: false, front: false, back: false });
  const frontAnim = useRef(new Animated.Value(0)).current;
  const backAnim = useRef(new Animated.Value(0)).current;
  const phaseRef = useRef<Phase>('playing');
  const committed = useRef(false);
  const toast = useRef<ToastHandle>(null);
  const gasAnim = useRef(new Animated.Value(0)).current;
  const brakeAnim = useRef(new Animated.Value(0)).current;
  const picture = useSharedValue<SkPicture>(emptyPicture());

  const [phase, setPhaseState] = useState<Phase>('playing');
  const [outcome, setOutcome] = useState<{ result: RunResult; reward: Reward; canContinue: boolean; canRevive: boolean; continues: number } | null>(null);
  const [doubled, setDoubled] = useState(false);
  const leaving = useRef(false);
  const rewardedReady = useRewardedReady();

  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  /** Bank the run's coins and progress exactly once. */
  const commit = useCallback(() => {
    const w = worldRef.current;
    if (committed.current || !w) return;
    committed.current = true;
    const result = w.result();
    commitSave(recordRun(getState().save, levelId, result).save);
    // the frequency rules count finished runs and completed levels
    AdMobManager.onRunEnded();
    if (result.win) AdMobManager.onLevelCompleted();
  }, [levelId]);

  // ---------------------------------------------------------------- world + loop
  useEffect(() => {
    const save = getState().save;
    const car = paintSpec(getVehicle(save.selectedVehicle), paintOf(save, save.selectedVehicle).sel);
    let endTimer: ReturnType<typeof setTimeout> | null = null;

    const onEvent = (e: GameEvent) => {
      rendererRef.current?.onEvent(e);
      switch (e.type) {
        case 'coin': play('coin', 55); break;
        case 'fuel': play('fuel'); toast.current?.show('+25 FUEL'); break;
        case 'stunt':
          if (e.grade === 'rough' || e.grade === 'crash') {
            play('smash', 90);
            buzz('heavy');
            toast.current?.show(e.text, e.grade === 'crash' ? '#ff6b5a' : '#ffb04a');
          } else {
            play('stunt');
            if (e.grade === 'perfect') play('checkpoint', 120);
            if ((e.multiplier ?? 1) >= 2) play('win', 400);
            if (e.points) buzz('light');
            toast.current?.show(e.text, e.grade === 'perfect' ? C.gold : C.greenHi);
          }
          break;
        case 'damage': if (e.added > 0) buzz('heavy'); break;
        case 'repair': toast.current?.show('CAR REPAIRED', C.greenHi); break;
        case 'km': play('win'); toast.current?.show(`${e.km} KM! +${e.coins}`, C.gold); break;
        case 'checkpoint': play('checkpoint'); buzz('light'); toast.current?.show('CHECKPOINT', C.gold); break;
        case 'land': play('land', 200); if (e.intensity > 0.45) buzz('light'); break;
        case 'splash': play('splash', 300); break;
        case 'smash': play('smash', 90); break;
        case 'rockfall': play('rockfall'); buzz('light'); toast.current?.show('ROCKFALL! WAIT', '#ff8a7a'); break;
        case 'lowFuel': play('lowfuel'); break;
        case 'end':
          stopEngine();
          if (e.reason === 'win') play('win');
          else {
            play('crash');
            buzz('heavy');
          }
          endTimer = setTimeout(showResult, e.reason === 'win' ? 1100 : 1300);
          break;
      }
    };

    const world = new GameWorld(level, car, upgradesOf(save, car.id), onEvent);
    const renderer = new SceneRenderer(world);
    worldRef.current = world;
    rendererRef.current = renderer;
    committed.current = false;

    const devBot = newBot();
    if (__DEV__) {
      // debugging aid (development builds only): step and draw the run by hand
      (globalThis as Record<string, unknown>).__tt = {
        world,
        renderer,
        size: size.current,
        /** let the test driver play n steps */
        drive(n: number) {
          for (let i = 0; i < n && world.state === 'playing'; i++) {
            const c = botControls(world, devBot);
            world.step(c.gas, c.brake, c.front, c.back);
          }
        },
        snapshot(w = 960, h = 540, t = 0): string | undefined {
          renderer.update(16.7, w, h);
          const surface = Skia.Surface.Make(w, h);
          if (!surface) return undefined;
          renderer.draw(surface.getCanvas(), w, h, t);
          surface.flush();
          return surface.makeImageSnapshot().encodeToBase64();
        },
      };
    }

    function showResult() {
      const result = world.result();
      const { reward } = recordRun(getState().save, levelId, result);
      const canContinue = world.canContinue();
      const canRevive = world.canRevive();
      // while the run can still go on (free continue or extra life) nothing is banked yet
      if (!canContinue && !canRevive) commit();
      setOutcome({ result, reward, canContinue, canRevive, continues: world.continuesLeft });
      setPhase('result');
    }

    let raf = 0;
    let acc = 0;
    let alive = true;
    const pacer = new FramePacer(getState().save.settings.frameRate);
    pacerRef.current = pacer;
    perfRef.current.target = pacer.target;
    // Every frame makes a new picture. The last few are released by hand: they hold native
    // memory the JavaScript garbage collector cannot see, so it would let them pile up.
    const old: SkPicture[] = [];
    let shown: SkPicture | null = null; // kept here: reading a shared value back from this thread is slow
    let bounds = Skia.XYWHRect(0, 0, 1, 1);
    let boundsW = 0;
    let boundsH = 0;
    // measurements for the "Show frame rate" line
    let mPhysics = 0;
    let mSteps = 0;
    let mDraw = 0;
    let mFrames = 0;
    let mWorst = 0;
    let mSince = 0;
    const frame = (t: number) => {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      const { w, h } = size.current;
      if (w === 0 || phaseRef.current === 'paused') {
        pacer.resume();
        return;
      }
      const elapsed = pacer.begin(t);
      if (elapsed === 0) return; // not this frame's turn (30 fps mode, or a 90 / 120 Hz screen)
      const dt = Math.min(elapsed, 50);

      const c = controls.current;
      const gas = c.gas || c.keyGas;
      const brake = c.brake || c.keyBrake;
      acc += dt;
      let steps = 0;
      const t0 = performance.now();
      while (acc >= PHYSICS_STEP && steps < MAX_STEPS_PER_FRAME) {
        world.step(gas, brake, c.front, c.back);
        acc -= PHYSICS_STEP;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) acc = 0; // never spiral after a long stall
      const t1 = performance.now();

      if (world.state === 'playing') {
        updateEngine(Math.min(1, Math.abs(world.speed) / 14), gas && world.fuel > 0 ? 1 : 0);
        if (pacer.observe(elapsed)) perfRef.current.target = 30;
      }

      renderer.update(dt, w, h);
      if (w !== boundsW || h !== boundsH) {
        boundsW = w;
        boundsH = h;
        bounds = Skia.XYWHRect(0, 0, w, h);
      }
      const rec = Skia.PictureRecorder();
      renderer.draw(rec.beginRecording(bounds), w, h, t);
      const next = rec.finishRecordingAsPicture();
      if (shown) old.push(shown);
      shown = next;
      picture.value = next;
      // the screen may still be showing the previous two, so only older ones are released
      if (old.length > 3) old.shift()?.dispose();
      const t2 = performance.now();

      mPhysics += t1 - t0;
      mSteps += steps;
      mDraw += t2 - t1;
      mFrames++;
      if (elapsed > mWorst) mWorst = elapsed;
      if (t - mSince >= 500) {
        const p = perfRef.current;
        p.fps = (mFrames * 1000) / Math.max(1, t - mSince);
        p.physics = mSteps ? mPhysics / mSteps : 0;
        p.draw = mDraw / mFrames;
        p.worst = mWorst;
        mPhysics = mSteps = mDraw = mFrames = mWorst = 0;
        mSince = t;
      }
    };
    raf = requestAnimationFrame(frame);
    if (getState().save.settings.sound) startEngine();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      if (endTimer) clearTimeout(endTimer);
      stopEngine();
      commit(); // leaving in any way keeps the coins collected so far
      renderer.dispose();
      world.destroy();
      worldRef.current = null;
      rendererRef.current = null;
      if (__DEV__) delete (globalThis as Record<string, unknown>).__tt;
    };
    // one world per mount: the screen is remounted (keyed) for every new run
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------- ads
  // Ads are only ever requested or shown while the car is NOT being driven.
  useEffect(() => {
    AdMobManager.setGameplayActive(phase === 'playing');
  }, [phase]);
  useEffect(() => () => AdMobManager.setGameplayActive(false), []);

  /** Leave the run: bank it, show an interstitial if the frequency rules allow one, then go. */
  const leave = useCallback(
    async (go: () => void, trigger: InterstitialTrigger | null) => {
      if (leaving.current) return;
      leaving.current = true;
      commit();
      if (trigger) await AdMobManager.maybeShowInterstitial(trigger);
      go();
    },
    [commit],
  );

  const doubleCoins = useCallback(() => {
    const amount = outcome?.reward.total ?? 0;
    watchAdForReward(() => {
      if (doubled || amount <= 0 || !commitSave(grantCoins(getState().save, amount))) return null;
      setDoubled(true);
      return `Reward doubled: +${fmt(amount)} coins`;
    });
  }, [doubled, outcome]);

  const extraLife = useCallback(() => {
    watchAdForReward(() => {
      const w = worldRef.current;
      if (!w || !w.revive()) return null;
      rendererRef.current?.resetCamera();
      setOutcome(null);
      if (getState().save.settings.sound) startEngine();
      setPhase('playing');
      return 'Extra life! Back at the checkpoint';
    });
  }, [setPhase]);

  // ---------------------------------------------------------------- pause / resume / back
  const pause = useCallback(() => {
    if (phaseRef.current !== 'playing' || worldRef.current?.state !== 'playing') return;
    controls.current.gas = controls.current.brake = controls.current.front = controls.current.back = false;
    gasAnim.setValue(0);
    brakeAnim.setValue(0);
    stopEngine();
    setPhase('paused');
  }, [brakeAnim, gasAnim, setPhase]);

  const resume = useCallback(() => {
    if (phaseRef.current !== 'paused') return;
    if (getState().save.settings.sound) startEngine();
    setPhase('playing');
  }, [setPhase]);

  const continueRun = useCallback(() => {
    const w = worldRef.current;
    if (!w || !w.continueFromCheckpoint()) return;
    rendererRef.current?.resetCamera();
    setOutcome(null);
    if (getState().save.settings.sound) startEngine();
    setPhase('playing');
  }, [setPhase]);

  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (phaseRef.current === 'playing') pause();
      else if (phaseRef.current === 'paused') resume();
      else leave(() => navigate({ name: 'levels' }), 'menuReturn');
      return true;
    });
    const app = AppState.addEventListener('change', (state) => {
      if (state !== 'active') pause();
    });
    return () => {
      back.remove();
      app.remove();
    };
  }, [pause, resume, leave]);

  // desktop keys, for the web build
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const GAS = ['ArrowRight', 'ArrowUp', 'd', 'w'];
    const BRAKE = ['ArrowLeft', 'ArrowDown', 'a', 's', ' '];
    const set = (e: KeyboardEvent, down: boolean) => {
      if (GAS.includes(e.key)) controls.current.keyGas = down;
      else if (BRAKE.includes(e.key)) controls.current.keyBrake = down;
      else if (down && (e.key === 'p' || e.key === 'Escape')) (phaseRef.current === 'paused' ? resume : pause)();
      else return;
      e.preventDefault();
    };
    const down = (e: KeyboardEvent) => set(e, true);
    const up = (e: KeyboardEvent) => set(e, false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [pause, resume]);

  // ---------------------------------------------------------------- touch
  // One view reads every finger, so both pedals can be held at once (two
  // separate buttons cannot both hold React Native's touch responder).
  const split = settings.controlMode === 'splitscreen';
  const onTouch = useCallback(
    (e: GestureResponderEvent) => {
      const { w, h } = size.current;
      let gas = false;
      let brake = false;
      let front = false;
      let back = false;
      for (const t of e.nativeEvent.touches) {
        // BACK FLIP sits beside the brake pedal, FRONT FLIP beside the gas pedal
        const inBack = t.pageX > insets.left + FLIP_EDGE - 6 && t.pageX < insets.left + FLIP_EDGE + FLIP_BTN_W + 6;
        const inFront = t.pageX < w - insets.right - FLIP_EDGE + 6 && t.pageX > w - insets.right - FLIP_EDGE - FLIP_BTN_W - 6;
        if (t.pageY > h * 0.45 && inBack) back = true;
        else if (t.pageY > h * 0.45 && inFront) front = true;
        else if (split) {
          if (t.pageX < w / 2) brake = true;
          else gas = true;
        } else if (t.pageY > h * 0.3) {
          if (t.pageX < w * 0.42) brake = true;
          else if (t.pageX > w * 0.58) gas = true;
        }
      }
      const c = controls.current;
      if (phaseRef.current !== 'playing') gas = brake = front = back = false;
      if (c.front !== front) frontAnim.setValue(front ? 1 : 0);
      if (c.back !== back) backAnim.setValue(back ? 1 : 0);
      c.front = front;
      c.back = back;
      if (c.gas !== gas) gasAnim.setValue(gas ? 1 : 0);
      if (c.brake !== brake) brakeAnim.setValue(brake ? 1 : 0);
      c.gas = gas;
      c.brake = brake;
    },
    [brakeAnim, gasAnim, frontAnim, backAnim, split, insets.left, insets.right],
  );

  const mouse =
    Platform.OS === 'web'
      ? {
          onMouseDown: (e: { nativeEvent: { pageX: number } }) => {
            const left = e.nativeEvent.pageX < size.current.w / 2;
            controls.current[left ? 'brake' : 'gas'] = true;
            (left ? brakeAnim : gasAnim).setValue(1);
          },
          onMouseUp: () => {
            controls.current.gas = controls.current.brake = false;
            gasAnim.setValue(0);
            brakeAnim.setValue(0);
          },
        }
      : {};

  const hasNext = levelId < LEVEL_COUNT;
  const o = outcome;
  return (
    <View
      style={st.root}
      onLayout={(e) => {
        size.current.w = e.nativeEvent.layout.width;
        size.current.h = e.nativeEvent.layout.height;
      }}
    >
      {/* opaque: the sky covers every pixel, so Android can use its cheapest surface and skip blending the game with the window behind it */}
      <Canvas style={StyleSheet.absoluteFill} opaque>
        <Picture picture={picture} />
      </Canvas>

      <View collapsable={false} style={StyleSheet.absoluteFill} onTouchStart={onTouch} onTouchMove={onTouch} onTouchEnd={onTouch} onTouchCancel={onTouch} {...(mouse as object)} />

      <HudView worldRef={worldRef} perfRef={perfRef} title={`${level.id}. ${level.name}`} showFps={settings.showFps} />
      <StuntHud worldRef={worldRef} />
      <Toast ref={toast} />
      <Pedal label="BRAKE" value={brakeAnim} side="left" faint={split} />
      <Pedal label="GAS" value={gasAnim} side="right" faint={split} />
      <FlipButton label="BACK FLIP" value={backAnim} side="left" />
      <FlipButton label="FRONT FLIP" value={frontAnim} side="right" />

      <Pressable accessibilityRole="button" accessibilityLabel="Pause" onPress={pause} hitSlop={8} style={[st.pause, { top: insets.top + 8, right: insets.right + 12 }]}>
        <View style={st.pauseBar} />
        <View style={st.pauseBar} />
      </Pressable>

      {phase === 'paused' ? (
        <Panel title="PAUSED" sub={THEMES[level.theme].name}>
          <Btn label="RESUME" onPress={resume} style={st.wide} />
          <Btn label="RESTART" color={C.blue} onPress={() => leave(() => startLevel(levelId), null)} style={st.wide} />
          <Btn label="QUIT" color={C.red} onPress={() => leave(() => navigate({ name: 'levels' }), 'menuReturn')} style={st.wide} />
        </Panel>
      ) : null}

      {phase === 'result' && o ? (
        <Panel wide title={o.result.win ? 'LEVEL COMPLETE' : END_TEXT[o.result.reason]?.title ?? 'CRASHED'} sub={`${level.id}. ${level.name}`}>
          <View style={st.resultRow}>
          <View style={st.resultInfo}>
          {o.result.win ? <Stars n={o.result.stars} size={40} /> : <Text style={st.line}>Progress: {Math.floor(o.result.progress * 100)}%</Text>}
          <Text style={st.line}>
            Coins: {o.result.coins} / {o.result.totalCoins}   (+{fmt(o.reward.coinValue)})
          </Text>
          {o.reward.flipBonus > 0 ? (
            <Text style={[st.line, { color: C.gold }]}>Flip bonus: +{fmt(o.reward.flipBonus)} coins ({o.result.frontFlips + o.result.backFlips} flips)</Text>
          ) : null}
          {o.result.stuntScore > 0 ? (
            <Text style={[st.line, { color: C.gold }]}>
              Stunt score {fmt(o.result.stuntScore)} (front flips {o.result.frontFlips}, back flips {o.result.backFlips})
            </Text>
          ) : null}
          {o.result.stuntBonus > 0 ? <Text style={[st.line, { color: C.greenHi }]}>Stunts and checkpoints: +{fmt(o.result.stuntBonus)} (included)</Text> : null}
          {o.result.win ? <Text style={[st.line, { color: C.greenHi }]}>{o.reward.firstTime ? 'Level bonus' : 'Replay bonus'}: +{fmt(o.reward.bonus)}</Text> : null}
          <Text style={st.total}>{o.result.win ? 'Total earned' : 'Coins kept'}: +{fmt(o.reward.total)}</Text>
          {!o.result.win ? <Text style={st.tip}>{END_TEXT[o.result.reason]?.tip}</Text> : null}
          {o.result.win && o.reward.unlockedNext ? <Text style={st.tip}>Level {levelId + 1} unlocked</Text> : null}
          </View>
          <View style={st.resultBtns}>
          {o.result.win && rewardedReady && !doubled && o.reward.total > 0 ? (
            <Btn label={`DOUBLE IT: +${fmt(o.reward.total)}`} sub="watch a short ad" color={C.orange} onPress={doubleCoins} style={st.wide} />
          ) : null}
          {!o.result.win && o.canRevive && rewardedReady ? (
            <Btn label="EXTRA LIFE" sub="watch a short ad, restart at the checkpoint" color={C.orange} onPress={extraLife} style={st.wide} />
          ) : null}
          <View style={st.btnRow}>
            {o.canContinue ? (
              <Btn label="CONTINUE" sub={`from checkpoint (${o.continues} left)`} onPress={continueRun} style={st.flex} />
            ) : o.result.win && hasNext ? (
              <Btn label="NEXT" onPress={() => leave(() => startLevel(levelId + 1), 'levelComplete')} style={st.flex} />
            ) : null}
            <Btn label="RETRY" color={C.blue} onPress={() => leave(() => startLevel(levelId), null)} style={st.flex} />
          </View>
          <View style={st.btnRow}>
            <Btn label="GARAGE" color={C.grey} small onPress={() => leave(() => navigate({ name: 'garage' }), o.result.win ? 'levelComplete' : 'menuReturn')} style={st.flex} />
            <Btn label="LEVELS" color={C.grey} small onPress={() => leave(() => navigate({ name: 'levels' }), o.result.win ? 'levelComplete' : 'menuReturn')} style={st.flex} />
          </View>
          </View>
          </View>
        </Panel>
      ) : null}
    </View>
  );
}

function emptyPicture(): SkPicture {
  const rec = Skia.PictureRecorder();
  rec.beginRecording(Skia.XYWHRect(0, 0, 1, 1));
  return rec.finishRecordingAsPicture();
}

/** Centre panel with a pop-in animation (pause and results). */
function Panel({ title, sub, children, wide }: { title: string; sub?: string; children: React.ReactNode; wide?: boolean }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(a, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 7 }).start();
  }, [a]);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, st.scrim, { opacity: a }]}>
      <Animated.View style={[st.panel, wide && st.panelWide, { transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) }] }]}>
        <Text style={st.panelTitle}>{title}</Text>
        {sub ? <Text style={st.panelSub}>{sub}</Text> : null}
        {children}
      </Animated.View>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b1217' },
  flex: { flex: 1 },
  wide: { alignSelf: 'stretch', marginTop: 8 },
  hud: { position: 'absolute', flexDirection: 'row' },
  hudLeft: { width: 190 },
  hudMid: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  hudLabel: { color: '#ffffff', fontSize: 11, fontWeight: '900', marginRight: 6, textShadowColor: '#000', textShadowRadius: 3 },
  hudTitle: { color: '#ffffff', fontSize: 14, fontWeight: '800', textShadowColor: '#000', textShadowRadius: 4 },
  hudPerf: { color: '#ffe9a8', fontSize: 11, fontWeight: '700', textShadowColor: '#000', textShadowRadius: 3, marginTop: 2 },
  hudDim: { color: '#e6edf2', fontSize: 12, fontWeight: '700', textShadowColor: '#000', textShadowRadius: 3 },
  fuelBar: { flex: 1, flexDirection: 'row', borderWidth: 2, borderColor: 'rgba(14,26,34,0.85)', borderRadius: 9 },
  progress: { flexDirection: 'row', width: '70%', maxWidth: 320, marginVertical: 4, borderWidth: 2, borderColor: 'rgba(14,26,34,0.85)', borderRadius: 6 },
  toast: { position: 'absolute', top: '24%', left: 0, right: 0, alignItems: 'center' },
  toastText: { fontSize: 22, fontWeight: '900', textShadowColor: '#000', textShadowRadius: 5, textShadowOffset: { width: 0, height: 1 } },
  flipBtn: { position: 'absolute', width: FLIP_BTN_W, height: 92, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#7a4fd6', borderWidth: 3, borderColor: 'rgba(255,255,255,0.5)' },
  flipBtnText: { color: '#fff', fontSize: 12, fontWeight: '900', textAlign: 'center', paddingHorizontal: 4 },
  pedal: { position: 'absolute', width: 132, height: 92, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.5)' },
  pedalText: { color: '#ffffff', fontSize: 21, fontWeight: '900', letterSpacing: 1 },
  pause: { position: 'absolute', width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(14,26,34,0.7)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  pauseBar: { width: 6, height: 18, borderRadius: 2, backgroundColor: '#ffffff', marginHorizontal: 3 },
  scrim: { backgroundColor: 'rgba(5,10,14,0.62)', alignItems: 'center', justifyContent: 'center', padding: 12 },
  panel: { width: '100%', maxWidth: 400, backgroundColor: C.panel, borderRadius: 20, borderWidth: 2, borderColor: C.line, paddingHorizontal: 20, paddingVertical: 14, alignItems: 'center' },
  panelTitle: { color: C.text, fontSize: 24, fontWeight: '900', letterSpacing: 1 },
  panelSub: { color: C.dim, fontSize: 13, fontWeight: '700', marginBottom: 4 },
  line: { color: C.text, fontSize: 15, fontWeight: '700', marginTop: 3 },
  total: { color: C.gold, fontSize: 19, fontWeight: '900', marginTop: 5 },
  tip: { color: C.dim, fontSize: 13, marginTop: 3, textAlign: 'center' },
  btnRow: { flexDirection: 'row', alignSelf: 'stretch', gap: 8, marginTop: 8 },
  panelWide: { maxWidth: 640 },
  resultRow: { flexDirection: 'row', alignSelf: 'stretch', alignItems: 'center', gap: 14 },
  resultInfo: { flex: 1, alignItems: 'center' },
  resultBtns: { width: 250 },
});
