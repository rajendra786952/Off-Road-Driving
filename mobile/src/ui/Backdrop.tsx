// Scenery behind a menu screen, with a dark wash over it so text stays readable.
// Falls back to the plain background colour if the picture cannot be made.
import React, { memo, useMemo } from 'react';
import { Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import { menuBackdropUri } from '../render/menuBackdrop';
import type { ThemeId } from '../data/themes';

export const Backdrop = memo(function Backdrop({ theme, dim = 0.45 }: { theme: ThemeId; dim?: number }) {
  const { width, height } = useWindowDimensions();
  const uri = useMemo(() => (width > 0 && height > 0 ? menuBackdropUri(theme, width, height) : null), [theme, width, height]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {uri ? <Image source={{ uri }} resizeMode="cover" fadeDuration={0} style={StyleSheet.absoluteFill} /> : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(8,14,20,${uri ? dim : 0})` }]} />
    </View>
  );
});
