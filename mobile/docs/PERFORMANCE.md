# Performance report: 2D game on low-end Android (target: Redmi 12C)

Written 2026-11-21. Line numbers refer to the code after the changes described here.

## What could and could not be measured

| Measured here | How |
| --- | --- |
| Physics cost per step | `npx tsx scripts/perf.ts` (Node on a desktop PC) |
| Drawing code cost per frame | browser build, 3,000 frames of level 60 against a counting canvas |
| That the physics did not change | `npx tsx scripts/fingerprint.ts`, identical output before and after |

**Not measured: anything on a Redmi 12C, and no Android release build was run.** No phone was
connected. Desktop numbers show which code is expensive relative to other code; they do not say
what the phone's frame rate is. The game now measures itself on the phone (see "Measure it on the
phone"), and those are the numbers that decide what to do next.

## How the game runs

- One `requestAnimationFrame` loop outside React (`src/screens/GameScreen.tsx:299`). React draws
  only the HUD, the pedals and the panels.
- Physics: matter-js at a fixed 60 steps a second (`GameScreen.tsx:317-321`).
- Drawing: each frame is recorded into one Skia picture and handed to the canvas
  (`GameScreen.tsx:336-343`). Terrain, car, props and signs are pictures recorded once and replayed.
- A frame of level 60 is about **140 canvas calls**. That is light; the drawing was already cached well.

## Findings

### 1. No frame-rate control (fixed)
`GameScreen.tsx`, the old loop. Every screen refresh drew a frame.
- On a phone that cannot hold 60, frames alternate between 16 ms and 33 ms. That is the "40 to 50
  fps" stutter: worse to look at than a steady 30.
- On a 90 or 120 Hz phone the game drew 90 or 120 frames a second for no visible gain.

Fix: `src/core/pacing.ts`, used at `GameScreen.tsx:282` and `:307`. Never more than 60 drawn frames
a second. In **Auto** (the default), if more than 30% of frames miss their slot for four seconds,
the run drops to a steady 30 and stays there for the session. The physics still runs 60 steps a
second, so the car drives the same. Settings has **Frame rate: AUTO / 60 / 30**.

### 2. The canvas was composited the expensive way on Android (fixed)
`GameScreen.tsx:538`. The canvas was not marked opaque, so Android drew it through a texture and
blended the whole screen with the window behind it every frame. It is now `opaque`, which lets
Android use a plain surface. **If the game screen looks wrong on a phone (black, or the HUD
missing), remove `opaque` on that line: it is the one change here that depends on the device.**

### 3. Per-frame pictures were never released (fixed)
`GameScreen.tsx:339-343`. 60 new pictures a second, each holding native memory the JavaScript
garbage collector cannot see. They are now released three frames after use.

### 4. React re-rendered the HUD about 8 times a second (reduced)
`GameScreen.tsx:95-110`. Speed changes constantly, so nearly every tick was a React render on the
same thread as the physics. Now 5 times a second.

### 5. Allocation and lookups in the drawing code (fixed)
`src/render/scene.ts`. None of these is large; together they were about a third of the drawing
code's time on the desktop.
- Particles were created and removed one by one (`push` / `shift` / `splice`). Now a fixed pool of
  90 slots reused for the whole run (`scene.ts:120-136`, `:160-168`).
- Every prop built a key string and a closure every frame to find its artwork. Now looked up per
  object (`scene.ts:538-542`, `propArt` at `:556`).
- Bridge and platform posts created rounded-rect objects every frame. Now recorded once
  (`scene.ts:460`).
- Paints for struts, clouds, ropes, shadows and liquids were looked up by string every frame. Now
  kept (`scene.ts:54-59`, `:308`).

### 6. Per-step bookkeeping in the game rules (fixed, no measurable gain on desktop)
`src/core/world.ts`.
- Every step walked all features to decide what to switch on (`:367`, now only those that own
  bodies), searched the feature list once per live obstacle (`:376`, now a stored reference),
  walked all features for checkpoints (`:761`) and re-checked terrain chunks (`:296`, now only when
  the car crosses into a new range).
- Coin pickup built an array and took square roots each step (`:734-745`).

On the desktop this is inside the noise. It is kept because the loops it removes (`Map` iteration,
`findIndex`) are relatively slower on the phone's JavaScript engine, but that is an expectation,
not a measurement.

### 7. Physics engine itself (not changed)
`world.ts:181-183`. matter-js with 10 position, 8 velocity and 8 constraint iterations and about
125 bodies, of which about 100 are fixed terrain pieces. The time is spread evenly through the
engine (constraint solving 18%, collision detection 17%, the rest in small pieces); there is no
single hot spot to fix. Lowering the iteration counts would be the biggest saving available, and it
would change how the suspension feels, so it was left alone.

### Checked and found fine
- **Images and assets:** the game has no image files; all artwork is drawn in code and cached.
  Audio is 14 short WAV files, 1 MB in total.
- **Timers and listeners:** one HUD interval, one end-of-run timer, back-button, app-state and
  keyboard listeners. All are removed when the screen closes.
- **Audio:** engine pitch updates are limited to 9 a second (`src/audio/sound.ts`).
- **Collision / pickups:** pickups are checked only within 100 px of the car.

## Before and after

| | Before | After |
| --- | --- | --- |
| Drawing code, per frame (desktop browser, level 60) | 51 µs | 27 to 40 µs |
| Canvas calls per frame | about 140 | about 140 |
| Physics, per step (desktop Node, levels 1 / 60 / 100) | 0.09 to 0.13 ms | same, within noise |
| Frames drawn on a 120 Hz screen | 120 a second | 60 a second |
| Phone that cannot hold 60 | uneven 40 to 50 | steady 30 (Auto) |
| Physics fingerprint, 8 levels | | identical |
| Tests | 24 pass | 29 pass (5 new, frame pacing) |

## Measure it on the phone

Settings → **Show frame rate**. While driving, a yellow line appears under the speed:

```
physics 2.1 ms  draw 0.6 ms  worst 34 ms  target 60
```

- **physics**: one physics step. 60 of these run every second.
- **draw**: building one frame's drawing on the game's thread. It does not include the GPU's work.
- **worst**: the longest gap between two frames in the last half second.
- **target**: 60, or 30 once Auto has stepped down.

Read it in a release build (`eas build --profile preview`), not in Expo Go, which runs the code
in development mode and is several times slower.

What the numbers mean:
- `physics` above about 6 ms: the phone cannot run 60 steps and still draw. The physics engine is
  the limit, and the next step is the iteration counts in finding 7.
- `physics` and `draw` both small but the frame rate still low: the time is going to the GPU or
  to Android's compositing, not to this code.

## Scenery upgrade (2026-11-23): what it costs

The backgrounds, ground and effects were redrawn (see "Visual upgrade" in `README.md`). All of it is still
drawn in code; there are no image files. How it is kept cheap:

- **Three scenery layers** (far, middle, near) are each drawn **once** into a texture when a level opens
  (`backdropImage` in `src/render/decor.ts`) and then drawn as one textured rectangle per tile. The textures are
  1408 px wide, cropped to the height of their own mountains and trees, about 2 to 4 MB each. A frame draws
  3 to 6 of them, where replaying the shapes would repeat several hundred draws every frame.
- **Terrain pictures** are still recorded once per chunk. The new pebbles, grass tufts, road dashes or snow bumps
  are each a single path, so a chunk grew by about 8 draw calls, not hundreds.
- **Clouds** are one cached picture, drawn 6 times. The **car shadow** is one oval; the **headlight** is one cached
  picture, in the two night worlds only.
- **Dust** uses the existing fixed pool of 90 particles. One particle per wheel every 90 ms while driving, a burst
  on a hard landing. Nothing is allocated while driving.
- **Lite mode** (`SceneRenderer.lite`): when the frame pacer steps down to 30 fps (or Settings says 30), the middle
  scenery layer and the foreground grass are skipped. They are the largest areas drawn on top of each other.
- The vignette (dark corners) was tried and **removed**: it was the most expensive single item for the least gain.

### What was measured, and what was not

`scripts/perf-fx.mjs` times the renderer in headless Chrome (software GL, 1280 x 720), switching parts off one at
a time. Software GL is fill-rate bound the way a weak GPU is, but it is **not a phone**: read the numbers as
ratios. Median ms per frame, drawing only:

| Level | Before | After | After, lite mode |
| --- | --- | --- | --- |
| 25 desert | 55 | about 300 | about 225 |
| 45 snow | 61 | about 300 | about 225 |
| 95 volcano | 77 | about 330 | |

Without the three scenery layers the new frame costs 12 to 14 ms, the same order as before, so **the layers are
the cost**: textured full-width areas, three deep, instead of two flat shapes. A software renderer is far
slower at that than a phone GPU (not measured here), so this is a warning to check on a device, not a failure.

**Not measured: any real Android device, and no Android APK was built here** (the C: drive had 2.9 GB free, too
little for a Gradle build). `expo export --platform android` (Hermes bundle) did succeed (3.9 MB).
**Before releasing, install a preview build on the slowest phone you have, turn on Settings → Show frame rate and
drive level 95 and level 55.** If `target` drops to 30 on a phone that held 60 before, the fix, cheapest first, is:
1. make `lite` the default for phones below a RAM or CPU threshold (`GameScreen.tsx`, where `renderer.lite` is set);
2. in `backdropImage` cut the layer depths `BACKDROP_DEPTH` (they are generous) and the texture width;
3. drop the near layer (`this.drawLayer(c, 2, ...)` in `scene.ts`).

`npm run typecheck` is clean and `npm test` (48) passes; `npx tsx scripts/bot.ts` finished all 100 levels, and
`scripts/gas-only.ts` shows throttle-only wins 4 of 14 sampled levels, all of them early ones.
