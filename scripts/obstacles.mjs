// node scripts/obstacles.mjs [trackId|all] [tier]
// Generates the obstacle layer for tracks and prints what was placed, plus any playability problems.
import { TRACKS, getTrackDef } from '../src/drive/tracks/index.js';
import { generateObstacles, validateObstacles, obstacleStats, OBSTACLE_TIERS } from '../src/drive/core/obstacles.js';

const arg = process.argv[2] || 'all';
const tiers = process.argv[3] ? [process.argv[3]] : OBSTACLE_TIERS;
const defs = arg === 'all' ? TRACKS : [getTrackDef(arg)];
let bad = 0;
for (const def of defs) {
  const track = def.build();
  for (const tier of tiers) {
    track.setLayer(generateObstacles(track, { difficulty: tier }));
    const st = obstacleStats(track), problems = validateObstacles(track);
    bad += problems.length;
    const types = Object.entries(st.types).map(([k, v]) => `${k}:${v}`).join(' ');
    console.log(`${def.id.padEnd(20)} ${tier.padEnd(8)} ${String(st.challenges).padStart(2)} challenges / ${(track.length / 1000).toFixed(1)} km  statics=${st.statics} bodies=${st.bodies}  ${types}` +
      (problems.length ? '\n   ! ' + problems.join('\n   ! ') : ''));
  }
  track.setLayer(null);
}
console.log(bad ? `${bad} problem(s)` : 'all layers playable');
