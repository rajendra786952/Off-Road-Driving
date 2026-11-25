// Browser build: AdMob banners exist only in the Android / iOS app. Development
// builds draw a placeholder of the same size so the layout can be checked.
import React, { memo } from 'react';
import { useBannersAllowed } from './AdMobManager';
import { SimBanner } from './simAd';

export const BannerAd = memo(function BannerAd() {
  const allowed = useBannersAllowed();
  if (!__DEV__ || !allowed) return null;
  return <SimBanner />;
});
