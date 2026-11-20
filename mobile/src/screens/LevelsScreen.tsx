import React, { memo, useMemo, useRef, useState, useEffect } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { FEATURE_LABEL } from '../core/features';
import { PX_PER_METER } from '../core/constants';
import { DIFFICULTY_LABEL, LEVELS, STAGES_PER_WORLD, difficultyTier, levelObstacles, type LevelConfig } from '../data/levels';
import { THEME_ORDER, THEMES } from '../data/themes';
import { adUnlockableLevel, grantLevelAd, highestUnlocked, isLevelUnlocked } from '../state/save';
import { commitSave, getState, startLevel, useStore } from '../state/store';
import { useRewardedReady } from '../ads/AdMobManager';
import { watchAdForReward } from '../ads/rewards';
import { play } from '../audio/sound';
import { C, Screen, Stars, s as ks } from '../ui/kit';

const TIER_COLOR = ['#55c26a', '#f0b429', '#f2742b', '#e0463c', '#b455e0'];

export default function LevelsScreen() {
  const levels = useStore((s) => s.save.levels);
  const save = useStore((s) => s.save);
  const { width } = useWindowDimensions();
  const current = highestUnlocked(save);
  const rewardedReady = useRewardedReady();
  const adLevel = rewardedReady ? adUnlockableLevel(save) : 0;
  const [world, setWorld] = useState(Math.floor((current - 1) / STAGES_PER_WORLD));
  const theme = THEMES[THEME_ORDER[world]];
  const list = useMemo(() => LEVELS.slice(world * STAGES_PER_WORLD, (world + 1) * STAGES_PER_WORLD), [world]);
  const columns = width > 900 ? 5 : width > 640 ? 4 : width > 430 ? 3 : 2;
  const worldStars = list.reduce((n, l) => n + (levels[l.id]?.stars ?? 0), 0);

  const tabs = useRef<React.ComponentRef<typeof ScrollView>>(null);
  useEffect(() => {
    tabs.current?.scrollTo({ x: Math.max(0, world * 128 - width / 2 + 64), animated: true });
  }, [world, width]);

  return (
    <Screen title="LEVELS" banner>
      <View>
        <ScrollView ref={tabs} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.tabs}>
          {THEME_ORDER.map((id, i) => {
            const th = THEMES[id];
            const open = isLevelUnlocked(save, i * STAGES_PER_WORLD + 1);
            const active = i === world;
            return (
              <Pressable
                key={id}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={th.name}
                onPress={() => {
                  play('click');
                  setWorld(i);
                }}
                style={[st.tab, { backgroundColor: th.skyTop, borderColor: active ? C.gold : 'transparent', opacity: open ? 1 : 0.55 }]}
              >
                <View style={[st.tabGround, { backgroundColor: th.grass }]} />
                <View style={[st.tabDirt, { backgroundColor: th.dirt }]} />
                <Text style={st.tabNum}>{i + 1}</Text>
                <Text style={st.tabName} numberOfLines={1}>{th.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={[ks.row, st.worldHead]}>
        <View style={{ flex: 1 }}>
          <Text style={st.worldName}>{theme.name}</Text>
          <Text style={st.worldBlurb} numberOfLines={2}>{theme.blurb}</Text>
        </View>
        <Text style={st.worldStars}>★ {worldStars} / {STAGES_PER_WORLD * 3}</Text>
      </View>

      <ScrollView contentContainerStyle={st.grid} showsVerticalScrollIndicator={false}>
        {list.map((level, i) => (
          <LevelCard
            key={level.id}
            level={level}
            index={i}
            width={`${100 / columns}%`}
            stars={levels[level.id]?.stars ?? 0}
            unlocked={isLevelUnlocked(save, level.id)}
            current={level.id === current}
            adUnlock={level.id === adLevel}
          />
        ))}
      </ScrollView>
    </Screen>
  );
}

const LevelCard = memo(function LevelCard({ level, index, width, stars, unlocked, current, adUnlock }: { level: LevelConfig; index: number; width: `${number}%`; stars: number; unlocked: boolean; current: boolean; adUnlock: boolean }) {
  const th = THEMES[level.theme];
  const tier = difficultyTier(level);
  const obstacles = useMemo(() => levelObstacles(level), [level]);
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    a.setValue(0);
    Animated.timing(a, { toValue: 1, duration: 220, delay: index * 28, useNativeDriver: true }).start();
  }, [a, index, level.id]);

  return (
    <Animated.View style={{ width, padding: 5, opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Level ${level.id} ${level.name}${unlocked ? '' : adUnlock ? ', locked, watch an ad to unlock' : ', locked'}`}
        accessibilityState={{ disabled: !unlocked && !adUnlock }}
        onPress={() => {
          if (unlocked) {
            play('click');
            startLevel(level.id);
          } else if (adUnlock) {
            play('click');
            watchAdForReward(() => (commitSave(grantLevelAd(getState().save, level.id)) ? `Level ${level.id} unlocked` : null));
          }
        }}
        style={({ pressed }) => [st.card, { borderColor: current ? C.gold : adUnlock ? C.orange : C.line, opacity: unlocked || adUnlock ? (pressed ? 0.8 : 1) : 0.6 }]}
      >
        <View style={[st.cardTop, { backgroundColor: th.skyTop }]}>
          <View style={[st.cardHill, { backgroundColor: th.nearHill }]} />
          <View style={[st.cardGround, { backgroundColor: th.grass }]} />
          <Text style={st.cardNum}>{level.id}</Text>
          {unlocked ? null : (
            <View style={st.lock}>
              <Text style={st.lockText}>🔒</Text>
            </View>
          )}
        </View>
        <View style={st.cardBody}>
          <Text style={st.cardName} numberOfLines={1}>{level.name}</Text>
          <View style={[ks.row, { justifyContent: 'space-between' }]}>
            <Stars n={stars} size={15} />
            <Text style={[st.tier, { color: TIER_COLOR[tier] }]}>{DIFFICULTY_LABEL[tier]}</Text>
          </View>
          <Text style={st.meta} numberOfLines={1}>
            {(level.length / PX_PER_METER / 1000).toFixed(1)} km{unlocked ? '' : ` - finish level ${level.id - 1}`}
          </Text>
          {adUnlock ? <Text style={st.adUnlock}>or watch an ad to unlock</Text> : null}
          <Text style={st.meta} numberOfLines={2}>
            {obstacles.length ? obstacles.map((o) => FEATURE_LABEL[o]).join(', ') : 'Open road'}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
});

const st = StyleSheet.create({
  tabs: { paddingVertical: 4, gap: 8 },
  tab: { width: 120, height: 58, borderRadius: 12, borderWidth: 2.5, overflow: 'hidden', paddingHorizontal: 8, paddingTop: 4 },
  tabGround: { position: 'absolute', left: 0, right: 0, bottom: 10, height: 6 },
  tabDirt: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 10 },
  tabNum: { color: '#ffffff', fontSize: 11, fontWeight: '900', opacity: 0.9, textShadowColor: '#000', textShadowRadius: 3 },
  tabName: { color: '#ffffff', fontSize: 13, fontWeight: '900', textShadowColor: '#000', textShadowRadius: 4 },
  worldHead: { marginTop: 6, marginBottom: 2, paddingHorizontal: 4 },
  worldName: { color: C.text, fontSize: 18, fontWeight: '900' },
  worldBlurb: { color: C.dim, fontSize: 12 },
  worldStars: { color: C.gold, fontSize: 15, fontWeight: '900', marginLeft: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingBottom: 16 },
  card: { borderRadius: 14, borderWidth: 2, backgroundColor: C.panel, overflow: 'hidden' },
  cardTop: { height: 54, justifyContent: 'center', paddingLeft: 10 },
  cardHill: { position: 'absolute', right: -20, bottom: 6, width: 110, height: 60, borderRadius: 55 },
  cardGround: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 10 },
  cardNum: { color: '#ffffff', fontSize: 26, fontWeight: '900', textShadowColor: '#000', textShadowRadius: 5 },
  lock: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(8,14,18,0.6)', alignItems: 'center', justifyContent: 'center' },
  lockText: { fontSize: 22 },
  cardBody: { padding: 8, minHeight: 92 },
  cardName: { color: C.text, fontSize: 14, fontWeight: '800', marginBottom: 2 },
  tier: { fontSize: 11, fontWeight: '900' },
  meta: { color: C.dim, fontSize: 11, marginTop: 2 },
  adUnlock: { color: C.orange, fontSize: 11, fontWeight: '900', marginTop: 2 },
});
