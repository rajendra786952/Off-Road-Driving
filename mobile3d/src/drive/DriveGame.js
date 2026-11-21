// The 3D driving scene: owns the Three.js renderer, the session, cameras, audio and the results
// flow. It draws into a native GL surface (expo-gl, see src/screens/DriveScreen.tsx) and talks to
// the React Native HUD through a HudBridge (src/drive/hudBridge.js): no DOM anywhere.
import * as THREE from 'three';
import { createRenderer, present, supportsHalfFloatTargets } from '../platform/gl';
import { preload, releaseAssets } from '../platform/textures';
import { softDot } from './render/pixels.js';
import { World, QUALITY } from './render/world.js';
import { CarModel } from './render/carModel.js';
import { DriveAudio } from './audio';
import { DriveSession, scoreRun, fmtTime } from './core/session.js';
import { fmtClock, ENABLE_SKYBOX } from './render/sky.js';
import { buildParams } from './core/specs.js';
import { TIRES } from './core/surfaces.js';
import { BotDriver } from './core/bot.js';
import { HazardView } from './render/hazards.js';
import { loadPack, packAssetKeys } from './render/pack.js';
import { TIER_FOR_DIFFICULTY } from './core/obstacles.js';
import { challengeRewards } from './core/progress.js';

const CAMS = ['chase', 'far', 'hood', 'cockpit', 'cinematic'];
const lerpAngle = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; };

export class DriveGame {
  /**
   * opts: { gl (expo-gl context), width, height (layout size), hud (HudBridge), def (track def),
   *         vehicle (VEHICLES entry), ups, gear, settings, quality (resolved preset name),
   *         resume (session snapshot), ghost ({ s, d } best-run trace),
   *         onCheckpoint(snapshot), coach (false for test drives),
   *         onFinish(session, score) -> reward summary, onExit(action), hasNext }
   */
  constructor(opts) {
    this.opts = opts;
    this.state = 'loading';
    this.t0 = performance.now();
    this.gl = opts.gl;
    this.width = opts.width; this.height = opts.height;

    const qName = QUALITY[opts.quality] ? opts.quality : 'medium';
    this.q = { ...QUALITY[qName], post: false };
    // soft image-based lighting needs half-float render targets; without them the sun and sky lights do all the work
    this.q.floatTargets = supportsHalfFloatTargets(this.gl);

    this.renderer = createRenderer(this.gl);
    this.renderer.shadowMap.enabled = !!this.q.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.3, 1400);

    this.params = buildParams(opts.vehicle.id, opts.ups, opts.gear);
    this.hud = opts.hud;
    this.hud.configure({ difflock: this.params.difflock, winch: this.params.winch, hot: ['desert', 'volcano'].includes(opts.def.env || opts.def.region), steerMode: opts.settings.steerMode, simple: opts.settings.hud !== 'full' });
    this.hud.loading(`Loading ${opts.def.name}...`, 0.03);

    this.camMode = Math.max(0, CAMS.indexOf(opts.settings.camera || 'chase'));
    this.camYaw = 0;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.camQ = new THREE.Quaternion();
    this.shake = 0;
    this.steer = 0;
    this.noteIdx = 0;
    this.fpsAcc = 0; this.fpsN = 0; this.fps = 60;
    this.last = 0;
    this.time = 0;
    this.raf = 0;
    this.v3 = new THREE.Vector3();
    this.v3b = new THREE.Vector3();
    this.q4 = new THREE.Quaternion();
    this.flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

    // read the textures and models this track needs, then build the heavy stuff
    this.pack = null;
    const keys = ['banner_start', 'banner_finish'];
    for (let i = 1; i <= 12; i++) keys.push('banner_cp' + i);
    if (this.q.name !== 'low') keys.push('tree_atlas', 'bark_pine', 'bark_broad', 'bark_palm');
    if (opts.def.pack) keys.push(...packAssetKeys());
    else if (this.q.pbr) keys.push('ground_c', 'ground_n');
    const name = `Loading ${opts.def.name}...`;
    preload(keys, (f) => this.hud.loading(name, 0.03 + 0.05 * f))
      .then(() => (opts.def.pack ? loadPack((f) => this.hud.loading(name, 0.08 + 0.02 * f)).then((p) => { this.pack = p; }) : null))
      .catch((e) => console.warn('Assets not loaded:', e))
      .then(() => {
        try { this._build(); } catch (e) { console.error('Track failed to build:', e); this.hud.fail(String((e && e.message) || e)); }
        releaseAssets();
      });
  }

  /** The view changed size (layout points); the drawing buffer follows the GL surface. */
  resize(w, h) {
    this.width = w; this.height = h;
    this.renderer.setSize(this.gl.drawingBufferWidth, this.gl.drawingBufferHeight, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1.5 ? 70 : 62;
    this.camera.updateProjectionMatrix();
    if (this.world && this.state !== 'loading') this._render();   // a resized surface is blank until it is drawn again
  }

  _render() {
    this.renderer.render(this.world.scene, this.camera);
    present(this.gl);
  }

  // look-around: drag anywhere on the view (springs back). Called by the touch layer.
  lookStart(x) { this.dragging = true; this.dragX = x; }
  lookMove(x) { if (!this.dragging) return; this.dragYaw = Math.max(-2.6, Math.min(2.6, this.dragYaw - (x - this.dragX) * 0.007)); this.dragX = x; }
  lookEnd() { this.dragging = false; }

  _build() {
    if (this.disposed) return;
    const o = this.opts;
    this.track = o.def.build();
    // generated obstacles follow the difficulty (settings.obstacles === false turns the layer off, ?obstacles=<tier> overrides it)
    const obTier = TIER_FOR_DIFFICULTY[o.difficulty] || 'medium';
    const obstacles = o.settings.obstacles === false || obTier === 'off' ? null
      : { difficulty: obTier, dynamicEvents: o.settings.dynamicHazards !== false, categories: { wildlife: o.settings.wildlife !== false } };
    this.session = new DriveSession(this.track, this.params, { difficulty: o.difficulty, resume: o.resume, obstacles });
    this.weather = this.session.weather;
    this.world = new World(this.track, this.q, this.renderer, this.pack);
    if (this.pack) {
      this.world.setSkyboxEnabled(true);       // this track brings its own skies
    } else if (!ENABLE_SKYBOX) {
      this.world.setSkyboxEnabled(false);
    } else if (o.settings && typeof o.settings.skybox === 'boolean') {
      this.world.setSkyboxEnabled(o.settings.skybox);
    }
    this.world.init(this.session);
    this.world.setAtmosphere(this.session.weather, this.session.hour, 1);
    this.atmoT = 0;
    this.car = new CarModel(o.vehicle, this.params, this.session.vehicle, { pbr: this.q.pbr });
    if (this.pack && this.pack.jeep && o.vehicle.id === 'mountain-jeep') this.car.usePack(this.pack.jeep);
    this.world.scene.add(this.car.group);
    for (const m of this.car.mats) this.world.useHdrOn(m);     // paint, chrome and glass reflect the HDR sky
    // ghost of the player's best run on this track
    this.ghost = null;
    if (o.ghost && Array.isArray(o.ghost.s) && o.ghost.s.length > 6) {
      const b = this.params.body;
      const gm = new THREE.MeshBasicMaterial({ color: 0x9fe0ff, transparent: true, opacity: 0.3, depthWrite: false });
      const g = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h * 0.55, b.l), gm); hull.position.y = b.h * 0.3;
      const cab = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.88, b.h * 0.45, b.l * 0.45), gm); cab.position.set(0, b.h * 0.8, -b.l * 0.08);
      g.add(hull, cab);
      g.visible = false;
      this.world.scene.add(g);
      this.ghost = { mesh: g, mat: gm, s: o.ghost.s, d: o.ghost.d || [] };
    }
    this.lookYaw = 0; this.dragYaw = 0; this.dragging = false;
    // first-run coach + one-off tips
    this.coach = o.coach !== false && !o.settings.tutorialDone ? { step: 0, t: 0, seen: {} } : null;
    this.tips = { stall: 0, spin: 0, shown: {} };
    // headlights: always fitted, brightness follows darkness and fog
    this.lamp = new THREE.SpotLight(0xfff2cc, 0, 85, 0.55, 0.55, 1.5);
    this.lamp.position.copy(this.car.lampPos);
    this.lamp.target.position.set(0, this.car.lampPos.y - 1.4, 16);
    this.car.group.add(this.lamp, this.lamp.target);
    this._buildFx();
    this.hazardView = this.session.hazards ? new HazardView(this.world, this.session.hazards) : null;
    this.audio = new DriveAudio(o.settings.sound !== false);
    this.hud.initMap(this.track);
    this.hud.on('pause', () => (this.state === 'run' ? this.pause() : this.state === 'paused' ? this.resume() : 0));
    this.hud.on('camera', () => this.nextCamera());
    this.hud.on('recover', () => this.recover());
    this.resize(this.width, this.height);

    const veh = this.session.vehicle;
    this.camYaw = veh.heading;
    this._warm = 0;
    this._warmTotal = 1;
    this.car.sync();
    this._camera(1);
    this.world.update(0, veh.p[0], veh.p[2], this.camera, 0);
    this._warmTotal = Math.max(1, this.world.pending);
    this._render();
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this._frame(t));
  }

  // ----------------------------------------------------------------- effects
  _buildFx() {
    const scene = this.world.scene;
    // dust / spray particles
    const N = 140;
    this.pN = N;
    this.pPos = new Float32Array(N * 3).fill(-9999);
    this.pVel = new Float32Array(N * 3);
    this.pLife = new Float32Array(N);
    this.pNext = 0;
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    this.pTex = softDot(32);
    this.pMat = new THREE.PointsMaterial({ color: 0x8a6a48, size: 0.9, map: this.pTex, transparent: true, opacity: 0.5, depthWrite: false });
    this.particles = new THREE.Points(pg, this.pMat);
    this.particles.frustumCulled = false;
    scene.add(this.particles);

    // tyre tracks: ring buffer of quads for the 4 wheels
    const SEG = 220;
    this.trSeg = SEG;
    this.trPos = new Float32Array(4 * SEG * 4 * 3).fill(-9999);
    const idx = new Uint16Array(4 * SEG * 6);
    for (let k = 0; k < 4 * SEG; k++) { const v = k * 4; idx.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], k * 6); }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.trPos, 3));
    tg.setIndex(new THREE.BufferAttribute(idx, 1));
    const snowy = this.track.env.off === 'deepsnow';
    this.trMat = new THREE.MeshBasicMaterial({ color: snowy ? 0x8fa3b8 : 0x1c140d, transparent: true, opacity: snowy ? 0.5 : 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
    this.trails = new THREE.Mesh(tg, this.trMat);
    this.trails.frustumCulled = false;
    this.trails.renderOrder = 1;
    scene.add(this.trails);
    this.trLast = [null, null, null, null];
    this.trHead = [0, 0, 0, 0];

    // winch line
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.winchLine = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xdddddd }));
    this.winchLine.frustumCulled = false;
    this.winchLine.visible = false;
    scene.add(this.winchLine);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 6, 16), new THREE.MeshBasicMaterial({ color: 0xffd23f, fog: false }));
    ring.visible = false;
    this.anchorRing = ring;
    scene.add(ring);
  }

  _spawnParticle(x, y, z, vx, vy, vz) {
    const i = this.pNext;
    this.pNext = (i + 1) % this.pN;
    this.pPos[i * 3] = x; this.pPos[i * 3 + 1] = y; this.pPos[i * 3 + 2] = z;
    this.pVel[i * 3] = vx; this.pVel[i * 3 + 1] = vy; this.pVel[i * 3 + 2] = vz;
    this.pLife[i] = 0.7 + Math.random() * 0.5;
  }

  /** A puff of particles at a world position (rock dust, splinters, splashes). */
  _burstFx(x, y, z, n, spread, up) {
    for (let k = 0; k < n; k++) {
      this._spawnParticle(x + (Math.random() - 0.5) * spread, y + 0.2 + Math.random() * 0.6, z + (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * spread * 1.6, up * (0.4 + Math.random()), (Math.random() - 0.5) * spread * 1.6);
    }
  }

  _updateFx(dt) {
    const veh = this.session.vehicle, tr = this.track;
    // particles
    let main = veh.wheels[2].surface;
    for (let i = 0; i < 4; i++) {
      const w = veh.wheels[i];
      if (!w.grounded) continue;
      const slip = Math.abs(w.slip), sp = Math.abs(veh.speed);
      // a wheel dropping into a water-filled pothole splashes like a ford
      const wet = w.water > 0.05 || (tr.layer && Math.abs(veh.speed) > 1.5 && tr.bumpAt(w.wx, w.wz) < -0.05);
      const rate = wet ? sp * 0.5 : slip > 1.5 ? 0.9 : sp > 6 && w.surface.sink < 0.1 ? 0.25 : 0;
      if (Math.random() < rate * dt * 30) {
        const back = slip > 1.5 ? -Math.sign(w.slip) : -0.3;
        this._spawnParticle(w.wx, w.wy - this.params.wheelR + 0.1, w.wz,
          veh.R[2] * back * (2 + slip * 0.3) + (Math.random() - 0.5) * 2, 1.2 + Math.random() * (wet ? 3.5 : 1.8), veh.R[8] * back * (2 + slip * 0.3) + (Math.random() - 0.5) * 2);
      }
      if (i >= 2) main = w.surface;
    }
    const wetNow = veh.waterDepth > 0.05;
    const c = wetNow ? [0.8, 0.88, 0.92] : main.color;
    this.pMat.color.setRGB(Math.min(1, c[0] * 1.25), Math.min(1, c[1] * 1.25), Math.min(1, c[2] * 1.25));
    for (let i = 0; i < this.pN; i++) {
      if (this.pLife[i] <= 0) continue;
      this.pLife[i] -= dt;
      if (this.pLife[i] <= 0) { this.pPos[i * 3 + 1] = -9999; continue; }
      this.pVel[i * 3 + 1] -= 5 * dt;
      this.pPos[i * 3] += this.pVel[i * 3] * dt; this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1] * dt; this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
    }
    this.particles.geometry.attributes.position.needsUpdate = true;

    // tyre tracks on soft ground
    let dirty = false;
    for (let i = 0; i < 4; i++) {
      const w = veh.wheels[i];
      const soft = w.grounded && w.surface.sink >= 0.02 && w.water < 0.05;
      if (!soft) { this.trLast[i] = null; continue; }
      const x = w.wx, z = w.wz;
      const last = this.trLast[i];
      if (last && Math.hypot(x - last.x, z - last.z) < 0.7) continue;
      const hx = veh.R[0] * 0.15, hz = veh.R[6] * 0.15;
      const cur = { x, z, ax: x + hx, az: z + hz, bx: x - hx, bz: z - hz };
      cur.ay = tr.heightAt(cur.ax, cur.az) + 0.04; cur.by = tr.heightAt(cur.bx, cur.bz) + 0.04;
      if (last) {
        const k = (i * this.trSeg + this.trHead[i]) * 12;
        this.trHead[i] = (this.trHead[i] + 1) % this.trSeg;
        const p = this.trPos;
        p[k] = last.ax; p[k + 1] = last.ay; p[k + 2] = last.az;
        p[k + 3] = last.bx; p[k + 4] = last.by; p[k + 5] = last.bz;
        p[k + 6] = cur.ax; p[k + 7] = cur.ay; p[k + 8] = cur.az;
        p[k + 9] = cur.bx; p[k + 10] = cur.by; p[k + 11] = cur.bz;
        dirty = true;
      }
      this.trLast[i] = cur;
    }
    if (dirty) this.trails.geometry.attributes.position.needsUpdate = true;

    // Mud and dirt accumulation on car body (washed off when wading through water)
    const moving = Math.hypot(veh.v[0], veh.v[2]) > 0.8;
    const offRoad = veh.wheels.some((w) => w.grounded && (w.surface.sink >= 0.015 || Math.abs(w.slip) > 0.8));
    if (this.car && this.car.updateDirt) {
      this.car.updateDirt(moving && offRoad ? dt : 0, veh.waterDepth > 0.15);
    }

    // winch
    const a = veh.winchAnchor;
    this.anchorRing.visible = !!a && this.params.winch;
    if (a) { this.anchorRing.position.set(a.x, a.y + 0.1, a.z); this.anchorRing.rotation.y = this.time * 2; }
    const pulling = !!a && veh.winchTension > 0;
    this.winchLine.visible = pulling;
    if (pulling) {
      const p = this.winchLine.geometry.attributes.position.array;
      const hl = this.params.body.l / 2;
      p[0] = veh.p[0] + veh.R[2] * hl; p[1] = veh.p[1] + veh.R[5] * hl - 0.2; p[2] = veh.p[2] + veh.R[8] * hl;
      p[3] = a.x; p[4] = a.y; p[5] = a.z;
      this.winchLine.geometry.attributes.position.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------------ camera
  nextCamera() {
    this.camMode = (this.camMode + 1) % CAMS.length;
    this.car.setInterior(CAMS[this.camMode] === 'cockpit');
    this.hud.toast(`Camera: ${CAMS[this.camMode]}`, 1200);
    this.opts.settings.camera = CAMS[this.camMode];
    this._camera(1);
  }

  _camera(dt) {
    const veh = this.session.vehicle, cam = this.camera, tr = this.track;
    const mode = CAMS[this.camMode];
    const p = veh.p;
    const sh = this.opts.settings.camShake === false ? 0 : this.shake;
    if (mode === 'chase' || mode === 'far') {
      // yaw follows the truck smoothly and stays level: no roll, no flips -> no motion sickness
      const moving = Math.hypot(veh.v[0], veh.v[2]) > 2.5 && veh.upY < 0.4;
      const targetYaw = moving ? Math.atan2(veh.v[0], veh.v[2]) : veh.heading;
      this.camYaw = lerpAngle(this.camYaw, targetYaw, 1 - Math.exp(-dt * (veh.upY < 0.4 ? 1.2 : 3.2)));
      const dist = mode === 'far' ? 12.5 : 7.4, height = mode === 'far' ? 5.6 : 2.9;
      const pitch = Math.max(-0.45, Math.min(0.45, veh.pitch));
      // on climbs the camera drops and looks up the hill, on descents it rises
      // look-around offset eases toward the held keys / stick / drag, and the drag springs back while driving
      if (!this.dragging) this.dragYaw *= Math.exp(-dt * (Math.abs(veh.speed) > 1.5 ? 2.2 : 0.5));
      const lookT = this.hud.look() * 1.9 + this.dragYaw;
      this.lookYaw = dt >= 1 ? lookT : this.lookYaw + (lookT - this.lookYaw) * (1 - Math.exp(-dt * 8));
      const yaw = this.camYaw + this.lookYaw;
      const tx = p[0] - Math.sin(yaw) * dist, tz = p[2] - Math.cos(yaw) * dist;
      let ty = p[1] + height - Math.sin(pitch) * dist * 0.75;
      // keep a clear line of sight: if a bank or cliff rises between the truck and the camera, lift the camera over it
      let lift = 0;
      for (let k = 1; k <= 5; k++) {
        const f = k / 5.5;
        const gy = tr.groundAt(p[0] + (tx - p[0]) * f, p[2] + (tz - p[2]) * f, 1e9) + 0.6;
        const ly = p[1] + 1.1 + (ty - p[1] - 1.1) * f;
        if (gy > ly) lift = Math.max(lift, (gy - ly) / f);
      }
      ty += Math.min(lift, 9);
      const ground = tr.groundAt(tx, tz, 1e9) + 1.1;
      if (ty < ground) ty = ground;
      const k = 1 - Math.exp(-dt * 7);
      this.camPos.x += (tx - this.camPos.x) * k; this.camPos.z += (tz - this.camPos.z) * k;
      this.camPos.y += (ty - this.camPos.y) * (1 - Math.exp(-dt * 4));
      if (dt >= 1) this.camPos.set(tx, ty, tz);
      const g2 = tr.groundAt(this.camPos.x, this.camPos.z, 1e9) + 0.7;
      if (this.camPos.y < g2) this.camPos.y = g2;
      cam.position.copy(this.camPos);
      if (sh > 0) { cam.position.x += (Math.random() - 0.5) * sh; cam.position.y += (Math.random() - 0.5) * sh; }
      this.v3.set(p[0] + veh.R[2] * 3.5, p[1] + 1.0 + veh.R[5] * 3.5, p[2] + veh.R[8] * 3.5);
      this.camLook.lerp(this.v3, dt >= 1 ? 1 : 1 - Math.exp(-dt * 9));
      cam.lookAt(this.camLook);
    } else if (mode === 'cinematic') {
      this.cineAngle = (this.cineAngle ?? veh.heading) + dt * 0.28;
      const dist = 8.2;
      const height = 2.4 + Math.sin(this.cineAngle * 0.4) * 0.7;
      const tx = p[0] - Math.sin(this.cineAngle) * dist;
      const tz = p[2] - Math.cos(this.cineAngle) * dist;
      let ty = p[1] + height;
      const ground = tr.groundAt(tx, tz, 1e9) + 1.0;
      if (ty < ground) ty = ground;
      const k = 1 - Math.exp(-dt * 5);
      this.camPos.x += (tx - this.camPos.x) * k;
      this.camPos.z += (tz - this.camPos.z) * k;
      this.camPos.y += (ty - this.camPos.y) * k;
      if (dt >= 1) this.camPos.set(tx, ty, tz);
      cam.position.copy(this.camPos);
      this.v3.set(p[0] + veh.R[2] * 1.5, p[1] + 0.9 + veh.R[5] * 1.5, p[2] + veh.R[8] * 1.5);
      this.camLook.lerp(this.v3, dt >= 1 ? 1 : 1 - Math.exp(-dt * 7));
      cam.lookAt(this.camLook);
    } else {
      const eye = mode === 'hood' ? this.car.hoodEye : this.car.eye;
      this.q4.set(veh.q[0], veh.q[1], veh.q[2], veh.q[3]);
      this.v3.copy(eye).applyQuaternion(this.q4);
      cam.position.set(p[0] + this.v3.x, p[1] + this.v3.y, p[2] + this.v3.z);
      if (sh > 0) cam.position.y += (Math.random() - 0.5) * sh * 0.5;
      this.q4.multiply(this.flip);
      this.camQ.slerp(this.q4, dt >= 1 ? 1 : 1 - Math.exp(-dt * 14));
      cam.quaternion.copy(this.camQ);
      this.camPos.copy(cam.position);
      this.camYaw = veh.heading;
    }

    // Dynamic Speed-based FOV
    const baseFov = this.width / this.height < 1.5 ? 70 : 62;
    const speedRatio = Math.min(1, Math.abs(veh.speed) / 22);
    const targetFov = baseFov + speedRatio * 11;
    if (Math.abs(cam.fov - targetFov) > 0.1) {
      cam.fov += (targetFov - cam.fov) * (1 - Math.exp(-dt * 3.5));
      cam.updateProjectionMatrix();
    }
  }

  // -------------------------------------------------------------------- loop
  _frame(t) {
    if (this.disposed) return;
    this.raf = requestAnimationFrame((tt) => this._frame(tt));
    const dt = Math.min(0.05, Math.max(0.001, (t - this.last) / 1000));
    this.last = t;
    const ss = this.session, veh = ss.vehicle;

    if (this.state === 'loading') {
      this.world.update(0, veh.p[0], veh.p[2], this.camera, 0);
      for (let i = 0; i < 6 && this.world.pending; i++) { this.world.update(0, veh.p[0], veh.p[2], this.camera, 0); }
      const done = 1 - this.world.pending / this._warmTotal;
      this.hud.loading(`Loading ${this.opts.def.name}...`, 0.1 + 0.9 * done);
      if (this.world.pending === 0) {
        this.state = 'run';
        this.loadMs = Math.round(performance.now() - this.t0);
        this.audio.start();
        this.hud.toast(ss.resumed ? `Resumed at checkpoint ${ss.cpNext}/${this.track.checkpoints.length}` : `${this.opts.def.name}  -  ${this.weather.name}${this.ghost ? '  -  your ghost is racing you' : ''}`, 3500);
        if (ss.resumed) this._camera(1);
        this.world.setAtmosphere(ss.weather, ss.hour, 1);
        this._render();
        this.hud.loaded();
      } else {
        this._render();
      }
      return;
    }

    if (this.state === 'run' || this.state === 'done') {
      this.time += dt;
      let inp = this.hud.read();
      if (this.bot) inp = { ...this.bot.input(dt), steerRaw: true };
      const sens = this.opts.settings.steerSens || 1;
      const rate = (inp.steer === 0 ? 5.5 : 3.4 * sens) * dt;
      this.steer += Math.max(-rate, Math.min(rate, inp.steer - this.steer));
      if (!inp.steerRaw) inp.steer = this.steer;
      if (inp.winch && this.params.winch && veh.winchAnchor && Math.floor(this.time * 6) !== Math.floor((this.time - dt) * 6)) this.audio.winch();
      ss.update(dt, inp);
      if (this.state === 'run') { this._coach(dt, inp, veh); this._tips(dt, inp, veh); }
      this._ghost(ss);
      this._events(ss.takeEvents());
      if (this.state === 'run') {
        const notes = this.track.notes;
        while (this.noteIdx < notes.length && ss.s >= notes[this.noteIdx].s - 6) this.hud.toast(notes[this.noteIdx++].text, 5200);
      }
      const rough = veh.wheels[0].surface.rough;
      this.shake = Math.max(this.shake * Math.exp(-dt * 6), Math.min(0.09, Math.abs(veh.speed) * rough * 0.0045));
      this._updateFx(dt);
      const slipMax = Math.max(Math.abs(veh.wheels[0].slip), Math.abs(veh.wheels[1].slip), Math.abs(veh.wheels[2].slip), Math.abs(veh.wheels[3].slip));
      this.audio.update({
        rpm01: veh.rpm01, throttle: Math.abs(veh.throttle), speed: veh.speed, slip: slipMax,
        surface: veh.wheels[2].surface, water: veh.waterDepth, grounded: veh.wheels.some((w) => w.grounded),
        strain: Math.abs(veh.throttle) * Math.max(0, 1 - Math.abs(veh.speed) / 4), weather: this.weather,
        env: this.track.env.silhouette, day: this.world.day, dt
      });
    }

    this.car.sync();
    this._camera(dt);
    this.world.update(dt, veh.p[0], veh.p[2], this.camera, this.time);
    if (this.hazardView) {
      this.hazardView.update(dt, this.time, veh.p[0], veh.p[2]);
      // rocks on the move throw dust
      if (this.state === 'run') for (const b of ss.hazards.awake) if ((b.kind === 'rock' || b.kind === 'boulder') && Math.random() < dt * 9 && Math.hypot(b.vx, b.vz) > 1.5) this._burstFx(b.x, b.y, b.z, 1, b.r * 2, 1.5);
    }
    // atmosphere (weather blend + clock) a few times a second
    this.atmoT += dt;
    if (this.atmoT > 0.25) {
      this.world.setAtmosphere(ss.weather, ss.hour, this.atmoT);
      this.atmoT = 0;
      const dark = Math.max(1 - this.world.day, ss.weather.fog < 0.4 ? 0.45 : 0);
      this.lamp.intensity = 420 * dark;
      this.car.setLights(dark, veh.speed > 0.5 && this.hud.read().brake > 0.1);
    }
    this.hud.update(ss, { weather: `${this.weather.name} · ${fmtClock(ss.hour)}`, fps: this.opts.settings.showFps ? Math.round(this.fps) : 0 });
    this._render();

    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc >= 2) { this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; }
  }

  _events(list) {
    for (const e of list) {
      if (e.type === 'impact') { this.audio.crash(e.v); this.shake = Math.min(0.5, 0.12 + e.v * 0.04); if (this.opts.vibrate) this.opts.vibrate(80); }
      else if (e.type === 'scrape') this.audio.scrape(e.v);
      else if (e.type === 'thump') { this.audio.thump(e.v); this.shake = Math.max(this.shake, Math.min(0.2, e.v * 0.03)); }
      else if (e.type === 'checkpoint') { this.audio.checkpoint(); this.hud.toast(`CHECKPOINT ${e.index}/${e.total}${e.name ? ' - ' + e.name : ''}   +fuel, repairs  -  progress saved`); if (this.opts.onCheckpoint) this.opts.onCheckpoint(this.session.snapshot()); }
      else if (e.type === 'puncture') { this.audio.crash(4); this.hud.toast(`PUNCTURE - ${['front left', 'front right', 'rear left', 'rear right'][e.wheel]} tyre`, 4200); if (this.opts.vibrate) this.opts.vibrate(120); }
      else if (e.type === 'cache') { this.audio.cache(); this.hud.toast(`${e.name} found!  +${e.reward} coins`); this.world.hideCache(e.index); }
      else if (e.type === 'relic') { this.audio.cache(); this.hud.toast(`Hidden relic found!  ${e.found}/${e.total}`); this.world.hideRelic(e.index); }
      else if (e.type === 'weather') this.hud.toast(`Weather: ${e.name}`, 2600);
      else if (e.type === 'overheat') { this.audio.scrape(3); this.hud.toast('ENGINE OVERHEATED - power cut. Ease off and let it cool.', 5000); }
      else if (e.type === 'cooled') this.hud.toast('Engine cooled - full power restored.', 2600);
      else if (e.type === 'burn') { this.audio.scrape(2); this.shake = Math.max(this.shake, 0.08); }
      else if (e.type === 'recover') { this._camera(1); this.steer = 0; }
      else if (e.type === 'finish') this._finish();
      else this._hazardEvent(e);
    }
  }

  /** Generated obstacles: challenge banners, warnings, sound and particles. */
  _hazardEvent(e) {
    const hud = this.hud, au = this.audio;
    if (e.type === 'challenge') { if (!e.dyn && this.opts.settings.hud === 'full') hud.toast(`${e.name.toUpperCase()}  -  ${e.tip}`, 3600); }
    else if (e.type === 'challengeDone') {
      const r = this.opts.def.reward || 0, mult = this.session.diff.reward;
      const coins = Math.round(r * (0.022 + (e.clean ? 0.014 : 0)) * e.w * mult);
      hud.toast(`${e.name} cleared${e.clean ? ' clean' : ''}   +${coins} coins${e.fuel > 0.05 ? ', +fuel' : ''}`, 2400);
      au.bonus();
    } else if (e.type === 'challengeFailed') hud.toast(`${e.name}: no bonus after a recovery`, 2600);
    else if (e.type === 'hardLine') { hud.toast('HARD LINE held - bonus at the finish', 2600); au.bonus(); }
    else if (e.type === 'hazard') {
      if (e.kind === 'rockfall' || e.kind === 'landslide') { hud.toast(e.kind === 'landslide' ? 'LANDSLIDE!  The bank is coming down' : 'ROCKFALL!  Rocks coming down the bank', 3600); au.alarm(); au.rumble(); this.shake = Math.max(this.shake, 0.22); this._burstFx(e.x, e.y, e.z, 26, 9, 3); }
      else if (e.kind === 'boulder') { hud.toast('BOULDER!  Get out of its lane', 3600); au.alarm(); au.rumble(); this.shake = Math.max(this.shake, 0.18); }
      else if (e.kind === 'treefall') { hud.toast('TREE FALLING!  Brake', 3200); au.alarm(); au.creak(); }
      else if (e.kind === 'treedown') { au.crash(e.under ? 7 : 4); this.shake = Math.max(this.shake, e.under ? 0.5 : 0.2); this._burstFx(e.x, e.y, e.z, 30, 7, 2.5); if (e.under && this.opts.vibrate) this.opts.vibrate(150); }
      else if (e.kind === 'herd') hud.toast(`ANIMALS AHEAD  -  slow down and let the ${e.sp === 'deer' ? 'deer' : e.sp + 's'} cross`, 4200);
      else if (e.kind === 'gust') { hud.toast('CROSSWIND  -  hold your line', 3000); au.gust(); }
      else if (e.kind === 'squall') { hud.toast('The weather is closing in fast', 3000); au.gust(); }
    } else if (e.type === 'break') { au.crack(); this._burstFx(e.x, e.y, e.z, e.kind === 'crate' ? 16 : 7, 1.6, 3); }
    else if (e.type === 'animalHit') { au.crash(3); hud.toast(`You hit a ${e.sp}!  Wildlife strike penalty`, 3400); this.shake = Math.max(this.shake, 0.25); if (this.opts.vibrate) this.opts.vibrate(100); }
    else if (e.type === 'birds') { au.flock(); }
  }

  /** Move the ghost car along the best run's recorded line. */
  _ghost(ss) {
    const g = this.ghost;
    if (!g) return;
    const gi = ss.time / 0.5, i0 = Math.floor(gi), n = g.s.length;
    if (i0 >= n - 1 || ss.finished) { g.mesh.visible = false; return; }
    const f = gi - i0;
    const gs = g.s[i0] + (g.s[i0 + 1] - g.s[i0]) * f, gd = ((g.d[i0] || 0) + ((g.d[i0 + 1] || 0) - (g.d[i0] || 0)) * f) / 10;
    const pose = this.track.roadPose(gs, gd);
    g.mesh.position.set(pose.x, pose.y + this.params.clearance, pose.z);
    g.mesh.rotation.y = pose.heading;
    const p = ss.vehicle.p, dist = Math.hypot(pose.x - p[0], pose.z - p[2]);
    g.mesh.visible = dist > 4;
    g.mat.opacity = Math.min(0.34, 0.08 + dist * 0.02);
  }

  /** First-run coach: one prompt at a time, each cleared by doing the thing. */
  _coach(dt, inp, veh) {
    const c = this.coach;
    if (!c) return;
    const mode = this.hud.pad.active ? 'pad' : this.hud.touch ? 'touch' : 'keys';
    const how = (touch, keys, pad) => (mode === 'pad' ? pad : mode === 'touch' ? touch : keys);
    const STEPS = [
      { t: 'Steer left, then right', s: how('Use the steering control on the left', 'Arrow keys or A / D', 'Left stick'), done: () => { if (inp.steer > 0.5) c.seen.l = 1; if (inp.steer < -0.5) c.seen.r = 1; return c.seen.l && c.seen.r; } },
      { t: 'Press GAS and get rolling', s: how('The tall pedal on the right - slide up for more throttle', 'Up arrow or W', 'Right trigger'), done: () => veh.speed > 3.5 },
      { t: 'BRAKE to a stop', s: how('BRAKE / REV pedal. Held at a standstill it reverses', 'Down arrow or S. Held at a standstill it reverses', 'Left trigger. Held at a standstill it reverses'), done: () => { if (veh.speed > 2) c.seen.m = 1; return c.seen.m && Math.abs(veh.speed) < 0.4 && inp.brake > 0.3; } },
      { t: 'Switch to 4L LOW range', s: 'Low range is slow but pulls hard: use it for steep climbs and to hold the truck back downhill. ' + how('Tap 4L LOW', 'Press L', 'Press X'), done: () => veh.low },
      { t: 'Back to high range', s: how('Tap 4L LOW again', 'Press L again', 'Press X again'), done: () => !veh.low },
      { t: 'Change the camera', s: how('Tap CAM. Drag the view to look around', 'Press C. Q / E or drag to look around', 'Right bumper. Right stick looks around'), done: () => { if (c.cam === undefined) c.cam = this.camMode; return this.camMode !== c.cam; } },
      { t: 'Stuck or on your roof? RECOVER', s: 'It puts you back on the trail for a time penalty. ' + how('RECOVER is top left', 'Press R', 'Left bumper'), wait: 7 },
      { t: 'Diff locks and a winch are in the garage', s: 'Diff locks stop a spinning wheel stealing the drive. The winch pulls you out using trees and posts. Checkpoints save your run.', wait: 8 }
    ];
    const st = STEPS[c.step];
    if (!st) { this.hud.coach(null); this.coach = null; this.opts.settings.tutorialDone = true; if (this.opts.onSettings) this.opts.onSettings(); this.hud.toast('You are set. Good luck out there.', 3000); return; }
    c.t += dt;
    this.hud.coach(`${c.step + 1}/${STEPS.length}  ${st.t}`, st.s);
    if (st.wait ? c.t > st.wait : (st.done() && c.t > 0.8)) { c.step++; c.t = 0; this.audio.click(); }
  }

  /** Context tips, each shown once per run. */
  _tips(dt, inp, veh) {
    if (this.coach) return;
    const t = this.tips;
    const slip = Math.max(Math.abs(veh.wheels[0].slip), Math.abs(veh.wheels[1].slip), Math.abs(veh.wheels[2].slip), Math.abs(veh.wheels[3].slip));
    t.stall = Math.abs(veh.speed) < 0.9 && inp.gas > 0.7 && !veh.low && veh.pitch > 0.17 ? t.stall + dt : 0;
    t.spin = Math.abs(veh.speed) < 1.5 && inp.gas > 0.5 && slip > 5 && !veh.lock ? t.spin + dt : 0;
    if (t.stall > 2 && !t.shown.stall) { t.shown.stall = 1; this.hud.toast('Too steep for high range - switch to 4L LOW', 5200); }
    else if (t.spin > 2.5 && !t.shown.spin) { t.shown.spin = 1; this.hud.toast(this.params.difflock ? 'Wheels spinning - engage DIFF LOCK' : 'Wheels spinning - ease off. Diff locks (garage) stop this', 5200); }
  }

  recover() {
    if (this.state !== 'run') return;
    const ss = this.session;
    if (ss.fuel <= 0) { ss.toCheckpoint(true); this.hud.toast('Towed to the last checkpoint and refuelled  (+60 s)'); }
    else { ss.recover(); this.hud.toast(`Recovered to the trail  (+${ss.diff.recover} s)`); }
    this.audio.click();
  }

  _finish() {
    this.state = 'done';
    this.hud.coach(null);
    this.audio.finish();
    const ss = this.session, o = this.opts;
    const score = scoreRun(ss, o.def.par);
    const sum = o.onFinish ? o.onFinish(ss, score) : { coins: 0, lines: [] };
    setTimeout(() => {
      if (this.disposed) return;
      this.audio.mute();
      const medal = ['No medal', 'BRONZE', 'SILVER', 'GOLD'][score.medal];
      const body = [
        { stars: score.stars, of: score.objectives.length },
        { text: `Time ${fmtTime(score.time)}${ss.penalty ? `  (incl. ${ss.penalty}s penalties)` : ''}   ${medal}${sum.newBest ? '   NEW BEST' : ''}`, color: sum.newBest ? '#8dff9b' : '#ffd23f', bold: true },
        { text: `Gold ${fmtTime(o.def.par.gold)} · Silver ${fmtTime(o.def.par.silver)} · Bronze ${fmtTime(o.def.par.bronze)} · Recoveries ${ss.recoveries} · Damage ${Math.round(ss.damage)}%`, color: '#9fb3c0', small: true },
        ...score.objectives.map((ob) => ({ text: `${ob.done ? '✔' : '☐'}  ${ob.label}`, color: ob.done ? '#8dff9b' : '#9fb3c0', small: true })),
        ...(sum.lines || []).map((l) => ({ text: l.text, color: l.color || '#fff' }))
      ];
      const btns = [];
      if (o.hasNext && o.hasNext()) btns.push({ label: 'NEXT TRACK', cls: 'go', fn: () => this.exit('next') });
      btns.push({ label: 'RETRY', cls: 'alt', fn: () => this.exit('retry') }, { label: 'GARAGE', fn: () => this.exit('garage') }, { label: 'TRACKS', fn: () => this.exit('tracks') });
      this.hud.panel('TRACK COMPLETE', body, btns);
    }, 1400);
  }

  pause() {
    if (this.state !== 'run') return;
    this.state = 'paused';
    this.audio.mute();
    const ss = this.session, s = this.opts.settings;
    const tire = TIRES[this.params.tire].name;
    const body = [
      { text: `${this.opts.def.name} · ${this.weather.name} · ${ss.diff.name}` },
      { text: `Time ${fmtTime(ss.totalTime)} · Checkpoint ${ss.cpNext}/${this.track.checkpoints.length} · Tyres: ${tire}`, color: '#9fb3c0', small: true }
    ];
    const sensLabel = () => `STEERING: ${(s.steerSens || 1) <= 0.75 ? 'SLOW' : (s.steerSens || 1) >= 1.35 ? 'FAST' : 'NORMAL'}`;
    const draw = () => this.hud.panel('PAUSED', body, [
      { label: 'RESUME', cls: 'go', fn: () => this.resume() },
      { label: 'LAST CHECKPOINT', cls: 'alt', fn: () => { ss.toCheckpoint(false); this.resume(); this._camera(1); } },
      { label: sensLabel(), fn: () => { s.steerSens = (s.steerSens || 1) >= 1.35 ? 0.7 : (s.steerSens || 1) + 0.35; this.opts.onSettings && this.opts.onSettings(); draw(); } },
      { label: `SHAKE: ${s.camShake === false ? 'OFF' : 'ON'}`, fn: () => { s.camShake = s.camShake === false; this.opts.onSettings && this.opts.onSettings(); draw(); } },
      { label: 'RESTART', fn: () => this.exit('retry') },
      { label: 'QUIT', cls: 'bad', fn: () => this.exit('tracks') }
    ]);
    draw();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.hud.closePanel();
    this.state = 'run';
    this.last = performance.now();
    this.audio.start();
  }

  /** Debug: let the test driver take the wheel (globalThis.__drive.autopilot(true) in a development build). */
  autopilot(on = true) { this.bot = on ? new BotDriver(this.session) : null; }

  /** Android back button. */
  back() {
    if (this.state === 'run') this.pause();
    else if (this.state === 'paused') this.resume();
    else if (this.state === 'done') this.exit('tracks');
  }

  exit(action) {
    const cb = this.opts.onExit;
    this.dispose();
    if (cb) cb(action);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.hud.dispose();
    if (this.audio) this.audio.dispose();
    if (this.world) {
      this.world.dispose();
      if (this.car) this.car.dispose();
      if (this.hazardView) this.hazardView.dispose();
      for (const o of [this.particles, this.trails, this.winchLine, this.anchorRing]) if (o) { o.geometry.dispose(); o.material.dispose(); }
      this.track.setLayer(null);                                  // the compiled track is cached: leave it clean
      if (this.ghost) { this.ghost.mesh.children.forEach((m) => m.geometry.dispose()); this.ghost.mat.dispose(); }
      if (this.pTex) this.pTex.dispose();
      this.track.chunks.clear();
      this.track._lastKey = -1;
    }
    this.renderer.dispose();
  }
}
