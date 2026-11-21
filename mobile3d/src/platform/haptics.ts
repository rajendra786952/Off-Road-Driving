// Haptic feedback. The game asks for a duration in milliseconds; phones get an impact of a matching weight.
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export function vibrate(ms = 40): void {
  if (Platform.OS === 'web') return;
  const style = ms >= 110 ? Haptics.ImpactFeedbackStyle.Heavy : ms >= 50 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light;
  Haptics.impactAsync(style).catch(() => {});
}
