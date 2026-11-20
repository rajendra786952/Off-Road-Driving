// Level select for landscape: ten environment tabs along the top, and the ten
// levels of the chosen environment as one row of cards that scrolls sideways.
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
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
const CARD_W = 158;
const TAB_W = 112;

export default function LevelsScreen() {
  const save = useStore((s) => s.save);
  const levels = save.levels;
  const { width } = useWindowDimensions();
  const current = highestUnlocked(save);
  const rewardedReady = useRewardedReady();
  const adLevel = rewardedReady ? adUnlockableLevel(save) : 0;
  const [world, setWorld] = useState(Math.floor((current - 1) / STAGES_PER_WORLD));
  const theme = THEMES[THEME_ORDER[world]];
  const list = useMemo(() => LEVELS.slice(world * STAGES_PER_WORLD, (world + 1) * STAGES_PER_WORLD), [world]);
  const worldStars = list.reduce((n, l) => n + (levels[l.id]?.stars ?? 0), 0);

  const tabs = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const cards = useRef<React.ComponentRef<typeof ScrollView>>(null);
  useEffect(() => {
    tabs.current?.scrollTo({ x: Math.max(0, world * (TAB_W + 6) - width / 2 + TAB_W / 2), animated: true });
    // bring the level the player is on into view, or start from the left
    const i = list.findIndex((l) => l.id === current);
    cards.current?.scrollTo({ x: i > 0 ? Math.max(0, i * CARD_W - width / 2 + CARD_W / 2) : 0, animated: false });
    // only when another environment is opened
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world]);

  return (
    <Screen title="LEVELS" banner theme={theme.id} right={<Text style={st.worldStars}>★ {worldStars} / {STAGES_PER_WORLD * 3}</Text>}>
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
                style={[st.tab, { backgroundColor: th.skyTop, borderColor: active ? C.gold : 'rgba(0,0,0,0.35)', opacity: open || active ? 1 : 0.6 }]}
              >
                <View style={[st.tabGround, { backgroundColor: th.grass }]} />
                <View style={[st.tabDirt, { backgroundColor: th.dirt }]} />
                <Text style={st.tabName} numberOfLines={1}>{i + 1}. {th.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <Text style={st.blurb} numberOfLines={1}>
        <Text style={st.worldName}>{theme.name}</Text>   {theme.blurb}
      </Text>

      <ScrollView ref={cards} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.cards}>
        {list.map((level, i) => (
          <LevelCard
            key={level.id}
            level={level}
            index={i}
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

const LevelCard = memo(function LevelCard({ level, index, stars, unlocked, current, adUnlock }: { level: LevelConfig; index: number; stars: number; unlocked: boolean; current: boolean; adUnlock: boolean }) {
  const th = THEMES[level.theme];
  const tier = difficultyTier(level);
  const obstacles = useMemo(() => levelObstacles(level), [level]);
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    a.setValue(0);
    Animated.timing(a, { toValue: 1, duration: 220, delay: index * 30, useNativeDriver: true }).start();
  }, [a, index, level.id]);

  return (
    <Animated.View style={{ width: CARD_W, paddingRight: 8, opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>
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
        style={({ pressed }) => [st.card, { borderColor: current ? C.gold : adUnlock ? C.orange : 'rgba(0,0,0,0.4)', opacity: unlocked || adUnlock ? 1 : 0.72, transform: [{ scale: pressed && (unlocked || adUnlock) ? 0.96 : 1 }] }]}
      >
        <View style={[st.art, { backgroundColor: th.skyTop }]}>
          <View style={[st.sun, { backgroundColor: th.sun }]} />
          <View style={[st.hillFar, { backgroundColor: th.farHill }]} />
          <View style={[st.hillNear, { backgroundColor: th.nearHill }]} />
          <View style={[st.ground, { backgroundColor: th.grass }]} />
          <Text style={st.num}>{level.id}</Text>
          {current && unlocked ? (
            <View style={st.playTag}>
              <Text style={st.playTagText}>PLAY</Text>
            </View>
          ) : null}
          {unlocked ? null : (
            <View style={st.lock}>
              <Text style={st.lockText}>🔒</Text>
            </View>
          )}
        </View>
        <View style={st.info}>
          <Text style={st.name} numberOfLines={1}>{level.name}</Text>
          <View style={[ks.row, { justifyContent: 'space-between' }]}>
            <Stars n={stars} size={15} />
            <Text style={[st.tier, { color: TIER_COLOR[tier] }]}>{DIFFICULTY_LABEL[tier]}</Text>
          </View>
          {adUnlock ? (
            <Text style={st.adUnlock} numberOfLines={1}>▶ watch an ad to unlock</Text>
          ) : (
            <Text style={st.meta} numberOfLines={1}>
              {(level.length / PX_PER_METER / 1000).toFixed(1)} km{unlocked ? '' : ` - finish level ${level.id - 1}`}
            </Text>
          )}
          <Text style={st.meta} numberOfLines={2}>
            {obstacles.length ? obstacles.map((o) => FEATURE_LABEL[o]).join(', ') : 'Open road'}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
});

const st = StyleSheet.create({
  worldStars: { color: C.gold, fontSize: 15, fontWeight: '900' },
  tabs: { gap: 6, paddingVertical: 2 },
  tab: { width: TAB_W, height: 34, borderRadius: 10, borderWidth: 2.5, overflow: 'hidden', paddingHorizontal: 7, justifyContent: 'center' },
  tabGround: { position: 'absolute', left: 0, right: 0, bottom: 5, height: 3 },
  tabDirt: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 5 },
  tabName: { color: '#ffffff', fontSize: 11.5, fontWeight: '900', marginTop: -4, textShadowColor: '#000', textShadowRadius: 4 },
  blurb: { color: '#e6edf2', fontSize: 12, marginVertical: 4, paddingHorizontal: 2, textShadowColor: '#000', textShadowRadius: 4 },
  worldName: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  cards: { paddingBottom: 6, alignItems: 'stretch' },
  card: { flex: 1, minHeight: 150, borderRadius: 14, borderWidth: 2.5, backgroundColor: 'rgba(18,28,36,0.94)', overflow: 'hidden' },
  art: { height: 58, justifyContent: 'center', paddingLeft: 10, overflow: 'hidden' },
  sun: { position: 'absolute', right: 18, top: 8, width: 20, height: 20, borderRadius: 10, opacity: 0.9 },
  hillFar: { position: 'absolute', left: -30, bottom: -34, width: 130, height: 70, borderRadius: 65 },
  hillNear: { position: 'absolute', right: -34, bottom: -40, width: 150, height: 74, borderRadius: 75 },
  ground: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 7 },
  num: { color: '#ffffff', fontSize: 28, fontWeight: '900', textShadowColor: '#000', textShadowRadius: 5 },
  playTag: { position: 'absolute', right: 6, bottom: 10, backgroundColor: C.green, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 },
  playTagText: { color: '#ffffff', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  lock: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(8,14,18,0.6)', alignItems: 'center', justifyContent: 'center' },
  lockText: { fontSize: 22 },
  info: { flex: 1, padding: 8 },
  name: { color: C.text, fontSize: 14, fontWeight: '800', marginBottom: 2 },
  tier: { fontSize: 11, fontWeight: '900' },
  meta: { color: C.dim, fontSize: 11, marginTop: 2 },
  adUnlock: { color: C.orange, fontSize: 11, fontWeight: '900', marginTop: 2 },
});
