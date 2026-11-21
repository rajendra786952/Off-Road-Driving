// The driving display: telemetry, map, gauges, messages, the loading screen and the pause /
// results panels. It only draws the snapshot the game keeps in its HudBridge.
import React, { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path, Polygon, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { HudBridge, HudMap, HudState, PanelButton } from '../drive/hudBridge';
import { sfx } from '../drive/audio';

const fuelColor = (f: number) => (f < 0.2 ? '#ef4444' : f < 0.4 ? '#f59e0b' : '#10b981');

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={st.barRow}>
      <Text style={st.barLabel}>{label}</Text>
      <View style={st.bar}><View style={{ height: '100%', width: `${Math.max(0, Math.min(1, value)) * 100}%`, backgroundColor: color }} /></View>
    </View>
  );
}

const MiniMap = memo(function MiniMap({ map, s, size }: { map: HudMap; s: HudState; size: number }) {
  return (
    <View style={[st.map, { width: size, height: size, borderRadius: size * 0.12 }]}>
      <Svg width={size} height={size} viewBox="0 0 220 220">
        {map.side ? <Path d={map.side} stroke="rgba(255,255,255,0.45)" strokeWidth={1.5} fill="none" /> : null}
        <Path d={map.main} stroke="rgba(0,0,0,0.6)" strokeWidth={5} fill="none" strokeLinejoin="round" />
        <Path d={map.main} stroke="#ffffff" strokeWidth={2.4} fill="none" strokeLinejoin="round" />
        {map.cps.map(([x, y], i) => (
          <Circle key={i} cx={x} cy={y} r={i === s.cp ? 6 : 4} fill={i < s.cp ? '#10b981' : i === s.cp ? '#ffd23f' : '#64748b'} />
        ))}
        <Rect x={map.finish[0] - 4} y={map.finish[1] - 4} width={8} height={8} fill="#ffffff" stroke="#0f172a" strokeWidth={1.5} />
        {s.found.map(([x, y], i) => (
          <Rect key={i} x={x - 3} y={y - 3} width={6} height={6} fill="#ffd23f" />
        ))}
        <G transform={`translate(${s.carX.toFixed(1)} ${s.carY.toFixed(1)}) rotate(${(-s.carHeading * 57.2958).toFixed(1)})`}>
          <Polygon points="0,0 -14,-26 14,-26" fill="rgba(255,255,200,0.3)" />
          <Polygon points="0,-10 6.5,7.5 0,4 -6.5,7.5" fill="#38bdf8" stroke="#ffffff" strokeWidth={1.8} />
        </G>
      </Svg>
    </View>
  );
});

/** Tilt gauge: an artificial horizon that rolls and pitches with the truck. */
function Inclinometer({ roll, pitch, size }: { roll: number; pitch: number; size: number }) {
  const danger = Math.abs(roll) > 0.42 || Math.abs(pitch) > 0.5;
  const warning = !danger && (Math.abs(roll) > 0.28 || Math.abs(pitch) > 0.35);
  const color = danger ? '#ff4d4f' : warning ? '#ffd23f' : '#34d399';
  const off = Math.max(-0.42, Math.min(0.42, pitch * 0.75)) * size;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: 'rgba(10,20,28,0.88)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: size * 1.6, height: size * 1.6, top: size / 2 + off, transform: [{ translateY: -size * 0.8 }, { rotate: `${-roll}rad` }, { translateY: size * 0.8 }], backgroundColor: 'rgba(110,78,48,0.95)', borderTopWidth: 2, borderTopColor: '#55d0ff' }} />
      <View style={{ width: size * 0.44, height: 2.5, backgroundColor: color }} />
      <View style={{ position: 'absolute', width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ position: 'absolute', bottom: 3, color: '#fff', fontSize: size * 0.13, fontWeight: '800' }}>
        {Math.round(Math.abs(roll) * 57.3)}° | {pitch > 0 ? '+' : ''}{Math.round(pitch * 57.3)}°
      </Text>
    </View>
  );
}

function PanelBtn({ b }: { b: PanelButton }) {
  const bg = b.cls === 'go' ? '#ffb020' : b.cls === 'alt' ? '#2563eb' : b.cls === 'bad' ? '#ef4444' : 'rgba(255,255,255,0.12)';
  return (
    <Pressable onPress={() => { sfx.click(); b.fn(); }} style={({ pressed }) => [st.panelBtn, { backgroundColor: bg, opacity: pressed ? 0.75 : 1 }]}>
      <Text style={[st.panelBtnText, b.cls === 'go' && { color: '#1a1205' }]}>{b.label}</Text>
    </Pressable>
  );
}

export default function DriveHud({ bridge, state: s, height, onQuit }: { bridge: HudBridge; state: HudState; height: number; onQuit(): void }) {
  const ins = useSafeAreaInsets();
  const u = height / 100;
  const cfg = bridge.cfg;
  const mapSize = Math.min(30 * u, 132);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {s.running && !s.loading && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {/* time, checkpoint, distance */}
          <View style={[st.top, { top: Math.max(ins.top, 1.4 * u) }]}>
            <Text style={st.topText}><Text style={st.topBold}>{s.time}</Text>   CP <Text style={st.topBold}>{s.cp}/{s.cpTotal}</Text>   <Text style={st.topBold}>{s.togo}</Text> to go</Text>
            {!cfg.simple && (
              <View style={st.prog}>
                <View style={{ height: '100%', width: `${s.progress * 100}%`, backgroundColor: '#ffb020' }} />
                {s.cpTicks.map((t, i) => <View key={i} style={[st.tick, { left: `${t * 100}%`, backgroundColor: i < s.cp ? '#10b981' : '#fff' }]} />)}
              </View>
            )}
          </View>
          {bridge.map && (
            <View style={{ position: 'absolute', right: Math.max(ins.right, 2 * u), top: Math.max(ins.top, 1.4 * u) }}>
              <MiniMap map={bridge.map} s={s} size={mapSize} />
            </View>
          )}
          {s.toast ? <View style={[st.toast, { top: Math.max(ins.top, 1.4 * u) + 8.5 * u }]}><Text style={st.toastText}>{s.toast}</Text></View> : null}
          {s.warn ? <View style={[st.warn, { top: 30 * u }]}><Text style={st.warnText}>{s.warn}</Text></View> : null}
          {s.coach ? (
            <View style={[st.coach, { top: 44 * u }]}>
              <Text style={st.coachTitle}>{s.coach.title}</Text>
              {s.coach.sub ? <Text style={st.coachSub}>{s.coach.sub}</Text> : null}
            </View>
          ) : null}
          {/* dashboard */}
          <View style={[st.dash, { bottom: Math.max(ins.bottom, 2 * u) }]}>
            {!cfg.simple && <Inclinometer roll={s.roll} pitch={s.pitch} size={Math.min(19 * u, 80)} />}
            <View style={{ alignItems: 'center', minWidth: 62 }}>
              <Text style={st.speed}>{s.speed}</Text>
              <Text style={st.unit}>KM/H</Text>
            </View>
            <View style={{ width: Math.min(34 * u, 150) }}>
              {!cfg.simple && <Bar label="RPM" value={s.rpm} color={s.rpm > 0.92 ? '#ef4444' : s.rpm > 0.72 ? '#ffd23f' : '#10b981'} />}
              <Bar label="FUEL" value={s.fuel} color={fuelColor(s.fuel)} />
              <Bar label="DMG" value={s.damage} color="#ef4444" />
              {cfg.hot && <Bar label="TEMP" value={s.heat} color={s.overheated ? '#ef4444' : s.heat > 0.8 ? '#f97316' : '#f59e0b'} />}
            </View>
            {!cfg.simple && (
              <View>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  <Text style={[st.tag, s.gearKind === 'rev' ? { backgroundColor: '#ef4444' } : s.gearKind === 'low' ? { backgroundColor: '#f59e0b', color: '#1a1205' } : null]}>{s.gear}</Text>
                  <Text style={st.tag}>{s.surface}</Text>
                  {s.locked && <Text style={[st.tag, { backgroundColor: '#ffd23f', color: '#1a1205' }]}>LOCKED</Text>}
                </View>
                <Text style={st.meta}>{s.weather}</Text>
              </View>
            )}
            {s.fps > 0 && <Text style={st.meta}>{s.fps} fps</Text>}
          </View>
        </View>
      )}

      {s.loading && (
        <View style={st.load}>
          <Text style={st.loadText}>{s.loading.text}</Text>
          <View style={st.loadBar}><View style={{ height: '100%', width: `${s.loading.frac * 100}%`, backgroundColor: '#ffb020' }} /></View>
          <Text style={st.loadHint}>Building the terrain. The first load of a track takes the longest.</Text>
        </View>
      )}

      {s.failed && (
        <View style={st.load}>
          <Text style={st.loadText}>This track could not be loaded</Text>
          <Text style={[st.loadHint, { marginBottom: 14 }]}>{s.failed}</Text>
          <PanelBtn b={{ label: 'BACK TO TRACKS', cls: 'go', fn: onQuit }} />
        </View>
      )}

      {s.panel && (
        <View style={st.panelWrap}>
          <View style={[st.card, { maxHeight: height - 16 }]}>
            <Text style={st.panelTitle}>{s.panel.title}</Text>
            <ScrollView style={{ flexGrow: 0 }} showsVerticalScrollIndicator={false}>
              {s.panel.body.map((l, i) =>
                l.stars !== undefined ? (
                  <Text key={i} style={st.stars}>{'★'.repeat(l.stars)}<Text style={{ color: 'rgba(255,255,255,0.25)' }}>{'★'.repeat(Math.max(0, (l.of || 0) - l.stars))}</Text></Text>
                ) : (
                  <Text key={i} style={[st.line, l.small && { fontSize: 11.5 }, l.bold && { fontWeight: '900', fontSize: 15 }, { color: l.color || '#fff' }]}>{l.text}</Text>
                ),
              )}
            </ScrollView>
            <View style={st.panelRow}>
              {s.panel.buttons.map((b) => <PanelBtn key={b.label} b={b} />)}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  top: { position: 'absolute', alignSelf: 'center', alignItems: 'center', backgroundColor: 'rgba(8,16,22,0.55)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5 },
  topText: { color: '#cfdbe3', fontSize: 12.5, fontWeight: '600' },
  topBold: { color: '#fff', fontWeight: '900', fontSize: 14 },
  prog: { width: 200, height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, marginTop: 4, overflow: 'hidden' },
  tick: { position: 'absolute', top: 0, width: 2, height: 4 },
  map: { backgroundColor: 'rgba(8,16,22,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' },
  toast: { position: 'absolute', alignSelf: 'center', maxWidth: '62%', backgroundColor: 'rgba(8,16,22,0.78)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(255,176,32,0.6)' },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  warn: { position: 'absolute', alignSelf: 'center', backgroundColor: 'rgba(160,20,20,0.82)', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  warnText: { color: '#fff', fontSize: 15, fontWeight: '900', textAlign: 'center', letterSpacing: 0.5 },
  coach: { position: 'absolute', alignSelf: 'center', maxWidth: '58%', backgroundColor: 'rgba(15,40,70,0.88)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 9, borderWidth: 1, borderColor: '#38bdf8' },
  coachTitle: { color: '#fff', fontSize: 15, fontWeight: '900', textAlign: 'center' },
  coachSub: { color: '#cfe6f5', fontSize: 12, textAlign: 'center', marginTop: 3 },
  dash: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(8,16,22,0.55)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  speed: { color: '#fff', fontSize: 30, fontWeight: '900', lineHeight: 32 },
  unit: { color: '#9fb3c0', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  barRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 1.5 },
  barLabel: { color: '#9fb3c0', fontSize: 8.5, fontWeight: '800', width: 32 },
  bar: { flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 3, overflow: 'hidden' },
  tag: { color: '#fff', fontSize: 10.5, fontWeight: '900', backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  meta: { color: '#cfdbe3', fontSize: 10.5, marginTop: 3, fontWeight: '600' },
  load: { ...StyleSheet.absoluteFill, backgroundColor: '#0b1217', alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadText: { color: '#fff', fontSize: 18, fontWeight: '900', marginBottom: 12 },
  loadBar: { width: '55%', height: 8, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 4, overflow: 'hidden' },
  loadHint: { color: '#9fb3c0', fontSize: 12, marginTop: 10, textAlign: 'center' },
  panelWrap: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 8 },
  card: { width: '78%', maxWidth: 620, backgroundColor: 'rgba(14,22,29,0.97)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', padding: 14 },
  panelTitle: { color: '#fff', fontSize: 20, fontWeight: '900', textAlign: 'center', marginBottom: 6, letterSpacing: 1 },
  stars: { color: '#ffd23f', fontSize: 24, textAlign: 'center', marginBottom: 2 },
  line: { color: '#fff', fontSize: 13, textAlign: 'center', marginVertical: 1.5, fontWeight: '600' },
  panelRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 7, marginTop: 10 },
  panelBtn: { minHeight: 40, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  panelBtnText: { color: '#fff', fontWeight: '900', fontSize: 12.5, letterSpacing: 0.4 },
});
