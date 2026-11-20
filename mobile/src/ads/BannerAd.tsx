// Banner for the bottom of the menu screens. It is an anchored adaptive banner:
// full width, with the height Google picks for the device. It takes no space
// until an ad has actually loaded, and disappears again if loading fails, so a
// missing connection never leaves a hole in the layout.
import React, { memo, useState } from 'react';
import { View } from 'react-native';
import { BannerAd as SdkBanner, BannerAdSize } from 'react-native-google-mobile-ads';
import { adUnitId } from './AdConfig';
import { useBannersAllowed } from './AdMobManager';

export const BannerAd = memo(function BannerAd() {
  const allowed = useBannersAllowed();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!allowed || failed) return null;
  return (
    <View accessibilityLabel="Advertisement" style={{ alignItems: 'center', height: loaded ? undefined : 0, overflow: 'hidden' }}>
      <SdkBanner
        unitId={adUnitId('banner')}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        onAdLoaded={() => setLoaded(true)}
        onAdFailedToLoad={() => setFailed(true)}
      />
    </View>
  );
});
