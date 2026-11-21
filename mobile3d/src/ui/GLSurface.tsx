// A GL view that fills its parent and tells the caller when the context is ready.
//
// A phone screen has about three physical pixels per layout point; drawing a 3D scene at that
// resolution is wasted work. The view is therefore laid out smaller (so its drawing buffer has
// `pixelRatio` pixels per point) and scaled back up to fill the parent.
import React, { useState } from 'react';
import { PixelRatio, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { GLView } from 'expo-gl';
import type { GL } from '../platform/gl';

interface Props {
  /** Drawing-buffer pixels per layout point (capped at the screen's own density). */
  pixelRatio: number;
  onContext(gl: GL, width: number, height: number): void;
  onResize?(width: number, height: number): void;
  style?: StyleProp<ViewStyle>;
}

export default function GLSurface({ pixelRatio, onContext, onResize, style }: Props) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const k = Math.min(1, pixelRatio / PixelRatio.get());
  return (
    <View
      style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, style]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width < 2 || height < 2) return;
        if (size && Math.abs(size.w - width) < 1 && Math.abs(size.h - height) < 1) return;
        setSize({ w: width, h: height });
        if (size) onResize?.(width, height);
      }}
    >
      {size && (
        <GLView
          style={{ width: size.w * k, height: size.h * k, transformOrigin: 'top left', transform: [{ scale: 1 / k }] }}
          onContextCreate={(gl) => onContext(gl, size.w, size.h)}
        />
      )}
    </View>
  );
}
