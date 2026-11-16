import Phaser from 'phaser';
import {
  GAME_W, GAME_H, PHYSICS_STEP, MAX_STEPS_PER_FRAME, GRAVITY_Y, SPAWN_X,
  PX_PER_METER, FUEL, COIN_VALUE, CHUNK_SIZE, DEBUG
} from '../config/constants.js';
import { THEMES } from '../config/themes.js';
import { LEVELS, getLevel, getLevelCoinTotal, makeEndlessConfig, starsForRatio } from '../config/levels.js';
import { getVehicle } from '../config/vehicles.js';
import { CELL, pickupsForCell } from '../core/pickups.js';
import { hashFloat } from '../core/rng.js';
import Terrain from '../objects/Terrain.js';
import Vehicle from '../objects/Vehicle.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import AudioSystem from '../systems/AudioSystem.js';
import { isNative, vibrate } from '../systems/platform.js';
import { createThemeTextures } from '../systems/TextureFactory.js';
import { makeText, makePanel, fixed, bindBack, fmtCoins } from '../systems/ui.js';

const { Engine } = Phaser.Physics.Matter.Matter;
const DECOR_TYPES = ['tree', 'tree', 'pine', 'pine', 'pine', 'bush', 'bush', 'rock'];

export default class LevelScene extends Phaser.Scene {
  constructor() {
    super('LevelScene');
  }

  init(data) {
    this.mode = data.mode || 'career';
    this.levelId = data.levelId || 1;
  }

  // ======================================================================
  // Setup
  // ======================================================================
  create() {
    this.save = SaveSystem.data;
    this.endless = this.mode === 'endless';
    this.cfg = this.endless ? makeEndlessConfig() : getLevel(this.levelId);
    this.theme = THEMES[this.cfg.theme];
    createThemeTextures(this, this.cfg.theme);

    // We drive Matter ourselves with a fixed time step (see update()).
    this.matter.world.autoUpdate = false;
    this.matter.world.engine.gravity.y = GRAVITY_Y;
    this.matter.world.engine.enableSleeping = false;

    this.state = 'playing'; // playing | paused | ending
    this.acc = 0;
    this.runCoins = 0;
    this.distance = 0;
    this.saved = false;
    this.stuckTime = 0;
    this.flipTime = 0;
    this.endReason = null;
    this.panel = null;
    this.controls = { gas: false, brake: false };
    this.pickups = [];
    this.decor = [];
    this.finishX = this.endless ? Infinity : this.cfg.length;
    this.totalCoins = this.endless ? 0 : getLevelCoinTotal(this.cfg);

    // Stunt & aerial mechanics
    this.airTime = 0;
    this.airRotation = 0;
    this.lastAirAngle = null;
    this.wheelieTime = 0;
    this.passedBest = false;
    this.fuelWarnTimer = 0;
    this.stuntBonusCoins = 0;
    this.lastKm = 0;

    this.audio = new AudioSystem(this, this.save.settings);

    this.buildBackground();

    this.terrain = new Terrain(this, this.cfg.terrain, this.theme, {
      onCreate: (i, x0, x1) => this.onChunkCreate(i, x0, x1),
      onDestroy: (i) => this.onChunkDestroy(i)
    });

    const spec = getVehicle(this.save.selectedVehicle);
    const ups = SaveSystem.getUpgrades(spec.id);
    const sy = this.terrain.surfaceY(SPAWN_X) - 70;
    this.vehicle = new Vehicle(this, spec, ups, SPAWN_X, sy, this.terrain);
    this.fuelMax = this.vehicle.stats.fuelCapacity;
    this.fuel = this.fuelMax;
    this.terrain.update(SPAWN_X);

    if (!this.endless) {
      this.add
        .image(this.finishX, this.terrain.surfaceY(this.finishX) + 4, 'finish_gate')
        .setOrigin(0.5, 1)
        .setDepth(6);
    } else {
      this.lastKm = 0;
      this.time.delayedCall(700, () => {
        this.floatText(SPAWN_X + 220, sy - 50, 'ENDLESS MODE: No finish line - survive as far as you can!');
      });
      if (this.save.bestDistance > 0) {
        // Endless mode personal best marker
        const bx = SPAWN_X + this.save.bestDistance * PX_PER_METER;
        const by = this.terrain.surfaceY(bx);
        const flagC = this.add.container(bx, by).setDepth(7);
        const pole = this.add.rectangle(0, -35, 6, 70, 0xffffff);
        const flag = this.add.triangle(0, -56, 0, 0, 52, 14, 0, 28, 0x2f9e55);
        const txt = makeText(this, 14, -75, `RECORD ${this.save.bestDistance}m`, { size: '16px', color: '#8dff9b' });
        flagC.add([pole, flag, txt]);
      }
    }

    this.dustEmitter = this.add.particles(0, 0, 'dust', {
      lifespan: 520,
      speed: { min: 15, max: 60 },
      angle: { min: 190, max: 260 },
      scale: { start: 0.7, end: 0.1 },
      alpha: { start: 0.55, end: 0 },
      emitting: false
    }).setDepth(12);
    this.sparkEmitter = this.add.particles(0, 0, 'spark', {
      lifespan: 450,
      speed: { min: 60, max: 200 },
      scale: { start: 1, end: 0 },
      gravityY: 400,
      emitting: false
    }).setDepth(13);

    this.buildHud();
    this.setupInput();

    const cam = this.cameras.main;
    cam.scrollX = SPAWN_X - 300;
    cam.scrollY = sy - 300;

    this.audio.startEngine();

    // Pause automatically when the app / tab goes to the background.
    const autoPause = () => { if (this.state === 'playing') this.pauseGame(); };
    this.game.events.on('app-pause', autoPause);
    this.game.events.on(Phaser.Core.Events.HIDDEN, autoPause);
    bindBack(this, () => this.onBack());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('app-pause', autoPause);
      this.game.events.off(Phaser.Core.Events.HIDDEN, autoPause);
      this.audio.stopEngine();
    });

    if (DEBUG) this.debugGfx = this.add.graphics().setDepth(50);
  }

  buildBackground() {
    const id = this.cfg.theme;
    this.sky = this.add
      .image(GAME_W / 2, GAME_H / 2, `sky_${id}`)
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(-30)
      .setScale(2.5);

    this.sun = this.add
      .image(GAME_W - 150, 110, `sun_${id}`)
      .setScrollFactor(0)
      .setDepth(-29)
      .setAlpha(0.9);

    this.clouds = [];
    for (let i = 0; i < 6; i++) {
      const c = this.add
        .image(Phaser.Math.Between(-300, GAME_W + 300), Phaser.Math.Between(30, 200), 'cloud')
        .setScrollFactor(0)
        .setDepth(-28)
        .setScale(Phaser.Math.FloatBetween(0.6, 1.3))
        .setAlpha(0.9);
      c.drift = Phaser.Math.FloatBetween(4, 14);
      this.clouds.push(c);
    }

    this.farHills = this.add
      .tileSprite(GAME_W / 2, 60, 2800, 512, `hills_far_${id}`)
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(-20);
    this.nearHills = this.add
      .tileSprite(GAME_W / 2, 110, 2800, 512, `hills_near_${id}`)
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(-10);
  }

  updateBackground(dt) {
    const cam = this.cameras.main;
    this.farHills.tilePositionX = cam.scrollX * 0.08;
    this.nearHills.tilePositionX = cam.scrollX * 0.2;
    const dy = cam.scrollY - 80;
    this.farHills.y = Phaser.Math.Clamp(60 - dy * 0.06, 30, 130);
    this.nearHills.y = Phaser.Math.Clamp(110 - dy * 0.12, 30, 220);
    this.clouds.forEach((c) => {
      c.x -= (c.drift * dt) / 1000;
      if (c.x < -300) c.x = GAME_W + 300;
    });
  }

  // ======================================================================
  // Chunk streaming hooks: pickups + decor
  // ======================================================================
  onChunkCreate(i, x0, x1) {
    const k0 = Math.round(x0 / CELL);
    const k1 = Math.round(x1 / CELL);
    for (let k = k0; k < k1; k++) {
      for (const p of pickupsForCell(this.cfg.pickups, k, (x) => this.terrain.surfaceY(x))) {
        if (p.x >= this.finishX - 80) continue;
        const sprite = this.add
          .image(p.x, p.y, p.type === 'coin' ? 'coin' : 'fuel_can')
          .setDepth(8);
        this.pickups.push({ sprite, type: p.type, x: p.x, y: p.y, chunk: i, phase: Math.random() * 6 });
      }
    }

    const id = this.cfg.theme;
    const seed = this.cfg.terrain.seed;

    const KM_PX = 1000 * PX_PER_METER;
    const kmIndex = Math.floor(x1 / KM_PX);
    const kmX = kmIndex * KM_PX + SPAWN_X;
    if (kmX >= x0 && kmX < x1 && kmIndex >= 1 && (this.endless || kmX < this.finishX - 800)) {
      const arch = this.add.image(kmX, this.terrain.surfaceY(kmX) + 4, 'finish_gate').setOrigin(0.5, 1).setDepth(6);
      const bannerTxt = makeText(this, kmX, this.terrain.surfaceY(kmX) - 130, `${kmIndex} KM CHECKPOINT`, {
        size: '18px', color: '#ffd23f'
      }).setDepth(7);
      this.decor.push({ sprite: arch, chunk: i }, { sprite: bannerTxt, chunk: i });
    }

    for (let j = 0; j < 6; j++) {
      const x = x0 + hashFloat(seed + 77 + j, i) * CHUNK_SIZE;
      if (x < 360) continue;
      const type = DECOR_TYPES[Math.floor(hashFloat(seed + 88 + j, i) * DECOR_TYPES.length)];
      const scale = 0.8 + hashFloat(seed + 99 + j, i) * 0.55;
      const sprite = this.add
        .image(x, this.terrain.surfaceY(x) + 6, `decor_${id}_${type}`)
        .setOrigin(0.5, 1)
        .setScale(scale)
        .setDepth(hashFloat(seed + 55 + j, i) > 0.5 ? 3 : 7);
      this.decor.push({ sprite, chunk: i });
    }
  }

  onChunkDestroy(i) {
    this.pickups = this.pickups.filter((p) => {
      if (p.chunk !== i) return true;
      p.sprite.destroy();
      return false;
    });
    this.decor = this.decor.filter((d) => {
      if (d.chunk !== i) return true;
      d.sprite.destroy();
      return false;
    });
  }

  // ======================================================================
  // HUD + input
  // ======================================================================
  buildHud() {
    const D = 100;
    // fuel
    const fuelIcon = this.add.image(32, 32, 'fuel_can').setScale(0.9).setDepth(D);
    this.fuelBg = this.add.rectangle(56, 32, 204, 22, 0x0e1a22, 0.8).setOrigin(0, 0.5).setDepth(D);
    this.fuelBar = this.add.rectangle(58, 32, 200, 18, 0x55c26a).setOrigin(0, 0.5).setDepth(D + 1);
    // coins
    const coinIcon = this.add.image(32, 72, 'coin').setDepth(D);
    this.coinText = makeText(this, 52, 72, '0', { size: '26px', originX: 0, color: '#ffd23f' }).setDepth(D);

    // distance / progress
    if (this.endless) {
      this.distText = makeText(this, GAME_W / 2, 28, '0 m', { size: '32px' }).setDepth(D);
      this.modeBadge = makeText(this, GAME_W / 2, 54, '\u221E ENDLESS SURVIVAL (No finish line)', {
        size: '13px', color: '#ffd23f', bold: true, strokeThickness: 3
      }).setDepth(D);
      this.bestText = makeText(this, GAME_W / 2, 74, this.save.bestDistance > 0 ? `Best: ${this.save.bestDistance} m` : 'Survive as far as you can!', {
        size: '14px', color: '#b8c7d2', bold: false, strokeThickness: 3
      }).setDepth(D);
      fixed(this.distText); fixed(this.modeBadge); fixed(this.bestText);
    } else {
      const totalKm = ((this.finishX - SPAWN_X) / PX_PER_METER / 1000).toFixed(1);
      this.distText = makeText(this, GAME_W / 2, 18, `0 m / ${totalKm} km`, { size: '15px', color: '#ffd23f', bold: true }).setDepth(D);
      this.progBg = this.add.rectangle(GAME_W / 2 - 150, 36, 300, 12, 0x0e1a22, 0.8).setOrigin(0, 0.5).setDepth(D);
      this.progBar = this.add.rectangle(GAME_W / 2 - 148, 36, 0, 8, 0xffd23f).setOrigin(0, 0.5).setDepth(D + 1);
      this.levelText = makeText(this, GAME_W / 2, 58, `Level ${this.cfg.id} - ${this.cfg.name} (${totalKm} km)`, { size: '15px', bold: false, strokeThickness: 3 }).setDepth(D);
      fixed(this.distText); fixed(this.progBg); fixed(this.progBar); fixed(this.levelText);
    }
    [fuelIcon, this.fuelBg, this.fuelBar, coinIcon, this.coinText].forEach(fixed);

    // pause
    const pause = this.add.image(GAME_W - 40, 40, 'pause_btn').setDepth(D);
    const pauseTxt = makeText(this, GAME_W - 40, 40, 'II', { size: '26px' }).setDepth(D + 1);
    fixed(pause); fixed(pauseTxt);
    pause.setInteractive();
    pause.on('pointerup', () => this.state === 'playing' && this.pauseGame());

    // Platform detection for controller layout
    const isTouch = isNative || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const controlMode = this.save.settings.controlMode || 'pedals';
    const showHints = !isTouch && this.save.settings.showKeyHints !== false;

    if (showHints) {
      const pHint = makeText(this, GAME_W - 40, 72, '[P]', { size: '13px', color: '#8fc1e3', strokeThickness: 2 }).setDepth(D);
      fixed(pHint);
    }

    if (controlMode === 'splitscreen' && isTouch) {
      // Split-screen touch layout: left screen half = brake, right half = gas
      const leftZone = this.add.rectangle(GAME_W / 4, GAME_H / 2, GAME_W / 2, GAME_H, 0x000000, 0.001).setDepth(D).setInteractive();
      const rightZone = this.add.rectangle((GAME_W * 3) / 4, GAME_H / 2, GAME_W / 2, GAME_H, 0x000000, 0.001).setDepth(D).setInteractive();

      const leftVisual = this.add.image(130, GAME_H - 76, 'pedal').setDepth(D).setAlpha(0.35);
      const leftTxt = makeText(this, 130, GAME_H - 76, 'BRAKE', { size: '26px' }).setDepth(D + 1).setAlpha(0.7);
      const rightVisual = this.add.image(GAME_W - 130, GAME_H - 76, 'pedal').setDepth(D).setAlpha(0.35);
      const rightTxt = makeText(this, GAME_W - 130, GAME_H - 76, 'GAS', { size: '26px' }).setDepth(D + 1).setAlpha(0.7);

      [leftVisual, leftTxt, rightVisual, rightTxt, leftZone, rightZone].forEach(fixed);

      leftZone.on('pointerdown', () => { this.controls.brake = true; leftVisual.setAlpha(0.85); leftTxt.setAlpha(1); });
      leftZone.on('pointerup', () => { this.controls.brake = false; leftVisual.setAlpha(0.35); leftTxt.setAlpha(0.7); });
      leftZone.on('pointerout', () => { this.controls.brake = false; leftVisual.setAlpha(0.35); leftTxt.setAlpha(0.7); });

      rightZone.on('pointerdown', () => { this.controls.gas = true; rightVisual.setAlpha(0.85); rightTxt.setAlpha(1); });
      rightZone.on('pointerup', () => { this.controls.gas = false; rightVisual.setAlpha(0.35); rightTxt.setAlpha(0.7); });
      rightZone.on('pointerout', () => { this.controls.gas = false; rightVisual.setAlpha(0.35); rightTxt.setAlpha(0.7); });
    } else {
      // Pedals layout (Classic)
      const mkPedal = (x, label, key, hint) => {
        const img = this.add.image(x, GAME_H - 76, 'pedal').setDepth(D).setAlpha(0.65);
        const txt = makeText(this, x, hint ? GAME_H - 85 : GAME_H - 76, label, { size: '28px' }).setDepth(D + 1);
        fixed(img); fixed(txt);
        if (hint) {
          const hTxt = makeText(this, x, GAME_H - 60, hint, { size: '14px', color: '#8fc1e3', strokeThickness: 2 }).setDepth(D + 1);
          fixed(hTxt);
        }
        img.setInteractive();
        const down = () => { this.controls[key] = true; img.setAlpha(0.95); img.setScale(0.96); };
        const up = () => { this.controls[key] = false; img.setAlpha(0.65); img.setScale(1); };
        img.on('pointerdown', down);
        img.on('pointerup', up);
        img.on('pointerout', up);
        img.on('pointerupoutside', up);
      };

      mkPedal(130, 'BRAKE', 'brake', showHints ? '[A / S / ←]' : null);
      mkPedal(GAME_W - 130, 'GAS', 'gas', showHints ? '[D / W / →]' : null);
    }

    if (DEBUG || this.save.settings.showFps) {
      this.fpsText = makeText(this, 8, GAME_H - 8, '', { size: '14px', originX: 0, originY: 1, bold: false }).setDepth(D);
      fixed(this.fpsText);
    }
  }

  setupInput() {
    this.input.addPointer(2);
    const kb = this.input.keyboard;
    if (kb) {
      this.keys = kb.addKeys({
        gas1: Phaser.Input.Keyboard.KeyCodes.RIGHT,
        gas2: Phaser.Input.Keyboard.KeyCodes.D,
        gas3: Phaser.Input.Keyboard.KeyCodes.UP,
        gas4: Phaser.Input.Keyboard.KeyCodes.W,
        brake1: Phaser.Input.Keyboard.KeyCodes.LEFT,
        brake2: Phaser.Input.Keyboard.KeyCodes.A,
        brake3: Phaser.Input.Keyboard.KeyCodes.DOWN,
        brake4: Phaser.Input.Keyboard.KeyCodes.S,
        brake5: Phaser.Input.Keyboard.KeyCodes.SPACE
      });
      kb.on('keydown-P', () => this.onBack());
    }
  }

  inputGas() {
    const k = this.keys;
    return this.controls.gas || (k && (k.gas1.isDown || k.gas2.isDown || k.gas3.isDown || k.gas4.isDown));
  }

  inputBrake() {
    const k = this.keys;
    return this.controls.brake || (k && (k.brake1.isDown || k.brake2.isDown || k.brake3.isDown || k.brake4.isDown || k.brake5.isDown));
  }

  onBack() {
    if (this.state === 'playing') this.pauseGame();
    else if (this.state === 'paused') this.resumeGame();
    else this.quit();
  }

  // ======================================================================
  // Main loop
  // ======================================================================
  update(time, delta) {
    const dt = Math.min(delta, 50);

    if (this.state === 'playing' || this.state === 'ending') {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= PHYSICS_STEP && steps < MAX_STEPS_PER_FRAME) {
        this.stepPhysics();
        this.acc -= PHYSICS_STEP;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.acc = 0; // never spiral after a long stall

      if (this.state === 'playing') this.gameLogic(dt);
      this.animatePickups(time);
    }

    const v = this.vehicle;
    v.syncVisuals();
    this.updateCamera(dt);
    this.updateBackground(dt);
    this.terrain.update(v.x);
    this.updateHud();
    if (DEBUG) this.drawDebug(delta);
  }

  stepPhysics() {
    const playing = this.state === 'playing';
    const won = this.endReason === 'win';
    const gas = playing && this.inputGas();
    const brake = (playing && this.inputBrake()) || won;
    const hasFuel = this.fuel > 0;

    this.vehicle.applyControls(gas, brake, hasFuel);
    Engine.update(this.matter.world.engine, PHYSICS_STEP);
    this.vehicle.clampSuspension();

    if (playing) {
      if (hasFuel) {
        const sec = PHYSICS_STEP / 1000;
        const use = this.vehicle.stats.fuelUse;
        this.fuel = Math.max(0, this.fuel - (FUEL.idleDrain + (gas ? FUEL.gasDrain : 0)) * use * sec);
      }
      this.checkPickups();
      if (this.vehicle.x >= this.finishX) return this.endRun('win');
      if (this.vehicle.headTouchesGround() || this.vehicle.isOverturned()) return this.endRun('crash');
    }
  }

  checkPickups() {
    const v = this.vehicle;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      if (Math.abs(p.x - v.x) > 100) continue;
      const hit = [v.chassis.position, ...v.wheels.map((w) => w.position)].some(
        (pos) => Math.hypot(pos.x - p.x, pos.y - p.y) < 38
      );
      if (hit) this.collect(p, i);
    }
  }

  isWheelGrounded(wheel) {
    return this.vehicle.isWheelGrounded(wheel);
  }

  updateStunts(dtS) {
    const v = this.vehicle;
    const grounded = v.groundedWheels();

    if (grounded === 0) {
      // Vehicle is airborne
      this.airTime += dtS;

      // Track rotational angle for flips
      const currentAngle = v.chassis.angle;
      if (this.lastAirAngle !== null) {
        let diff = currentAngle - this.lastAirAngle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        this.airRotation += diff;
      }
      this.lastAirAngle = currentAngle;
    } else {
      // Vehicle touched ground!
      if (this.airTime > 0.18) {
        // Landing audio and particle feedback
        const vy = v.chassis.velocity.y;
        if (vy > 3.5) {
          const intensity = Math.min(1, vy / 16);
          this.audio.land(intensity);
          if (vy > 7.5) this.cameras.main.shake(120, 0.005 * intensity);
          v.wheels.forEach((w) => this.dustEmitter.emitParticleAt(w.position.x, w.position.y + v.spec.wheel.r, 3));
        }

        // Check for flips
        const flips = Math.round(this.airRotation / (Math.PI * 2));
        if (flips >= 1) {
          const earned = flips * 50;
          this.runCoins += earned / COIN_VALUE;
          this.stuntBonusCoins += earned;
          this.floatText(v.x, v.y - 40, `BACKFLIP x${flips}! +${earned}`);
          this.audio.stunt();
          this.save.stats.stunts = (this.save.stats.stunts || 0) + flips;
        } else if (flips <= -1) {
          const count = Math.abs(flips);
          const earned = count * 50;
          this.runCoins += earned / COIN_VALUE;
          this.stuntBonusCoins += earned;
          this.floatText(v.x, v.y - 40, `FRONTFLIP x${count}! +${earned}`);
          this.audio.stunt();
          this.save.stats.stunts = (this.save.stats.stunts || 0) + count;
        } else if (this.airTime >= 1.4) {
          const bonus = Math.min(40, Math.floor(this.airTime * 12));
          this.runCoins += bonus / COIN_VALUE;
          this.stuntBonusCoins += bonus;
          this.floatText(v.x, v.y - 40, `AIR TIME! ${this.airTime.toFixed(1)}s +${bonus}`);
          this.audio.stunt();
        }
      }

      this.airTime = 0;
      this.airRotation = 0;
      this.lastAirAngle = null;

      // Wheelie tracking
      const rearGrounded = this.isWheelGrounded(v.rearWheel);
      const frontGrounded = this.isWheelGrounded(v.frontWheel);
      if (rearGrounded && !frontGrounded && v.chassis.velocity.x > 3 && this.fuel > 0) {
        this.wheelieTime += dtS;
        if (this.wheelieTime >= 1.0 && (this.wheelieTime - dtS) < 1.0) {
          this.runCoins += 15 / COIN_VALUE;
          this.stuntBonusCoins += 15;
          this.floatText(v.x, v.y - 40, 'WHEELIE! +15');
          this.audio.stunt();
        }
      } else {
        this.wheelieTime = 0;
      }
    }
  }

  gameLogic(dt) {
    const v = this.vehicle;
    const dtS = dt / 1000;

    this.distance = Math.max(this.distance, (v.x - SPAWN_X) / PX_PER_METER);

    // Stunts tracking
    this.updateStunts(dtS);

    // Low fuel warning beep
    if (this.fuel > 0 && this.fuel / this.fuelMax < 0.20) {
      this.fuelWarnTimer = (this.fuelWarnTimer || 0) + dtS;
      if (this.fuelWarnTimer >= 1.6) {
        this.fuelWarnTimer = 0;
        this.audio.lowFuel();
      }
    } else {
      this.fuelWarnTimer = 0;
    }

    // Endless mode personal best cross celebration
    if (this.endless && !this.passedBest && this.save.bestDistance > 0 && this.distance > this.save.bestDistance) {
      this.passedBest = true;
      this.floatText(v.x, v.y - 60, 'NEW BEST RECORD!');
      this.audio.win();
    }

    // KM distance checkpoints (both Career & Endless)
    const km = Math.floor(this.distance / 1000);
    const maxTrackKm = this.endless ? Infinity : Math.floor((this.finishX - SPAWN_X) / (1000 * PX_PER_METER));
    if (km > (this.lastKm || 0) && km <= maxTrackKm) {
      this.lastKm = km;
      const kmBonus = km * 100;
      this.runCoins += kmBonus / COIN_VALUE;
      this.stuntBonusCoins += kmBonus;
      this.floatText(v.x, v.y - 60, `${km} KM CHECKPOINT! +${kmBonus}`);
      this.audio.win();
    }

    // stuck upside down / overturned flip
    if (Math.abs(Phaser.Math.Angle.Wrap(v.angle)) > 1.85) {
      this.flipTime += dtS;
      if (this.flipTime > 0.25) return this.endRun('crash');
    } else {
      this.flipTime = 0;
    }

    // out of fuel and coming to a stop
    if (this.fuel <= 0) {
      const sp = Math.hypot(v.chassis.velocity.x, v.chassis.velocity.y);
      this.stuckTime = sp < 0.35 ? this.stuckTime + dtS : 0;
      if (this.stuckTime > 1.5) return this.endRun('fuel');
    }

    // effects: dust + engine audio
    const gas = this.inputGas();
    if (gas && this.fuel > 0 && v.groundedWheels() > 0 && Math.random() < 0.5) {
      const c = v.rearContact();
      this.dustEmitter.emitParticleAt(c.x, c.y, 1);
    }
    const speed01 = Phaser.Math.Clamp(Math.abs(v.chassis.velocity.x) / 9, 0, 1);
    this.audio.updateEngine(speed01, gas && this.fuel > 0 ? 1 : 0);
  }

  collect(p, index) {
    this.pickups.splice(index, 1);
    const { x, y, sprite } = p;
    if (p.type === 'coin') {
      this.runCoins++;
      this.audio.coin();
      this.sparkEmitter.emitParticleAt(x, y, 4);
    } else {
      this.fuel = Math.min(this.fuelMax, this.fuel + FUEL.canAmount);
      this.audio.fuel();
      this.floatText(x, y - 20, `+${FUEL.canAmount} FUEL`);
    }
    this.tweens.add({
      targets: sprite, y: y - 40, alpha: 0, scale: 1.6, duration: 260,
      onComplete: () => sprite.destroy()
    });
  }

  floatText(x, y, str) {
    const t = makeText(this, x, y, str, { size: '24px', color: '#8dff9b' }).setDepth(40);
    this.tweens.add({ targets: t, y: y - 60, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  animatePickups(time) {
    const cam = this.cameras.main;
    for (const p of this.pickups) {
      if (p.x < cam.scrollX - 60 || p.x > cam.scrollX + GAME_W + 60) continue;
      if (p.type === 'coin') p.sprite.scaleX = Math.abs(Math.cos(time / 260 + p.phase)) * 0.8 + 0.2;
      else p.sprite.y = p.y + Math.sin(time / 300 + p.phase) * 4;
    }
  }

  updateCamera(dt) {
    const cam = this.cameras.main;
    const v = this.vehicle;
    const vx = v.chassis.velocity.x;
    const lead = Phaser.Math.Clamp(vx * 14, -60, 160);
    const tx = v.x + lead - 300;
    const ty = v.y - 300;
    const k = 1 - Math.pow(0.002, dt / 1000); // frame-rate independent smoothing
    cam.scrollX += (tx - cam.scrollX) * k;
    cam.scrollY += (ty - cam.scrollY) * k;

    // Dynamic zoom: expands view at higher speeds
    const speedRatio = Phaser.Math.Clamp(Math.abs(vx) / 22, 0, 1);
    const targetZoom = 1.0 - speedRatio * 0.16;
    cam.zoom += (targetZoom - cam.zoom) * k;
  }

  updateHud() {
    const pct = Phaser.Math.Clamp(this.fuel / this.fuelMax, 0, 1);
    this.fuelBar.setSize(Math.max(0.01, 200 * pct), 18);
    const low = pct < 0.25;
    this.fuelBar.setFillStyle(low ? 0xe0463c : pct < 0.5 ? 0xf0b429 : 0x55c26a);
    this.fuelBar.setAlpha(low ? 0.6 + 0.4 * Math.abs(Math.sin(this.time.now / 180)) : 1);
    this.coinText.setText(fmtCoins(this.runCoins) + (this.totalCoins ? ` / ${this.totalCoins}` : ''));

    if (this.endless) {
      this.distText.setText(`${Math.floor(this.distance)} m`);
    } else {
      const prog = Phaser.Math.Clamp((this.vehicle.x - SPAWN_X) / (this.finishX - SPAWN_X), 0, 1);
      this.progBar.setSize(Math.max(0.01, 296 * prog), 8);
      const curM = Math.floor(Math.max(0, this.distance));
      const totM = Math.floor((this.finishX - SPAWN_X) / PX_PER_METER);
      if (this.distText) {
        this.distText.setText(`${curM} m / ${totM} m  (${Math.floor(prog * 100)}%)`);
      }
    }

    if (this.fpsText) {
      this.fpsText.setText(
        `FPS: ${Math.round(1000 / Math.max(1, this.game.loop.delta))}  Spd: ${Math.abs(this.vehicle.chassis.velocity.x).toFixed(1)} px/s`
      );
    }
  }

  // ======================================================================
  // End of run
  // ======================================================================
  endRun(reason) {
    if (this.state !== 'playing') return;
    this.state = 'ending';
    this.endReason = reason;
    this.audio.stopEngine();

    if (reason === 'win') {
      this.audio.win();
      this.time.delayedCall(1100, () => this.showResult());
    } else {
      this.audio.crash();
      if (this.save.settings.vibration) vibrate(reason === 'crash' ? 160 : 60);
      if (reason === 'crash') this.cameras.main.shake(260, 0.012);
      const v = this.vehicle;
      this.sparkEmitter.emitParticleAt(v.x, v.y, 14);
      this.time.delayedCall(1300, () => this.showResult());
    }
  }

  showResult() {
    if (this.panel) return;
    const reason = this.endReason;
    const sfx = () => this.audio.click();
    let spec;

    if (this.endless) {
      const dist = Math.floor(this.distance);
      const isBest = dist > this.save.bestDistance;
      const totalRunEarned = this.runCoins * COIN_VALUE;
      this.commit(() => {
        SaveSystem.addCoins(totalRunEarned);
        SaveSystem.recordEndless(dist);
      });
      const lines = [
        { text: `Distance: ${dist} m`, size: '32px' },
        { text: isBest ? 'NEW BEST!' : `Best: ${Math.max(dist, this.save.bestDistance)} m`, color: isBest ? '#8dff9b' : '#ffffff' },
        { text: `Coins earned: +${fmtCoins(totalRunEarned)}`, color: '#ffd23f' }
      ];
      if (this.stuntBonusCoins > 0) {
        lines.push({ text: `Stunts bonus: +${fmtCoins(this.stuntBonusCoins)}`, color: '#8dff9b' });
      }
      spec = {
        title: reason === 'fuel' ? 'OUT OF FUEL' : reason === 'finish' ? 'RUN COMPLETED' : 'CRASHED',
        height: this.stuntBonusCoins > 0 ? 380 : 340,
        lines,
        buttons: [
          { label: 'RETRY', color: 0x2f9e55, onClick: () => this.scene.restart({ mode: 'endless' }), sfx },
          { label: 'GARAGE', color: 0x2f6fa8, onClick: () => this.scene.start('GarageScene'), sfx },
          { label: 'MENU', color: 0x3a4a56, onClick: () => this.scene.start('MenuScene'), sfx }
        ]
      };
    } else if (reason === 'win') {
      const ratio = this.totalCoins ? this.runCoins / this.totalCoins : 1;
      const stars = starsForRatio(ratio);
      const firstTime = !(this.save.levels[this.cfg.id]?.stars > 0);
      const bonus = firstTime ? this.cfg.bonus : Math.round(this.cfg.bonus * 0.25);
      const earned = this.runCoins * COIN_VALUE + bonus;
      this.commit(() => {
        SaveSystem.addCoins(earned);
        SaveSystem.recordLevel(this.cfg.id, stars, this.runCoins);
      });
      const hasNext = this.cfg.id < LEVELS.length;
      const lines = [
        { text: '\u2605'.repeat(stars) + '\u2606'.repeat(3 - stars), size: '48px', color: '#ffd23f', gap: 50 },
        `Coins: ${this.runCoins} / ${this.totalCoins}  (+${fmtCoins(this.runCoins * COIN_VALUE)})`,
        { text: `${firstTime ? 'Level bonus' : 'Replay bonus'}: +${fmtCoins(bonus)}`, color: '#8dff9b' }
      ];
      if (this.stuntBonusCoins > 0) {
        lines.push({ text: `Stunts bonus: +${fmtCoins(this.stuntBonusCoins)}`, color: '#8dff9b' });
      }
      lines.push({ text: `Total earned: +${fmtCoins(earned)}`, color: '#ffd23f', size: '28px' });

      spec = {
        title: 'LEVEL COMPLETE',
        height: this.stuntBonusCoins > 0 ? 410 : 380,
        lines,
        buttons: [
          hasNext
            ? { label: 'NEXT', color: 0x2f9e55, onClick: () => this.scene.restart({ mode: 'career', levelId: this.cfg.id + 1 }), sfx }
            : { label: 'GARAGE', color: 0x2f9e55, onClick: () => this.scene.start('GarageScene'), sfx },
          { label: 'RETRY', color: 0x2f6fa8, onClick: () => this.scene.restart({ mode: 'career', levelId: this.cfg.id }), sfx },
          { label: 'LEVELS', color: 0x3a4a56, onClick: () => this.scene.start('LevelSelectScene'), sfx }
        ]
      };
    } else {
      const totalKept = this.runCoins * COIN_VALUE;
      this.commit(() => {
        SaveSystem.addCoins(totalKept);
        SaveSystem.data.stats.runs++;
        SaveSystem.persist();
      });
      const lines = [
        `Progress: ${Math.floor(Phaser.Math.Clamp((this.vehicle.x - SPAWN_X) / (this.finishX - SPAWN_X), 0, 1) * 100)}%`,
        { text: `Coins kept: +${fmtCoins(totalKept)}`, color: '#ffd23f' }
      ];
      if (this.stuntBonusCoins > 0) {
        lines.push({ text: `Stunts bonus: +${fmtCoins(this.stuntBonusCoins)}`, color: '#8dff9b' });
      }
      lines.push({ text: reason === 'fuel' ? 'Grab fuel cans to keep going!' : 'Keep your head off the ground!', size: '18px', color: '#b8c7d2' });

      spec = {
        title: reason === 'fuel' ? 'OUT OF FUEL' : 'CRASHED',
        height: this.stuntBonusCoins > 0 ? 370 : 340,
        lines,
        buttons: [
          { label: 'RETRY', color: 0x2f9e55, onClick: () => this.scene.restart({ mode: 'career', levelId: this.cfg.id }), sfx },
          { label: 'GARAGE', color: 0x2f6fa8, onClick: () => this.scene.start('GarageScene'), sfx },
          { label: 'LEVELS', color: 0x3a4a56, onClick: () => this.scene.start('LevelSelectScene'), sfx }
        ]
      };
    }
    this.panel = makePanel(this, spec);
  }

  /** Runs a save mutation exactly once per run. */
  commit(fn) {
    if (this.saved) return;
    this.saved = true;
    fn();
  }

  // ======================================================================
  // Pause
  // ======================================================================
  pauseGame() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.controls.gas = this.controls.brake = false;
    this.audio.stopEngine();
    const sfx = () => this.audio.click();

    const buttons = this.endless
      ? [
          { label: 'RESUME', color: 0x2f9e55, onClick: () => this.resumeGame(), sfx },
          { label: 'FINISH RUN', color: 0xd9812b, onClick: () => { this.resumeGame(); this.endRun('finish'); }, sfx },
          { label: 'RESTART', color: 0x2f6fa8, onClick: () => this.restart(), sfx },
          { label: 'MENU', color: 0x7a2a2a, onClick: () => this.quit(), sfx }
        ]
      : [
          { label: 'RESUME', color: 0x2f9e55, onClick: () => this.resumeGame(), sfx },
          { label: 'RESTART', color: 0x2f6fa8, onClick: () => this.restart(), sfx },
          { label: 'QUIT', color: 0x7a2a2a, onClick: () => this.quit(), sfx }
        ];

    this.panel = makePanel(this, {
      title: 'PAUSED',
      height: this.endless ? 300 : 260,
      lines: this.endless ? [{ text: `Distance so far: ${Math.floor(this.distance)} m`, size: '20px', color: '#ffd23f' }] : [],
      buttons
    });
  }

  resumeGame() {
    if (this.state !== 'paused') return;
    this.panel.destroy();
    this.panel = null;
    this.state = 'playing';
    this.acc = 0;
    this.audio.startEngine();
  }

  restart() {
    this.commit(() => { SaveSystem.addCoins(this.runCoins * COIN_VALUE); SaveSystem.persist(); });
    this.scene.restart({ mode: this.mode, levelId: this.levelId });
  }

  quit() {
    this.commit(() => { SaveSystem.addCoins(this.runCoins * COIN_VALUE); SaveSystem.persist(); });
    this.scene.start(this.endless ? 'MenuScene' : 'LevelSelectScene');
  }

  // ======================================================================
  // Debug overlay (?debug=1)
  // ======================================================================
  drawDebug(delta) {
    const g = this.debugGfx;
    const v = this.vehicle;
    g.clear();
    g.lineStyle(2, 0x00ff88, 1);
    g.strokePoints(v.chassis.vertices, true);
    v.wheels.forEach((w) => g.strokeCircle(w.position.x, w.position.y, v.spec.wheel.r));
    const hd = v.getHead();
    g.lineStyle(2, 0xff3355, 1);
    g.strokeCircle(hd.x, hd.y, hd.r);
    g.lineStyle(2, 0xffff00, 1);
    g.beginPath();
    for (let x = v.x - 400; x <= v.x + 600; x += 10) {
      const y = this.terrain.surfaceY(x);
      if (x === v.x - 400) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.strokePath();
    this.fpsText.setText(
      `fps ${Math.round(1000 / Math.max(1, delta))}  grounded ${v.groundedWheels()}  fuel ${this.fuel.toFixed(0)}  ` +
      `v ${v.chassis.velocity.x.toFixed(1)}  chunks ${this.terrain.chunks.size}  pickups ${this.pickups.length}`
    );
  }
}
