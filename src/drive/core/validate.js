// Geometry sanity checks for a compiled track (used by tests and the bot script).

/** @returns {string[]} list of problems (empty = OK) */
export function validateTrack(track) {
  const out = [];
  const { PX, PZ, S, HW, nMain } = track;

  // 1. the route must never overlap itself (no broken / merged roads)
  const cell = 20;
  const grid = new Map();
  const key = (a, b) => (a + 5000) * 10000 + (b + 5000);
  for (let i = 0; i < nMain; i++) {
    const k = key(Math.floor(PX[i] / cell), Math.floor(PZ[i] / cell));
    let arr = grid.get(k);
    if (!arr) grid.set(k, (arr = []));
    arr.push(i);
  }
  let worst = 1e9, at = -1;
  for (let i = 0; i < nMain; i += 2) {
    const gx = Math.floor(PX[i] / cell), gz = Math.floor(PZ[i] / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const arr = grid.get(key(gx + dx, gz + dz));
        if (!arr) continue;
        for (const j of arr) {
          if (Math.abs(S[j] - S[i]) < 70) continue;
          const d = Math.hypot(PX[i] - PX[j], PZ[i] - PZ[j]) - HW[i] - HW[j];
          if (d < worst) { worst = d; at = i; }
        }
      }
    }
  }
  if (worst < 9) out.push(`route passes within ${worst.toFixed(1)} m of itself near s=${S[at].toFixed(0)}`);

  // 2. gradients must stay drivable
  let maxG = 0, gAt = 0;
  for (let i = 3; i < nMain - 3; i++) {
    const g = Math.abs(track.PY[i + 3] - track.PY[i - 3]) / (S[i + 3] - S[i - 3]);
    let inBridge = false;
    for (const b of track.bridges) if (S[i] > b.s0 - 8 && S[i] < b.s1 + 8) inBridge = true;
    if (!inBridge && g > maxG) { maxG = g; gAt = i; }
  }
  if (maxG > 0.42) out.push(`gradient ${(maxG * 100).toFixed(0)}% at s=${S[gAt].toFixed(0)} is too steep`);

  // 3. checkpoints
  if (track.checkpoints.length < 3) out.push(`only ${track.checkpoints.length} checkpoints`);
  for (const c of track.checkpoints) if (c.s < 30 || c.s > track.finishS - 30) out.push(`checkpoint at s=${c.s} too close to start/finish`);

  // 4. spawn + checkpoint poses sit on the road surface
  for (const s of [track.startS, ...track.checkpoints.map((c) => c.s)]) {
    const p = track.roadPose(s);
    if (!(p.y === p.y)) out.push(`bad pose at s=${s}`);
    if (track.bumpAt(p.x, p.z) > 0.05) out.push(`obstacle on the spawn point at s=${s.toFixed(0)}`);
  }
  return out;
}

/** Track statistics for docs / UI. */
export function trackStats(track) {
  let up = 0, down = 0, minY = 1e9, maxY = -1e9;
  for (let i = 1; i < track.nMain; i++) {
    const dy = track.PY[i] - track.PY[i - 1];
    if (dy > 0) up += dy; else down -= dy;
    minY = Math.min(minY, track.PY[i]); maxY = Math.max(maxY, track.PY[i]);
  }
  return {
    length: track.length, climb: up, descent: down, relief: maxY - minY,
    checkpoints: track.checkpoints.length, rocks: track.obstacles.length,
    caches: track.caches.length, bridges: track.bridges.length, fords: track.water.length,
    bypasses: track.bypasses.length
  };
}
