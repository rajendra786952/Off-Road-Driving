// One run of one level: physics world, terrain streaming, obstacles, pickups and
// the rules (fuel, stunts, checkpoints, crash, finish). No rendering and no
// React here, so the same class drives the game screen, the unit tests and the
// automated test driver.
import Matter from 'matter-js';
import {
  CHUNK_SIZE, COIN_VALUE, FUEL, GRAVITY_Y, MAX_CONTINUES, PHYSICS_STEP, PX_PER_METER, SPAWN_X, TERRAIN_THICKNESS,
} from './constants';
import { createTerrainProfile, SEGMENT, BASE_Y, type TerrainProfile } from './terrain';
import { CELL, countCoins, pickupsForCell } from './pickups';
import type { Feature } from './features';
import { Vehicle, wrapAngle } from './vehicle';
import { getFeatures, starsForRatio, type LevelConfig } from '../data/levels';
import { THEMES, type Theme } from '../data/themes';
import type { Upgrades, VehicleSpec } from '../data/vehicles';

const { Engine, Bodies, Body, Composite, Constraint } = Matter;

const CAT_TERRAIN = 0x0002;
const CAT_PLANK = 0x0004;
const PLANK_T = 12;
const PLATFORM_T = 30;
export const FALL_WARNING = 700; // rocks start falling when the car is this far away
export const ROCK_BURY = 0.78; // how much of a fixed rock's radius sits below ground
const STEP_S = PHYSICS_STEP / 1000;
/** Features without bodies of their own. */
const PASSIVE = new Set<Feature['type']>(['checkpoint', 'hill', 'drop', 'ramp', 'gap', 'mud', 'water']);
const PICKUP_R2 = 38 * 38;

export type EndReason = 'win' | 'crash' | 'fuel' | 'fell' | 'hit';

export type GameEvent =
  | { type: 'coin'; x: number; y: number }
  | { type: 'fuel'; x: number; y: number }
  | { type: 'stunt'; text: string }
  | { type: 'checkpoint'; n: number }
  | { type: 'km'; km: number; coins: number }
  | { type: 'land'; intensity: number }
  | { type: 'dust'; x: number; y: number; n: number }
  | { type: 'splash'; x: number; y: number; kind: 'mud' | 'water' }
  | { type: 'rockfall' }
  | { type: 'smash'; x: number; y: number; kind: PropKind }
  | { type: 'lowFuel' }
  | { type: 'end'; reason: EndReason };

export type PropKind = 'rock' | 'log' | 'crate' | 'barrel' | 'boulder' | 'plank' | 'platform' | 'fallrock' | 'seesaw' | 'ball';

/** Height of the frame a wrecking ball hangs from, above the road. */
export const PENDULUM_TOP = 250;
export interface Prop {
  kind: PropKind;
  body: Matter.Body;
  fid: number;
  r: number; // radius, or half width for boxes
  w: number;
  h: number;
  variant: number;
  /** Steps this loose object has been blocking a slow car. */
  jam?: number;
}

export interface Pickup {
  key: string;
  type: 'coin' | 'fuel';
  x: number;
  y: number;
  chunk: number;
  phase: number;
}

export interface Chunk {
  index: number;
  bodies: Matter.Body[];
  /** Surface heights at x0, x0 + SEGMENT, ... x1 */
  ys: number[];
}

interface Live {
  f: Feature;
  /** Half the plank length of a seesaw (0 for everything else). */
  half: number;
  bodies: Matter.Body[];
  constraints: Matter.Constraint[];
  planks: Matter.Body[];
  platform: Matter.Body | null;
  seesaw: Matter.Body | null;
  ball: Matter.Body | null;
  rimY: number;
  triggered: boolean;
}

export interface RunResult {
  reason: EndReason;
  win: boolean;
  stars: number;
  coins: number;
  totalCoins: number;
  coinValue: number;
  stuntBonus: number;
  progress: number;
  distance: number;
}

export class GameWorld {
  readonly level: LevelConfig;
  readonly theme: Theme;
  readonly features: Feature[];
  readonly profile: TerrainProfile;
  readonly engine: Matter.Engine;
  readonly finishX: number;
  readonly totalCoins: number;
  readonly spec: VehicleSpec;
  private readonly upgrades: Partial<Upgrades>;
  private readonly emit: (e: GameEvent) => void;

  vehicle!: Vehicle;
  fuel = 0;
  fuelMax = 0;
  runCoins = 0;
  stuntBonusCoins = 0;
  distance = 0;
  tick = 0;
  state: 'playing' | 'ending' = 'playing';
  endReason: EndReason | null = null;
  continuesLeft = MAX_CONTINUES;
  reviveUsed = false;
  checkpoint: { x: number; fuel: number; n: number } | null = null;
  inLiquid: 'mud' | 'water' | null = null;

  chunks = new Map<number, Chunk>();
  pickups: Pickup[] = [];
  props: Prop[] = [];
  /** Bumped whenever chunks are added or removed (the renderer rebuilds its paths). */
  chunkVersion = 0;

  private live = new Map<number, Live>();
  /** The same entries as `live`, in the same order, as a plain array: it is walked several times per step. */
  private liveList: Live[] = [];
  /** Features that own physics bodies (the rest are terrain shapes, liquids and checkpoints). */
  private readonly dynamic: Feature[];
  private readonly checkpoints: Feature[];
  private chunkFirst = NaN;
  private chunkLast = NaN;
  private collected = new Set<string>();
  /** Checkpoints already driven through (feature ids). */
  passed = new Set<number>();
  private chasms: Feature[];
  private liquids: Feature[];
  private wall: Matter.Body;

  private airTime = 0;
  private airRotation = 0;
  private lastAirAngle: number | null = null;
  private wheelieTime = 0;
  private fuelWarn = 0;
  private lastKm = 0;
  private flipTime = 0;
  private stuckTime = 0;
  private tipTime = 0;
  private stuckX = 0;
  private stuckY = 0;

  constructor(level: LevelConfig, spec: VehicleSpec, upgrades: Partial<Upgrades>, emit: (e: GameEvent) => void = () => {}) {
    this.level = level;
    this.theme = THEMES[level.theme];
    this.features = getFeatures(level);
    this.profile = createTerrainProfile(level.terrain, this.features);
    this.finishX = level.length;
    this.totalCoins = countCoins(level.pickups, level.length);
    this.spec = spec;
    this.upgrades = upgrades;
    this.emit = emit;
    this.chasms = this.features.filter((f) => f.type === 'gap' || f.type === 'bridge' || f.type === 'platform');
    this.liquids = this.features.filter((f) => f.type === 'mud' || f.type === 'water');
    this.dynamic = this.features.filter((f) => !PASSIVE.has(f.type));
    this.checkpoints = this.features.filter((f) => f.type === 'checkpoint');

    this.engine = Engine.create({
      gravity: { x: 0, y: GRAVITY_Y },
      enableSleeping: false,
      positionIterations: 10,
      velocityIterations: 8,
      constraintIterations: 8,
    });
    // Invisible wall so the car can't reverse off the start of the world.
    this.wall = Bodies.rectangle(-140, BASE_Y, 40, 3000, { isStatic: true, label: 'wall', friction: 0 });
    Composite.add(this.engine.world, this.wall);

    this.spawn(SPAWN_X);
    this.fuelMax = this.vehicle.stats.fuelCapacity;
    this.fuel = this.fuelMax;
  }

  // ------------------------------------------------------------------ queries
  surfaceY = (x: number): number => this.profile.surfaceY(x);

  /** Height of whatever can be driven on at x: terrain, bridge deck or platform. */
  groundY = (x: number): number => {
    for (const f of this.chasms) {
      if (x <= f.a || x >= f.b || f.type === 'gap') continue;
      const lv = this.live.get(f.id);
      if (!lv) break;
      if (lv.platform) return lv.platform.position.y - PLATFORM_T / 2;
      if (lv.planks.length) {
        const pw = (f.b - f.a) / lv.planks.length;
        const i = Math.min(lv.planks.length - 1, Math.max(0, Math.floor((x - f.a) / pw)));
        return lv.planks[i].position.y - PLANK_T / 2;
      }
    }
    // a seesaw plank counts as ground while the car is on it
    const list = this.liveList;
    for (let i = 0; i < list.length; i++) {
      const s = list[i].seesaw;
      if (!s) continue;
      const half = list[i].half;
      const dx = x - s.position.x;
      if (Math.abs(dx) < half * Math.cos(s.angle)) return Math.min(this.profile.surfaceY(x), s.position.y + dx * Math.tan(s.angle) - PLANK_T / 2);
    }
    return this.profile.surfaceY(x);
  };

  get progress(): number {
    return Math.min(1, Math.max(0, (this.vehicle.x - SPAWN_X) / (this.finishX - SPAWN_X)));
  }

  get speed(): number {
    return this.vehicle.chassis.velocity.x;
  }

  canContinue(): boolean {
    return this.state === 'ending' && this.endReason !== 'win' && !!this.checkpoint && this.continuesLeft > 0;
  }

  result(): RunResult {
    const win = this.endReason === 'win';
    const ratio = this.totalCoins ? this.runCoins / this.totalCoins : 1;
    return {
      reason: this.endReason ?? 'crash',
      win,
      stars: win ? starsForRatio(ratio) : 0,
      coins: Math.floor(this.runCoins),
      totalCoins: this.totalCoins,
      coinValue: Math.round(this.runCoins * COIN_VALUE),
      stuntBonus: this.stuntBonusCoins,
      progress: this.progress,
      distance: Math.floor(this.distance),
    };
  }

  // ------------------------------------------------------------------ spawning
  private spawn(x: number): void {
    const y = this.profile.surfaceY(x) - 70;
    this.vehicle = new Vehicle(this.engine.world, this.spec, this.upgrades, x, y, this.groundY);
    this.updateChunks(x);
    this.updateFeatures();
  }

  /** An extra life is on offer once the free continues are used up (one per run). */
  canRevive(): boolean {
    return this.state === 'ending' && this.endReason !== 'win' && !!this.checkpoint && !this.reviveUsed && this.continuesLeft <= 0;
  }

  /** Extra life: back to the last checkpoint without spending a continue. */
  revive(): boolean {
    if (!this.canRevive()) return false;
    this.reviveUsed = true;
    this.respawnAtCheckpoint();
    return true;
  }

  /** Restart from the last checkpoint (limited per run). */
  continueFromCheckpoint(): boolean {
    if (!this.canContinue() || !this.checkpoint) return false;
    this.continuesLeft--;
    this.respawnAtCheckpoint();
    return true;
  }

  private respawnAtCheckpoint(): void {
    if (!this.checkpoint) return;
    this.vehicle.destroy();
    for (const id of [...this.live.keys()]) this.deactivate(id);
    this.fuel = Math.max(this.checkpoint.fuel, this.fuelMax * 0.4);
    this.state = 'playing';
    this.endReason = null;
    this.airTime = this.airRotation = this.wheelieTime = this.flipTime = this.stuckTime = this.tipTime = 0;
    this.lastAirAngle = null;
    this.inLiquid = null;
    this.spawn(this.checkpoint.x);
  }

  // ------------------------------------------------------------------ terrain
  private updateChunks(focusX: number): void {
    const first = Math.max(-1, Math.floor((focusX - 900) / CHUNK_SIZE));
    const last = Math.floor((focusX + 1500) / CHUNK_SIZE);
    if (first === this.chunkFirst && last === this.chunkLast) return; // nothing to add or drop
    this.chunkFirst = first;
    this.chunkLast = last;
    for (let i = first; i <= last; i++) if (!this.chunks.has(i)) this.buildChunk(i);
    for (const [i, chunk] of this.chunks) {
      if (i < first - 1 || i > last + 1) this.destroyChunk(i, chunk);
    }
  }

  private buildChunk(index: number): void {
    const x0 = index * CHUNK_SIZE;
    const i0 = Math.round(x0 / SEGMENT);
    const count = CHUNK_SIZE / SEGMENT;
    const ys: number[] = [];
    for (let i = 0; i <= count; i++) ys.push(this.profile.sampleAt(i0 + i));

    // Physics: one thick rotated rectangle per segment, top edge on the surface.
    const bodies: Matter.Body[] = [];
    const half = TERRAIN_THICKNESS / 2;
    const friction = this.theme.friction;
    const frictionStatic = this.theme.frictionStatic;
    for (let i = 0; i < count; i++) {
      const ax = x0 + i * SEGMENT;
      const dy = ys[i + 1] - ys[i];
      const length = Math.sqrt(SEGMENT * SEGMENT + dy * dy);
      const angle = Math.atan2(dy, SEGMENT);
      bodies.push(
        Bodies.rectangle(
          ax + SEGMENT / 2 - Math.sin(angle) * half,
          (ys[i] + ys[i + 1]) / 2 + Math.cos(angle) * half,
          length + 2,
          TERRAIN_THICKNESS,
          {
            isStatic: true,
            angle,
            chamfer: { radius: 3 },
            friction,
            frictionStatic,
            restitution: 0.02,
            label: 'terrain',
            collisionFilter: { category: CAT_TERRAIN },
          },
        ),
      );
    }
    Composite.add(this.engine.world, bodies);
    this.chunks.set(index, { index, bodies, ys });
    this.chunkVersion++;

    const k0 = Math.round(x0 / CELL);
    const k1 = Math.round((x0 + CHUNK_SIZE) / CELL);
    for (let k = k0; k < k1; k++) {
      const spots = pickupsForCell(this.level.pickups, k, this.profile.surfaceY, this.features);
      spots.forEach((p, n) => {
        const key = `${k}:${n}`;
        if (p.x >= this.finishX - 80 || this.collected.has(key)) return;
        this.pickups.push({ key, type: p.type, x: p.x, y: p.y, chunk: index, phase: (k * 7 + n * 3) % 6 });
      });
    }
  }

  private destroyChunk(index: number, chunk: Chunk): void {
    Composite.remove(this.engine.world, chunk.bodies as never);
    this.chunks.delete(index);
    this.pickups = this.pickups.filter((p) => p.chunk !== index);
    this.chunkVersion++;
  }

  // ------------------------------------------------------------------ obstacles
  private updateFeatures(): void {
    const x = this.vehicle.x;
    const dynamic = this.dynamic;
    for (let i = 0; i < dynamic.length; i++) {
      const f = dynamic[i];
      const near = x > f.x0 - 1300 && x < f.x1 + 1100;
      const lv = this.live.get(f.id);
      if (near && !lv) this.activate(f);
      else if (!near && lv) this.deactivate(f.id);
    }
    // nothing below adds or removes a live entry (a rock fall or a roller only adds props)
    const list = this.liveList;
    for (let i = 0; i < list.length; i++) {
      const lv = list[i];
      const f = lv.f;
      if (lv.platform) {
        const y = lv.rimY + PLATFORM_T / 2 + f.h * Math.sin(this.tick * 0.034 + (f.seed % 7));
        // third argument (missing from the typings): also set the velocity, so the platform carries the car
        (Body.setPosition as (b: Matter.Body, p: Matter.Vector, updateVelocity: boolean) => void)(lv.platform, { x: lv.platform.position.x, y }, true);
      }
      if (!lv.triggered && f.type === 'falling' && x > f.a - FALL_WARNING) {
        lv.triggered = true;
        this.emit({ type: 'rockfall' });
        for (let i = 0; i < f.n; i++) {
          const px = f.a + ((i + 0.5) * (f.b - f.a)) / f.n;
          const r = f.h + (i % 3) * 2;
          const body = Bodies.polygon(px, this.profile.surfaceY(px) - 430 - ((i * 5) % f.n) * 95, 6, r, {
            density: 0.0022, friction: 0.8, restitution: 0.1, label: 'fallrock', angle: i,
          });
          this.addProp(lv, { kind: 'fallrock', body, fid: f.id, r, w: 0, h: 0, variant: i });
        }
      }
      if (lv.seesaw) {
        // the ends stop at road level
        const s = lv.seesaw;
        const max = Math.asin(Math.min(0.9, f.h / ((f.b - f.a) / 2)));
        if (s.angle > max || s.angle < -max) {
          const av = s.angularVelocity;
          Body.setAngle(s, s.angle > max ? max : -max);
          Body.setAngularVelocity(s, s.angle > 0 ? Math.min(0, av) : Math.max(0, av));
        }
      }
      if (lv.ball) {
        // keep the wrecking ball swinging: a nudge along its path whenever it slows down
        const b = lv.ball;
        if (b.speed < 5.2 && Math.abs(b.position.x - f.a) < 60) {
          const dir = b.velocity.x >= 0 ? 1 : -1;
          Body.applyForce(b, b.position, { x: dir * b.mass * 0.00045, y: 0 });
        }
      }
      if (!lv.triggered && f.type === 'roller' && x > f.a) {
        lv.triggered = true;
        const r = f.h;
        const body = Bodies.circle(f.b, this.profile.surfaceY(f.b) - r - 2, r, {
          density: 0.0011, friction: 0.9, frictionStatic: 1.5, restitution: 0.05, label: 'roller',
        });
        this.addProp(lv, { kind: 'boulder', body, fid: f.id, r, w: 0, h: 0, variant: 1 });
        Body.setVelocity(body, { x: -4.2, y: 0 });
        Body.setAngularVelocity(body, -0.16);
      }
    }
    // anything that fell into a hole is gone
    if (this.tick % 30 === 0 && this.props.length) {
      const doomed = this.props.filter((p) => !p.body.isStatic && p.body.position.y > this.profile.surfaceY(p.body.position.x) + 500);
      for (const p of doomed) this.removeProp(p);
    }
  }

  private addProp(lv: Live, prop: Prop): void {
    lv.bodies.push(prop.body);
    this.props.push(prop);
    Composite.add(this.engine.world, prop.body);
  }

  private removeProp(p: Prop): void {
    Composite.remove(this.engine.world, p.body);
    this.props = this.props.filter((q) => q !== p);
    const lv = this.live.get(p.fid);
    if (lv) {
      lv.bodies = lv.bodies.filter((b) => b !== p.body);
      if (p.kind === 'ball' || p.kind === 'seesaw') {
        // the rope snaps / the plank comes off its pivot
        Composite.remove(this.engine.world, lv.constraints as never);
        lv.constraints = [];
        lv.ball = null;
        lv.seesaw = null;
      }
    }
  }

  private activate(f: Feature): void {
    const lv: Live = { f, half: 0, bodies: [], constraints: [], planks: [], platform: null, seesaw: null, ball: null, rimY: this.profile.surfaceY(f.a), triggered: false };
    this.live.set(f.id, lv);
    this.liveList.push(lv);
    const sy = this.profile.surfaceY;
    switch (f.type) {
      case 'rocks':
        for (let i = 0; i < f.n; i++) {
          const x = f.a + i * 110 + ((f.seed >> i) % 30);
          const r = f.h + ((f.seed >> (i + 3)) % 8);
          // on a slope the rock sits lower, so it never becomes a wall or a trip hazard
          const climb = Math.abs(sy(x - 30) - sy(x + 30)) / 60;
          const body = Bodies.polygon(x, sy(x) + r * Math.min(0.93, ROCK_BURY + climb * 0.45), 10, r, {
            isStatic: true, friction: 1.4, label: 'rock', angle: (f.seed % 10) * 0.3 + i,
          });
          this.addProp(lv, { kind: 'rock', body, fid: f.id, r, w: 0, h: 0, variant: i });
        }
        break;
      case 'logs':
        for (let i = 0; i < f.n; i++) {
          const r = f.h;
          const x = f.a + i * (r * 2 + 6);
          const body = Bodies.circle(x, sy(x) - r - 1, r, { density: 0.0016, friction: 0.9, frictionStatic: 1.6, restitution: 0.02, label: 'log' });
          this.addProp(lv, { kind: 'log', body, fid: f.id, r, w: 0, h: 0, variant: i });
        }
        break;
      case 'crates': {
        const s = f.h;
        const baseY = Math.min(sy(f.a), sy(f.a + s + 2));
        for (let i = 0; i < f.n; i++) {
          const col = i % 2;
          const row = Math.floor(i / 2);
          const body = Bodies.rectangle(f.a + col * (s + 2), baseY - s / 2 - row * (s + 0.5), s, s, {
            density: 0.0005, friction: 0.6, restitution: 0.05, label: 'crate',
          });
          this.addProp(lv, { kind: 'crate', body, fid: f.id, r: s / 2, w: s, h: s, variant: i });
        }
        break;
      }
      case 'barrels':
        for (let i = 0; i < f.n; i++) {
          const x = f.a + i * 32;
          const body = Bodies.rectangle(x, sy(x) - f.h / 2 - 1, 26, f.h, {
            chamfer: { radius: 7 }, density: 0.0006, friction: 0.5, restitution: 0.15, label: 'barrel',
          });
          this.addProp(lv, { kind: 'barrel', body, fid: f.id, r: 13, w: 26, h: f.h, variant: i });
        }
        break;
      case 'boulder': {
        const r = f.h;
        const body = Bodies.circle(f.a, sy(f.a) - r - 1, r, { density: 0.0016, friction: 0.9, frictionStatic: 2, restitution: 0.03, label: 'boulder' });
        this.addProp(lv, { kind: 'boulder', body, fid: f.id, r, w: 0, h: 0, variant: 0 });
        break;
      }
      case 'bridge': {
        const span = f.b - f.a;
        const n = Math.round(span / 60);
        const pw = span / n;
        const group = Body.nextGroup(true);
        const y = lv.rimY + PLANK_T / 2;
        for (let i = 0; i < n; i++) {
          const body = Bodies.rectangle(f.a + (i + 0.5) * pw, y, pw, PLANK_T, {
            density: 0.003, friction: 1.4, frictionStatic: 2.4, restitution: 0, label: 'plank',
            collisionFilter: { group, category: CAT_PLANK, mask: 0xffffffff & ~CAT_TERRAIN },
          });
          lv.planks.push(body);
          this.addProp(lv, { kind: 'plank', body, fid: f.id, r: pw / 2, w: pw, h: PLANK_T, variant: i });
        }
        const link = (c: Matter.IConstraintDefinition) => {
          const con = Constraint.create({ length: 0, stiffness: 0.92, damping: 0.1, ...c });
          lv.constraints.push(con);
        };
        link({ pointA: { x: f.a, y }, bodyB: lv.planks[0], pointB: { x: -pw / 2, y: 0 } });
        for (let i = 0; i < n - 1; i++) {
          link({ bodyA: lv.planks[i], pointA: { x: pw / 2, y: 0 }, bodyB: lv.planks[i + 1], pointB: { x: -pw / 2, y: 0 } });
        }
        link({ pointA: { x: f.b, y }, bodyB: lv.planks[n - 1], pointB: { x: pw / 2, y: 0 } });
        Composite.add(this.engine.world, lv.constraints);
        break;
      }
      case 'seesaw': {
        const len = f.b - f.a;
        const cx = (f.a + f.b) / 2;
        const py = lv.rimY - f.h;
        const tilt = -Math.asin(Math.min(0.9, f.h / (len / 2))); // near end resting on the road
        const body = Bodies.rectangle(cx, py, len, PLANK_T, {
          angle: tilt, density: 0.0011, friction: 1.4, frictionStatic: 2.2, restitution: 0, label: 'seesaw', chamfer: { radius: 3 },
          // the plank never touches the ground body: its travel is limited in updateFeatures instead,
          // because an end pinched between a wheel and the ground makes the solver throw the car
          collisionFilter: { mask: 0xffffffff & ~CAT_TERRAIN },
        });
        lv.seesaw = body;
        lv.half = len / 2;
        this.addProp(lv, { kind: 'seesaw', body, fid: f.id, r: len / 2, w: len, h: PLANK_T, variant: 0 });
        const pin = Constraint.create({ pointA: { x: cx, y: py }, bodyB: body, pointB: { x: 0, y: 0 }, length: 0, stiffness: 1 });
        lv.constraints.push(pin);
        Composite.add(this.engine.world, pin);
        break;
      }
      case 'pendulum': {
        const r = f.h;
        const top = { x: f.a, y: lv.rimY - PENDULUM_TOP };
        const start = -1.05; // released from the left, about 60 degrees up
        const body = Bodies.circle(top.x + Math.sin(start) * f.n, top.y + Math.cos(start) * f.n, r, {
          density: 0.0014, friction: 0.3, frictionAir: 0, restitution: 0.25, label: 'ball',
          collisionFilter: { mask: 0xffffffff & ~CAT_TERRAIN },
        });
        lv.ball = body;
        this.addProp(lv, { kind: 'ball', body, fid: f.id, r, w: f.n, h: 0, variant: 0 });
        const rope = Constraint.create({ pointA: top, bodyB: body, pointB: { x: 0, y: 0 }, length: f.n, stiffness: 1 });
        lv.constraints.push(rope);
        Composite.add(this.engine.world, rope);
        break;
      }
      case 'platform': {
        const w = f.b - f.a + 24;
        const body = Bodies.rectangle((f.a + f.b) / 2, lv.rimY + PLATFORM_T / 2, w, PLATFORM_T, {
          isStatic: true, friction: 1.6, frictionStatic: 2.6, label: 'platform', chamfer: { radius: 6 },
        });
        lv.platform = body;
        this.addProp(lv, { kind: 'platform', body, fid: f.id, r: w / 2, w, h: PLATFORM_T, variant: 0 });
        break;
      }
    }
  }

  private deactivate(id: number): void {
    const lv = this.live.get(id);
    if (!lv) return;
    Composite.remove(this.engine.world, lv.constraints as never);
    Composite.remove(this.engine.world, lv.bodies as never);
    this.props = this.props.filter((p) => p.fid !== id);
    this.live.delete(id);
    this.liveList = this.liveList.filter((l) => l !== lv);
  }

  /** Mud drags the wheels, water slows the car and floats it a little. */
  private applyLiquids(): void {
    const v = this.vehicle;
    let kind: 'mud' | 'water' | null = null;
    for (const f of this.liquids) {
      if (v.x < f.a - 120 || v.x > f.b + 120) continue;
      const level = this.profile.surfaceY(f.a - 10) + 6;
      const r = v.spec.wheel.r;
      for (const w of v.wheels) {
        if (w.position.x <= f.a || w.position.x >= f.b) continue;
        const depth = Math.min(1, (w.position.y + r - level) / (2 * r));
        if (depth <= 0) continue;
        kind = f.type as 'mud' | 'water';
        const c = v.chassis;
        if (f.type === 'mud') {
          Body.setAngularVelocity(w, w.angularVelocity * (1 - 0.1 * depth));
          Body.setVelocity(w, { x: w.velocity.x * (1 - 0.03 * depth), y: w.velocity.y });
          Body.setVelocity(c, { x: c.velocity.x * (1 - 0.01 * depth), y: c.velocity.y });
        } else {
          Body.setVelocity(w, { x: w.velocity.x * (1 - 0.018 * depth), y: w.velocity.y * (1 - 0.02 * depth) });
          Body.setVelocity(c, { x: c.velocity.x * (1 - 0.007 * depth), y: c.velocity.y });
          Body.applyForce(w, w.position, { x: 0, y: -w.mass * 0.0006 * depth });
        }
      }
      break;
    }
    if (kind && kind !== this.inLiquid) {
      const p = v.frontWheel.position;
      this.emit({ type: 'splash', x: p.x, y: p.y + v.spec.wheel.r, kind });
    }
    this.inLiquid = kind;
  }

  // ------------------------------------------------------------------ main step
  /** Advance the simulation by one fixed 60 Hz step. */
  step(gasInput: boolean, brakeInput: boolean): void {
    const playing = this.state === 'playing';
    const won = this.endReason === 'win';
    const gas = playing && gasInput;
    const brake = (playing && brakeInput) || won;
    const hasFuel = this.fuel > 0;
    const v = this.vehicle;

    this.updateFeatures();
    v.applyControls(gas, brake, hasFuel);
    this.applyLiquids();
    Engine.update(this.engine, PHYSICS_STEP);
    this.unstickWheels();
    v.clampSuspension();
    this.tick++;

    if (playing) {
      if (hasFuel) {
        const mud = this.inLiquid === 'mud' ? 1.3 : 1;
        this.fuel = Math.max(0, this.fuel - (FUEL.idleDrain + (gas ? FUEL.gasDrain * mud : 0)) * v.stats.fuelUse * STEP_S);
      }
      this.updateProps();
      this.checkPickups();
      this.checkCheckpoints();
      if (v.x >= this.finishX) this.endRun('win');
      else if (v.headTouchesGround() || v.isOverturned()) this.endRun('crash');
      else if (this.fellInHole()) this.endRun('fell');
      else if (this.headHit()) this.endRun('hit');
      else this.gameLogic(gas);
    }
    this.updateChunks(v.x);
  }

  /**
   * Crates and barrels smash when hit at speed. Any loose object that keeps
   * blocking a crawling car breaks up after a moment, so nothing can wedge the
   * car in place for good.
   */
  private updateProps(): void {
    if (!this.props.length) return;
    const v = this.vehicle;
    const slow = Math.abs(v.chassis.velocity.x) < 1.6;
    let broken: Prop[] | null = null;
    for (const p of this.props) {
      const b = p.body;
      if (p.kind === 'plank' || p.kind === 'platform') continue;
      if (Math.abs(b.position.x - v.x) > 150 || Math.abs(b.position.y - v.y) > 110) {
        p.jam = 0;
        continue;
      }
      const fragile = p.kind === 'crate' || p.kind === 'barrel';
      if (fragile && b.speed > 3.4) (broken ??= []).push(p);
      else if (slow || (!b.isStatic && v.chassis.velocity.x < 6 && b.position.x > v.x && b.position.x - v.x < 70 + p.r)) {
        // also counts while being bulldozed along: a boulder is shoved for a moment, then breaks up
        p.jam = (p.jam ?? 0) + 1;
        // fixed rocks take longer to give way than loose objects
        if (p.jam > (b.isStatic ? 150 : 80)) (broken ??= []).push(p);
      } else if (p.jam) p.jam--;
    }
    if (broken) {
      for (const p of broken) {
        this.emit({ type: 'smash', x: p.body.position.x, y: p.body.position.y, kind: p.kind });
        this.removeProp(p);
      }
    }
  }

  /**
   * A very hard landing can push a wheel through the surface into the ground
   * slab, where it would stay wedged. Put any wheel that is more than half
   * buried back on top.
   */
  private unstickWheels(): void {
    const v = this.vehicle;
    const r = v.spec.wheel.r;
    for (const w of v.wheels) {
      const top = this.profile.surfaceY(w.position.x) - r;
      const sunk = w.position.y - top;
      if (sunk > r * 0.5 && sunk < r * 2.4) {
        Body.setPosition(w, { x: w.position.x, y: top });
        if (w.velocity.y > 0) Body.setVelocity(w, { x: w.velocity.x, y: 0 });
      }
    }
  }

  private fellInHole(): boolean {
    const v = this.vehicle;
    for (const f of this.chasms) {
      if (v.x > f.a - 40 && v.x < f.b + 40) return v.y > this.profile.surfaceY(f.a - 10) + 190;
    }
    return false;
  }

  private headHit(): boolean {
    if (!this.props.length) return false;
    const hd = this.vehicle.getHead();
    for (const p of this.props) {
      if (p.kind !== 'fallrock') continue;
      const b = p.body;
      // only a rock still coming down on the driver counts; rolling debris is harmless
      if (b.velocity.y < 3 || b.position.y > hd.y) continue;
      if (Math.hypot(b.position.x - hd.x, b.position.y - hd.y) < p.r + hd.r) return true;
    }
    return false;
  }

  private checkPickups(): void {
    const v = this.vehicle;
    const a = v.chassis.position;
    const b = v.rearWheel.position;
    const c = v.frontWheel.position;
    const vx = v.x;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      const dx = p.x - vx;
      if (dx > 100 || dx < -100) continue;
      const hit =
        (a.x - p.x) * (a.x - p.x) + (a.y - p.y) * (a.y - p.y) < PICKUP_R2 ||
        (b.x - p.x) * (b.x - p.x) + (b.y - p.y) * (b.y - p.y) < PICKUP_R2 ||
        (c.x - p.x) * (c.x - p.x) + (c.y - p.y) * (c.y - p.y) < PICKUP_R2;
      if (!hit) continue;
      this.pickups.splice(i, 1);
      this.collected.add(p.key);
      if (p.type === 'coin') {
        this.runCoins++;
        this.emit({ type: 'coin', x: p.x, y: p.y });
      } else {
        this.fuel = Math.min(this.fuelMax, this.fuel + FUEL.canAmount);
        this.emit({ type: 'fuel', x: p.x, y: p.y });
      }
    }
  }

  private checkCheckpoints(): void {
    const x = this.vehicle.x;
    for (const f of this.checkpoints) {
      if (x < f.a || this.passed.has(f.id)) continue;
      this.passed.add(f.id);
      this.checkpoint = { x: f.a, fuel: this.fuel, n: f.n };
      this.emit({ type: 'checkpoint', n: f.n });
    }
  }

  private bonus(coins: number): void {
    this.runCoins += coins / COIN_VALUE;
    this.stuntBonusCoins += coins;
  }

  private updateStunts(): void {
    const v = this.vehicle;
    const rearGrounded = v.isWheelGrounded(v.rearWheel);
    const frontGrounded = v.isWheelGrounded(v.frontWheel);

    if (!rearGrounded && !frontGrounded) {
      this.airTime += STEP_S;
      const a = v.chassis.angle;
      if (this.lastAirAngle !== null) this.airRotation += wrapAngle(a - this.lastAirAngle);
      this.lastAirAngle = a;
      return;
    }

    if (this.airTime > 0.18) {
      const vy = v.chassis.velocity.y;
      if (vy > 3.5) {
        this.emit({ type: 'land', intensity: Math.min(1, vy / 16) });
        for (const w of v.wheels) this.emit({ type: 'dust', x: w.position.x, y: w.position.y + v.spec.wheel.r, n: 3 });
      }
      const flips = Math.round(this.airRotation / (Math.PI * 2));
      if (flips !== 0) {
        const count = Math.abs(flips);
        const earned = count * 50;
        this.bonus(earned);
        // same naming as the original game: positive rotation is called a backflip
        this.emit({ type: 'stunt', text: `${flips > 0 ? 'BACKFLIP' : 'FRONTFLIP'} x${count}! +${earned}` });
      } else if (this.airTime >= 1.4) {
        const earned = Math.min(40, Math.floor(this.airTime * 12));
        this.bonus(earned);
        this.emit({ type: 'stunt', text: `AIR TIME ${this.airTime.toFixed(1)}s +${earned}` });
      }
    }
    this.airTime = 0;
    this.airRotation = 0;
    this.lastAirAngle = null;

    if (rearGrounded && !frontGrounded && v.chassis.velocity.x > 3 && this.fuel > 0) {
      const before = this.wheelieTime;
      this.wheelieTime += STEP_S;
      if (this.wheelieTime >= 1.0 && before < 1.0) {
        this.bonus(15);
        this.emit({ type: 'stunt', text: 'WHEELIE! +15' });
      }
    } else {
      this.wheelieTime = 0;
    }
  }

  private gameLogic(gas: boolean): void {
    const v = this.vehicle;
    this.distance = Math.max(this.distance, (v.x - SPAWN_X) / PX_PER_METER);
    this.updateStunts();

    if (this.fuel > 0 && this.fuel / this.fuelMax < 0.2) {
      this.fuelWarn += STEP_S;
      if (this.fuelWarn >= 1.6) {
        this.fuelWarn = 0;
        this.emit({ type: 'lowFuel' });
      }
    } else {
      this.fuelWarn = 0;
    }

    // every full kilometre pays a bonus
    const km = Math.floor(this.distance / 1000);
    const maxKm = Math.floor((this.finishX - SPAWN_X) / (1000 * PX_PER_METER));
    if (km > this.lastKm && km <= maxKm) {
      this.lastKm = km;
      this.bonus(km * 100);
      this.emit({ type: 'km', km, coins: km * 100 });
    }

    // upside down for a quarter of a second
    if (Math.abs(wrapAngle(v.angle)) > 1.85) {
      this.flipTime += STEP_S;
      if (this.flipTime > 0.25) return this.endRun('crash');
    } else {
      this.flipTime = 0;
    }

    // standing on its nose or tail and going nowhere: that is a crash too
    if (Math.abs(wrapAngle(v.angle)) > 1.2 && Math.abs(v.chassis.velocity.x) < 0.6) {
      this.tipTime += STEP_S;
      if (this.tipTime > 1.5) return this.endRun('crash');
    } else {
      this.tipTime = 0;
    }

    // out of fuel and rolled to a stop
    if (this.fuel <= 0) {
      // measured by position: a car resting on an obstacle still reports a small velocity
      if (Math.abs(v.x - this.stuckX) > 5) {
        this.stuckX = v.x;
        this.stuckY = v.y;
        this.stuckTime = 0;
      } else {
        this.stuckTime += STEP_S;
      }
      if (this.stuckTime > 1.5) return this.endRun('fuel');
    }

    if (gas && this.fuel > 0 && this.tick % 2 === 0 && v.isWheelGrounded(v.rearWheel)) {
      const c = v.rearContact();
      this.emit({ type: 'dust', x: c.x, y: c.y, n: 1 });
    }
  }

  private endRun(reason: EndReason): void {
    if (this.state !== 'playing') return;
    this.state = 'ending';
    this.endReason = reason;
    this.emit({ type: 'end', reason });
  }

  destroy(): void {
    Matter.World.clear(this.engine.world, false);
    Engine.clear(this.engine);
    this.chunks.clear();
    this.props = [];
    this.pickups = [];
    this.live.clear();
    this.liveList = [];
  }
}
