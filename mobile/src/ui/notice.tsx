// A short message that drops in from the top of any screen: reward
// confirmations ("+500 coins"), and "no ad available". One host, mounted in App.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type NoticeTone = 'reward' | 'info';

let push: ((text: string, tone: NoticeTone) => void) | null = null;

export function notify(text: string, tone: NoticeTone = 'reward'): void {
  push?.(text, tone);
}

export function NoticeHost() {
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState<{ text: string; tone: NoticeTone }>({ text: '', tone: 'reward' });
  const a = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    push = (text, tone) => {
      setMsg({ text, tone });
      a.stopAnimation();
      a.setValue(0);
      Animated.sequence([
        Animated.spring(a, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 8 }),
        Animated.delay(1900),
        Animated.timing(a, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]).start();
    };
    return () => {
      push = null;
    };
  }, [a]);

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[
        st.box,
        { top: insets.top + 10, backgroundColor: msg.tone === 'reward' ? '#1f7a43' : '#33434f' },
        { opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) }] },
      ]}
    >
      <Text style={st.text}>{msg.text}</Text>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  box: { position: 'absolute', alignSelf: 'center', maxWidth: '88%', borderRadius: 14, paddingHorizontal: 18, paddingVertical: 10, borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)', zIndex: 50, elevation: 10 },
  text: { color: '#ffffff', fontSize: 15, fontWeight: '900', textAlign: 'center' },
});
