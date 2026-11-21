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
