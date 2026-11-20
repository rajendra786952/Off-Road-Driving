// Draws one frame of a run into a Skia canvas. Static things (terrain chunks
// with their decoration, the car body, backdrops, liquids) are recorded once
// into pictures or paths and reused; a frame is a few dozen draw calls.
import { Skia, TileMode, type SkCanvas, type SkPaint, type SkPath, type SkPicture } from '@shopify/react-native-skia';
import { DEG, fill, hardFill, poly, record, rect, rrect, shade, stroke, tmpRect } from './gfx';
import { drawPictureAt, getCarArt, type CarArt } from './car';
import { BACKDROP_PERIOD, backdropPath, drawDecor, skylineWindows } from './decor';
import { CHUNK_SIZE, PX_PER_METER, SPAWN_X } from '../core/constants';
import { SEGMENT } from '../core/terrain';
import { hashFloat } from '../core/rng';
import type { Feature } from '../core/features';
import { PENDULUM_TOP, type Chunk, type GameEvent, type GameWorld, type Prop } from '../core/world';
import type { DecorType, Theme } from '../data/themes';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  grav: number;
  paint: SkPaint;
}

const SMALL_DECOR: DecorType[] = ['bush', 'rock', 'reed', 'cone'];
const MAX_PARTICLES = 90;
/** Hazards that get a warning sign a little before them. */
const WARNED = new Set<Feature['type']>(['gap', 'ramp', 'falling', 'pendulum', 'seesaw', 'drop']);

export class SceneRenderer {
  private world: GameWorld;
  private th: Theme;
  private art: CarArt;
  private chunkPics = new Map<number, SkPicture>();
  private chunkVersion = -1;
  private liquidPaths = new Map<number, SkPath>();
  private far: SkPath;
  private near: SkPath;
  private windows: SkPath[] = [];
  private skyPic: SkPicture | null = null;
  private skyW = 0;
  private skyH = 0;
  /** Artwork recorded once and then only placed: see stamp(). */
  private stamps = new Map<string, SkPicture>();
  private particles: Particle[] = [];
  private clouds: { x: number; y: number; s: number; drift: number }[] = [];
  private shake = 0;
  private camX = 0;
  private camY = 0;
  private zoom = 1;
  private snap = true;

  constructor(world: GameWorld) {
    this.world = world;
    this.th = world.theme;
    this.art = getCarArt(world.spec);
    this.far = backdropPath(this.th.backdrop, 0);
    this.near = backdropPath(this.th.backdrop, 1);
    if (this.th.backdrop === 'skyline') this.windows = [skylineWindows(0), skylineWindows(1)];
    for (let i = 0; i < 6; i++) {
      this.clouds.push({ x: hashFloat(77, i) * 1600 - 200, y: 30 + hashFloat(78, i) * 150, s: 0.6 + hashFloat(79, i) * 0.7, drift: 4 + hashFloat(80, i) * 10 });
    }
  }

  /** After a checkpoint restart the camera jumps instead of gliding. */
  resetCamera(): void {
    this.snap = true;
  }

  // ---------------------------------------------------------------- events -> effects
  onEvent(e: GameEvent): void {
    switch (e.type) {
      case 'coin':
        this.emit(e.x, e.y, 5, { color: '#ffd23f', speed: 2.6, life: 380, size: 3.5, grav: 0.12 });
        break;
      case 'fuel':
        this.emit(e.x, e.y, 8, { color: '#8dff9b', speed: 2.2, life: 480, size: 4, grav: -0.03 });
        break;
      case 'dust':
        this.emit(e.x, e.y, e.n, { color: shade(this.th.dirt, 0.25), speed: 1, life: 480, size: 6, grav: -0.02, back: true });
        break;
      case 'splash':
        this.emit(e.x, e.y, 14, { color: e.kind === 'mud' ? this.th.mud : this.th.water, speed: 3.6, life: 620, size: 5, grav: 0.16, up: true });
        break;
      case 'smash':
        this.emit(e.x, e.y, 9, { color: e.kind === 'barrel' ? '#c0392b' : e.kind === 'crate' || e.kind === 'log' ? '#b9853f' : this.th.rock, speed: 3.4, life: 560, size: 6, grav: 0.18 });
        break;
      case 'land':
        this.shake = Math.max(this.shake, e.intensity * 7);
        break;
      case 'end':
        if (e.reason !== 'win') {
          this.shake = 12;
          const v = this.world.vehicle;
          this.emit(v.x, v.y, 16, { color: '#ffb347', speed: 4.2, life: 520, size: 4, grav: 0.2 });
        }
        break;
    }
  }

  private emit(x: number, y: number, n: number, o: { color: string; speed: number; life: number; size: number; grav: number; back?: boolean; up?: boolean }): void {
    const paint = fill(o.color);
    for (let i = 0; i < n; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      const a = o.back ? Math.PI + 0.2 + Math.random() * 1.1 : o.up ? -Math.PI * (0.2 + Math.random() * 0.6) : Math.random() * Math.PI * 2;
      const sp = o.speed * (0.4 + Math.random() * 0.8);
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.back ? 0 : 0.6), life: o.life, max: o.life, size: o.size, grav: o.grav, paint });
    }
  }

  // ---------------------------------------------------------------- per-frame update
  update(dtMs: number, W: number, H: number): void {
    const scale = Math.min(H / 540, W / 720) * this.zoom;
    const viewW = W / scale;
    const viewH = H / scale;
    const v = this.world.vehicle;
    const vx = v.chassis.velocity.x;
    const lead = Math.max(-60, Math.min(160, vx * 14));
    const tx = v.x + lead - viewW * 0.31;
    const ty = v.y - viewH * 0.56;
    const k = this.snap ? 1 : 1 - Math.pow(0.002, dtMs / 1000); // frame-rate independent smoothing
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    // the view widens a little at speed
    const targetZoom = 1 - Math.min(1, Math.abs(vx) / 22) * 0.16;
    this.zoom += (targetZoom - this.zoom) * (this.snap ? 1 : k);
    this.snap = false;

    const f = dtMs / 16.667;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dtMs;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.grav * f;
      p.x += p.vx * f;
      p.y += p.vy * f;
    }
    for (const c of this.clouds) {
      c.x -= (c.drift * dtMs) / 1000;
      if (c.x < -300) c.x = 1700;
    }
    this.shake *= Math.pow(0.004, dtMs / 1000);
  }

  // ---------------------------------------------------------------- cached geometry
  private syncChunks(): void {
    const w = this.world;
    if (this.chunkVersion === w.chunkVersion) return;
    this.chunkVersion = w.chunkVersion;
    for (const i of [...this.chunkPics.keys()]) if (!w.chunks.has(i)) this.chunkPics.delete(i);
    for (const [i, chunk] of w.chunks) if (!this.chunkPics.has(i)) this.chunkPics.set(i, this.recordChunk(chunk));
  }

  private recordChunk(chunk: Chunk): SkPicture {
    const th = this.th;
    const w = this.world;
    const x0 = chunk.index * CHUNK_SIZE;
    const ys = chunk.ys;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const y of ys) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const bottom = maxY + 1500;

    return record(CHUNK_SIZE + 400, bottom - minY + 500, (c) => {
      const seed = w.level.terrain.seed;
      const decor: { x: number; type: DecorType; s: number; v: number }[] = [];
      for (let j = 0; j < 6; j++) {
        const x = x0 + hashFloat(seed + 77 + j, chunk.index) * CHUNK_SIZE;
        if (x < 360 || x > w.finishX - 120) continue;
        if (w.features.some((f) => f.type !== 'checkpoint' && f.type !== 'hill' && x > f.a - 60 && x < f.b + 60)) continue;
        const type = th.decor[Math.floor(hashFloat(seed + 88 + j, chunk.index) * th.decor.length)];
        decor.push({ x, type, s: 0.8 + hashFloat(seed + 99 + j, chunk.index) * 0.55, v: hashFloat(seed + 55 + j, chunk.index) });
      }
      const place = (d: (typeof decor)[number]) => {
        c.save();
        c.translate(d.x, w.surfaceY(d.x) + 6);
        c.scale(d.s, d.s);
        drawDecor(c, d.type, th, d.v);
        c.restore();
      };
      for (const d of decor) if (!SMALL_DECOR.includes(d.type)) place(d);

      const top: number[] = [];
      for (let i = 0; i < ys.length; i++) top.push(x0 + i * SEGMENT, ys[i]);
      const body = (offset: number) => {
        const pts: number[] = [];
        for (let i = 0; i < ys.length; i++) pts.push(x0 + i * SEGMENT, ys[i] + offset);
        // one pixel of overlap hides the hairline between neighbouring chunks
        pts.push(x0 + CHUNK_SIZE + 1, ys[ys.length - 1] + offset, x0 + CHUNK_SIZE + 1, bottom, x0, bottom);
        return poly(pts);
      };
      c.drawPath(body(0), hardFill(th.dirt));
      c.drawPath(body(90), hardFill(th.dirtDeep));
      // grass / road surface: skipped on the walls of a hole
      const grass = fill(th.grass);
      const edge = stroke(th.grassLight, 5);
      for (let i = 0; i < ys.length - 1; i++) {
        if (Math.abs(ys[i + 1] - ys[i]) > 110) continue;
        const ax = x0 + i * SEGMENT;
        c.drawPath(poly([ax, ys[i], ax + SEGMENT + 0.6, ys[i + 1], ax + SEGMENT + 0.6, ys[i + 1] + 16, ax, ys[i] + 16]), grass);
        c.drawLine(ax, ys[i], ax + SEGMENT, ys[i + 1], edge);
      }
      for (const d of decor) if (SMALL_DECOR.includes(d.type)) place(d);
    }, x0 - 200, minY - 400);
  }

  private liquidPath(f: Feature): SkPath {
    let p = this.liquidPaths.get(f.id);
    if (!p) {
      const w = this.world;
      const level = w.surfaceY(f.a - 10) + 6;
      const pts: number[] = [f.a - 6, level, f.b + 6, level];
      for (let x = f.b; x >= f.a; x -= SEGMENT) pts.push(x, Math.max(level, w.surfaceY(x)) + 3);
      p = poly(pts);
      this.liquidPaths.set(f.id, p);
    }
    return p;
  }

  // ---------------------------------------------------------------- frame
  draw(c: SkCanvas, W: number, H: number, timeMs: number): void {
    const w = this.world;
    const th = this.th;
    const base = Math.min(H / 540, W / 720);
    const s = base * this.zoom;
    const viewW = W / s;
    const viewH = H / s;
    this.syncChunks();

    this.drawSky(c, W, H, base);

    // ---- world
    c.save();
    c.scale(s, s);
    const shx = this.shake > 0.3 ? (Math.random() - 0.5) * this.shake : 0;
    const shy = this.shake > 0.3 ? (Math.random() - 0.5) * this.shake : 0;
    c.translate(-this.camX + shx, -this.camY + shy);
    const left = this.camX - 80;
    const right = this.camX + viewW + 80;

    // fixed rocks go under the ground so only their tops show
    for (const p of w.props) if (p.kind === 'rock') this.drawProp(c, p);
    for (const [i, pic] of this.chunkPics) {
      const cx0 = i * CHUNK_SIZE;
      if (cx0 > right + 200 || cx0 + CHUNK_SIZE < left - 200) continue;
      c.drawPicture(pic);
    }

    for (const f of w.features) {
      if (f.x1 < left - 200 || f.x0 > right + 200) continue;
      if (f.type === 'checkpoint') this.drawFlag(c, f.a, w.passed.has(f.id));
      else if (f.type === 'bridge' || f.type === 'platform') this.drawPosts(c, f);
      else if (f.type === 'seesaw') this.drawPivot(c, f);
      else if (f.type === 'pendulum') this.drawGantry(c, f);
      if (WARNED.has(f.type)) this.drawWarning(c, f.type === 'drop' ? f.a - 220 : f.a - 430, f.type);
    }
    this.drawFinish(c);

    for (const p of w.props) if (p.kind !== 'rock' && p.body.position.x > left - 60 && p.body.position.x < right + 60) this.drawProp(c, p);
    this.drawPickups(c, left, right, timeMs);
    this.drawVehicle(c);

    for (const p of this.particles) {
      const a = p.life / p.max;
      c.drawCircle(p.x, p.y, p.size * (0.4 + 0.6 * a), p.paint);
    }

    for (const f of w.features) {
      if ((f.type !== 'mud' && f.type !== 'water') || f.b < left || f.a > right) continue;
      const level = w.surfaceY(f.a - 10) + 6;
      const col = f.type === 'mud' ? th.mud : th.water;
      c.drawPath(this.liquidPath(f), fill(col, f.type === 'mud' ? 0.9 : 0.62));
      c.drawLine(f.a - 4, level, f.b + 4, level, stroke(shade(col, 0.35), 3, 0.8));
    }
    c.restore();
  }

  private drawSky(c: SkCanvas, W: number, H: number, base: number): void {
    const th = this.th;
    if (!this.skyPic || this.skyW !== W || this.skyH !== H) {
      this.skyW = W;
      this.skyH = H;
      // gradient, stars, sun and glow never change: one picture, one draw call per frame
      this.skyPic = record(W, H, (k) => {
        const sky = Skia.Paint();
        sky.setShader(Skia.Shader.MakeLinearGradient({ x: 0, y: 0 }, { x: 0, y: H }, [Skia.Color(th.skyTop), Skia.Color(th.skyBottom)], null, TileMode.Clamp));
        k.drawRect(tmpRect(0, 0, W, H), sky);
        if (th.night) {
          const star = fill('#ffffff', 0.8);
          for (let i = 0; i < 40; i++) k.drawCircle(hashFloat(5, i) * W, hashFloat(6, i) * H * 0.55, 0.8 + hashFloat(7, i) * 1.4, star);
        }
        const sunX = W - 150 * base;
        const sunY = 105 * base;
        k.drawCircle(sunX, sunY, 74 * base, fill(th.sun, 0.14));
        k.drawCircle(sunX, sunY, 42 * base, fill(th.sun, 0.95));
        if (th.backdrop === 'volcano') k.drawCircle(W * 0.5, H * 0.6, 260 * base, fill('#ff5a1a', 0.18));
      });
    }
    c.drawPicture(this.skyPic);

    if (!th.night) {
      const cloud = fill('#ffffff', 0.88);
      for (const cl of this.clouds) {
        const x = ((cl.x * base) % (W + 500)) - 150;
        const y = cl.y * base;
        const r = 26 * cl.s * base;
        c.drawCircle(x, y, r, cloud);
        c.drawCircle(x + r * 1.1, y - r * 0.35, r * 1.2, cloud);
        c.drawCircle(x + r * 2.3, y, r * 0.95, cloud);
        c.drawCircle(x + r * 0.6, y + r * 0.3, r * 0.9, cloud);
        c.drawCircle(x + r * 1.7, y + r * 0.3, r * 0.9, cloud);
      }
    }

    const dy = this.camY - 80;
    this.drawLayer(c, this.far, th.farHill, 0, 0.08, H * 0.6 - Math.max(-70, Math.min(40, dy * 0.06)) * base, W, base);
    this.drawLayer(c, this.near, th.nearHill, 1, 0.2, H * 0.7 - Math.max(-110, Math.min(60, dy * 0.12)) * base, W, base);
  }

  private drawLayer(c: SkCanvas, path: SkPath, color: string, layer: number, par: number, y: number, W: number, base: number): void {
    const period = BACKDROP_PERIOD * base;
    let x = -(((this.camX * par * base) % period) + period) % period;
    const paint = fill(color);
    for (; x < W; x += period) {
      c.save();
      c.translate(x, y);
      c.scale(base, base);
      c.drawPath(path, paint);
      if (this.windows.length) c.drawPath(this.windows[layer], fill('#ffd98a', layer ? 0.75 : 0.5));
      c.restore();
    }
  }

  private drawVehicle(c: SkCanvas): void {
    const v = this.world.vehicle;
    const ch = v.chassis;
    const strut = stroke('#2b3238', 5);
    v.constraints.forEach((con, i) => {
      const wheel = v.wheels[i < 2 ? 0 : 1];
      // Matter rotates constraint.pointA in place every step, so it is already
      // the chassis-relative offset in world orientation.
      const p = con.pointA;
      c.drawLine(ch.position.x + p.x, ch.position.y + p.y, wheel.position.x, wheel.position.y, strut);
    });
    drawPictureAt(c, this.art.body, ch.position.x, ch.position.y, ch.angle);
    for (const wheel of v.wheels) drawPictureAt(c, this.art.wheel, wheel.position.x, wheel.position.y, wheel.angle);
  }

  /**
   * Draw a piece of fixed artwork at a position. The shapes are recorded into a
   * picture the first time and replayed afterwards, so a crate or a warning sign
   * costs one draw call per frame instead of one per shape, and builds no paths.
   */
  private stamp(c: SkCanvas, key: string, x: number, y: number, angle: number, draw: (k: SkCanvas) => void): void {
    let pic = this.stamps.get(key);
    if (!pic) {
      pic = record(760, 800, draw, -380, -440);
      this.stamps.set(key, pic);
    }
    drawPictureAt(c, pic, x, y, angle);
  }

  private drawPickups(c: SkCanvas, left: number, right: number, timeMs: number): void {
    for (const p of this.world.pickups) {
      if (p.x < left || p.x > right) continue;
      if (p.type === 'coin') {
        let pic = this.stamps.get('coin');
        if (!pic) {
          pic = record(40, 40, (k) => {
            k.drawCircle(0, 0, 13, fill('#c8961e'));
            k.drawCircle(0, 0, 10.5, fill('#ffd23f'));
            rrect(k, -2, -6, 4, 12, 2, fill('#c8961e'));
          }, -20, -20);
          this.stamps.set('coin', pic);
        }
        c.save();
        c.translate(p.x, p.y);
        c.scale(Math.abs(Math.cos(timeMs / 260 + p.phase)) * 0.8 + 0.2, 1); // spinning
        c.drawPicture(pic);
        c.restore();
      } else {
        this.stamp(c, 'fuel', p.x, p.y + Math.sin(timeMs / 300 + p.phase) * 4, 0, (k) => {
          k.drawCircle(0, 0, 24, fill('#8dff9b', 0.18));
          rrect(k, -13, -15, 26, 32, 5, fill('#d6342c'));
          rrect(k, -13, -3, 26, 8, 0, fill('#ffd23f'));
          rrect(k, -4, -21, 12, 8, 2, fill('#8f1f1a'));
        });
      }
    }
  }

  private drawFlag(c: SkCanvas, x: number, passed: boolean): void {
    this.stamp(c, passed ? 'flag-passed' : 'flag', x, this.world.surfaceY(x), 0, (k) => {
      rrect(k, -3, -96, 6, 100, 2, fill('#e8ecef'));
      k.drawPath(poly([3, -94, 54, -80, 3, -64]), fill(passed ? '#2f9e55' : '#f2742b'));
      k.drawCircle(0, -98, 5, fill('#ffd23f'));
    });
  }

  private drawFinish(c: SkCanvas): void {
    const w = this.world;
    const x = w.finishX;
    if (Math.abs(x - this.camX) > 3000) return;
    this.stamp(c, 'finish', x, w.surfaceY(x) + 4, 0, (k) => {
      const pole = fill('#e8ecef');
      rrect(k, -70, -150, 9, 150, 3, pole);
      rrect(k, 61, -150, 9, 150, 3, pole);
      const white = fill('#ffffff');
      const black = fill('#16181c');
      for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 2; j++) k.drawRect(rect(-61 + i * 12.2, -150 + j * 12, 12.2, 12), (i + j) % 2 ? black : white);
      }
    });
  }

  /** Anchor posts at both ends of a bridge or platform. */
  private drawPosts(c: SkCanvas, f: Feature): void {
    const y = this.world.surfaceY(f.a - 10);
    const post = fill(f.type === 'bridge' ? '#6b4a2b' : '#4a4f5c');
    rrect(c, f.a - 16, y - 34, 9, 40, 2, post);
    rrect(c, f.b + 7, y - 34, 9, 40, 2, post);
    if (f.type === 'bridge') {
      // hand rope
      const rope = stroke('#c9a66b', 2.5);
      const mid = (f.a + f.b) / 2;
      c.drawLine(f.a - 12, y - 32, mid, y - 14, rope);
      c.drawLine(mid, y - 14, f.b + 12, y - 32, rope);
    }
  }

  /** Yellow diamond on a post, a little before a hazard. */
  private drawWarning(c: SkCanvas, x: number, type: Feature['type']): void {
    const icon = type === 'gap' || type === 'drop' ? 'hole' : type === 'ramp' || type === 'seesaw' ? 'ramp' : 'mark';
    const hot = type === 'falling' || type === 'pendulum';
    this.stamp(c, `warn-${icon}-${hot ? 1 : 0}`, x, this.world.surfaceY(x), 0, (k) => {
      rrect(k, -2.5, -70, 5, 74, 2, fill('#5b6470'));
      k.translate(0, -84);
      k.drawPath(poly([0, -24, 24, 0, 0, 24, -24, 0]), fill('#16181c'));
      k.drawPath(poly([0, -20, 20, 0, 0, 20, -20, 0]), fill(hot ? '#f2742b' : '#ffd23f'));
      const ink = fill('#16181c');
      if (icon === 'hole') {
        // broken road: two slabs with a hole between them
        k.drawPath(poly([-13, 3, -3, 3, -3, 8, -13, 8]), ink);
        k.drawPath(poly([5, 6, 13, 6, 13, 11, 5, 11]), ink);
        k.drawPath(poly([-2, -9, 4, -9, 1, -2]), ink);
      } else if (icon === 'ramp') {
        k.drawPath(poly([-12, 9, 12, 9, 12, -8]), ink);
      } else {
        // exclamation mark
        rrect(k, -3, -13, 6, 15, 2, ink);
        k.drawCircle(0, 9, 3.4, ink);
      }
    });
  }

  /** The stand a seesaw plank pivots on. */
  private drawPivot(c: SkCanvas, f: Feature): void {
    const h = Math.round(f.h);
    this.stamp(c, `pivot-${h}`, (f.a + f.b) / 2, this.world.surfaceY(f.a), 0, (k) => {
      k.drawPath(poly([-26, 4, 0, -h - 2, 26, 4]), fill('#4a4f5c'));
      k.drawPath(poly([-12, 4, 0, -h + 10, 12, 4]), fill('#6b7078'));
      k.drawCircle(0, -h, 6, fill('#16181c'));
    });
  }

  /** Frame and chain of a wrecking ball. */
  private drawGantry(c: SkCanvas, f: Feature): void {
    const y = this.world.surfaceY(f.a);
    const top = y - PENDULUM_TOP;
    this.stamp(c, 'gantry', f.a, y, 0, (k) => {
      const beam = stroke('#3a3f48', 9);
      k.drawLine(-78, 4, -10, -PENDULUM_TOP, beam);
      k.drawLine(78, 4, 10, -PENDULUM_TOP, beam);
      k.drawLine(-44, -PENDULUM_TOP * 0.5, 44, -PENDULUM_TOP * 0.5, stroke('#3a3f48', 5));
      rrect(k, -20, -PENDULUM_TOP - 8, 40, 14, 4, fill('#f2c94c'));
    });
    for (const p of this.world.props) {
      if (p.kind === 'ball' && p.fid === f.id) c.drawLine(f.a, top, p.body.position.x, p.body.position.y, stroke('#16181c', 4));
    }
  }

  private drawProp(c: SkCanvas, p: Prop): void {
    const b = p.body;
    const th = this.th;
    // soft shadow under anything loose that is near the ground
    if (!b.isStatic && p.kind !== 'plank' && p.kind !== 'seesaw' && p.kind !== 'ball') {
      const gy = this.world.surfaceY(b.position.x);
      const lift = gy - b.position.y - p.r;
      if (lift > -6 && lift < 40) c.drawOval(tmpRect(b.position.x - p.r, gy - 3, p.r * 2, 7), fill('#000000', lift > 16 ? 0.1 : 0.2));
    }
    const r = Math.round(p.r);
    const w = Math.round(p.w);
    const h = Math.round(p.h);
    this.stamp(c, `${p.kind}-${r}-${w}-${h}-${p.variant % 2}`, b.position.x, b.position.y, b.angle, (k) => {
      const outline = stroke('#101216', 2, 0.55);
      switch (p.kind) {
        case 'rock':
          k.drawCircle(0, 0, r, fill(th.rock));
          k.drawCircle(-r * 0.2, -r * 0.35, r * 0.62, fill(shade(th.rock, 0.16)));
          break;
        case 'log':
          k.drawCircle(0, 0, r, fill('#7a4f28'));
          k.drawCircle(0, 0, r * 0.74, fill('#c89a5e'));
          k.drawCircle(0, 0, r * 0.46, stroke('#9a6f3a', 1.5));
          k.drawCircle(0, 0, r * 0.16, fill('#9a6f3a'));
          k.drawLine(0, 0, r * 0.7, 0, stroke('#9a6f3a', 1.5));
          k.drawCircle(0, 0, r, outline);
          break;
        case 'crate':
          rrect(k, -w / 2, -h / 2, w, h, 3, fill('#8a5f2c'));
          rrect(k, -w / 2 + 3, -h / 2 + 3, w - 6, h - 6, 2, fill('#c79552'));
          k.drawLine(-w / 2 + 4, -h / 2 + 4, w / 2 - 4, h / 2 - 4, stroke('#8a5f2c', 3));
          k.drawLine(w / 2 - 4, -h / 2 + 4, -w / 2 + 4, h / 2 - 4, stroke('#8a5f2c', 3));
          k.drawRect(rect(-w / 2, -h / 2, w, h), outline);
          break;
        case 'barrel':
          rrect(k, -w / 2, -h / 2, w, h, 7, fill(p.variant % 2 ? '#2f6fa8' : '#c0392b'));
          rrect(k, -w / 2, Math.round(-h * 0.28), w, 4, 0, fill('#16181c', 0.55));
          rrect(k, -w / 2, Math.round(h * 0.2), w, 4, 0, fill('#16181c', 0.55));
          rrect(k, -w / 2 + 3, -h / 2 + 2, 4, h - 4, 2, fill('#ffffff', 0.22));
          k.drawRRect(Skia.RRectXY(rect(-w / 2, -h / 2, w, h), 7, 7), outline);
          break;
        case 'boulder':
        case 'fallrock': {
          const col = shade(th.rock, -0.15);
          k.drawCircle(0, 0, r, fill(col));
          k.drawCircle(-r * 0.25, -r * 0.25, r * 0.55, fill(shade(col, 0.2)));
          k.drawLine(-r * 0.5, r * 0.3, r * 0.2, r * 0.1, stroke(shade(col, -0.35), 2));
          k.drawCircle(0, 0, r, outline);
          break;
        }
        case 'plank':
          rrect(k, -w / 2 + 1, -h / 2, w - 2, h, 3, fill(p.variant % 2 ? '#a9763e' : '#96652f'));
          k.drawCircle(-w / 2 + 6, 0, 2, fill('#3a2a18'));
          k.drawCircle(w / 2 - 6, 0, 2, fill('#3a2a18'));
          break;
        case 'seesaw':
          rrect(k, -w / 2, -h / 2, w, h, 4, fill('#a9763e'));
          rrect(k, -w / 2, -h / 2, w, 3, 2, fill('#c79552'));
          for (const sx of [-w / 2 + 6, w / 2 - 34]) {
            rrect(k, sx, -h / 2, 28, h, 3, fill('#f2c94c'));
            k.drawPath(poly([sx + 6, -h / 2, sx + 13, -h / 2, sx + 7, h / 2, sx, h / 2]), fill('#16181c'));
            k.drawPath(poly([sx + 20, -h / 2, sx + 27, -h / 2, sx + 21, h / 2, sx + 14, h / 2]), fill('#16181c'));
          }
          k.drawCircle(0, 0, 5, fill('#16181c'));
          break;
        case 'ball':
          k.drawCircle(0, 0, r, fill('#2c3038'));
          k.drawCircle(-r * 0.28, -r * 0.3, r * 0.5, fill('#4a505c'));
          k.drawCircle(-r * 0.38, -r * 0.42, r * 0.16, fill('#8a919c'));
          k.drawCircle(0, 0, r, stroke('#101216', 3));
          break;
        case 'platform':
          rrect(k, -w / 2, -h / 2, w, h, 6, fill('#4a4f5c'));
          for (let x = -w / 2 + 10; x < w / 2 - 24; x += 34) k.drawPath(poly([x, -h / 2 + 4, x + 14, -h / 2 + 4, x + 24, -h / 2 + 14, x + 10, -h / 2 + 14]), fill('#f2c94c'));
          rrect(k, -6, h / 2, 12, 260, 0, fill('#2c3038')); // piston
          break;
      }
    });

    // shadow on the ground where a falling rock will land
    if (p.kind === 'fallrock' && b.speed > 1.5) {
      const gy = this.world.surfaceY(b.position.x);
      if (gy - b.position.y > 60) {
        c.drawOval(tmpRect(b.position.x - p.r * 1.4, gy - 5, p.r * 2.8, 10), fill('#e0463c', 0.55));
        this.stamp(c, 'fall-mark', b.position.x, gy, 0, (k) => k.drawPath(poly([-9, -34, 9, -34, 0, -16]), fill('#e0463c', 0.9)));
      }
    }
  }

  dispose(): void {
    this.chunkPics.clear();
    this.stamps.clear();
    this.skyPic = null;
    this.liquidPaths.clear();
    this.particles = [];
  }
}

/** Distance label helper shared by the HUD. */
export function metres(px: number): number {
  return Math.max(0, Math.floor((px - SPAWN_X) / PX_PER_METER));
}
