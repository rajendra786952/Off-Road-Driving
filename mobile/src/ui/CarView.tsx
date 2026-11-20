// A parked car for the menus. The artwork is rendered once to an image (see
// render/carImage.ts) and shown with a plain <Image>; if that ever fails, a
// simple drawn silhouette in the car's colours is shown instead, so a car slot
// is never empty.
import React, { memo, useMemo, useState } from 'react';
import { Image, PixelRatio, View } from 'react-native';
import { carImageUri } from '../render/carImage';
import type { VehicleSpec } from '../data/vehicles';

interface Props {
  spec: VehicleSpec;
  width: number;
  height: number;
  /** Draw a soft shadow under the wheels. */
  shadow?: boolean;
}

export const CarView = memo(function CarView({ spec, width, height, shadow = true }: Props) {
  const [failed, setFailed] = useState(false);
  const uri = useMemo(
    () => carImageUri(spec, width, height, Math.min(3, Math.max(1, PixelRatio.get())), shadow),
    // the id and paint identify the artwork; the spec object itself may be recreated
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spec.id, spec.colors.main, width, height, shadow],
  );
  if (!uri || failed) return <CarFallback spec={spec} width={width} height={height} />;
  return (
    <Image
      accessibilityLabel={spec.name}
      source={{ uri }}
      resizeMode="contain"
      fadeDuration={0}
      onError={() => setFailed(true)}
      style={{ width, height }}
    />
  );
});

/** Body, cabin and two wheels built from plain views. */
export const CarFallback = memo(function CarFallback({ spec, width, height }: Props) {
  const k = Math.min(width / (spec.body.w + 40), height / (spec.body.h + spec.wheel.r * 2 + 50));
  const bw = spec.body.w * k;
  const bh = spec.body.h * k;
  const wr = spec.wheel.r * k;
  return (
    <View accessibilityLabel={spec.name} style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: bw, alignItems: 'center' }}>
        <View style={{ width: bw * 0.42, height: bh * 0.8, backgroundColor: spec.colors.main, borderTopLeftRadius: 8 * k, borderTopRightRadius: 14 * k, opacity: 0.9 }} />
        <View style={{ width: bw, height: bh, backgroundColor: spec.colors.main, borderRadius: 7 * k, borderBottomWidth: bh * 0.3, borderBottomColor: spec.colors.dark }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: (spec.wheel.base * 2 + spec.wheel.r * 2) * k, marginTop: -wr * 0.7 }}>
          {[0, 1].map((i) => (
            <View key={i} style={{ width: wr * 2, height: wr * 2, borderRadius: wr, backgroundColor: '#17191d', borderWidth: wr * 0.42, borderColor: '#17191d', alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: wr * 1.1, height: wr * 1.1, borderRadius: wr * 0.55, backgroundColor: '#aab1ba' }} />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
});
