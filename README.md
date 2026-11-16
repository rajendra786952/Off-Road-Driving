# Trail Torque

Off-road driving game for Android. **Capacitor + Vite**, with two game modes in one app:

- **Expedition 3D** - a 3D off-road driving simulator (Three.js + a custom 4x4 physics model):
  5 regions, 20 tracks, about 4 hours of main-track driving.
- **Classic 2D / Endless 2D** - the original side-scrolling hill-climb (Phaser 3 + Matter.js), unchanged.

Offline only, no backend. All art and sound are generated in code (no asset files).

> This project is **Capacitor**, not React Native. The 3D mode runs in its own WebGL canvas;
> Phaser is put to sleep while you drive, so the two renderers never share a GL context.

## Quick start

Requires **Node 20+**.

```bash
npm install
npm run dev          # http://localhost:5173   (add ?debug=1 to unlock every track for testing)
npm test             # 25 unit tests: 2D core + 3D tracks, physics, rules, progression
npm run bot          # headless test driver over all 20 tracks (time, recoveries, fuel)
npm run physcheck    # physics sanity numbers (acceleration, braking, climb limits, rollover)
```

Desktop keys in 3D: **arrows / WASD** drive, **Space** handbrake, **L** low range, **X** diff lock,
**E** winch, **R** recover, **C** camera, **P / Esc** pause. Ctrl + Up = half throttle.

## Android

```bash
npm run android          # build web -> cap sync -> open Android Studio
npm run android:run      # same, but runs on a connected device
cd android && ./gradlew assembleDebug    # APK at android/app/build/outputs/apk/debug/
```

## Expedition 3D

### World

| Region | Tracks | What it teaches | Recommended kit |
|---|---|---|---|
| Forest Trails | Forest Entry, Fallen Forest, River Crossing, Deep Forest Challenge | rocks, logs, fords, mud, steep dirt | stock |
| Mud Valley | Muddy Entrance, Deep Mud Pit, Waterlogged Valley, Mud Mountain | traction loss, deep mud, wading, muddy climbs | mud tyres, winch |
| Rocky Mountains | Rocky Entrance, Rock Crawler, Mountain Climb, Mountain Descent | rock crawling, wheel lift, long climbs/descents | rock tyres, lift, diff locks |
| Deadly Ridge | Ridge Entry, Cliff Bridge, Deadly Pass, Final Ridge | cliff ledges, rail-less bridges, fog, knife-edge ridge | brakes, diff locks, winch |
| Extreme Expedition | Snow Entry, Frozen River, Blizzard Mountain, Extreme Summit | snow, ice, blizzard, everything combined | studded snow tyres |

Every track has 5-8 checkpoints (taken in order - the finish only counts after all of them),
2 optional side trails ending at a supply cache, objectives, medals and a best time.
Tracks unlock in order; finishing a region opens the next one.

### How a track is built

Tracks are **authored data**, not random terrain. `src/drive/tracks/*.js` describe each route
turtle-style (`go(length, turn, grade)`) plus features: `mud()`, `rocks()`, `log()`, `ford()`,
`bridge()`, `bypass()`, `spur()`, `ice()`, `anchor()`, banked/off-camber sections, cliff sides.
`core/track.js` compiles that into a centreline and a continuous heightfield **with the road carved
into it**, so roads always follow real terrain. The renderer builds its meshes from the same
1 m height grid the physics samples - what you see is what the wheels touch.

### Vehicle physics (`src/drive/core/physics.js`)

6-DOF rigid body with four independent raycast wheels: suspension spring/damper/bump-stop per wheel,
slip-ratio + slip-angle tyre forces in a friction circle, real wheel spin (wheels spin up, lock, slip),
open differentials per axle (a lifted wheel steals the torque) with optional diff locks, high/low range,
engine braking, soft ground (tyres sink, spinning tyres dig in, the belly drags), chassis contact points
(ground clearance, rollover, resting on the roof), tree/boulder colliders, water drag and wading depth, winch.

Surface table (`core/surfaces.js`): dirt, gravel, grass, mud, deep mud, bog, rock, wet rock, river bed,
sand, snow, deep snow, ice, wood, scree - each with grip, rolling resistance, sink, dig and drag.
Weather (clear, overcast, rain, heavy rain, fog, snow, blizzard) changes grip and visibility.

### Upgrades (all change physics parameters - `core/specs.js`)

Engine, tyre quality, suspension (travel + damping), fuel tank, lift kit (clearance, but a higher centre
of gravity), brakes - 5 levels each, per vehicle. Equipment: 4 tyre compounds (all-terrain, mud, rock,
studded snow), diff locks, winch. With a stock truck the test driver cannot finish 6 of the 20 tracks
(Deep Mud Pit, Waterlogged Valley, Mud Mountain, Final Ridge, Blizzard Mountain, Extreme Summit -
check with `npm run bot -- all --stock`); on the others upgrades make the run faster and safer
rather than possible.

### Testing approach

`core/` is pure JavaScript with no rendering, so the real physics and rules run in Node:

- `scripts/bot.mjs` drives every track with a test driver that only uses player controls
  (steer, pedals, low range, diff lock, winch, recover). Gold par times come from its runs
  (`scripts/pars.mjs`), so every par is achievable.
- `tests/drive.test.mjs` checks all 20 tracks compile to valid, distinct, non-overlapping geometry
  with the road on the terrain, plus physics behaviour, session rules, progression and save migration.

## Project layout

```
src/
  main.js                       Phaser config, scene list
  game/                         menus + classic 2D game (Phaser)
    scenes/                     Boot, Menu, Expedition (region/track select), Garage, Settings,
                                LevelSelect + Level (classic 2D)
    core/saveModel.js           save v3: coins, vehicles, upgrades, tyres, gear, 2D levels, 3D tracks, XP
  drive/                        Expedition 3D
    core/                       pure logic, unit tested, no Three.js
      track.js                  TrackBuilder DSL + terrain heightfield + queries
      physics.js                4x4 vehicle model
      session.js                run rules: checkpoints, fuel, damage, recovery, caches, scoring
      surfaces.js  specs.js     surface/tyre/weather tables, vehicle specs + upgrade effects
      progress.js               unlock chain, rewards, achievements
      bot.js  validate.js       test driver, geometry checks
    tracks/                     the 20 tracks (forest, mud, rocky, ridge, snow) + metadata
    render/                     Three.js world (streamed terrain, instanced trees, water, bridges, weather), car model
    DriveGame.js  hud.js  audio.js  launch.js
tests/                          node:test suites
scripts/                        bot, par generation, physics check, failure diagnosis
```

## Tuning

| To change... | Edit |
|---|---|
| a track's layout or obstacles | `src/drive/tracks/<region>.js`, then `npm run bot -- <trackId>` |
| par times after changing tracks or physics | `node scripts/pars.mjs` (rewrites `tracks/meta.js`) |
| grip / mud / snow behaviour | `SURFACES` and `TIRES` in `core/surfaces.js` |
| power, weight, suspension, upgrade strength | `core/specs.js` |
| fuel burn, damage, recovery penalties | `core/session.js` |
| draw distance, shadows, tree count per quality level | `QUALITY` in `render/world.js` |
| why the bot fails somewhere | `node scripts/diag.mjs <trackId>` |

## Known limitations

- **Not yet tested on a physical Android phone.** The APK builds and the game runs in a desktop
  browser; frame rate on real devices (especially low-end) is unverified. The 3D mode has three quality
  presets and dynamic resolution, selectable in Settings.
- Graphics are procedural low-poly (no textures or models are shipped). Real art can be added later.
- Day/night is fixed per track (morning, day, dusk); weather is fixed per track, not changing mid-run.
- Terrain does not deform; tyre tracks are drawn on soft ground but mud/snow geometry does not change.
- The "interior" camera is a minimal cockpit (dashboard, pillars, steering wheel), not a modelled cabin.
- Steering is by buttons; there is no tilt or steering-wheel control yet.
- Track difficulty and par times are tuned against the test driver, not against human playtesting.
