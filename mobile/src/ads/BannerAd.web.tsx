// Browser build: AdMob banners exist only in the Android / iOS app. Development
// builds draw a placeholder of the same size so the layout can be checked.
import React, { memo } from 'react';
import { Text, View } from 'react-native';
import { useBannersAllowed } from './AdMobManager';

export const BannerAd = memo(function BannerAd() {
  const allowed = useBannersAllowed();
  if (!__DEV__ || !allowed) return null;
  return (
    <View accessibilityLabel="Advertisement" style={{ height: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1b2a35', borderTopWidth: 1, borderTopColor: '#2c4252' }}>
      <Text style={{ color: '#9db1bf', fontSize: 12, fontWeight: '700' }}>Ad banner placeholder (real AdMob banner in the Android / iOS build)</Text>
    </View>
  );
});
