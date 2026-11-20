# Trail Torque

3D off-road driving simulator for the web and Android.

- **React** renders the whole interface (home, regions, tracks, garage, profile, achievements, settings).
- **Three.js** renders the 3D expedition: 8 regions, 40 tracks, about 8 hours of main-track driving.
- **Phaser 3** runs the original 2D hill-climb, kept as "Classic 2D".
- **Capacitor** packages it for Android. Offline only, no backend, no asset files (all art and sound are generated in code).

> The project is **Vite + Capacitor**. It is not React Native. React and Phaser/Three never share a canvas:
> the React shell is DOM, the 3D drive has its own WebGL canvas, and Phaser is asleep and hidden unless
> Classic 2D is open (`src/main.js`).

> **React Native version of the 2D game:** `mobile/` holds a separate Expo / React Native app that rebuilds
> the classic 2D hill-climb natively with 100 levels and 100 vehicles. It is named **Offroad Racing 4x4**. See [mobile/README.md](mobile/README.md).
> It does not change anything described below.

## Quick start

Requires **Node 20+**.

```bash
npm install
npm run dev          # http://localhost:5173   (add ?debug=1 to unlock every track)
npm test             # tests: tracks, physics, rules, progression, save migration, classic core
npm run bot          # headless test driver over all 40 tracks (add: -- <trackId>, -- all --stock)
npm run physcheck    # physics sanity numbers
node scripts/pars.mjs   # re-derive gold times from the test driver after changing tracks or physics
node scripts/obstacles.mjs [trackId|all] [tier]   # list the generated obstacle layer per track and prove it is playable
node scripts/bot.mjs all --obstacles=hard         # test driver with generated obstacles (easy | medium | hard | extreme)
```

Desktop keys while driving: **arrows / WASD** drive, **Space** handbrake, **L** low range, **X** diff lock,
**F** winch, **R** recover, **C** camera, **Q / E** or drag to look around, **P / Esc** pause, Ctrl + Up half throttle.
A gamepad works too: left stick steers, triggers are the pedals, A handbrake, B winch, X low range, Y diff lock, bumpers recover / camera.

## Android

```bash
npm run android          # build web -> cap sync -> open Android Studio
cd android && ./gradlew assembleDebug    # APK: android/app/build/outputs/apk/debug/app-debug.apk
```

## The world

| # | Region | Level | Tracks |
|---|---|---|---|
| 1 | Forest Trails | Beginner | Forest Entry, Fallen Forest, River Crossing, Deep Forest Challenge, Hidden Forest Trail |
| 2 | Mud Valley | Intermediate | Muddy Entrance, Deep Mud Pit, Waterlogged Valley, Mud Mountain, Swamp Survival |
| 3 | Rocky Mountains | Advanced | Rocky Entrance, Rock Crawler, Mountain Climb, Mountain Descent, Giant Rock Challenge |
| 4 | Deadly Ridge | Expert | Ridge Entry, Cliff Bridge, Deadly Pass, Narrow Mountain Road, Final Ridge |
| 5 | Extreme Expedition | Extreme | Snow Entry, Frozen River, Blizzard Mountain, Ice Valley, Extreme Summit |
| 6 | Desert Storm | Advanced | Desert Entry, Sand Dune Challenge, Lost Desert Trail, Rocky Desert Pass, Desert Survival |
| 7 | Jungle Expedition | Expert | Jungle Entry, Waterfall Crossing, Deep Jungle, Forgotten Jungle Road, Jungle Survival |
| 8 | Volcanic Wasteland | Extreme | Ash Valley, Black Rock Trail, Lava Ridge, Volcanic Mountain Climb, Final Extreme Expedition |

Every track has 5-8 ordered checkpoints (the finish only counts after all of them), two optional side
trails ending in a supply cache, three hidden relics off the trail, five objectives, medals and a best time.
Tracks unlock in order; finishing a region opens the next. Three difficulty levels (Casual / Standard /
Hardcore) change damage, fuel use, recovery penalties and rewards.

Region mechanics: mud that bogs, rivers that drown engine power, rock gardens that need clearance and
diff locks, cliff ledges and rail-less bridges, ice with almost no grip, sand that drags and an engine that
**overheats** when worked hard at low speed (desert, volcano), waterfalls and flooded rivers, and lava
that burns the truck but is always beside the driving line, never on it.

Weather (clear, overcast, rain, heavy rain, fog, mist, snow, blizzard, heat haze, sandstorm, ash fall)
and time of day are per track and can **change during a run**: a storm arrives, the sun sets, you finish
by headlight. Both affect grip and visibility. See `weatherPlan` / `hours` in `src/drive/tracks/meta.js`.

## How it is built

- **Tracks are authored data.** `src/drive/tracks/*.js` describe each route turtle-style
  (`go(length, turn, grade)`) plus features: `mud`, `rocks`, `boulder`, `log`, `ford`, `bridge`, `bypass`,
  `spur`, `ice`, `lava`, `fall`, `anchor`, banked sections, cliff sides. `core/track.js` compiles that into
  a heightfield with the road carved in. The renderer builds meshes from the same 1 m grid the physics samples.
- **Physics** (`core/physics.js`): 6-DOF rigid body, four independently sprung raycast wheels, slip-based tyre
  forces in a friction circle, real wheel spin, open differentials with optional locks, high/low range,
  soft ground that tyres sink and dig into, chassis contact (clearance, rollover), colliders, water, winch.
  18 surface types in `core/surfaces.js`.
- **Photo assets** (all CC0 from polyhaven.com, used on Medium quality and above, loaded in the background):
  `public/textures/ground/` holds eight ground layers (grass, dirt, mud, rock, gravel, sand, snow, forest floor;
  1K colour + normal JPG) blended on the terrain per vertex and projected onto boulders;
  `public/textures/trees/` holds three bark photos for the trunks (leaf and needle cards are drawn in code, `render/trees.js`);
  `public/environments/` holds the HDR skies (`hdr` / `hdrLift` per region in `core/environments.js`).
  Low quality stays fully procedural.
- **Scenery** (`render/scenery.js`): instanced grass tufts that sway in the wind, pebbles, fallen logs and
  stumps, roadside marker posts (snow poles in the snow region) and drifting leaves / dust / embers,
  streamed around the truck. Visual only - no colliders, so driving and par times are unaffected.
- **Rendering** (`render/`): streamed terrain chunks with three LOD levels and skirts, instanced vegetation
  with a near/far LOD, physically based materials with procedural normal maps and an environment map
  (Medium/High), a procedural sky shader with a different cloud model and horizon silhouette per region,
  stars, aurora and crater glow, animated water, waterfalls, glowing lava, shadows, fog, precipitation.
  Low quality switches to Lambert shading with no shadows.
- **Upgrades** (`core/specs.js`): engine, tyre quality, suspension, fuel tank, lift kit, brakes (5 levels each),
  four tyre compounds, diff locks, winch. All change physics parameters; the garage preview shows the
  real model built from those parameters.
- **Rules** (`core/session.js`) and **progression** (`core/progress.js`) are pure JavaScript, shared by the
  game and the headless tests.

## Project layout

```
src/
  main.js                 shell: creates Phaser (classic only), mounts React, routes hardware back
  ui/                     React interface: App.jsx (screens), GaragePreview.jsx (3D), Backdrop.jsx (SVG art), ui.css
  drive/                  3D expedition
    core/                 pure logic: track, physics, session, surfaces, specs, progress, bot, validate
    tracks/               40 tracks in 8 region files + extra.js, meta.js (pars, weather, hours), regions.js
    render/               world.js, sky.js, carModel.js, geo.js
    DriveGame.js  hud.js  audio.js  launch.js
  game/                   classic 2D game (Phaser) + save system
tests/                    node:test suites
scripts/                  bot, pars, physcheck, diag
```

## Known limitations

- **Not tested on a physical Android phone.** The APK builds; frame rate on real devices is unverified.
  Three quality presets and dynamic resolution are available in Settings.
- **No GLTF/GLB models are shipped.** Vehicles, trees and scenery are built in code; ground textures and skies are photos.
  Materials are physically based with generated normal maps, but this is stylised low-poly, not photoreal.
- Track difficulty and gold times are tuned against the automated test driver, not human playtesting.
- Terrain does not deform (tyre tracks are drawn on soft ground). Wind affects sound, particles and clouds only.
- The interior camera is a minimal dashboard. Steering is by buttons (three speeds), no tilt control.
- Classic 2D keeps its original Phaser screens; only the 3D mode uses the new React interface.
