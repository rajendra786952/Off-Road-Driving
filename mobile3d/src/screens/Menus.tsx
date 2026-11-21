// The menus: home, regions, tracks, garage, profile, achievements and settings.
// Same screens and rules as the browser version's React interface, rebuilt with React Native views.
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import GaragePreview from '../ui/GaragePreview';
import Backdrop from '../ui/Backdrop';
import { Btn, C, Item, Pill, Screen, Stars, coins, s as ks } from '../ui/kit';
import { act, type Save } from '../state/save';
import { sfx } from '../drive/audio';
import { vibrate } from '../platform/haptics';
import { REGIONS } from '../drive/tracks/regions.js';
import { TRACK_META } from '../drive/tracks/meta.js';
import { WEATHER, TIRES } from '../drive/core/surfaces.js';
import { DIFFICULTY, fmtTime } from '../drive/core/session.js';
import { isTrackUnlocked, isRegionUnlocked, regionProgress, ACHIEVEMENTS, dailyChallenge, UNLOCK_ALL_TRACKS } from '../drive/core/progress.js';
import { UPGRADE_INFO, GEAR_INFO, buildParams } from '../drive/core/specs.js';
import { VEHICLES, PAINTS } from '../game/config/vehicles.js';
import { MAX_UPGRADE, UPGRADE_KEYS, GEAR_KEYS, TIRE_IDS, upgradeCost } from '../game/core/saveModel.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Meta = (typeof TRACK_META)[number] & { env?: string; hours?: number[]; time?: string; weatherPlan?: [number, string][] };
const TRACKS = TRACK_META as Meta[];
const REG = REGIONS as { id: string; n: number; name: string; level: string; color: string; desc: string; open?: boolean }[];
const DIFF = DIFFICULTY as Record<string, { id: string; name: string; desc: string; reward: number }>;
const W = WEATHER as Record<string, { name: string }>;
const TI = TIRES as Record<string, { name: string; desc: string; price: number }>;

export interface Nav {
  go(name: string, params?: Record<string, string>): void;
  back(): void;
  save: Save;
  params: Record<string, string>;
  onDrive(trackId: string, difficulty?: string, testVehicle?: string, extra?: { resume?: boolean }): void;
}

const clock = (h: number) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
const HOURS: Record<string, number> = { morning: 8, day: 13, dusk: 18.2, night: 23 };
const whenLabel = (t: Meta) => (t.hours ? `${clock(t.hours[0])} → ${clock(t.hours[1])}` : t.time ? t.time[0].toUpperCase() + t.time.slice(1) : 'Day');
const weatherLabel = (t: Meta) => (t.weatherPlan ? t.weatherPlan.map((p) => W[p[1]].name).join(' → ') : W[t.weather].name);
const endsAtNight = (t: Meta) => (t.hours ? t.hours[1] : HOURS[t.time || 'day'] || 13) >= 19.4;
const MEDAL = ['', 'Bronze', 'Silver', 'Gold'];
const MEDAL_COLOR = ['', '#cd7f32', '#c0c8d0', '#ffd23f'];
const diffOf = (id: string) => DIFF[id] || DIFF.standard;
const open = (save: Save, id: string) => UNLOCK_ALL_TRACKS || isTrackUnlocked(save as any, id);
const regionArt = (id: string) => (id === 'tour' || id === 'coast' ? id : id);
const pad2 = (n: number) => String(n).padStart(2, '0');

function nextTrack(save: Save): Meta {
  return TRACKS.find((t) => !save.tracks[t.id]?.done && open(save, t.id)) || TRACKS[TRACKS.length - 1];
}

// ------------------------------------------------------------------- home
function Cta({ small, title, sub, onPress }: { small?: string; title: string; sub: string; onPress(): void }) {
  return (
    <Pressable onPress={() => { sfx.go(); onPress(); }} style={({ pressed }) => [st.cta, pressed && { opacity: 0.8 }]}>
      {small ? <Text style={st.ctaSmall}>{small}</Text> : null}
      <Text style={st.ctaTitle} numberOfLines={1}>{title}</Text>
      <Text style={st.ctaSub} numberOfLines={1}>{sub}</Text>
    </Pressable>
  );
}
function Tile({ title, sub, onPress }: { title: string; sub: string; onPress(): void }) {
  return (
    <Pressable onPress={() => { sfx.click(); onPress(); }} style={({ pressed }) => [st.tile, pressed && { opacity: 0.75 }]}>
      <Text style={st.tileTitle} numberOfLines={1}>{title}</Text>
      <Text style={st.tileSub} numberOfLines={1}>{sub}</Text>
    </Pressable>
  );
}

export function Home({ go, save, onDrive }: Nav) {
  const nt = nextTrack(save);
  const rs = save.resume && TRACKS.find((t) => t.id === save.resume!.trackId) ? save.resume : null;
  const rsMeta = rs && TRACKS.find((t) => t.id === rs.trackId);
  const dc = dailyChallenge(save as any);
  const dcMeta = TRACKS.find((t) => t.id === dc.trackId)!;
  const region = REG.find((r) => r.id === nt.region)!;
  const done = TRACKS.filter((t) => save.tracks[t.id]?.done).length;
  const veh = save.selectedVehicle;
  return (
    <Screen title="" save={save} region={regionArt(nt.env || region.id)} dim={0.5}>
      <View style={{ flex: 1, flexDirection: 'row', gap: 12 }}>
        <ScrollView style={{ flex: 1.15 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 6 }}>
          <Text style={st.logo}>OFFROAD <Text style={{ color: C.amber }}>RACING 4x4</Text></Text>
          <Text style={st.tag}>Eight regions. Forty expeditions. Five open tours. One coast run.</Text>
          {rs && rsMeta && (
            <Cta small="RESUME YOUR RUN" title={rsMeta.name} sub={`From checkpoint ${rs.cp} · ${DIFF[rs.difficulty]?.name || 'Standard'}`} onPress={() => onDrive(rs.trackId, rs.difficulty, undefined, { resume: true })} />
          )}
          <Cta
            small={done === 0 ? 'START EXPEDITION' : done >= TRACKS.length ? 'REPLAY' : 'CONTINUE EXPEDITION'}
            title={nt.name}
            sub={`${region.name} · Track ${TRACKS.indexOf(nt) + 1} of ${TRACKS.length}`}
            onPress={() => go('tracks', { region: region.id, track: nt.id })}
          />
          <View style={st.tiles}>
            <Tile title="Expedition" sub={`${done}/${TRACKS.length} tracks`} onPress={() => go('regions')} />
            <Tile title="Daily challenge" sub={dc.done ? 'Done - back tomorrow' : `${dcMeta.name} · +${coins(dc.bonus)}`} onPress={() => go('tracks', { region: dcMeta.region, track: dc.trackId })} />
            <Tile title="Garage" sub="Upgrades & tyres" onPress={() => go('garage')} />
            <Tile title="Profile" sub={`${(save.stats.distance / 1000).toFixed(1)} km driven`} onPress={() => go('profile')} />
            <Tile title="Achievements" sub={`${Object.keys(save.achievements).length}/${ACHIEVEMENTS.length}`} onPress={() => go('achievements')} />
            <Tile title="Settings" sub="Graphics & controls" onPress={() => go('settings')} />
          </View>
        </ScrollView>
        <View style={{ flex: 1 }}>
          <GaragePreview vehicleId={veh} ups={save.upgrades[veh]} gear={save.gear[veh]} tire={save.tires[veh].sel} paint={save.paint[veh].sel} />
          <View style={st.vehTag} pointerEvents="none"><Text style={st.vehTagText}>{VEHICLES.find((v) => v.id === veh)!.name}</Text></View>
        </View>
      </View>
    </Screen>
  );
}

// ---------------------------------------------------------------- regions
export function Regions({ go, back, save }: Nav) {
  return (
    <Screen title="Choose a region" onBack={back} save={save} region="rocky" dim={0.78}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 8 }}>
        {REG.map((r, i) => {
          const isOpen = UNLOCK_ALL_TRACKS || isRegionUnlocked(save as any, r.id);
          const pr = regionProgress(save as any, r.id);
          return (
            <Pressable
              key={r.id}
              onPress={() => { if (!isOpen) { sfx.deny(); return; } sfx.click(); go('tracks', { region: r.id }); }}
              style={({ pressed }) => [st.regionCard, { borderColor: isOpen ? r.color : C.line }, pressed && { opacity: 0.85 }]}
            >
              <Backdrop region={regionArt(r.id)} dim={isOpen ? 0.25 : 0.75} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={st.num}>{pad2(r.n)}</Text>
                <Text style={[st.badge, { backgroundColor: r.color }]}>{r.level}</Text>
              </View>
              <View style={st.regionBody}>
                <Text style={ks.h2}>{r.name}</Text>
                <Text style={[ks.p, { color: '#d6e0e6', marginTop: 3 }]} numberOfLines={4}>{r.desc}</Text>
                {isOpen ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                    <View style={st.bar}><View style={{ height: 5, backgroundColor: r.color, width: `${(pr.done / pr.total) * 100}%` }} /></View>
                    <Text style={[ks.small, { marginLeft: 8, color: C.text }]}>{pr.done}/{pr.total} tracks</Text>
                  </View>
                ) : (
                  <Text style={[ks.small, { marginTop: 8, color: C.gold }]}>Locked · finish {REG[i - 1].name}</Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

// ----------------------------------------------------------------- tracks
function Chip({ label, value, wide, color }: { label: string; value: string; wide?: boolean; color?: string }) {
  return (
    <View style={[st.chip, wide && { flexBasis: '100%' }, color ? { borderColor: color } : null]}>
      <Text style={st.chipLabel}>{label}</Text>
      <Text style={st.chipValue}>{value}</Text>
    </View>
  );
}

export function Tracks({ go, back, save, params, onDrive }: Nav) {
  const region = REG.find((r) => r.id === params.region) || REG[0];
  const list = TRACKS.filter((t) => t.region === region.id);
  const firstOpen = list.find((t) => !save.tracks[t.id]?.done && open(save, t.id)) || list[0];
  const [sel, setSel] = useState(params.track && list.find((t) => t.id === params.track) ? params.track : firstOpen.id);
  const [diff, setDiff] = useState(diffOf(save.settings.difficulty).id);
  const dc = dailyChallenge(save as any);
  const t = list.find((x) => x.id === sel) || list[0];
  const isOpen = open(save, t.id);
  const rec = save.tracks[t.id];
  const n = TRACKS.indexOf(t) + 1;
  const veh = VEHICLES.find((v) => v.id === save.selectedVehicle)!;
  const objTotal = 5;
  const rs = save.resume && save.resume.trackId === t.id ? save.resume : null;
  const isDaily = dc.trackId === t.id && !dc.done;
  return (
    <Screen title={region.name} onBack={back} save={save} region={regionArt(t.env || region.id)} dim={0.72} right={<Btn kind="ghost" label="Garage" onPress={() => go('garage')} />}>
      <View style={{ flex: 1, flexDirection: 'row', gap: 10 }}>
        <ScrollView style={{ flex: 0.8 }} showsVerticalScrollIndicator={false}>
          {list.map((x) => {
            const o = open(save, x.id);
            const r = save.tracks[x.id];
            return (
              <Pressable key={x.id} onPress={() => { sfx.click(); setSel(x.id); }} style={[st.trackRow, x.id === sel && { borderColor: region.color, backgroundColor: 'rgba(255,255,255,0.12)' }, !o && { opacity: 0.55 }]}>
                <Text style={st.numSmall}>{pad2(TRACKS.indexOf(x) + 1)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={st.trackName} numberOfLines={1}>{x.name}</Text>
                  <Text style={ks.small} numberOfLines={1}>{o ? `${weatherLabel(x)} · ${whenLabel(x)}` : 'Locked'}</Text>
                </View>
                {!o ? <Text style={ks.small}>LOCKED</Text> : r?.done ? (
                  <View style={{ alignItems: 'flex-end' }}><Stars n={r.stars} of={objTotal} /><Text style={ks.small}>{fmtTime(r.bestTime)}</Text></View>
                ) : <Text style={{ color: C.amber, fontWeight: '900', fontSize: 11 }}>NEW</Text>}
              </Pressable>
            );
          })}
        </ScrollView>
        <ScrollView style={[ks.card, { flex: 1.2 }]} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[st.num, { fontSize: 30, marginRight: 10, color: region.color }]}>{pad2(n)}</Text>
            <View style={{ flex: 1 }}>
              <Text style={ks.h2}>{t.name}</Text>
              <Text style={ks.p}>{t.blurb}</Text>
            </View>
          </View>
          <View style={st.chips}>
            <Chip label="Weather" value={weatherLabel(t)} />
            <Chip label="Time of day" value={whenLabel(t) + (endsAtNight(t) ? ' (night)' : '')} />
            <Chip label="Gold time" value={fmtTime(t.par.gold)} />
            <Chip label="Reward" value={coins(t.reward * diffOf(diff).reward)} />
            {isDaily && <Chip wide color={C.gold} label="Daily challenge" value={`Finish today for +${coins(dc.bonus)}`} />}
            <Chip wide label="Recommended" value={t.rec} />
            <Chip wide label="Your truck" value={`${veh.name} · ${TI[save.tires[veh.id].sel].name}`} />
          </View>
          {rec?.done && (
            <View style={st.record}>
              <Text style={{ color: C.text, fontWeight: '900', fontSize: 13 }}>Best {fmtTime(rec.bestTime)}</Text>
              {rec.medal ? <Text style={{ color: MEDAL_COLOR[rec.medal], fontWeight: '900', fontSize: 12 }}>{MEDAL[rec.medal]}</Text> : null}
              <Stars n={rec.stars} of={objTotal} />
              <Text style={ks.small}>Caches {rec.caches.filter(Boolean).length}/{rec.caches.length} · Relics {(rec.relics || []).filter(Boolean).length}/3{rec.diff ? ` · ${diffOf(rec.diff).name}` : ''}{save.ghosts[t.id] ? ' · your ghost races you' : ''}</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
            {Object.values(DIFF).map((d) => (
              <Pressable key={d.id} onPress={() => { sfx.click(); setDiff(d.id); act((S) => S.setSetting('difficulty', d.id)); }} style={[st.diff, diff === d.id && { borderColor: C.amber, backgroundColor: 'rgba(255,176,32,0.16)' }]}>
                <Text style={{ color: C.text, fontWeight: '900', fontSize: 12.5 }}>{d.name}</Text>
                <Text style={ks.small}>x{d.reward} rewards</Text>
              </Pressable>
            ))}
          </View>
          <Text style={[ks.small, { marginVertical: 6 }]}>{diffOf(diff).desc}</Text>
          {isOpen && rs && <Cta title="RESUME" sub={`From checkpoint ${rs.cp} · ${DIFF[rs.difficulty]?.name || 'Standard'}`} onPress={() => onDrive(t.id, rs.difficulty, undefined, { resume: true })} />}
          {isOpen ? (
            <Cta title={rs ? 'START OVER' : rec?.done ? 'DRIVE AGAIN' : 'START'} sub="8-15 minutes · every checkpoint saves your run" onPress={() => onDrive(t.id, diff)} />
          ) : (
            <Text style={[ks.p, { color: C.gold }]}>Locked. Finish “{TRACKS[n - 2]?.name}” to unlock this track.</Text>
          )}
        </ScrollView>
      </View>
    </Screen>
  );
}

// ----------------------------------------------------------------- garage
export function Garage({ back, save, params, onDrive }: Nav) {
  const [idx, setIdx] = useState(Math.max(0, VEHICLES.findIndex((v) => v.id === (params.vehicle || save.selectedVehicle))));
  const [tab, setTab] = useState<'upgrades' | 'gear' | 'paint'>('upgrades');
  const spec = VEHICLES[idx];
  const owned = save.unlockedVehicles.includes(spec.id);
  const ups = save.upgrades[spec.id], gear = save.gear[spec.id], tires = save.tires[spec.id];
  const P = buildParams(spec.id, ups, { ...gear, tire: tires.sel }) as any;
  const buy = (ok: boolean) => { if (ok) { sfx.buy(); vibrate(20); } else sfx.deny(); };
  const step = (d: number) => { sfx.click(); setIdx((idx + d + VEHICLES.length) % VEHICLES.length); };
  const price = (cost: number, fn: () => boolean) => <Btn kind={save.coins >= cost ? 'gold' : 'default'} disabled={save.coins < cost} label={coins(cost)} onPress={() => buy(fn())} />;
  return (
    <Screen title="Garage" onBack={back} save={save} region="rocky" dim={0.86}>
      <View style={{ flex: 1, flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1.15 }}>
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
            {VEHICLES.map((v, i) => (
              <Pressable key={v.id} onPress={() => { sfx.click(); setIdx(i); }} style={[st.vehPill, i === idx && { backgroundColor: C.amber, borderColor: C.amber }]}>
                <Text style={{ color: i === idx ? '#1a1205' : C.text, fontSize: 11, fontWeight: '800' }} numberOfLines={1}>{v.name.split(' ').slice(0, 2).join(' ')}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flex: 1 }}>
            <GaragePreview vehicleId={spec.id} ups={ups} gear={gear} tire={tires.sel} paint={save.paint[spec.id].sel} locked={!owned} />
            <Pressable accessibilityLabel="Previous vehicle" onPress={() => step(-1)} style={[st.arrow, { left: 6 }]}><Text style={st.arrowText}>‹</Text></Pressable>
            <Pressable accessibilityLabel="Next vehicle" onPress={() => step(1)} style={[st.arrow, { right: 6 }]}><Text style={st.arrowText}>›</Text></Pressable>
          </View>
          <View style={{ marginTop: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={ks.h2} numberOfLines={1}>{spec.name}</Text>
                <Text style={ks.small} numberOfLines={2}>{spec.desc}</Text>
              </View>
              {!owned ? (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Btn kind={save.coins >= spec.price ? 'gold' : 'default'} disabled={save.coins < spec.price} label={`Buy · ${coins(spec.price)}`} onPress={() => buy(act((S) => S.buyVehicle(spec)))} />
                  <Btn kind="ghost" label="Test drive" onPress={() => onDrive(TRACKS[0].id, 'casual', spec.id)} />
                </View>
              ) : save.selectedVehicle === spec.id ? <Pill label="Selected" /> : <Btn kind="primary" label="Select this truck" onPress={() => act((S) => S.selectVehicle(spec.id))} />}
            </View>
            <Text style={[ks.small, { marginTop: 4, color: C.text }]}>
              {Math.round(P.power / 1000)} kW · {P.mass} kg · {Math.round(P.clearance * 100)} cm clearance · {Math.round(P.travel * 100)} cm travel · {Math.round(P.fuelCap)} L
            </Text>
          </View>
        </View>
        <View style={[ks.card, { flex: 1 }]}>
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 4 }}>
            {(['upgrades', 'gear', 'paint'] as const).map((k) => (
              <Pressable key={k} onPress={() => { sfx.click(); setTab(k); }} style={[st.tab, tab === k && { borderBottomColor: C.amber }]}>
                <Text style={{ color: tab === k ? C.text : C.dim, fontWeight: '900', fontSize: 12.5 }}>{k === 'upgrades' ? 'Upgrades' : k === 'gear' ? 'Tyres & gear' : 'Paint'}</Text>
              </Pressable>
            ))}
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {!owned && <Text style={[ks.p, { marginTop: 10 }]}>Buy this vehicle to equip it.</Text>}
            {owned && tab === 'upgrades' && (UPGRADE_KEYS as string[]).map((k) => {
              const lv = ups[k], max = lv >= MAX_UPGRADE, cost = max ? 0 : upgradeCost(k, lv);
              const info = (UPGRADE_INFO as any)[k];
              return <Item key={k} title={`${info.label}  ${'●'.repeat(lv)}${'○'.repeat(MAX_UPGRADE - lv)}`} hint={info.hint} right={max ? <Pill label="Max" /> : price(cost, () => act((S) => S.buyUpgrade(spec.id, k)))} />;
            })}
            {owned && tab === 'paint' && PAINTS.map((p) => {
              const pt = save.paint[spec.id], has = pt.owned.includes(p.id), on = pt.sel === p.id;
              const sw = p.main !== undefined ? p.main : spec.colors.main;
              return (
                <Item key={p.id} swatch={`#${sw.toString(16).padStart(6, '0')}`} title={p.name} hint={p.id === 'stock' ? 'The colour it left the factory in.' : 'Cosmetic. Applies to this vehicle.'}
                  right={on ? <Pill label="Applied" /> : has ? <Btn kind="primary" label="Apply" onPress={() => act((S) => S.selectPaint(spec.id, p.id))} /> : price(p.price, () => act((S) => S.buyPaint(spec.id, p.id, p.price)))} />
              );
            })}
            {owned && tab === 'gear' && (TIRE_IDS as string[]).map((id) => {
              const t = TI[id], has = tires.owned.includes(id), on = tires.sel === id;
              return <Item key={id} title={t.name} hint={t.desc} right={on ? <Pill label="Fitted" /> : has ? <Btn kind="primary" label="Fit" onPress={() => act((S) => S.selectTire(spec.id, id))} /> : price(t.price, () => act((S) => S.buyTire(spec.id, id, t.price)))} />;
            })}
            {owned && tab === 'gear' && (GEAR_KEYS as string[]).map((k) => {
              const g = (GEAR_INFO as any)[k];
              return <Item key={k} title={g.label} hint={g.hint} right={gear[k] ? <Pill label="Fitted" /> : price(g.price, () => act((S) => S.buyGear(spec.id, k, g.price)))} />;
            })}
          </ScrollView>
        </View>
      </View>
    </Screen>
  );
}

// ---------------------------------------------------------------- profile
export function Profile({ back, save }: Nav) {
  const stt = save.stats;
  const recs = Object.values(save.tracks);
  const hrs = stt.driveTime / 3600;
  const cells: [string, string | number][] = [
    ['Tracks completed', `${recs.filter((r) => r.done).length} / ${TRACKS.length}`],
    ['Distance driven', `${(stt.distance / 1000).toFixed(1)} km`],
    ['Time at the wheel', hrs >= 1 ? `${hrs.toFixed(1)} h` : `${Math.round(stt.driveTime / 60)} min`],
    ['Gold medals', recs.filter((r) => r.medal === 3).length],
    ['Silver / Bronze', `${recs.filter((r) => r.medal === 2).length} / ${recs.filter((r) => r.medal === 1).length}`],
    ['Clean runs', stt.cleanRuns],
    ['Recoveries used', stt.recoveries],
    ['Supply caches', stt.caches],
    ['Hidden relics', `${stt.relics || 0} / ${TRACKS.length * 3}`],
    ['Hardcore finishes', stt.hardcore || 0],
    ['Coins earned', coins(stt.totalCoins)],
    ['Daily challenges', stt.dailies || 0],
  ];
  return (
    <Screen title="Profile" onBack={back} save={save} region="ridge" dim={0.84}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={st.grid}>
          {cells.map(([k, v]) => (
            <View key={k} style={st.statCell}><Text style={ks.small}>{k}</Text><Text style={st.statValue}>{v}</Text></View>
          ))}
        </View>
        <Text style={[ks.h2, { fontSize: 14, marginVertical: 8 }]}>Regions</Text>
        <View style={st.grid}>
          {REG.map((r) => {
            const pr = regionProgress(save as any, r.id);
            const total = TRACKS.filter((t) => t.region === r.id);
            const best = total.reduce((sum, t) => sum + (save.tracks[t.id]?.stars || 0), 0);
            return (
              <View key={r.id} style={[st.statCell, { flexBasis: '48%' }]}>
                <Text style={{ color: C.text, fontWeight: '800', fontSize: 12.5 }}>{r.name}</Text>
                <View style={[st.bar, { marginVertical: 5, flex: 0 }]}><View style={{ height: 5, backgroundColor: r.color, width: `${(pr.done / pr.total) * 100}%` }} /></View>
                <Text style={ks.small}>{pr.done}/{pr.total} tracks · {best}/{total.length * 5} ★</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </Screen>
  );
}

export function Achievements({ back, save }: Nav) {
  return (
    <Screen title="Achievements" onBack={back} save={save} region="snow" dim={0.86}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={st.grid}>
          {(ACHIEVEMENTS as { id: string; name: string; desc: string }[]).map((a) => {
            const got = !!save.achievements[a.id];
            return (
              <View key={a.id} style={[st.statCell, { flexBasis: '48%', flexDirection: 'row', alignItems: 'center', opacity: got ? 1 : 0.6 }]}>
                <Text style={{ fontSize: 20, width: 30, color: got ? C.gold : C.dim }}>{got ? '★' : '○'}</Text>
                <View style={{ flex: 1 }}><Text style={{ color: C.text, fontWeight: '800', fontSize: 13 }}>{a.name}</Text><Text style={ks.small}>{a.desc}</Text></View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </Screen>
  );
}

// --------------------------------------------------------------- settings
export function Settings({ back, save }: Nav) {
  const s = save.settings;
  const [armed, setArmed] = useState(false);
  const cyc = (key: string, list: unknown[]) => act((S) => S.setSetting(key, list[(list.indexOf(s[key] ?? list[0]) + 1) % list.length]));
  const row = (label: string, hint: string, value: string, onPress: () => void) => <Item key={label} title={label} hint={hint} right={<Btn kind="primary" label={value} onPress={onPress} style={{ minWidth: 96 }} />} />;
  const sens = s.steerSens || 1;
  return (
    <Screen title="Settings" onBack={back} save={save} region="forest" dim={0.86}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center' }}>
        <View style={[ks.card, { width: '100%', maxWidth: 640 }]}>
          {row('Graphics quality', 'Auto picks Medium on phones. Low is the fastest: flat shading, no shadows. High adds sharper shadows and a longer view.', String(s.quality || 'auto').toUpperCase(), () => cyc('quality', ['auto', 'low', 'medium', 'high']))}
          {row('Steering control', 'Buttons, an analog slider you drag left and right, or tilting the phone like a wheel.', String(s.steerMode || 'buttons').toUpperCase(), () => cyc('steerMode', ['buttons', 'slider', 'tilt']))}
          {row('Steering speed', 'How fast the wheels follow the steering buttons.', sens < 0.9 ? 'SLOW' : sens > 1.2 ? 'FAST' : 'NORMAL', () => cyc('steerSens', [0.7, 1, 1.35]))}
          {row('Camera shake', 'Shake on rough ground and impacts.', s.camShake === false ? 'OFF' : 'ON', () => act((S) => S.setSetting('camShake', s.camShake === false)))}
          {row('Driving display', s.hud === 'full' ? 'Everything: tilt gauge, rev bar, gear and surface, challenge tips.' : 'Only what you need: speed, fuel, damage, time and the map.', s.hud === 'full' ? 'FULL' : 'SIMPLE', () => cyc('hud', ['simple', 'full']))}
          {row('Default difficulty', diffOf(s.difficulty).desc, diffOf(s.difficulty).name.toUpperCase(), () => cyc('difficulty', ['casual', 'standard', 'hardcore']))}
          {row('Sound', 'Engine, impacts and interface sounds.', s.sound ? 'ON' : 'OFF', () => act((S) => S.setSetting('sound', !s.sound)))}
          {row('Vibration', 'Haptic feedback on impacts.', s.vibration ? 'ON' : 'OFF', () => { act((S) => S.setSetting('vibration', !s.vibration)); vibrate(60); })}
          {row('Show frame rate', 'FPS counter in the driving display.', s.showFps ? 'ON' : 'OFF', () => act((S) => S.setSetting('showFps', !s.showFps)))}
          <Item
            title="Reset all progress"
            hint="Deletes coins, vehicles, upgrades and every record. Cannot be undone."
            right={
              <Btn
                kind={armed ? 'danger' : 'default'}
                label={armed ? 'TAP AGAIN TO CONFIRM' : 'RESET'}
                onPress={async () => {
                  if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 3500); return; }
                  await act((S) => S.reset());
                  setArmed(false);
                  back();
                }}
              />
            }
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  logo: { color: C.text, fontSize: 26, fontWeight: '900', letterSpacing: 1 },
  tag: { color: '#d6e0e6', fontSize: 12, marginBottom: 8 },
  cta: { backgroundColor: C.amber, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 14, marginBottom: 7 },
  ctaSmall: { color: '#4a3200', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  ctaTitle: { color: '#1a1205', fontSize: 17, fontWeight: '900' },
  ctaSub: { color: '#4a3200', fontSize: 11.5, fontWeight: '600' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  tile: { flexBasis: '31%', flexGrow: 1, backgroundColor: C.panel, borderRadius: 10, borderWidth: 1, borderColor: C.line, paddingVertical: 9, paddingHorizontal: 10 },
  tileTitle: { color: C.text, fontWeight: '900', fontSize: 13 },
  tileSub: { color: C.dim, fontSize: 11, marginTop: 2 },
  vehTag: { position: 'absolute', bottom: 10, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 5 },
  vehTagText: { color: C.text, fontWeight: '900', fontSize: 12.5 },
  regionCard: { width: 230, borderRadius: 14, borderWidth: 1.5, overflow: 'hidden', padding: 10, justifyContent: 'space-between', backgroundColor: C.bg },
  regionBody: { backgroundColor: 'rgba(8,14,19,0.72)', borderRadius: 10, padding: 9 },
  num: { color: C.text, fontSize: 22, fontWeight: '900' },
  numSmall: { color: C.dim, fontSize: 14, fontWeight: '900', width: 28 },
  badge: { color: '#0b1217', fontSize: 10.5, fontWeight: '900', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden', alignSelf: 'flex-start' },
  bar: { flex: 1, height: 5, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 3, overflow: 'hidden' },
  trackRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.panel, borderRadius: 10, borderWidth: 1, borderColor: C.line, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 6 },
  trackName: { color: C.text, fontWeight: '800', fontSize: 13.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { flexBasis: '23%', flexGrow: 1, backgroundColor: C.panel2, borderRadius: 8, borderWidth: 1, borderColor: C.line, paddingHorizontal: 8, paddingVertical: 5 },
  chipLabel: { color: C.dim, fontSize: 9.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  chipValue: { color: C.text, fontSize: 12, fontWeight: '800' },
  record: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8 },
  diff: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: C.line, backgroundColor: C.panel2 },
  vehPill: { flex: 1, alignItems: 'center', paddingVertical: 7, paddingHorizontal: 4, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.panel },
  arrow: { position: 'absolute', top: '50%', marginTop: -22, width: 40, height: 44, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  arrowText: { color: C.text, fontSize: 28, fontWeight: '900', marginTop: -4 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  statCell: { flexBasis: '23%', flexGrow: 1, backgroundColor: C.panel, borderRadius: 10, borderWidth: 1, borderColor: C.line, padding: 9 },
  statValue: { color: C.text, fontSize: 16, fontWeight: '900', marginTop: 2 },
});
