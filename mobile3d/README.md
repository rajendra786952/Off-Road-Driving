# Offroad Racing 4x4 3D (React Native)

The 3D off-road game as a native app: Expo SDK 58, React Native 0.88, Three.js 0.170 drawing
straight into a native GL view (`expo-gl`). No WebView. The game logic, the tracks, the
textures and the models all live in this folder.

- 46 tracks in 10 regions, 4 vehicles, upgrades, tyres, diff locks, winch, paint
- checkpoints that save the run, ghost of your best time, daily challenge, achievements
- menus, garage (live 3D preview), HUD and touch controls are React Native views

## Run it

```
npm install
npm run web        # browser build, keyboard: arrows/WASD, Space, L, X, F, R, C, P
npx expo start     # then open it in a development build on a phone
```

Every native module it uses is part of Expo Go, so Expo Go works for a first look. Expo Go is
slow, though: for real frame rates use a release build:

```
eas build --platform android --profile preview
```

## Where things are

| Folder | What |
| --- | --- |
| `src/drive/core` | physics, track builder, session, obstacles, progress. Unchanged from the browser game |
| `src/drive/tracks` | the 46 track definitions. Unchanged |
| `src/drive/render` | Three.js world, car, sky, trees, hazards |
| `src/drive/DriveGame.js` | the game loop, cameras, effects, results |
| `src/drive/hudBridge.ts` | what the game tells the HUD and what the controls tell the game |
| `src/drive/audio.ts` | sounds (expo-audio) |
| `src/platform` | GL set-up for Three.js, asset loading, haptics |
| `src/screens`, `src/ui` | React Native menus, HUD, touch controls, garage preview |
| `src/state/save.ts` | the save (AsyncStorage) |
| `assets/source` | the original textures and models |
| `assets/game` | what the app loads: textures as raw pixel files, made by `npm run bake` |

## Textures: `npm run bake`

A browser decodes and resizes pictures with a 2D canvas. React Native has none, so
`scripts/bake-assets.mjs` does that work ahead of time: it reads `assets/source`, writes raw
RGBA files to `assets/game` and regenerates `src/platform/assetIndex.ts`. It also draws the
tree foliage cards and the START / CHECKPOINT banners, which used to be drawn at run time.
Run it again whenever a source texture or model changes.

## What differs from the browser version

- No bloom and no photographic (HDR) sky: both need render features phone GL drivers do not
  reliably have. The procedural sky is used on every track. "Ultra" quality is gone.
- Ground photos are 512 px (the browser's Medium setting) at every quality level.
- Sound is recorded clips with an engine loop that follows the revs, not synthesised audio.
- No gamepad support yet. Tilt steering uses the accelerometer.
- The classic 2D mode is not here: it is the separate app in `../mobile`.

## Checks

```
npm run typecheck
npm test           # the game's own physics / track / progress tests
```

Two tests fail the same way as in the original project: one expects tracks to be locked
(`UNLOCK_ALL_TRACKS` is switched on in `src/game/config/constants.js`), one is a winch tuning check.
