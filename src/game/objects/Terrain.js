import { createTerrainProfile, SEGMENT, BASE_Y } from '../core/terrainMath.js';
import { CHUNK_SIZE, TERRAIN_THICKNESS } from '../config/constants.js';

/**
 * Streams terrain in chunks around the player: each chunk owns its static
 * Matter bodies and one Graphics object, and is destroyed when left behind.
 * hooks.onCreate(index, x0, x1) / hooks.onDestroy(index) let the scene attach
 * pickups and decor to chunks.
 */
export default class Terrain {
  constructor(scene, cfg, theme, hooks = {}) {
    this.scene = scene;
    this.theme = theme;
    this.hooks = hooks;
    this.profile = createTerrainProfile(cfg);
    this.chunks = new Map();

    // Invisible wall so the car can't reverse off the start of the world.
    this.wall = scene.matter.add.rectangle(-140, BASE_Y, 40, 3000, {
      isStatic: true, label: 'wall', friction: 0
    });
  }

  heightAt(x) { return this.profile.heightAt(x); }
  surfaceY(x) { return this.profile.surfaceY(x); }

  update(focusX) {
    const first = Math.max(-1, Math.floor((focusX - 1400) / CHUNK_SIZE));
    const last = Math.floor((focusX + 2400) / CHUNK_SIZE);
    for (let i = first; i <= last; i++) {
      if (!this.chunks.has(i)) this._build(i);
    }
    for (const [i, chunk] of this.chunks) {
      if (i < first - 1 || i > last + 1) this._destroy(i, chunk);
    }
  }

  _build(index) {
    const x0 = index * CHUNK_SIZE;
    const x1 = x0 + CHUNK_SIZE;
    const pts = [];
    for (let x = x0; x <= x1; x += SEGMENT) pts.push({ x, y: this.heightAt(x) });

    // Physics: one thick rotated rectangle per segment, top edge on the surface.
    const bodies = [];
    const half = TERRAIN_THICKNESS / 2;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const fric = this.theme.friction ?? 2.5;
      const fricStat = this.theme.frictionStatic ?? 4;
      bodies.push(
        this.scene.matter.add.rectangle(
          mx - Math.sin(angle) * half,
          my + Math.cos(angle) * half,
          length + 2,
          TERRAIN_THICKNESS,
          {
            isStatic: true,
            angle,
            chamfer: { radius: 3 },
            friction: fric,
            frictionStatic: fricStat,
            restitution: 0.02,
            label: 'terrain'
          }
        )
      );
    }

    // Visuals
    const th = this.theme;
    const bottom = BASE_Y + 900;
    const g = this.scene.add.graphics().setDepth(5);
    const poly = (top, offset) => [
      ...top.map((p) => ({ x: p.x, y: p.y + offset })),
      { x: x1, y: bottom },
      { x: x0, y: bottom }
    ];
    g.fillStyle(th.dirt);
    g.fillPoints(poly(pts, 0), true);
    g.fillStyle(th.dirtDeep);
    g.fillPoints(poly(pts, 90), true);

    const strip = [...pts, ...pts.slice().reverse().map((p) => ({ x: p.x, y: p.y + 16 }))];
    g.fillStyle(th.grass);
    g.fillPoints(strip, true);
    g.lineStyle(5, th.grassLight, 1);
    g.strokePoints(pts, false);

    const chunk = { bodies, graphics: g };
    this.chunks.set(index, chunk);
    if (this.hooks.onCreate) this.hooks.onCreate(index, x0, x1);
  }

  _destroy(index, chunk) {
    chunk.bodies.forEach((b) => this.scene.matter.world.remove(b));
    chunk.graphics.destroy();
    this.chunks.delete(index);
    if (this.hooks.onDestroy) this.hooks.onDestroy(index);
  }

  destroy() {
    for (const [i, chunk] of this.chunks) this._destroy(i, chunk);
    this.scene.matter.world.remove(this.wall);
  }
}
