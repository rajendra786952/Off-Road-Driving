// Banner for the bottom of the menu screens. It is an anchored adaptive banner:
// full width, with the height Google picks for the device. The native view has
// no height until an ad has loaded, and the component is removed if loading
// fails, so a missing connection never leaves a hole in the layout. (It is not
// wrapped in a zero-height box: a hidden ad view may be refused an ad.)
import React, { memo, useState } from 'react';
import { View } from 'react-native';
import { adUnitId } from './AdConfig';
import { gma } from './native';
import { describeAdError, setAdsStatus } from './diagnostics';
import { useBannersAllowed } from './AdMobManager';

export const BannerAd = memo(function BannerAd() {
  const allowed = useBannersAllowed();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const lib = allowed && !failed ? gma() : null;
  if (!lib) return null; // also covers builds without the AdMob native module (Expo Go)
  const SdkBanner = lib.BannerAd;
  return (
    <View accessibilityLabel="Advertisement" style={{ alignItems: 'center' }}>
      <SdkBanner
        unitId={adUnitId('banner')}
        size={lib.BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        onAdLoaded={() => {
          setAdsStatus({ banner: 'loaded and showing' });
          setLoaded(true);
        }}
        onAdFailedToLoad={(e) => {
          setAdsStatus({ banner: describeAdError(e) });
          setFailed(true);
        }}
      />
    </View>
  );
});
