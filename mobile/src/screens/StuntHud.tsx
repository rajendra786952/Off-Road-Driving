// Stunt readouts on the driving screen: flip counters, stunt score, combo multiplier,
// damage, an air-time readout while the car is airborne and a badge for the last
// landing. Quiet until a stunt happens, and refreshed ten times a second (never per frame).
import React, { memo, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { GameWorld } from '../core/world';
import { Bar, C, fmt, s as ks } from '../ui/kit';

interface StuntView {
  air: number;
  flips: number;
  dir: 'FRONT' | 'BACK' | '';
  prog: number;
  points: number;
  front: number;
  back: number;
  mult: number;
  damage: number;
  badge: '' | 'PERFECT' | 'GOOD' | 'ROUGH' | 'BAD LANDING';
}

const BADGE_COLOR: Record<string, string> = { PERFECT: '#ffd23f', GOOD: '#8dff9b', ROUGH: '#ffb04a', 'BAD LANDING': '#ff6b5a' };

const same = (p: StuntView, n: StuntView) =>
  p.air === n.air && p.flips === n.flips && p.dir === n.dir && p.prog === n.prog && p.points === n.points && p.front === n.front &&
  p.back === n.back && p.mult === n.mult && p.damage === n.damage && p.badge === n.badge;

export function readStunts(w: GameWorld): StuntView {
  const t = w.stunts;
  const air = t.airSteps >= 12 ? Math.round(t.airTime * 10) / 10 : 0;
  const dir = air && Math.abs(t.rotation) > 1.2 ? (t.liveDir === 'front' ? 'FRONT' : 'BACK') : '';
  const l = t.lastLanding;
  const badge = l && t.lastLandingAge < 80 ? (l.grade === 'perfect' ? 'PERFECT' : l.grade === 'good' ? 'GOOD' : l.grade === 'rough' ? 'ROUGH' : 'BAD LANDING') : '';
  return {
    air,
    flips: air ? t.liveFlips : 0,
    dir,
    prog: air ? Math.round(t.liveProgress * 20) / 20 : 0,
    points: t.points,
    front: t.frontFlips,
    back: t.backFlips,
    mult: t.multiplier,
    damage: Math.round(t.damage / 5) * 5,
    badge,
  };
}

export const StuntHud = memo(function StuntHud({ worldRef }: { worldRef: React.RefObject<GameWorld | null> }) {
  const insets = useSafeAreaInsets();
  const [v, setV] = useState<StuntView>({ air: 0, flips: 0, dir: '', prog: 0, points: 0, front: 0, back: 0, mult: 1, damage: 0, badge: '' });
  useEffect(() => {
    const id = setInterval(() => {
      const w = worldRef.current;
      if (!w) return;
      const next = readStunts(w);
      setV((p) => (same(p, next) ? p : next));
    }, 100);
    return () => clearInterval(id);
  }, [worldRef]);

  const dmgColor = v.damage < 35 ? '#f0b429' : v.damage < 70 ? '#f2742b' : '#e0463c';
  return (
    <>
      <View pointerEvents="none" style={[st.box, { top: insets.top + 58, left: insets.left + 12 }]}>
        {v.damage > 0 ? (
          <View style={ks.row}>
            <Text style={st.label}>DAMAGE</Text>
            <View style={st.dmgBar}>
              <Bar value={v.damage / 100} color={dmgColor} height={10} />
            </View>
          </View>
        ) : null}
        {v.points > 0 ? (
          <View style={[ks.row, { marginTop: 4 }]}>
            <Text style={st.score}>{fmt(v.points)} pts</Text>
            <Text style={st.count}>  F {v.front}  B {v.back}</Text>
            {v.mult > 1 ? <Text style={st.mult}>  x{v.mult.toFixed(1)}</Text> : null}
          </View>
        ) : null}
      </View>
      {v.air > 0 || v.badge ? (
        <View pointerEvents="none" style={st.airBox}>
          {v.air > 0 ? <Text style={st.airText}>AIR {v.air.toFixed(1)}s</Text> : null}
          {v.dir ? (
            <>
              <Text style={st.flipText}>
                {v.dir} FLIP{v.flips > 0 ? ' x' + v.flips : ''}
              </Text>
              <View style={st.flipBar}>
                <Bar value={v.prog} color={C.gold} height={6} />
              </View>
            </>
          ) : null}
          {v.air === 0 && v.badge ? <Text style={[st.badgeText, { color: BADGE_COLOR[v.badge] }]}>{v.badge}</Text> : null}
        </View>
      ) : null}
    </>
  );
});

const shadow = { textShadowColor: '#000', textShadowRadius: 4 } as const;
const st = StyleSheet.create({
  box: { position: 'absolute' },
  label: { color: '#ffffff', fontSize: 11, fontWeight: '900', marginRight: 6, ...shadow },
  dmgBar: { width: 110 },
  score: { color: '#ffd23f', fontSize: 15, fontWeight: '900', ...shadow },
  count: { color: '#e6edf2', fontSize: 12, fontWeight: '800', ...shadow },
  mult: { color: '#8dff9b', fontSize: 14, fontWeight: '900', ...shadow },
  airBox: { position: 'absolute', top: '40%', left: 0, right: 0, alignItems: 'center' },
  airText: { color: '#ffffff', fontSize: 15, fontWeight: '800', ...shadow },
  flipText: { color: '#ffd23f', fontSize: 20, fontWeight: '900', marginTop: 2, ...shadow },
  flipBar: { width: 120, marginTop: 4 },
  badgeText: { fontSize: 24, fontWeight: '900', textShadowColor: '#000', textShadowRadius: 6 },
});
