// The 3D driving scene: owns the Three.js renderer, the session, cameras, HUD,
// audio and the results flow. Lives in its own DOM overlay + WebGL canvas, so it
// never shares a GL context with Phaser (which is put to sleep while this runs).
import * as THREE from 'three';
import { World, QUALITY } from './render/world.js';
import { CarModel } from './render/carModel.js';
import { Hud } from './hud.js';
import { DriveAudio } from './audio.js';
import { DriveSession, scoreRun, fmtTime, RECOVER_PENALTY } from './core/session.js';
import { buildParams } from './core/specs.js';
import { TIRES } from './core/surfaces.js';
import { BotDriver } from './core/bot.js';

const CAMS = ['chase', 'far', 'hood', 'cockpit'];
const lerpAngle = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; };

export class DriveGame {
  /**
   * opts: { parent, def (track def), vehicle (VEHICLES entry), ups, gear, settings, audioCtx,
   *         onFinish(session, score) -> reward summary, onExit(action), hasNext }
   */
  constructor(opts) {
    this.opts = opts;
    this.state = 'loading';
    this.t0 = performance.now();
    this.root = document.createElement('div');
    this.root.className = 'tt3d';
    opts.parent.appendChild(this.root);

    const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const qName = opts.settings.quality && QUALITY[opts.settings.quality] ? opts.settings.quality : touch ? 'medium' : 'high';
    this.q = { ...QUALITY[qName] };
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.q.pixelRatio);

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'view';
    this.root.appendChild(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: this.q.antialias, powerPreference: 'high-performance', alpha: false });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = !!this.q.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.3, 1400);

    this.params = buildParams(opts.vehicle.id, opts.ups, opts.gear);
    this.hud = new Hud(this.root, { difflock: this.params.difflock, winch: this.params.winch });
    this.hud.loading(`Loading ${opts.def.name}...`, 0.05);

    this.onResize = () => {
      const w = this.root.clientWidth || window.innerWidth, h = this.root.clientHeight || window.innerHeight;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.fov = w / h < 1.5 ? 70 : 62;
      this.camera.updateProjectionMatrix();
      if (this.hud) this.hud.layout();
    };
    window.addEventListener('resize', this.onResize);
    this.onHide = () => { if (document.hidden && this.state === 'run') this.pause(); };
    document.addEventListener('visibilitychange', this.onHide);

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

    // build the heavy stuff after the loading screen has painted
    setTimeout(() => this._build(), 30);
  }

  _build() {
    if (this.disposed) return;
    const o = this.opts;
    this.track = o.def.build();
    this.session = new DriveSession(this.track, this.params);
    this.weather = this.session.weather;
    this.world = new World(this.track, this.q);
    this.world.init(this.weather);
    this.car = new CarModel(o.vehicle, this.params, this.session.vehicle);
    this.world.scene.add(this.car.group);
    if (this.world.isNight || this.weather.fog < 0.35) {
      const sl = new THREE.SpotLight(0xfff2cc, 260, 70, 0.5, 0.5, 1.6);
      sl.position.set(0, 0.3, 1.6);
      sl.target.position.set(0, -0.6, 14);
      this.car.group.add(sl, sl.target);
    }
    this._buildFx();
    this.audio = new DriveAudio(o.audioCtx, o.settings.sound !== false);
    this.hud.initMap(this.track);
    this.hud.on('pause', () => (this.state === 'run' ? this.pause() : this.state === 'paused' ? this.resume() : 0));
    this.hud.on('camera', () => this.nextCamera());
    this.hud.on('recover', () => this.recover());
    this.onResize();

    const veh = this.session.vehicle;
    this.camYaw = veh.heading;
    this._warm = 0;
    this._warmTotal = 1;
    this.car.sync();
    this._camera(1);
    this.world.update(0, veh.p[0], veh.p[2], this.camera, 0);
    this._warmTotal = Math.max(1, this.world.pending);
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
    const pc = document.createElement('canvas'); pc.width = pc.height = 32;
    const pg2 = pc.getContext('2d'); const gr = pg2.createRadialGradient(16, 16, 1, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    pg2.fillStyle = gr; pg2.fillRect(0, 0, 32, 32);
    this.pTex = new THREE.CanvasTexture(pc);
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

  _updateFx(dt) {
    const veh = this.session.vehicle, tr = this.track;
    // particles
    let main = veh.wheels[2].surface;
    for (let i = 0; i < 4; i++) {
      const w = veh.wheels[i];
      if (!w.grounded) continue;
      const slip = Math.abs(w.slip), sp = Math.abs(veh.speed);
      const wet = w.water > 0.05;
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
      const tx = p[0] - Math.sin(this.camYaw) * dist, tz = p[2] - Math.cos(this.camYaw) * dist;
      let ty = p[1] + height - Math.sin(pitch) * dist * 0.75;
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
        this.hud.loaded();
        this.state = 'run';
        this.loadMs = Math.round(performance.now() - this.t0);
        this.audio.start();
        this.hud.toast(`${this.opts.def.name}  -  ${this.weather.name}`, 3500);
      }
      this.renderer.render(this.world.scene, this.camera);
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
        strain: Math.abs(veh.throttle) * Math.max(0, 1 - Math.abs(veh.speed) / 4), weather: this.weather
      });
    }

    this.car.sync();
    this._camera(dt);
    this.world.update(dt, veh.p[0], veh.p[2], this.camera, this.time);
    this.hud.update(ss, { weather: this.weather.name + (this.opts.settings.showFps ? `<br>${Math.round(this.fps)} fps` : '') });
    this.renderer.render(this.world.scene, this.camera);

    // dynamic resolution keeps the frame rate stable on slow phones
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc >= 3) {
      this.fps = this.fpsN / this.fpsAcc;
      this.fpsAcc = 0; this.fpsN = 0;
      if (this.state === 'run') {
        const maxPr = Math.min(window.devicePixelRatio || 1, this.q.pixelRatio);
        if (!this.adaptOff && this.fps < 40 && this.pixelRatio > 0.7) {
          if (this.fpsBefore === undefined) this.fpsBefore = this.fps;
          this.pixelRatio = Math.max(0.7, this.pixelRatio - 0.2);
          this.renderer.setPixelRatio(this.pixelRatio); this.onResize();
        } else if (!this.adaptOff && this.fps < 40 && this.fpsBefore !== undefined && this.fps < this.fpsBefore * 1.15) {
          // lower resolution did not help: the display/browser is capped, not the GPU
          this.adaptOff = true;
          this.pixelRatio = maxPr;
          this.renderer.setPixelRatio(this.pixelRatio); this.onResize();
        } else if (!this.adaptOff && this.fps > 57 && this.pixelRatio < maxPr) {
          this.pixelRatio = Math.min(maxPr, this.pixelRatio + 0.1);
          this.renderer.setPixelRatio(this.pixelRatio); this.onResize();
        }
      }
    }
  }

  _events(list) {
    for (const e of list) {
      if (e.type === 'impact') { this.audio.crash(e.v); this.shake = Math.min(0.5, 0.12 + e.v * 0.04); if (this.opts.vibrate) this.opts.vibrate(80); }
      else if (e.type === 'scrape') this.audio.scrape(e.v);
      else if (e.type === 'thump') { this.audio.thump(e.v); this.shake = Math.max(this.shake, Math.min(0.2, e.v * 0.03)); }
      else if (e.type === 'checkpoint') { this.audio.checkpoint(); this.hud.toast(`CHECKPOINT ${e.index}/${e.total}${e.name ? ' - ' + e.name : ''}   +fuel, repairs`); }
      else if (e.type === 'cache') { this.audio.cache(); this.hud.toast(`${e.name} found!  +${e.reward} coins`); this.world.hideCache(e.index); }
      else if (e.type === 'recover') { this._camera(1); this.steer = 0; }
      else if (e.type === 'finish') this._finish();
    }
  }

  recover() {
    if (this.state !== 'run') return;
    const ss = this.session;
    if (ss.fuel <= 0) { ss.toCheckpoint(true); this.hud.toast('Towed to the last checkpoint and refuelled  (+60 s)'); }
    else { ss.recover(); this.hud.toast(`Recovered to the trail  (+${RECOVER_PENALTY} s)`); }
    this.audio.click();
  }

  _finish() {
    this.state = 'done';
    this.audio.finish();
    const ss = this.session, o = this.opts;
    const score = scoreRun(ss, o.def.par);
    const sum = o.onFinish ? o.onFinish(ss, score) : { coins: 0, lines: [] };
    setTimeout(() => {
      if (this.disposed) return;
      this.audio.mute();
      const medal = ['No medal', 'BRONZE', 'SILVER', 'GOLD'][score.medal];
      const objs = score.objectives.map((ob) => `<div class="obj ${ob.done ? 'ok' : 'no'}">${ob.done ? '&#10004;' : '&#9744;'} ${ob.label}</div>`).join('');
      const lines = (sum.lines || []).map((l) => `<p style="color:${l.color || '#fff'}">${l.text}</p>`).join('');
      const body =
        `<div class="medal">${'&#9733;'.repeat(score.stars)}${'&#9734;'.repeat(score.objectives.length - score.stars)}</div>` +
        `<p>Time <b style="color:#ffd23f">${fmtTime(score.time)}</b> ${ss.penalty ? `(incl. ${ss.penalty}s penalties)` : ''} &nbsp; ${medal}${sum.newBest ? ' &nbsp; <b style="color:#8dff9b">NEW BEST</b>' : ''}</p>` +
        `<p style="font-size:2vh;color:#9fb3c0">Gold ${fmtTime(o.def.par.gold)} &middot; Silver ${fmtTime(o.def.par.silver)} &middot; Bronze ${fmtTime(o.def.par.bronze)} &middot; Recoveries ${ss.recoveries} &middot; Damage ${Math.round(ss.damage)}%</p>` +
        objs + lines;
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
    const body =
      `<p>${this.opts.def.name} &middot; ${this.weather.name}</p>` +
      `<p style="font-size:2.1vh;color:#9fb3c0">Time ${fmtTime(ss.totalTime)} &middot; Checkpoint ${ss.cpNext}/${this.track.checkpoints.length} &middot; Tyres: ${tire}</p>` +
      `<p style="font-size:2vh;color:#9fb3c0">Keys: arrows/WASD drive &middot; Space handbrake &middot; L low range &middot; X diff lock &middot; E winch &middot; R recover &middot; C camera</p>`;
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

  /** Debug: let the test driver take the wheel (window.__drive.autopilot(true)). */
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
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onHide);
    this.hud.dispose();
    if (this.audio) this.audio.dispose();
    if (this.world) {
      this.world.dispose();
      this.car.dispose();
      for (const o of [this.particles, this.trails, this.winchLine, this.anchorRing]) { o.geometry.dispose(); o.material.dispose(); }
      this.pTex.dispose();
      this.track.chunks.clear();
      this.track._lastKey = -1;
    }
    this.renderer.dispose();
    this.renderer.forceContextLoss && this.renderer.forceContextLoss();
    this.root.remove();
  }
}
