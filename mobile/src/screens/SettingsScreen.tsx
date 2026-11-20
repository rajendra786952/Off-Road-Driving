import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LEVEL_COUNT } from '../data/levels';
import { VEHICLE_COUNT } from '../data/vehicles';
import { completedLevels, totalStars } from '../state/save';
import { resetProgress, updateSettings, useStore } from '../state/store';
import { setAudioSettings } from '../audio/sound';
import { Btn, C, Screen, Toggle, fmt, s as ks } from '../ui/kit';

export default function SettingsScreen() {
  const save = useStore((s) => s.save);
  const set = save.settings;
  const [confirm, setConfirm] = useState(false);

  const audio = (patch: { sound?: boolean; music?: boolean }) => {
    updateSettings(patch);
    setAudioSettings({ sound: patch.sound ?? set.sound, music: patch.music ?? set.music });
  };

  return (
    <Screen title="SETTINGS">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.body}>
        <View style={ks.card}>
          <Text style={st.head}>SOUND</Text>
          <Toggle label="Sound effects" hint="Engine, coins, crashes" value={set.sound} onChange={(v) => audio({ sound: v })} />
          <Toggle label="Music" value={set.music} onChange={(v) => audio({ music: v })} />
          <Toggle label="Vibration" hint="On crashes, hard landings and checkpoints" value={set.vibration} onChange={(v) => updateSettings({ vibration: v })} />
        </View>

        <View style={ks.card}>
          <Text style={st.head}>CONTROLS</Text>
          <Toggle
            label="Split-screen pedals"
            hint={set.controlMode === 'splitscreen' ? 'Touch anywhere on the left half to brake, right half for gas' : 'Brake pedal bottom left, gas pedal bottom right'}
            value={set.controlMode === 'splitscreen'}
            onChange={(v) => updateSettings({ controlMode: v ? 'splitscreen' : 'pedals' })}
          />
          <Toggle label="Show frame rate" value={set.showFps} onChange={(v) => updateSettings({ showFps: v })} />
          <Text style={st.help}>
            Gas drives forward and tilts the nose up in the air. Brake slows the car, reverses once it has stopped, and tilts the nose down in the air. Keep the
            driver's head off the ground. Flips, long jumps and wheelies pay bonus coins; fuel cans refill the tank; a checkpoint flag lets you continue after a
            crash, up to three times per run.
          </Text>
        </View>

        <View style={ks.card}>
          <Text style={st.head}>PROGRESS</Text>
          <Text style={st.stat}>Levels finished: {completedLevels(save)} / {LEVEL_COUNT}</Text>
          <Text style={st.stat}>Stars: {totalStars(save)} / {LEVEL_COUNT * 3}</Text>
          <Text style={st.stat}>Vehicles owned: {save.unlockedVehicles.length} / {VEHICLE_COUNT}</Text>
          <Text style={st.stat}>Runs: {fmt(save.stats.runs)}   Distance: {fmt(save.stats.distance)} m   Coins earned: {fmt(save.stats.totalCoins)}</Text>
          {confirm ? (
            <View style={{ marginTop: 10 }}>
              <Text style={st.warn}>This deletes all coins, vehicles, upgrades and level progress. It cannot be undone.</Text>
              <View style={st.row}>
                <Btn
                  small
                  label="DELETE EVERYTHING"
                  color={C.red}
                  onPress={() => {
                    resetProgress();
                    setConfirm(false);
                  }}
                  style={{ flex: 1 }}
                />
                <Btn small label="CANCEL" color={C.grey} onPress={() => setConfirm(false)} style={{ flex: 1 }} />
              </View>
            </View>
          ) : (
            <Btn small label="RESET PROGRESS" color={C.grey} onPress={() => setConfirm(true)} style={{ marginTop: 10, alignSelf: 'flex-start' }} />
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  body: { gap: 10, paddingBottom: 18, maxWidth: 640, width: '100%', alignSelf: 'center' },
  head: { color: C.dim, fontSize: 12, fontWeight: '900', letterSpacing: 1.5, marginBottom: 2 },
  help: { color: C.dim, fontSize: 13, lineHeight: 19, marginTop: 6 },
  stat: { color: C.text, fontSize: 14, fontWeight: '600', marginTop: 4 },
  warn: { color: '#ff9c8a', fontSize: 13, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 10, marginTop: 8 },
});
