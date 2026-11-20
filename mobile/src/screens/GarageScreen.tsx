// Garage for landscape, in three columns:
//   list of vehicles | big preview with buy / select | stats, upgrades or paint
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import {
  MAX_UPGRADE, PAINTS, SERIES_NAMES, STAT_NAMES, STYLE_LABEL, STYLE_ORDER, UPGRADE_HINT, UPGRADE_KEYS, UPGRADE_LABEL, VEHICLES,
  adUnlockCost, displayStats, getVehicle, paintSpec, upgradeCost, type CarStyle, type UpgradeKey, type VehicleSpec,
} from '../data/vehicles';
import { buyUpgrade, buyVehicle, choosePaint, grantCarAd, paintOf, selectVehicle, upgradesOf } from '../state/save';
import { commitSave, getState, useStore } from '../state/store';
import { useRewardedReady } from '../ads/AdMobManager';
import { watchAdForReward } from '../ads/rewards';
import { play } from '../audio/sound';
import { Bar, Btn, C, Coins, Screen, fmt, s as ks } from '../ui/kit';
import { CarView } from '../ui/CarView';

type Filter = 'all' | 'owned' | CarStyle;
type Tab = 'stats' | 'upgrades' | 'paint';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'owned', label: 'Owned' },
  ...STYLE_ORDER.map((id) => ({ id: id as Filter, label: STYLE_LABEL[id] })),
];
const ROW_H = 58;
const LIST_W = 168;

export default function GarageScreen() {
  const save = useStore((s) => s.save);
  const { width, height } = useWindowDimensions();
  const [filter, setFilter] = useState<Filter>('all');
  const [tab, setTab] = useState<Tab>('stats');
  const [viewId, setViewId] = useState(save.selectedVehicle);
  const rewardedReady = useRewardedReady();

  const cars = useMemo(
    () => VEHICLES.filter((v) => (filter === 'all' ? true : filter === 'owned' ? save.unlockedVehicles.includes(v.id) : v.style === filter)),
    [filter, save.unlockedVehicles],
  );
  const base = getVehicle(viewId);
  const owned = save.unlockedVehicles.includes(base.id);
  const inUse = save.selectedVehicle === base.id;
  const ups = upgradesOf(save, base.id);
  const paint = paintOf(save, base.id);
  const car = paintSpec(base, paint.sel);
  const stats = displayStats(base, ups);
  const stock = displayStats(base, {});
  const adNeeded = adUnlockCost(base);
  const adWatched = save.ads.cars[base.id] ?? 0;
  const index = cars.findIndex((v) => v.id === viewId);

  const list = useRef<FlatList<VehicleSpec>>(null);
  const reveal = useCallback((i: number, animated: boolean) => {
    if (i >= 0) list.current?.scrollToOffset({ offset: Math.max(0, i * ROW_H - ROW_H * 1.5), animated });
  }, []);
  useEffect(() => {
    reveal(cars.findIndex((v) => v.id === viewId), false);
    // only when the filter changes: tapping a car must not move the list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  /** Previous / next vehicle in the current list (wraps round). */
  const step = (d: number) => {
    if (!cars.length) return;
    const i = (Math.max(0, index) + d + cars.length) % cars.length;
    play('click');
    setViewId(cars[i].id);
    reveal(i, true);
  };

  // the preview pops when another car is shown
  const pop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    pop.setValue(0.88);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 9 }).start();
  }, [viewId, paint.sel, pop]);

  const act = useCallback((next: ReturnType<typeof buyVehicle>, sound: 'fuel' | 'click' = 'fuel') => {
    if (commitSave(next)) play(sound);
  }, []);
  const watchForCar = () =>
    watchAdForReward(() => {
      const r = grantCarAd(getState().save, base.id);
      if (!r || !commitSave(r.save)) return null;
      return r.unlocked ? `${base.name} unlocked!` : `${r.watched} / ${r.needed} ads watched for the ${base.name}`;
    });

  const narrow = width < 620; // a phone held upright, or a very small window
  const midW = narrow ? width - 24 : (width - LIST_W - 44) * 0.46;
  const previewW = Math.max(120, Math.min(midW - 100, 340, (height - 150) * 1.9));

  const renderItem = useCallback(
    ({ item }: { item: VehicleSpec }) => (
      <CarRow spec={item} active={item.id === viewId} owned={getState().save.unlockedVehicles.includes(item.id)} inUse={getState().save.selectedVehicle === item.id} onPress={setViewId} />
    ),
    // owned / in-use badges must refresh after a purchase
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewId, save.unlockedVehicles, save.selectedVehicle],
  );

  const listColumn = (
    <View style={[st.listCol, narrow && { width: '100%', height: 150 }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.filters} style={st.filterBar}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === f.id }}
            accessibilityLabel={`Show ${f.label}`}
            onPress={() => {
              play('click');
              setFilter(f.id);
            }}
            style={[st.chip, filter === f.id && st.chipOn]}
          >
            <Text style={[st.chipText, filter === f.id && { color: '#10202b' }]}>{f.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <FlatList
        ref={list}
        data={cars}
        keyExtractor={(v) => v.id}
        renderItem={renderItem}
        getItemLayout={(_, i) => ({ length: ROW_H, offset: ROW_H * i, index: i })}
        initialNumToRender={7}
        maxToRenderPerBatch={6}
        windowSize={5}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<Text style={[st.desc, { padding: 12 }]}>No vehicles here yet.</Text>}
      />
    </View>
  );

  const previewColumn = (
    <View style={[st.card, st.midCol]}>
      <View style={ks.row}>
        <View style={[st.tag, { backgroundColor: inUse ? C.green : owned ? C.blue : C.grey }]}>
          <Text style={st.tagText}>{inUse ? '✓ SELECTED' : owned ? 'OWNED' : '🔒 LOCKED'}</Text>
        </View>
        <View style={{ flex: 1 }} />
        {index >= 0 ? <Text style={st.position}>{index + 1} / {cars.length}</Text> : null}
      </View>
      <View style={st.stage}>
        <Arrow label="Previous vehicle" glyph="‹" onPress={() => step(-1)} />
        <Animated.View style={{ flex: 1, alignItems: 'center', transform: [{ scale: pop }] }}>
          <CarView spec={car} width={previewW} height={previewW * 0.5} />
        </Animated.View>
        <Arrow label="Next vehicle" glyph="›" onPress={() => step(1)} />
      </View>
      <View style={[ks.row, { gap: 8 }]}>
        <View style={{ flex: 1 }}>
          <Text style={st.name} numberOfLines={1}>{base.name}</Text>
          <Text style={st.series} numberOfLines={1}>{STYLE_LABEL[base.style]} - {SERIES_NAMES[base.series]} series</Text>
        </View>
        {owned ? (
          <Btn label={inUse ? 'IN USE' : 'SELECT'} disabled={inUse} onPress={() => act(selectVehicle(getState().save, base.id), 'click')} />
        ) : (
          <Btn label="BUY" sub={`${fmt(base.price)} coins`} color={C.orange} disabled={save.coins < base.price} onPress={() => act(buyVehicle(getState().save, base.id))} />
        )}
      </View>
      {!owned && save.coins < base.price ? <Text style={st.need}>{fmt(base.price - save.coins)} more coins needed</Text> : null}
      {!owned && adNeeded > 0 ? (
        <View style={[ks.row, st.adRow]}>
          <Text style={st.adText}>Or free: watch {adNeeded} ads ({adWatched} / {adNeeded} done)</Text>
          <Btn small label="WATCH AD" color={C.orange} disabled={!rewardedReady} sub={rewardedReady ? undefined : 'no ad right now'} onPress={watchForCar} />
        </View>
      ) : null}
    </View>
  );

  const detailColumn = (
    <View style={[st.card, st.rightCol]}>
      <View style={st.tabs}>
        {(['stats', 'upgrades', 'paint'] as Tab[]).map((t) => (
          <Pressable
            key={t}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
            accessibilityLabel={t}
            onPress={() => {
              play('click');
              setTab(t);
            }}
            style={[st.tabBtn, tab === t && st.tabOn]}
          >
            <Text style={[st.tabText, tab === t && { color: '#10202b' }]}>{t.toUpperCase()}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 6 }}>
        {tab === 'stats' ? (
          <View>
            {STAT_NAMES.map((n) => (
              <View key={n} style={[ks.row, st.statRow]}>
                <Text style={st.statName}>{n}</Text>
                <Bar value={stats[n]} color={stats[n] > stock[n] + 0.004 ? C.gold : C.greenHi} height={10} />
              </View>
            ))}
            <Text style={st.desc}>{base.desc}</Text>
          </View>
        ) : !owned ? (
          <View style={st.locked}>
            <Text style={st.lockTitle}>🔒 Locked</Text>
            <Text style={st.desc}>Buy this vehicle to {tab === 'paint' ? 'paint' : 'upgrade'} it.</Text>
          </View>
        ) : tab === 'upgrades' ? (
          UPGRADE_KEYS.map((key) => <UpgradeRow key={key} id={key} level={ups[key]} coins={save.coins} onBuy={() => act(buyUpgrade(getState().save, base.id, key))} />)
        ) : (
          <View style={st.paints}>
            {PAINTS.map((p) => {
              const has = paint.owned.includes(p.id);
              const sel = paint.sel === p.id;
              const afford = has || save.coins >= p.price;
              return (
                <Pressable
                  key={p.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${p.name} paint${has ? '' : `, ${p.price} coins`}`}
                  onPress={() => act(choosePaint(getState().save, base.id, p.id), has ? 'click' : 'fuel')}
                  style={[st.paint, { borderColor: sel ? C.gold : C.line, opacity: afford ? 1 : 0.5 }]}
                >
                  <View style={[st.swatch, { backgroundColor: p.main ?? base.colors.main }]} />
                  <Text style={st.paintName} numberOfLines={1}>{p.name}</Text>
                  {has ? <Text style={st.paintOwned}>{sel ? 'On' : 'Owned'}</Text> : <Coins value={p.price} size={11} />}
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );

  return (
    <Screen title="GARAGE" banner theme="city" right={<Text style={st.count}>{save.unlockedVehicles.length} / {VEHICLES.length} owned</Text>}>
      {narrow ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
          {listColumn}
          {previewColumn}
          {detailColumn}
        </ScrollView>
      ) : (
        <View style={st.columns}>
          {listColumn}
          {previewColumn}
          {detailColumn}
        </View>
      )}
    </Screen>
  );
}

const CarRow = memo(function CarRow({ spec, active, owned, inUse, onPress }: { spec: VehicleSpec; active: boolean; owned: boolean; inUse: boolean; onPress: (id: string) => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${spec.name}${inUse ? ', selected' : owned ? ', owned' : `, ${spec.price} coins`}`}
      onPress={() => {
        play('click');
        onPress(spec.id);
      }}
      style={[st.row, { borderColor: active ? C.gold : inUse ? C.green : 'transparent', backgroundColor: active ? C.panelHi : 'rgba(23,35,45,0.9)', opacity: owned ? 1 : 0.8 }]}
    >
      <CarView spec={spec} width={62} height={34} shadow={false} />
      <View style={{ flex: 1, marginLeft: 6 }}>
        <Text style={st.rowName} numberOfLines={1}>{spec.name}</Text>
        {inUse ? <Text style={[st.rowTag, { color: C.greenHi }]}>✓ IN USE</Text> : owned ? <Text style={st.rowTag}>OWNED</Text> : <Coins value={spec.price} size={11} />}
      </View>
    </Pressable>
  );
});

function Arrow({ label, glyph, onPress }: { label: string; glyph: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={8} onPress={onPress} style={({ pressed }) => [st.arrow, pressed && { opacity: 0.6 }]}>
      <Text style={st.arrowText}>{glyph}</Text>
    </Pressable>
  );
}

const UpgradeRow = memo(function UpgradeRow({ id, level, coins, onBuy }: { id: UpgradeKey; level: number; coins: number; onBuy: () => void }) {
  const max = level >= MAX_UPGRADE;
  const cost = max ? 0 : upgradeCost(id, level);
  return (
    <View style={[ks.row, st.upRow]}>
      <View style={{ flex: 1 }}>
        <Text style={st.upName}>{UPGRADE_LABEL[id]}</Text>
        <Text style={st.upHint} numberOfLines={1}>{UPGRADE_HINT[id]}</Text>
        <View style={[ks.row, { marginTop: 3 }]}>
          {Array.from({ length: MAX_UPGRADE }, (_, i) => (
            <View key={i} style={[st.pip, { backgroundColor: i < level ? C.gold : '#0b1218' }]} />
          ))}
        </View>
      </View>
      <Btn small label={max ? 'MAX' : 'UPGRADE'} sub={max ? undefined : `${fmt(cost)}`} color={C.blue} disabled={max || coins < cost} onPress={onBuy} />
    </View>
  );
});

const st = StyleSheet.create({
  count: { color: '#e6edf2', fontSize: 13, fontWeight: '800' },
  columns: { flex: 1, flexDirection: 'row', gap: 8, paddingBottom: 6 },
  card: { backgroundColor: 'rgba(18,28,36,0.94)', borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 10 },
  listCol: { width: LIST_W },
  midCol: { flex: 1, justifyContent: 'space-between' },
  rightCol: { flex: 1.1 },
  filterBar: { flexGrow: 0, flexShrink: 0, height: 30, marginBottom: 5 },
  filters: { gap: 5 },
  chip: { paddingHorizontal: 10, height: 28, borderRadius: 14, backgroundColor: 'rgba(32,49,62,0.95)', justifyContent: 'center' },
  chipOn: { backgroundColor: C.gold },
  chipText: { color: C.text, fontSize: 11.5, fontWeight: '800' },
  row: { height: ROW_H - 5, marginBottom: 5, borderRadius: 11, borderWidth: 2, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 5 },
  rowName: { color: C.text, fontSize: 11.5, fontWeight: '800' },
  rowTag: { color: C.dim, fontSize: 10, fontWeight: '900' },
  tag: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  tagText: { color: '#ffffff', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  position: { color: C.dim, fontSize: 12, fontWeight: '800' },
  stage: { flexDirection: 'row', alignItems: 'center', flex: 1, minHeight: 70 },
  arrow: { width: 40, height: 52, borderRadius: 14, backgroundColor: C.panelHi, alignItems: 'center', justifyContent: 'center' },
  arrowText: { color: C.text, fontSize: 34, lineHeight: 38, fontWeight: '700', marginTop: -4 },
  name: { color: C.text, fontSize: 17, fontWeight: '900' },
  series: { color: C.gold, fontSize: 11.5, fontWeight: '800' },
  desc: { color: C.dim, fontSize: 12.5, marginTop: 8 },
  need: { color: '#ff9c8a', fontSize: 12, fontWeight: '700', marginTop: 4 },
  adRow: { marginTop: 6, gap: 8, backgroundColor: C.panelHi, borderRadius: 12, padding: 6 },
  adText: { flex: 1, color: C.text, fontSize: 11.5, fontWeight: '700' },
  tabs: { flexDirection: 'row', backgroundColor: '#0b1218', borderRadius: 12, padding: 3, marginBottom: 6 },
  tabBtn: { flex: 1, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: C.gold },
  tabText: { color: C.text, fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
  statRow: { marginTop: 7 },
  statName: { color: C.text, fontSize: 12.5, fontWeight: '700', width: 98 },
  upRow: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.line },
  upName: { color: C.text, fontSize: 13.5, fontWeight: '800' },
  upHint: { color: C.dim, fontSize: 11 },
  pip: { width: 13, height: 6, borderRadius: 3, marginRight: 3 },
  paints: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  paint: { width: 84, borderRadius: 10, borderWidth: 2, padding: 5, alignItems: 'center', backgroundColor: C.panelHi },
  swatch: { width: 44, height: 20, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  paintName: { color: C.text, fontSize: 10, fontWeight: '800', marginTop: 3 },
  paintOwned: { color: C.dim, fontSize: 10, fontWeight: '800' },
  locked: { alignItems: 'center', paddingVertical: 18 },
  lockTitle: { color: C.text, fontSize: 16, fontWeight: '900' },
});
