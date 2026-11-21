// Shared look of the menus: colours, buttons, the top bar and the screen frame.
import React, { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Backdrop from './Backdrop';
import { sfx } from '../drive/audio';
import { playerLevel } from '../drive/core/progress.js';
import type { Save } from '../state/save';

export const C = {
  bg: '#0b1217', panel: 'rgba(14,22,29,0.86)', panel2: 'rgba(255,255,255,0.07)', line: 'rgba(255,255,255,0.14)',
  text: '#f2f6f8', dim: '#9fb3c0', amber: '#ffb020', gold: '#ffd23f', green: '#34d399', red: '#ef4444', blue: '#38bdf8',
};

export const coins = (n: number): string => Math.round(n).toLocaleString('en-US');

type Kind = 'default' | 'primary' | 'gold' | 'ghost' | 'danger';
const KIND: Record<Kind, { bg: string; fg: string; border: string }> = {
  default: { bg: 'rgba(255,255,255,0.10)', fg: C.text, border: C.line },
  primary: { bg: '#2563eb', fg: '#fff', border: '#3b82f6' },
  gold: { bg: C.amber, fg: '#1a1205', border: '#ffd27a' },
  ghost: { bg: 'transparent', fg: C.text, border: C.line },
  danger: { bg: C.red, fg: '#fff', border: '#fca5a5' },
};

export function Btn({ label, onPress, kind = 'default', disabled, style, textStyle }: {
  label: string; onPress?: () => void; kind?: Kind; disabled?: boolean; style?: StyleProp<ViewStyle>; textStyle?: StyleProp<TextStyle>;
}) {
  const k = KIND[kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      onPress={() => {
        if (disabled) { sfx.deny(); return; }
        sfx.click();
        onPress?.();
      }}
      style={({ pressed }) => [s.btn, { backgroundColor: k.bg, borderColor: k.border, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 }, style]}
    >
      <Text style={[s.btnText, { color: k.fg }, textStyle]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export function Pill({ label }: { label: string }) {
  return (
    <View style={s.pill}>
      <Text style={s.pillText}>{label}</Text>
    </View>
  );
}

export function Stars({ n, of }: { n: number; of: number }) {
  return (
    <Text style={{ color: C.gold, fontSize: 13 }}>
      {'★'.repeat(n)}
      <Text style={{ color: 'rgba(255,255,255,0.25)' }}>{'★'.repeat(Math.max(0, of - n))}</Text>
    </Text>
  );
}

/** A row with a title, a hint and one control on the right (settings, upgrades, tyres ...). */
export function Item({ title, hint, right, swatch }: { title: string; hint?: string; right: ReactNode; swatch?: string }) {
  return (
    <View style={s.item}>
      <View style={{ flex: 1, paddingRight: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {swatch ? <View style={[s.swatch, { backgroundColor: swatch }]} /> : null}
          <Text style={s.itemTitle}>{title}</Text>
        </View>
        {hint ? <Text style={s.itemHint}>{hint}</Text> : null}
      </View>
      {right}
    </View>
  );
}

function TopBar({ title, onBack, save, right }: { title: string; onBack?: () => void; save: Save; right?: ReactNode }) {
  const lvl = playerLevel(save.xp);
  const cur = 120 * (lvl - 1) ** 2, next = 120 * lvl ** 2;
  return (
    <View style={s.top}>
      {onBack ? <Btn kind="ghost" label="‹ Back" onPress={onBack} style={{ paddingHorizontal: 12 }} /> : <Text style={s.brand}>OFFROAD 4x4</Text>}
      <Text style={s.title} numberOfLines={1}>{title}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {right}
        <View>
          <Text style={s.lvl}>LVL {lvl}</Text>
          <View style={s.lvlBar}><View style={{ height: 3, backgroundColor: C.blue, width: `${Math.min(100, ((save.xp - cur) / (next - cur)) * 100)}%` }} /></View>
        </View>
        <View style={s.coin}>
          <View style={s.coinDot} />
          <Text style={s.coinText}>{coins(save.coins)}</Text>
        </View>
      </View>
    </View>
  );
}

export function Screen({ title, onBack, save, right, region, dim = 0.8, children }: {
  title: string; onBack?: () => void; save: Save; right?: ReactNode; region: string; dim?: number; children: ReactNode;
}) {
  const ins = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Backdrop region={region} dim={dim} />
      <View style={{ flex: 1, paddingLeft: Math.max(12, ins.left), paddingRight: Math.max(12, ins.right), paddingTop: Math.max(6, ins.top), paddingBottom: Math.max(8, ins.bottom) }}>
        <TopBar title={title} onBack={onBack} save={save} right={right} />
        {children}
      </View>
    </View>
  );
}

export const s = StyleSheet.create({
  btn: { minHeight: 38, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.4 },
  pill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(52,211,153,0.16)', borderWidth: 1, borderColor: 'rgba(52,211,153,0.5)' },
  pillText: { color: C.green, fontSize: 12, fontWeight: '800' },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  itemTitle: { color: C.text, fontSize: 14, fontWeight: '800' },
  itemHint: { color: C.dim, fontSize: 11.5, marginTop: 2, lineHeight: 15 },
  swatch: { width: 13, height: 13, borderRadius: 7, marginRight: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 44, marginBottom: 6 },
  brand: { color: C.amber, fontWeight: '900', letterSpacing: 2, fontSize: 13 },
  title: { color: C.text, fontSize: 17, fontWeight: '900', flex: 1, textAlign: 'center', marginHorizontal: 8 },
  lvl: { color: C.text, fontSize: 11, fontWeight: '900' },
  lvlBar: { width: 54, height: 3, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 2, overflow: 'hidden', marginTop: 3 },
  coin: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: C.line },
  coinDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.gold, marginRight: 6, borderWidth: 1, borderColor: '#b8860b' },
  coinText: { color: C.text, fontWeight: '900', fontSize: 13 },
  card: { backgroundColor: C.panel, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 12 },
  h2: { color: C.text, fontSize: 18, fontWeight: '900' },
  p: { color: C.dim, fontSize: 12.5, lineHeight: 17 },
  small: { color: C.dim, fontSize: 11 },
});
