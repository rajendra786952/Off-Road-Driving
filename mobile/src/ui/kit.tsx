// Shared interface pieces: colours, buttons, bars, the screen frame.
import React, { memo, useEffect, useRef, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { play, startMusic } from '../audio/sound';
import { useStore, goBack } from '../state/store';
import { BannerAd } from '../ads/BannerAd';
import { Backdrop } from './Backdrop';
import type { ThemeId } from '../data/themes';

export const C = {
  bg: '#0e161d',
  panel: '#17232d',
  panelHi: '#20313e',
  line: '#2c4252',
  text: '#f2f6f8',
  dim: '#9db1bf',
  gold: '#ffd23f',
  green: '#2f9e55',
  greenHi: '#8dff9b',
  blue: '#2f6fa8',
  orange: '#f2742b',
  red: '#c0392b',
  grey: '#3a4a56',
};

export function fmt(n: number): string {
  return Math.floor(n).toLocaleString('en-US');
}

interface BtnProps {
  label: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  sub?: string;
}

/** Button with a press animation and a click sound. */
export const Btn = memo(function Btn({ label, onPress, color = C.green, disabled, small, style, sub }: BtnProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) => Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPressIn={() => to(0.94)}
      onPressOut={() => to(1)}
      onPress={() => {
        startMusic();
        play('click');
        onPress();
      }}
      style={style}
    >
      <Animated.View style={[s.btn, small && s.btnSmall, { backgroundColor: disabled ? C.grey : color, opacity: disabled ? 0.55 : 1, transform: [{ scale }] }]}>
        <Text style={[s.btnText, small && s.btnTextSmall]} numberOfLines={1}>{label}</Text>
        {sub ? <Text style={s.btnSub} numberOfLines={1}>{sub}</Text> : null}
      </Animated.View>
    </Pressable>
  );
});

export const Coin = memo(function Coin({ size = 16 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.gold, borderWidth: Math.max(1.5, size * 0.12), borderColor: '#c8961e' }} />
  );
});

export const Coins = memo(function Coins({ value, size = 16, style }: { value: number; size?: number; style?: StyleProp<TextStyle> }) {
  return (
    <View style={s.row}>
      <Coin size={size} />
      <Text style={[{ color: C.gold, fontWeight: '800', fontSize: size, marginLeft: 6 }, style]}>{fmt(value)}</Text>
    </View>
  );
});

export const Stars = memo(function Stars({ n, size = 16 }: { n: number; size?: number }) {
  return (
    <Text style={{ fontSize: size, letterSpacing: 1 }}>
      <Text style={{ color: C.gold }}>{'★'.repeat(n)}</Text>
      <Text style={{ color: '#45596a' }}>{'★'.repeat(3 - n)}</Text>
    </Text>
  );
});

export const Bar = memo(function Bar({ value, color = C.greenHi, height = 8 }: { value: number; color?: string; height?: number }) {
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: '#0b1218', overflow: 'hidden', flex: 1 }}>
      <View style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`, height, borderRadius: height / 2, backgroundColor: color }} />
    </View>
  );
});

export const Toggle = memo(function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      onPress={() => {
        play('click');
        onChange(!value);
      }}
      style={s.toggleRow}
    >
      <View style={{ flex: 1 }}>
        <Text style={s.label}>{label}</Text>
        {hint ? <Text style={s.hint}>{hint}</Text> : null}
      </View>
      <View style={[s.track, { backgroundColor: value ? C.green : C.grey }]}>
        <View style={[s.knob, { alignSelf: value ? 'flex-end' : 'flex-start' }]} />
      </View>
    </Pressable>
  );
});

/** Fades and slides its children in whenever `id` changes: the screen transition. */
export function Transition({ id, children }: { id: string; children: ReactNode }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    a.setValue(0);
    Animated.timing(a, { toValue: 1, duration: 240, useNativeDriver: true }).start();
  }, [id, a]);
  return (
    <Animated.View style={{ flex: 1, opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>
      {children}
    </Animated.View>
  );
}

/** Frame of every menu screen: title bar with back button and the coin balance. */
export function Screen({ title, children, right, banner, theme }: { title: string; children: ReactNode; right?: ReactNode; banner?: boolean; theme?: ThemeId }) {
  const insets = useSafeAreaInsets();
  const coins = useStore((st) => st.save.coins);
  return (
    <View style={[s.screen, { paddingTop: insets.top + 4, paddingLeft: insets.left + 12, paddingRight: insets.right + 12, paddingBottom: insets.bottom }]}>
      {theme ? <Backdrop theme={theme} /> : null}
      <View style={s.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={10}
          onPress={() => {
            play('click');
            goBack();
          }}
          style={s.back}
        >
          <Text style={s.backText}>‹</Text>
        </Pressable>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        {right}
        <View style={s.coinPill}>
          <Coins value={coins} size={15} />
        </View>
      </View>
      <View style={{ flex: 1 }}>{children}</View>
      {banner ? <BannerAd /> : null}
    </View>
  );
}

export const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  screen: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', height: 42, marginBottom: 4, gap: 8 },
  back: { width: 44, height: 38, borderRadius: 12, backgroundColor: 'rgba(32,49,62,0.95)', alignItems: 'center', justifyContent: 'center' },
  backText: { color: C.text, fontSize: 30, lineHeight: 32, fontWeight: '700', marginTop: -3 },
  title: { flex: 1, color: C.text, fontSize: 20, fontWeight: '900', marginLeft: 4, letterSpacing: 0.5, textShadowColor: '#000', textShadowRadius: 5 },
  coinPill: { backgroundColor: 'rgba(14,22,29,0.88)', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: C.line, marginLeft: 8 },
  btn: { minHeight: 46, borderRadius: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 4, borderBottomColor: 'rgba(0,0,0,0.28)' },
  btnSmall: { minHeight: 36, borderRadius: 10, paddingHorizontal: 12, borderBottomWidth: 3 },
  btnText: { color: '#ffffff', fontSize: 17, fontWeight: '900', letterSpacing: 0.6 },
  btnTextSmall: { fontSize: 13 },
  btnSub: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '700', marginTop: -1 },
  label: { color: C.text, fontSize: 15, fontWeight: '700' },
  hint: { color: C.dim, fontSize: 12, marginTop: 2 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, minHeight: 48 },
  track: { width: 50, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center' },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#ffffff' },
  card: { backgroundColor: 'rgba(18,28,36,0.94)', borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 12 },
});
