// Dynamic part of the Expo config. Everything static stays in app.json; this file
// adds the two plugins that need values computed here.
//
// 1. Google Mobile Ads. The AdMob *app* IDs must come from the environment and
//    never be committed. The plugin writes them into the native projects when
//    they are generated (`npx expo prebuild`, `npx expo run:android`, EAS Build):
//      Android: <meta-data android:name="com.google.android.gms.ads.APPLICATION_ID"> in AndroidManifest.xml
//      iOS:     GADApplicationIdentifier, SKAdNetworkItems and the tracking text in Info.plist
//    Without ADMOB_ANDROID_APP_ID / ADMOB_IOS_APP_ID the build uses Google's public
//    sample app IDs, which only ever serve test ads.
//
// 2. Android release build settings: code shrinking (see MINIFY) and the memory
//    the build itself may use (see BUILD_MEMORY).

const { withGradleProperties } = require('expo/config-plugins');

const SAMPLE_ANDROID_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const SAMPLE_IOS_APP_ID = 'ca-app-pub-3940256099942544~1458002511';
const APP_ID = /^ca-app-pub-\d{16}~\d{6,}$/;

function appId(name, sample) {
  const value = (process.env[name] || '').trim();
  if (!value) return sample;
  if (!APP_ID.test(value)) throw new Error(`${name} is not an AdMob app ID (expected ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX, with a "~")`);
  return value;
}

// Classes that are created by name at run time, so R8 cannot see that they are
// used. Without these rules a shrunk release build crashes before the first
// screen with "Failed to create an instance of androidx.work.impl.WorkDatabase":
// the Google Mobile Ads SDK brings in WorkManager, which starts from
// androidx.startup and opens a Room database whose generated class
// (WorkDatabase_Impl) R8 had removed.
const KEEP_RULES = `
# WorkManager and its Room database (used by the Google Mobile Ads SDK)
-keep class androidx.work.** { *; }
-keep class * extends androidx.room.RoomDatabase { *; }
-keep class androidx.startup.** { *; }
-keep class * implements androidx.startup.Initializer { *; }
-dontwarn androidx.work.**

# Google Mobile Ads, the consent SDK, and the React Native bridge to them
-keep class com.google.android.gms.ads.** { *; }
-keep class com.google.android.ump.** { *; }
-keep class io.invertase.googlemobileads.** { *; }

# Skia, Reanimated and Worklets are driven from C++ and JavaScript
-keep class com.shopify.reactnative.skia.** { *; }
-keep class com.swmansion.reanimated.** { *; }
-keep class com.swmansion.worklets.** { *; }
`;

// Release build: code shrinking is switched OFF. Expo turns R8 on by default,
// and that is what broke the first APK. The keep rules above are applied
// either way, so shrinking can be turned back on later by setting
// ANDROID_MINIFY=1 for a build (test that build on a phone before shipping it).
const MINIFY = process.env.ANDROID_MINIFY === '1';

// Only the two CPU types real phones use. The default also compiles all the
// native code (Skia, Reanimated, Hermes glue) for x86 and x86_64, which are only
// for emulators: twice the work and memory, and a much larger APK.
// Set ANDROID_ALL_ARCHS=1 for a build that must run in an emulator.
const BUILD_ARCHS = process.env.ANDROID_ALL_ARCHS === '1' ? ['armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64'] : ['arm64-v8a', 'armeabi-v7a'];

// Cloud builds were dying with "Gradle build daemon disappeared unexpectedly":
// the build process ran out of memory. Gradle gets a bigger heap than the 2 GB
// default, and fewer things are compiled at the same time.
const BUILD_MEMORY = {
  'org.gradle.jvmargs': '-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError',
  'kotlin.daemon.jvmargs': '-Xmx2048m',
  'org.gradle.workers.max': '2',
};

function withBuildMemory(config) {
  return withGradleProperties(config, (cfg) => {
    for (const [key, value] of Object.entries(BUILD_MEMORY)) {
      const existing = cfg.modResults.find((item) => item.type === 'property' && item.key === key);
      if (existing) existing.value = value;
      else cfg.modResults.push({ type: 'property', key, value });
    }
    return cfg;
  });
}

module.exports = ({ config }) => {
  const name = (p) => (Array.isArray(p) ? p[0] : p);
  const plugins = (config.plugins || []).filter((p) => name(p) !== 'react-native-google-mobile-ads' && name(p) !== 'expo-build-properties');
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
  plugins.push([
    'expo-build-properties',
    {
      android: {
        enableMinifyInReleaseBuilds: MINIFY,
        enableShrinkResourcesInReleaseBuilds: MINIFY,
        buildArchs: BUILD_ARCHS,
        extraProguardRules: KEEP_RULES,
      },
    },
  ]);
  return withBuildMemory({ ...config, plugins });
};
