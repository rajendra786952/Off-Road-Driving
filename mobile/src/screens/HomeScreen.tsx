import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LEVEL_COUNT, getLevel } from '../data/levels';
import { THEMES } from '../data/themes';
import { VEHICLE_COUNT, getVehicle, paintSpec } from '../data/vehicles';
import { completedLevels, freeCoinsAmount, grantCoins, highestUnlocked, paintOf, totalStars } from '../state/save';
import { commitSave, getState, navigate, startLevel, useStore } from '../state/store';
import { BannerAd } from '../ads/BannerAd';
import { useRewardedReady } from '../ads/AdMobManager';
import { watchAdForReward } from '../ads/rewards';
import { Btn, C, Coins, fmt } from '../ui/kit';
import { CarView } from '../ui/CarView';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const save = useStore((s) => s.save);
  const wide = width > height;
  const next = highestUnlocked(save);
  const level = getLevel(next);
  const car = paintSpec(getVehicle(save.selectedVehicle), paintOf(save, save.selectedVehicle).sel);
  const done = completedLevels(save);
  const rewardedReady = useRewardedReady();
  const freeCoins = freeCoinsAmount(save);
  const watchForCoins = () =>
    watchAdForReward(() => {
      const amount = freeCoinsAmount(getState().save);
      return commitSave(grantCoins(getState().save, amount)) ? `+${fmt(amount)} coins` : null;
    });

  // the car idles: a slow bob, and it rolls in when the screen opens
  const bob = useRef(new Animated.Value(0)).current;
  const roll = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(roll, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob, roll]);

  const carW = Math.min(wide ? width * 0.42 : width * 0.8, 380);
  const carH = carW * 0.56;

  const hero = (
    <View style={st.hero}>
      <Text style={st.logo} numberOfLines={1} adjustsFontSizeToFit>OFFROAD RACING</Text>
      <View style={st.badge}>
        <Text style={st.badgeText}>4x4</Text>
      </View>
      <View style={[st.stage, { width: carW, height: carH + 14 }]}>
        <View style={st.ground} />
        <Animated.View
          style={{
            transform: [
              { translateX: roll.interpolate({ inputRange: [0, 1], outputRange: [-carW, 0] }) },
              { translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) },
            ],
          }}
        >
          <CarView spec={car} width={carW} height={carH} />
        </Animated.View>
      </View>
      <Text style={st.carName}>{car.name}</Text>
    </View>
  );

  const menu = (
    <View style={[st.menu, wide && { maxWidth: 360 }]}>
      <View style={st.stats}>
        <Stat label="Levels" value={`${done} / ${LEVEL_COUNT}`} />
        <Stat label="Stars" value={`${totalStars(save)} / ${LEVEL_COUNT * 3}`} />
        <Stat label="Cars" value={`${save.unlockedVehicles.length} / ${VEHICLE_COUNT}`} />
      </View>
      <Btn
        label={done === 0 ? 'PLAY' : 'CONTINUE'}
        sub={`Level ${level.id}: ${level.name} - ${THEMES[level.theme].name}`}
        onPress={() => startLevel(next)}
        style={st.item}
      />
      <Btn label="LEVELS" color={C.blue} onPress={() => navigate({ name: 'levels' })} style={st.item} />
      <Btn label="GARAGE" color={C.orange} onPress={() => navigate({ name: 'garage' })} style={st.item} />
      <Btn label="SETTINGS" color={C.grey} onPress={() => navigate({ name: 'settings' })} style={st.item} />
    </View>
  );

  return (
    <View style={[st.root, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 10, paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }]}>
      <View style={st.top}>
        {rewardedReady ? <Btn small label={`FREE +${fmt(freeCoins)}`} sub="watch an ad" color={C.orange} onPress={watchForCoins} /> : null}
        <View style={st.coins}>
          <Coins value={save.coins} size={17} />
        </View>
      </View>
      <View style={[st.body, { flexDirection: wide ? 'row' : 'column' }]}>
        {hero}
        {menu}
      </View>
      <BannerAd />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={st.stat}>
      <Text style={st.statValue}>{value}</Text>
      <Text style={st.statLabel}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  top: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10 },
  coins: { backgroundColor: C.panel, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: C.line },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { color: C.gold, fontSize: 32, fontWeight: '900', letterSpacing: 2, textShadowColor: '#000', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  badge: { backgroundColor: C.orange, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 1, marginTop: 2, marginBottom: 6, borderBottomWidth: 3, borderBottomColor: 'rgba(0,0,0,0.28)' },
  badgeText: { color: '#ffffff', fontSize: 22, fontWeight: '900', letterSpacing: 2 },
  stage: { justifyContent: 'flex-end', overflow: 'hidden' },
  ground: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 22, borderRadius: 11, backgroundColor: '#1b2a35' },
  carName: { color: C.text, fontSize: 15, fontWeight: '800', marginTop: 6 },
  menu: { flex: 1, alignSelf: 'stretch', justifyContent: 'center' },
  item: { marginTop: 10 },
  stats: { flexDirection: 'row', backgroundColor: C.panel, borderRadius: 14, borderWidth: 1, borderColor: C.line, paddingVertical: 8 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { color: C.text, fontSize: 15, fontWeight: '900' },
  statLabel: { color: C.dim, fontSize: 11, fontWeight: '700' },
});
