import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import {
  MAX_UPGRADE, PAINTS, SERIES_NAMES, STAT_NAMES, STYLE_LABEL, STYLE_ORDER, UPGRADE_HINT, UPGRADE_KEYS, UPGRADE_LABEL, VEHICLES,
  adUnlockCost, displayStats, getVehicle, paintSpec, upgradeCost, type CarStyle, type UpgradeKey, type VehicleSpec,
} from '../data/vehicles';
import { buyUpgrade, buyVehicle, choosePaint, grantCarAd, paintOf, selectVehicle, upgradesOf } from '../state/save';
import { useRewardedReady } from '../ads/AdMobManager';
import { watchAdForReward } from '../ads/rewards';
import { commitSave, getState, useStore } from '../state/store';
import { play } from '../audio/sound';
import { Bar, Btn, C, Coins, Screen, fmt, s as ks } from '../ui/kit';
import { CarView } from '../ui/CarView';

type Filter = 'all' | 'owned' | CarStyle;
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All 100' },
  { id: 'owned', label: 'Owned' },
  ...STYLE_ORDER.map((id) => ({ id: id as Filter, label: STYLE_LABEL[id] })),
];
const ITEM_W = 118;

export default function GarageScreen() {
  const save = useStore((s) => s.save);
  const { width, height } = useWindowDimensions();
  const wide = width > height && width > 640;
  const [filter, setFilter] = useState<Filter>('all');
  const [viewId, setViewId] = useState(save.selectedVehicle);

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
  const rewardedReady = useRewardedReady();
  const adNeeded = adUnlockCost(base);
  const adWatched = save.ads.cars[base.id] ?? 0;
  const index = cars.findIndex((v) => v.id === viewId);
  /** Previous / next vehicle in the current list (wraps round). */
  const step = (d: number) => {
    if (!cars.length) return;
    const next = cars[(Math.max(0, index) + d + cars.length) % cars.length];
    play('click');
    setViewId(next.id);
    const i = cars.indexOf(next);
    list.current?.scrollToOffset({ offset: Math.max(0, i * ITEM_W - width / 2 + ITEM_W / 2), animated: true });
  };
  const watchForCar = () =>
    watchAdForReward(() => {
      const r = grantCarAd(getState().save, base.id);
      if (!r || !commitSave(r.save)) return null;
      return r.unlocked ? `${base.name} unlocked!` : `${r.watched} / ${r.needed} ads watched for the ${base.name}`;
    });

  const list = useRef<FlatList<VehicleSpec>>(null);
  useEffect(() => {
    const i = cars.findIndex((v) => v.id === viewId);
    if (i >= 0) list.current?.scrollToOffset({ offset: Math.max(0, i * ITEM_W - width / 2 + ITEM_W / 2), animated: false });
    // only when the filter changes: tapping a car must not move the strip
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // the preview pops when another car is shown
  const pop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    pop.setValue(0.9);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 9 }).start();
  }, [viewId, paint.sel, pop]);

  const act = useCallback((next: ReturnType<typeof buyVehicle>, sound: 'fuel' | 'click' = 'fuel') => {
    if (commitSave(next)) play(sound);
  }, []);

  const previewW = Math.min(wide ? width * 0.5 - 135 : width - 136, 360);
  const renderItem = useCallback(
    ({ item }: { item: VehicleSpec }) => (
      <Thumb spec={item} active={item.id === viewId} owned={getState().save.unlockedVehicles.includes(item.id)} inUse={getState().save.selectedVehicle === item.id} onPress={setViewId} />
    ),
    // owned / in-use badges must refresh after a purchase
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewId, save.unlockedVehicles, save.selectedVehicle],
  );

  const left = (
    <View style={[ks.card, st.block]}>
      <View style={st.stage}>
        <Arrow label="Previous vehicle" glyph="‹" onPress={() => step(-1)} />
        <Animated.View style={{ flex: 1, alignItems: 'center', transform: [{ scale: pop }] }}>
          <CarView spec={car} width={previewW} height={previewW * 0.5} />
        </Animated.View>
        <Arrow label="Next vehicle" glyph="›" onPress={() => step(1)} />
        <View style={[st.tag, { backgroundColor: inUse ? C.green : owned ? C.blue : C.grey }]}>
          <Text style={st.tagText}>{inUse ? '✓ SELECTED' : owned ? 'OWNED' : '🔒 LOCKED'}</Text>
        </View>
        {index >= 0 ? <Text style={st.position}>{index + 1} / {cars.length}</Text> : null}
      </View>
      <View style={[ks.row, { marginTop: 4 }]}>
        <View style={{ flex: 1 }}>
          <Text style={st.name}>{base.name}</Text>
          <Text style={st.series}>{STYLE_LABEL[base.style]} - {SERIES_NAMES[base.series]} series</Text>
        </View>
        {owned ? (
          <Btn label={inUse ? 'IN USE' : 'SELECT'} disabled={inUse} onPress={() => act(selectVehicle(getState().save, base.id), 'click')} />
        ) : (
          <Btn label="BUY" sub={`${fmt(base.price)} coins`} color={C.orange} disabled={save.coins < base.price} onPress={() => act(buyVehicle(getState().save, base.id))} />
        )}
      </View>
      <Text style={st.desc}>{base.desc}</Text>
      {!owned && save.coins < base.price ? <Text style={st.need}>You need {fmt(base.price - save.coins)} more coins. Finish levels to earn them.</Text> : null}
      {!owned && adNeeded > 0 ? (
        <View style={[ks.row, st.adRow]}>
          <Text style={st.adText}>Or unlock it free: watch {adNeeded} ads ({adWatched} / {adNeeded} done)</Text>
          <Btn small label="WATCH AD" color={C.orange} disabled={!rewardedReady} sub={rewardedReady ? undefined : 'no ad right now'} onPress={watchForCar} />
        </View>
      ) : null}
      <View style={{ marginTop: 8 }}>
        {STAT_NAMES.map((n) => (
          <View key={n} style={[ks.row, st.statRow]}>
            <Text style={st.statName}>{n}</Text>
            <Bar value={stats[n]} color={stats[n] > stock[n] + 0.004 ? C.gold : C.greenHi} />
          </View>
        ))}
      </View>
    </View>
  );

  const right = owned ? (
    <View style={st.block}>
      <View style={ks.card}>
        <Text style={st.head}>UPGRADES</Text>
        {UPGRADE_KEYS.map((key) => (
          <UpgradeRow key={key} id={key} level={ups[key]} coins={save.coins} onBuy={() => act(buyUpgrade(getState().save, base.id, key))} />
        ))}
      </View>
      <View style={[ks.card, { marginTop: 10 }]}>
        <Text style={st.head}>PAINT</Text>
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
      </View>
    </View>
  ) : (
    <View style={[ks.card, st.block, { alignItems: 'center', justifyContent: 'center', minHeight: 110 }]}>
      <Text style={st.lockTitle}>🔒 Locked</Text>
      <Text style={st.desc}>Buy this vehicle to upgrade and paint it.</Text>
    </View>
  );

  return (
    <Screen title="GARAGE" banner right={<Text style={st.count}>{save.unlockedVehicles.length} / {VEHICLES.length}</Text>}>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.filters}>
          {FILTERS.map((f) => (
            <Pressable
              key={f.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: filter === f.id }}
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
      </View>
      <View>
        <FlatList
          ref={list}
          horizontal
          data={cars}
          keyExtractor={(v) => v.id}
          renderItem={renderItem}
          getItemLayout={(_, index) => ({ length: ITEM_W, offset: ITEM_W * index, index })}
          initialNumToRender={8}
          maxToRenderPerBatch={6}
          windowSize={5}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingVertical: 6 }}
          ListEmptyComponent={<Text style={[st.desc, { padding: 16 }]}>No vehicles here yet.</Text>}
        />
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[{ paddingBottom: 18, gap: 10 }, wide && { flexDirection: 'row', alignItems: 'flex-start' }]}>
        {left}
        {right}
      </ScrollView>
    </Screen>
  );
}

const Thumb = memo(function Thumb({ spec, active, owned, inUse, onPress }: { spec: VehicleSpec; active: boolean; owned: boolean; inUse: boolean; onPress: (id: string) => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${spec.name}${owned ? ', owned' : `, ${spec.price} coins`}`}
      onPress={() => {
        play('click');
        onPress(spec.id);
      }}
      style={[st.thumb, { borderColor: active ? C.gold : inUse ? C.green : C.line, opacity: owned ? 1 : 0.72 }]}
    >
      <CarView spec={spec} width={ITEM_W - 18} height={50} shadow={false} />
      <Text style={st.thumbName} numberOfLines={1}>{spec.name}</Text>
      {inUse ? <Text style={[st.thumbTag, { color: C.greenHi }]}>IN USE</Text> : owned ? <Text style={st.thumbTag}>OWNED</Text> : <Coins value={spec.price} size={11} />}
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
  count: { color: C.dim, fontSize: 13, fontWeight: '800' },
  filters: { gap: 6, paddingVertical: 2 },
  chip: { paddingHorizontal: 12, height: 32, borderRadius: 16, backgroundColor: C.panelHi, justifyContent: 'center' },
  chipOn: { backgroundColor: C.gold },
  chipText: { color: C.text, fontSize: 12, fontWeight: '800' },
  thumb: { width: ITEM_W - 8, marginRight: 8, borderRadius: 12, borderWidth: 2, backgroundColor: C.panel, alignItems: 'center', paddingVertical: 5, paddingHorizontal: 4 },
  thumbName: { color: C.text, fontSize: 11, fontWeight: '800', marginTop: 1 },
  thumbTag: { color: C.dim, fontSize: 10, fontWeight: '900' },
  block: { flex: 1, alignSelf: 'stretch' },
  stage: { flexDirection: 'row', alignItems: 'center', paddingTop: 22 },
  arrow: { width: 44, height: 56, borderRadius: 14, backgroundColor: C.panelHi, alignItems: 'center', justifyContent: 'center' },
  arrowText: { color: C.text, fontSize: 34, lineHeight: 38, fontWeight: '700', marginTop: -4 },
  tag: { position: 'absolute', top: 0, left: 0, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  tagText: { color: '#ffffff', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  position: { position: 'absolute', top: 2, right: 2, color: C.dim, fontSize: 12, fontWeight: '800' },
  adRow: { marginTop: 8, gap: 10, backgroundColor: C.panelHi, borderRadius: 12, padding: 8 },
  adText: { flex: 1, color: C.text, fontSize: 12, fontWeight: '700' },
  name: { color: C.text, fontSize: 19, fontWeight: '900' },
  series: { color: C.gold, fontSize: 12, fontWeight: '800' },
  desc: { color: C.dim, fontSize: 13, marginTop: 6 },
  need: { color: '#ff9c8a', fontSize: 12, fontWeight: '700', marginTop: 4 },
  statRow: { marginTop: 6 },
  statName: { color: C.text, fontSize: 12, fontWeight: '700', width: 92 },
  head: { color: C.dim, fontSize: 12, fontWeight: '900', letterSpacing: 1.5, marginBottom: 2 },
  upRow: { paddingVertical: 7, borderTopWidth: 1, borderTopColor: C.line },
  upName: { color: C.text, fontSize: 14, fontWeight: '800' },
  upHint: { color: C.dim, fontSize: 11 },
  pip: { width: 14, height: 6, borderRadius: 3, marginRight: 3 },
  paints: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  paint: { width: 86, borderRadius: 10, borderWidth: 2, padding: 6, alignItems: 'center', backgroundColor: C.panelHi },
  swatch: { width: 44, height: 22, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  paintName: { color: C.text, fontSize: 10, fontWeight: '800', marginTop: 3 },
  paintOwned: { color: C.dim, fontSize: 10, fontWeight: '800' },
  lockTitle: { color: C.text, fontSize: 17, fontWeight: '900' },
});
