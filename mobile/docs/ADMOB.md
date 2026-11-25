# Google AdMob setup

The game uses the official Google Mobile Ads SDK through
[`react-native-google-mobile-ads`](https://github.com/invertase/react-native-google-mobile-ads) (v17).
All ad code lives in `src/ads/`; screens never call the SDK directly.

> **Status.** The integration is written, type-checked, unit-tested, and exercised in the browser build with
> simulated ads. It has **not yet run on a phone**: no APK could be built on the development machine (the
> drive was full). The first device build is the real test of the SDK calls. See "First device build" below.

## Local development shows simulated ads

In a development run (`npm run web`, Expo Go) a banner placeholder appears on the menu screens, and the
interstitial and rewarded ads are drawn as a full-screen "simulated ad" with a 3 second wait (`src/ads/simAd.tsx`).
Release builds never show these. Real Google ads only appear in a build of the app (see below).

## Expo Go has no real ads

AdMob needs native code that exists only in a build of this app. Expo Go, and any build made before the
library was added, do not have it. The game detects that (`src/ads/native.ts`) and runs normally with the
ads layer switched off: no banners, no interstitials, and the "watch an ad" buttons stay hidden. It no
longer stops with `'RNGoogleMobileAdsModule' could not be found`.

To test ads, install a build of the app itself: `npx expo run:android` with a phone connected, or
`eas build --profile development --platform android`.

## If no ads appear

Open **Settings -> ADS** in the game. It shows whether the ads code is in the build, what the consent service
answered, whether the ads service started, which units are requested (test or your own), and the last result
or error for the banner, interstitial and rewarded ad. The **AD INSPECTOR** button opens Google's own tool.

Common answers:

- *Ads code in this build: no* - this is Expo Go or an old build. Ads need a build of the app.
- *failed: ... no-fill* on your own units - normal for a new AdMob app or ad unit. Google serves few or no
  ads until the app is reviewed and the unit has been live for some hours. Test units always fill.
- Units say *test* in a cloud build although `.env` has your IDs - `.env` is not uploaded to EAS. Add the
  variables to the EAS environment (`eas env:create`), or keep test ads for internal builds.

Ads are held back only when consent is definitely required and not yet given. An "unknown" answer from the
consent service (for example because no consent message has been created for the app ID) no longer switches
ads off; that was the reason the first working APK showed none.

## 1. Where the IDs go

Nothing is hardcoded. IDs are read from `.env` (ignored by git; `.env.example` lists every setting).

| Setting | What it is | Used by |
|---|---|---|
| `ADMOB_ANDROID_APP_ID`, `ADMOB_IOS_APP_ID` | **App** IDs (contain `~`) | `app.config.js` writes them into `AndroidManifest.xml` / `Info.plist` when the native project is generated |
| `EXPO_PUBLIC_ADMOB_ANDROID_BANNER` / `_INTERSTITIAL` / `_REWARDED` | Android **ad unit** IDs (contain `/`) | `src/ads/AdConfig.ts` |
| `EXPO_PUBLIC_ADMOB_IOS_BANNER` / `_INTERSTITIAL` / `_REWARDED` | iOS ad unit IDs | `src/ads/AdConfig.ts` |

Currently set in `.env`: the Android app ID and the Android **banner** unit. Still to create in the
[AdMob console](https://admob.google.com) (Apps -> your app -> Ad units -> Add ad unit):

1. an **Interstitial** unit -> `EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL`
2. a **Rewarded** unit -> `EXPO_PUBLIC_ADMOB_ANDROID_REWARDED`
3. for iOS: add the iOS app, then its app ID and three units.

Until a unit ID is filled in, that format uses Google's public **test** unit: it works, but earns nothing.

Rules the code applies:

- **Development builds always use test ads**, whatever is in `.env`. Never tap your own live ads: AdMob
  suspends accounts for it.
- A release build uses the production ID when it is present and well-formed, otherwise the test unit.
- `EXPO_PUBLIC_ADMOB_USE_TEST_ADS=1` forces test ads in a release build (for internal testers).
- `EXPO_PUBLIC_ADMOB_ENABLED=0` removes ads completely.
- Changing an **app** ID needs a native rebuild. Changing a **unit** ID needs a new JavaScript bundle.

For release builds made with EAS, put the same variables in the EAS environment (`eas env:create`), because
`.env` is not uploaded.

## 2. Native configuration

There is no hand-edited `AndroidManifest.xml` or `Info.plist`: the `android/` and `ios/` folders are generated
(`npx expo prebuild`), and the library's config plugin, configured in `app.config.js`, writes:

- **Android:** `<meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="...">`
  plus the delayed-measurement flag.
- **iOS:** `GADApplicationIdentifier`, `SKAdNetworkItems`, `NSUserTrackingUsageDescription`.

Check the result with `npx expo config --type public` (look for `react-native-google-mobile-ads`), or after
`npx expo prebuild -p android` in `android/app/src/main/AndroidManifest.xml`.

## 3. What shows where

| Format | Where | Rule |
|---|---|---|
| **Banner** (anchored adaptive, full width) | Bottom of the home screen, the garage (vehicle selection) and level select | Takes no space until an ad has loaded; disappears if loading fails. Never on the driving screen. |
| **Interstitial** | When the player leaves a result panel or quits a run (NEXT, LEVELS, GARAGE, QUIT) | Only if the frequency rules allow it, see below. Never over a running level. RETRY never shows one. |
| **Rewarded** (always the player's choice) | Home: free coins. Result after a win: double the reward. Result after a crash: extra life. Garage: unlock a Sport-series vehicle. Level select: open the next locked level. | The button appears only while an ad is loaded. |

### Interstitial frequency (`AdFrequencyManager.ts`)

- none in the first 60 seconds after the app starts;
- at least 120 seconds between two full-screen ads, and a rewarded ad the player chose counts;
- after a win: only once 3 levels have been completed since the last interstitial;
- when leaving a failed run or quitting: only after 2 runs without an ad;
- at most 12 per session.

`EXPO_PUBLIC_ADMOB_INTERSTITIAL_EVERY_LEVELS` and `..._MIN_INTERVAL_SEC` change the first two numbers;
the rest are in `AdConfig.ts`.

### Rewards

| Reward | Amount | Limit |
|---|---|---|
| Free coins | 400 + 20 x highest unlocked level | one per ad |
| Double the level reward | the "Total earned" of that result | once per result |
| Extra life | restart at the last checkpoint, keeps the run's coins | once per run, offered after the three free continues are used |
| Unlock a vehicle | the ten Sport-series vehicles, 3 ads each (they can still be bought with coins) | progress is saved per vehicle |
| Unlock a level | the first locked level | one skipped level at a time: finish it before skipping another |

A reward is granted only when AdMob has fired its "earned reward" event **and** the ad has been closed.
A skipped ad shows "Ad skipped - no reward this time"; a missing ad shows "No ad available right now".
Rewards are written to the same save as coins and progress (`save.ads`), and a second tap while an ad is
opening does nothing.

## 4. Files

```
src/ads/
  AdConfig.ts            IDs from the environment, frequency numbers, audience settings
  units.ts               test unit IDs and ID validation (pure, unit-tested)
  AdFrequencyManager.ts  when an interstitial may show (pure, unit-tested)
  AdMobManager.ts        the single entry point: start-up, preloading, "is a level running?", show calls
  FullScreenAd.ts        load -> ready -> show -> closed -> reload, with retry back-off (30 s ... 5 min)
  InterstitialAd.ts  RewardedAd.ts   the two full-screen formats
  BannerAd.tsx           the banner component
  rewards.ts             watchAdForReward(): show, then grant only if earned, then confirm
  sdk.ts                 consent (Google UMP), request configuration, SDK initialise
  native.ts              loads the ads library only when its native module is in the build
  *.web.ts(x)            browser build: no SDK; development builds simulate ads to test the flows
app.config.js            injects the app IDs into the native projects
.env.example             every setting, documented
```

## 5. Behaviour worth knowing

- **Never during play.** While the car is being driven nothing is loaded, shown, or kept on screen. Ads are
  preloaded in the menus and on the result panel.
- **Offline.** Loads fail quietly and retry with a growing delay; banners collapse; reward buttons stay
  hidden. The game itself needs no connection.
- **Audio.** Music and engine pause while a full-screen ad is open.
- **Consent.** On start the game calls Google's User Messaging Platform. For players in the EEA / UK you must
  create a consent message in the AdMob console (Privacy & messaging), or no ads will be served there.
- **Audience.** If the store listing targets children, set `EXPO_PUBLIC_ADMOB_CHILD_DIRECTED=1` (ads are then
  requested as child-directed and rated G) and follow Google Play's Families policy.

## Release builds and R8

The Google Mobile Ads SDK brings in WorkManager, which opens a Room database by class name when the app
starts. With R8 code shrinking on (Expo's default for release builds) that class was removed and the app
closed immediately with `Failed to create an instance of androidx.work.impl.WorkDatabase`. `app.config.js`
now turns shrinking off and adds keep rules for WorkManager, Room, the ads SDK, Skia and Reanimated.

## 6. First device build

```bash
cd mobile
npx expo run:android          # debug build on a connected phone or emulator; shows TEST ads
```

A debug APK ends up in `android/app/build/outputs/apk/debug/`. The build needs several GB of free disk space.

Then check, in this order:

1. The app starts, and the device log shows the Mobile Ads SDK initialising.
2. A "Test Ad" banner appears at the bottom of the home screen, garage and level select.
3. No banner on the driving screen.
4. Home -> "FREE +420": a test rewarded video plays; closing it after it finishes adds the coins; closing it
   early adds nothing.
5. Finish three levels, then press NEXT or LEVELS: one test interstitial; none on the following level.
6. Airplane mode: the game plays normally, no banners, no reward buttons.
7. Coins, vehicles and level progress are unchanged after all of the above.

Before publishing: fill in the interstitial and rewarded unit IDs, add `app-ads.txt` to your developer
website (AdMob console -> Apps -> app-ads.txt), declare ads in the Play Console (App content -> Ads), and
complete the Data safety form (the SDK collects device identifiers).
