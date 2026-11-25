# Play Store listing: Offroad Racing 4x4

Copy each block into the matching field in Play Console (Grow users → Store presence → Main store listing).
Character limits are Google's; the counts are for the text below.

## App name (limit 30, this is 18)

```
Offroad Racing 4x4
```

## Short description (limit 80, this is 77)

```
Climb hills, jump gaps and cross rope bridges in 100 off-road driving levels.
```

## Full description (limit 4000, this is about 1,700)

```
Take a 4x4 over hills, mud, rivers and broken roads. Two pedals are all you need: gas and brake. Keeping the car the right way up is the hard part.

100 LEVELS, 10 WORLDS
Drive through Green Valley, Pine Forest, Desert Storm, the Rocky Mountains, Snow Mountain, Jungle Expedition, Mud Marsh, Neon City, Red Canyon and the Volcanic Wasteland. Each world has its own ground, grip and hazards, and new obstacles keep arriving as you progress.

OBSTACLES THAT FIGHT BACK
- Rocks, logs, crates and barrels to climb or smash through
- Ramps, gaps in the road and cliff drops
- Mud that drags you down and water that floats you off line
- Rope bridges, seesaws and moving platforms
- Swinging wrecking balls, rolling boulders and falling rocks

100 VEHICLES
Jeeps, pickups, buggies, monster trucks, sports cars, muscle cars, SUVs, vans, rally cars and trucks. Each one drives differently. Upgrade engine, tyres, suspension, brakes and fuel tank, and repaint your favourite.

EARN AS YOU DRIVE
Collect coins, grab fuel cans before the tank runs dry, and land flips, long jumps and wheelies for bonus coins. Checkpoints let you continue after a crash, up to three times in a run. Collect at least nine coins in ten on a level for three stars.

MADE FOR PHONES
- Plays in landscape with two big pedals, or tap either half of the screen
- Runs at 60 frames a second where the phone allows, and a steady 30 where it does not
- Works offline: your progress is saved on your phone
- No account and no sign-up

FREE TO PLAY
The game is free and shows ads. Watching a short video is always your choice: use it to double a reward, get an extra life, or unlock a vehicle or a level early. There are no in-app purchases.
```

## Other fields

| Field | Value |
| --- | --- |
| App category | Game → Racing |
| Tags | Racing, Driving, Offroad |
| Contains ads | Yes |
| In-app purchases | No |
| Target age | 13 and over |
| Contact email | your support email (shown publicly on the store page) |
| Privacy policy | the web address where you host `privacy-policy.html` |

## Graphics (all made; upload them in Play Console)

Grow users → Store presence → Main store listing → Graphics. Everything is a real screenshot of the game, dressed with a headline.
Brand text on the images is "OFFROAD RACING 4X4", the listing name above. Change `BRAND` in `scripts/store-compose.mjs` if you rename the game.

| Field | File(s) | Size |
| --- | --- | --- |
| App icon (the game's own jeep, no second name; replaces the old "Trail Torque" 3D picture) | `graphics/play/icon-512x512.png` | 512 x 512 |
| Feature graphic | `graphics/play/feature-graphic-1024x500.jpg` | 1024 x 500 |
| Phone screenshots (landscape: the right shape for this landscape-only game) | `graphics/play/landscape/01..08-*.jpg` | 1920 x 1080 |
| Phone screenshots, portrait set (the same eight scenes, landscape picture in a card plus a close-up) | `graphics/play/portrait/01..08-*.jpg` | 1080 x 1920 |

**Promo video:** `graphics/play/promo-1920x1080.mp4` (27 s, six scenes played by the test driver, the game's music).
Play Console takes a YouTube link, not a file: upload the clip to YouTube (public or unlisted, ads off) and paste the
address into *Video*. Remake it with `FFMPEG=<path to ffmpeg> node scripts/store-video.mjs` (web build on :8090).

Upload the **landscape** set as the phone screenshots (8 allowed). Use the portrait set only if you want a portrait set on
the listing too: Play shows each orientation separately. Order is the file number:
1 CONQUER THE OFFROAD · 2 MASTER EXTREME HILLS · 3 OVERCOME EVERY OBSTACLE · 4 PERFORM AMAZING STUNTS ·
5 EXPLORE 10 UNIQUE WORLDS · 6 DRIVE 100 VEHICLES · 7 UPGRADE YOUR RIDE · 8 100 LEVELS. ENDLESS ADVENTURE.
Play's limits at the time of writing: JPEG or 24-bit PNG, no transparency, 320 to 3840 px per side, longest side at most
twice the shortest, 8 MB each. Check the current rules in Play Console when you upload.

To remake them after changing the game: start the web build (`npm run web -- --port 8090`, Node 22+), then
`node scripts/store-play.mjs` (plays the game with the test driver and takes the raw pictures into `graphics/play/raw/`)
and `node scripts/store-compose.mjs` (adds the headlines). `node scripts/store-compose.mjs brand` remakes only the
icon and the feature graphic.

### How to update the listing

1. Play Console → your app → Grow users → Store presence → **Main store listing**.
2. Replace the screenshots under *Phone screenshots* with `graphics/play/landscape/01..08` (drag them in order).
3. Replace the feature graphic and icon if they changed. Paste the texts above if the numbers in them changed.
4. Save, then **Send for review** (store listing changes are reviewed, usually within a day or two).
5. To compare the new screenshots against the old: Grow users → **Store listing experiments** → create a *Main store
   listing* experiment (graphics) and give the new set 50 % of visitors; keep it for a week or two before choosing.
6. The new look is in the **app**, so it also needs a new release (a new build uploaded to a track). The screenshots
   alone do not change what players see.

## Before you paste

- Every number above (100 levels, 10 worlds, 100 vehicles, three continues) matches the game today. Change the text if the game changes.
- Google rejects listings that claim rankings or awards ("best", "#1"). None are used here; keep it that way if you edit.
