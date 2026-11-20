// Dynamic part of the Expo config. Everything static stays in app.json; this file
// only adds the Google Mobile Ads plugin, because the AdMob *app* IDs must come
// from the environment and never be committed.
//
// The plugin writes them into the native projects when they are generated
// (`npx expo prebuild`, `npx expo run:android`, EAS Build):
//   Android: <meta-data android:name="com.google.android.gms.ads.APPLICATION_ID"> in AndroidManifest.xml
//   iOS:     GADApplicationIdentifier, SKAdNetworkItems and the tracking text in Info.plist
//
// Without ADMOB_ANDROID_APP_ID / ADMOB_IOS_APP_ID the build uses Google's public
// sample app IDs, which only ever serve test ads.

const SAMPLE_ANDROID_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const SAMPLE_IOS_APP_ID = 'ca-app-pub-3940256099942544~1458002511';
const APP_ID = /^ca-app-pub-\d{16}~\d{6,}$/;

function appId(name, sample) {
  const value = (process.env[name] || '').trim();
  if (!value) return sample;
  if (!APP_ID.test(value)) throw new Error(`${name} is not an AdMob app ID (expected ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX, with a "~")`);
  return value;
}

module.exports = ({ config }) => {
  const plugins = (config.plugins || []).filter((p) => (Array.isArray(p) ? p[0] : p) !== 'react-native-google-mobile-ads');
  plugins.push([
    'react-native-google-mobile-ads',
    {
      androidAppId: appId('ADMOB_ANDROID_APP_ID', SAMPLE_ANDROID_APP_ID),
      iosAppId: appId('ADMOB_IOS_APP_ID', SAMPLE_IOS_APP_ID),
      // no measurement before the player has answered the consent form
      delayAppMeasurementInit: true,
      userTrackingUsageDescription: 'This lets the game show ads that are more relevant to you. The game works the same either way.',
      // Google's own ad network; add your mediation partners' IDs here if you use mediation
      skAdNetworkItems: ['cstr6suwn9.skadnetwork'],
    },
  ]);
  return { ...config, plugins };
};
