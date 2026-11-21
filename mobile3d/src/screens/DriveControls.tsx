// Touch controls for the drive. One full-screen view receives every finger and decides which
// control it is on, so steering, throttle and a button can be held at the same time (React
// Native's own pressables only track one). A finger that lands on no control looks around.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { Accelerometer } from 'expo-sensors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { HudBridge, HudState } from '../drive/hudBridge';

interface Game {
  lookStart(x: number): void;
  lookMove(x: number): void;
  lookEnd(): void;
}

type Id = 'steerL' | 'steerR' | 'slider' | 'gas' | 'brake' | 'hand' | 'low' | 'lock' | 'winch' | 'pause' | 'camera' | 'recover';
interface Rect { id: Id; x: number; y: number; w: number; h: number; label: string; sub?: string }

/** Control rectangles for a screen of w x h points (u = 1% of the height, like the original layout). */
function layout(w: number, h: number, steerMode: string, inset: { l: number; r: number; t: number; b: number }): Rect[] {
  const u = h / 100;
  const L = inset.l + 3 * u, R = w - inset.r - 3 * u, B = h - Math.max(inset.b, 3 * u), T = Math.max(inset.t, 1.4 * u);
  const out: Rect[] = [];
  if (steerMode === 'slider') out.push({ id: 'slider', x: L, y: B - 17 * u, w: 40 * u, h: 17 * u, label: '' });
  else {
    out.push({ id: 'steerL', x: L, y: B - 19 * u, w: 19 * u, h: 19 * u, label: '‹' });
    out.push({ id: 'steerR', x: L + 21 * u, y: B - 19 * u, w: 19 * u, h: 19 * u, label: '›' });
  }
  out.push({ id: 'gas', x: R - 18 * u, y: B - 34 * u, w: 18 * u, h: 34 * u, label: 'GAS' });
  out.push({ id: 'brake', x: R - 38 * u, y: B - 22 * u, w: 18 * u, h: 22 * u, label: 'BRAKE', sub: '/ REV' });
  out.push({ id: 'hand', x: L, y: B - 31 * u, w: 12.5 * u, h: 10 * u, label: 'HAND', sub: 'BRAKE' });
  out.push({ id: 'low', x: L + 13.7 * u, y: B - 31 * u, w: 12.5 * u, h: 10 * u, label: '4L', sub: 'LOW' });
  out.push({ id: 'lock', x: L + 27.4 * u, y: B - 31 * u, w: 12.5 * u, h: 10 * u, label: 'DIFF', sub: 'LOCK' });
  out.push({ id: 'winch', x: R - 38 * u, y: B - 34 * u, w: 18 * u, h: 10 * u, label: 'WINCH' });
  out.push({ id: 'pause', x: L - 1.6 * u, y: T, w: 10 * u, h: 9 * u, label: 'II' });
  out.push({ id: 'camera', x: L + 9.6 * u, y: T, w: 12 * u, h: 9 * u, label: 'CAM' });
  out.push({ id: 'recover', x: L + 22.8 * u, y: T, w: 14 * u, h: 9 * u, label: 'RESET' });
  return out;
}

export default function DriveControls({ bridge, game, state, width, height }: { bridge: HudBridge; game: React.RefObject<Game | null>; state: HudState; width: number; height: number }) {
  const ins = useSafeAreaInsets();
  const steerMode = bridge.cfg.steerMode;
  const rects = useMemo(() => layout(width, height, steerMode, { l: ins.left, r: ins.right, t: ins.top, b: ins.bottom }), [width, height, steerMode, ins.left, ins.right, ins.top, ins.bottom]);
  const touches = useRef(new Map<string, Id | 'look'>());
  const [down, setDown] = useState<Partial<Record<Id, boolean>>>({});
  const [gas, setGas] = useState(0);
  const [knob, setKnob] = useState(0);

  // tilt steering: roll the phone like a wheel
  useEffect(() => {
    if (steerMode !== 'tilt') return;
    Accelerometer.setUpdateInterval(33);
    const sub = Accelerometer.addListener(({ x, y }) => {
      // landscape: gravity moves along the phone's long axis (y) as it is rolled
      const roll = Math.atan2(y, Math.abs(x) + 0.3) * 57.3;
      const v = Math.max(-1, Math.min(1, roll / 24));
      bridge.input.steerA = Math.abs(v) < 0.05 ? 0 : v;
    });
    return () => {
      sub.remove();
      bridge.input.steerA = 0;
    };
  }, [steerMode, bridge]);

  const hit = (x: number, y: number): Rect | null => {
    for (const r of rects) if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
    return null;
  };
  const setGasFrom = (r: Rect, y: number) => {
    const t = 1 - (y - r.y) / r.h;
    const v = Math.max(0.3, Math.min(1, 0.25 + t));
    bridge.input.gas = v;
    setGas(v);
  };
  const setSlider = (r: Rect, x: number) => {
    const v = Math.max(-1, Math.min(1, ((x - r.x) / r.w - 0.5) * 2.3));
    const a = Math.abs(v) < 0.06 ? 0 : Math.sign(v) * Math.pow((Math.abs(v) - 0.06) / 0.94, 1.35);
    bridge.input.steerA = -a;
    setKnob(v);
  };
  const press = (id: Id, on: boolean) => setDown((d) => (!!d[id] === on ? d : { ...d, [id]: on }));

  const onStart = (e: GestureResponderEvent) => {
    for (const t of e.nativeEvent.changedTouches) {
      const key = String(t.identifier);
      const r = hit(t.pageX, t.pageY);
      if (!r) {
        touches.current.set(key, 'look');
        game.current?.lookStart(t.pageX);
        continue;
      }
      touches.current.set(key, r.id);
      press(r.id, true);
      const i = bridge.input;
      switch (r.id) {
        case 'steerL': i.steerL = 1; break;
        case 'steerR': i.steerR = 1; break;
        case 'slider': setSlider(r, t.pageX); break;
        case 'gas': setGasFrom(r, t.pageY); break;
        case 'brake': i.brake = 1; break;
        case 'hand': i.hand = true; break;
        case 'winch': i.winch = true; break;
        case 'low': bridge.toggle('low'); break;
        case 'lock': bridge.toggle('lock'); break;
        case 'pause': bridge.fire('pause'); break;
        case 'camera': bridge.fire('camera'); break;
        case 'recover': bridge.fire('recover'); break;
      }
    }
  };
  const onMove = (e: GestureResponderEvent) => {
    for (const t of e.nativeEvent.changedTouches) {
      const id = touches.current.get(String(t.identifier));
      if (id === 'look') game.current?.lookMove(t.pageX);
      else if (id === 'gas' || id === 'slider') {
        const r = rects.find((x) => x.id === id);
        if (r) (id === 'gas' ? setGasFrom(r, t.pageY) : setSlider(r, t.pageX));
      }
    }
  };
  const onEnd = (e: GestureResponderEvent) => {
    for (const t of e.nativeEvent.changedTouches) {
      const key = String(t.identifier);
      const id = touches.current.get(key);
      touches.current.delete(key);
      if (!id) continue;
      if (id === 'look') { game.current?.lookEnd(); continue; }
      press(id, false);
      const i = bridge.input;
      switch (id) {
        case 'steerL': i.steerL = 0; break;
        case 'steerR': i.steerR = 0; break;
        case 'slider': i.steerA = 0; setKnob(0); break;
        case 'gas': i.gas = 0; setGas(0); break;
        case 'brake': i.brake = 0; break;
        case 'hand': i.hand = false; break;
        case 'winch': i.winch = false; break;
      }
    }
  };

  // leaving the screen (pause panel, results) must never leave a pedal stuck down
  useEffect(() => () => { Object.assign(bridge.input, { gas: 0, brake: 0, steerL: 0, steerR: 0, steerA: 0, hand: false, winch: false }); }, [bridge]);

  const u = height / 100;
  return (
    <View style={StyleSheet.absoluteFill} onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} onTouchCancel={onEnd}>
      {rects.map((r) => {
        const on = r.id === 'low' ? state.low : r.id === 'lock' ? state.lock : r.id === 'winch' ? state.winchReady : false;
        const off = (r.id === 'lock' && !bridge.cfg.difflock) || (r.id === 'winch' && !bridge.cfg.winch);
        const pedal = r.id === 'gas' || r.id === 'brake';
        const steer = r.id === 'steerL' || r.id === 'steerR';
        const top = r.id === 'pause' || r.id === 'camera' || r.id === 'recover';
        return (
          <View
            key={r.id}
            pointerEvents="none"
            style={[
              st.btn,
              { left: r.x, top: r.y, width: r.w, height: r.h, borderRadius: pedal ? 2.6 * u : steer ? 4 * u : 2 * u },
              r.id === 'gas' && { borderColor: 'rgba(52,211,153,0.7)' },
              r.id === 'brake' && { borderColor: 'rgba(239,68,68,0.7)' },
              on && { borderColor: '#ffd23f', backgroundColor: 'rgba(255,210,63,0.28)' },
              down[r.id] && { backgroundColor: 'rgba(255,255,255,0.3)' },
              off && { opacity: 0.35 },
              steerMode === 'tilt' && steer && { opacity: 0.45 },
            ]}
          >
            {r.id === 'gas' && <View style={[st.fill, { height: `${gas * 100}%` }]} />}
            {r.id === 'slider' ? (
              <View style={[st.knob, { width: 9 * u, height: 9 * u, borderRadius: 4.5 * u, transform: [{ translateX: knob * r.w * 0.33 }] }]} />
            ) : (
              <>
                <Text style={[st.label, { fontSize: steer ? 9 * u : pedal ? 3.6 * u : top ? 3 * u : 3.1 * u }]}>{r.label}</Text>
                {r.sub ? <Text style={[st.label, { fontSize: 2.5 * u, opacity: 0.8 }]}>{r.sub}</Text> : null}
              </>
            )}
          </View>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  btn: { position: 'absolute', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,16,22,0.42)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  label: { color: '#fff', fontWeight: '900', letterSpacing: 0.5, textAlign: 'center' },
  fill: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(52,211,153,0.35)' },
  knob: { backgroundColor: 'rgba(255,255,255,0.85)' },
});
