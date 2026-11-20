// Home screen, laid out for landscape: the car on the left standing on the road
// of the environment the player is in, the menu on the right.
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
import { Backdrop } from '../ui/Backdrop';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const save = useStore((s) => s.save);
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

  // the car rolls in when the screen opens, then idles with a slow bob
  const bob = useRef(new Animated.Value(0)).current;
  const roll = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(roll, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob, roll]);

  const wide = width > height;
  const carW = Math.min(wide ? width * 0.36 : width * 0.7, height * (wide ? 0.62 : 0.4), 360);
  const carH = carW * 0.56;

  return (
    <View style={st.root}>
      <Backdrop theme={level.theme} dim={0.28} />
      <View style={[st.frame, { paddingTop: insets.top + 8, paddingLeft: insets.left + 16, paddingRight: insets.right + 16, paddingBottom: insets.bottom + 4 }]}>
        <View style={st.top}>
          <View>
            <Text style={st.logo} numberOfLines={1}>OFFROAD RACING</Text>
          </View>
          <View style={st.badge}>
            <Text style={st.badgeText}>4x4</Text>
          </View>
          <View style={{ flex: 1 }} />
          {rewardedReady ? <Btn small label={`FREE +${fmt(freeCoins)}`} sub="watch an ad" color={C.orange} onPress={watchForCoins} /> : null}
          <View style={st.coins}>
            <Coins value={save.coins} size={17} />
          </View>
        </View>

        <View style={[st.body, { flexDirection: wide ? 'row' : 'column' }]}>
          <View style={st.hero}>
            <Animated.View
              style={{
                transform: [
                  { translateX: roll.interpolate({ inputRange: [0, 1], outputRange: [-carW * 1.4, 0] }) },
                  { translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) },
                ],
              }}
            >
              <CarView spec={car} width={carW} height={carH} />
            </Animated.View>
            <View style={st.carTag}>
              <Text style={st.carName} numberOfLines={1}>{car.name}</Text>
            </View>
          </View>

          <View style={[st.menu, wide && { maxWidth: 380 }]}>
            <View style={st.stats}>
              <Stat label="Levels" value={`${done} / ${LEVEL_COUNT}`} />
              <Stat label="Stars" value={`${totalStars(save)} / ${LEVEL_COUNT * 3}`} />
              <Stat label="Cars" value={`${save.unlockedVehicles.length} / ${VEHICLE_COUNT}`} />
            </View>
            <Btn
              label={done === 0 ? 'PLAY' : 'CONTINUE'}
              sub={`Level ${level.id}: ${level.name} - ${THEMES[level.theme].name}`}
              onPress={() => startLevel(next)}
              style={st.play}
            />
            <View style={st.row}>
              <Btn label="LEVELS" color={C.blue} onPress={() => navigate({ name: 'levels' })} style={st.flex} />
              <Btn label="GARAGE" color={C.orange} onPress={() => navigate({ name: 'garage' })} style={st.flex} />
            </View>
            <Btn small label="SETTINGS" color={C.grey} onPress={() => navigate({ name: 'settings' })} style={{ marginTop: 8 }} />
          </View>
        </View>
        <BannerAd />
      </View>
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
  frame: { flex: 1 },
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  logo: { color: C.gold, fontSize: 26, fontWeight: '900', letterSpacing: 1.5, textShadowColor: '#000', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  badge: { backgroundColor: C.orange, borderRadius: 9, paddingHorizontal: 11, borderBottomWidth: 3, borderBottomColor: 'rgba(0,0,0,0.28)' },
  badgeText: { color: '#ffffff', fontSize: 19, fontWeight: '900', letterSpacing: 2 },
  coins: { backgroundColor: 'rgba(14,22,29,0.85)', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: C.line },
  body: { flex: 1, alignItems: 'center', gap: 14 },
  hero: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: '5%' },
  carTag: { backgroundColor: 'rgba(14,22,29,0.8)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 3, marginTop: 2 },
  carName: { color: C.text, fontSize: 13, fontWeight: '800' },
  menu: { flex: 1, alignSelf: 'stretch', justifyContent: 'center' },
  play: { marginTop: 8 },
  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
  stats: { flexDirection: 'row', backgroundColor: 'rgba(14,22,29,0.85)', borderRadius: 14, borderWidth: 1, borderColor: C.line, paddingVertical: 6 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { color: C.text, fontSize: 15, fontWeight: '900' },
  statLabel: { color: C.dim, fontSize: 11, fontWeight: '700' },
});
