import Phaser from 'phaser';
import { computeStats } from '../config/vehicles.js';
import { VEHICLE_TEX } from '../systems/TextureFactory.js';

const { Bodies, Body, Constraint } = Phaser.Physics.Matter.Matter;

const MAX_BODY_SPEED = 28; // px per step - keeps wheels from tunnelling through terrain

/**
 * Chassis + two wheels joined by V-shaped spring struts.
 * - Chassis and wheels share a negative collision group (they never collide with
 *   each other, only with terrain).
 * - Drive is applied as wheel angular velocity (a motor), brakes damp it.
 * - In the air the pedals rotate the chassis (flip control).
 * - Crash detection is analytic: the driver's head vs. terrain.surfaceY().
 */
export default class Vehicle {
  constructor(scene, spec, upgrades, x, y, terrain) {
    this.scene = scene;
    this.spec = spec;
    this.terrain = terrain;
    this.stats = computeStats(spec, upgrades);
    const s = this.stats;
    const { w, h } = spec.body;
    const wr = spec.wheel.r;
    const wb = spec.wheel.base;

    const group = Body.nextGroup(true);
    this.chassis = Bodies.rectangle(x, y, w, h, {
      chamfer: { radius: 8 },
      density: spec.body.density,
      friction: 0.5,
      frictionAir: 0.004,
      restitution: 0.05,
      collisionFilter: { group },
      label: 'chassis'
    });

    this.anchorY = h / 2 - 2;
    const wheelY = y + this.anchorY + spec.suspension.rest;
    this.wheels = [-1, 1].map((side) =>
      Bodies.circle(x + side * wb, wheelY, wr, {
        density: spec.wheel.density,
        friction: s.grip,
        frictionStatic: s.grip * 2,
        frictionAir: 0.0008,
        restitution: 0.02,
        collisionFilter: { group },
        label: 'wheel'
      })
    );
    [this.rearWheel, this.frontWheel] = this.wheels;

    // Two struts per wheel (a "V") = vertical springiness + lateral stability.
    this.constraints = [];
    this.wheels.forEach((wheel, idx) => {
      const side = idx === 0 ? -1 : 1;
      [-1, 1].forEach((spread) => {
        const off = spread * spec.suspension.spread;
        this.constraints.push(
          Constraint.create({
            bodyA: this.chassis,
            pointA: { x: side * wb + off, y: this.anchorY },
            bodyB: wheel,
            length: Math.hypot(off, spec.suspension.rest),
            stiffness: s.stiffness,
            damping: s.damping
          })
        );
      });
    });

    scene.matter.world.add([this.chassis, ...this.wheels, ...this.constraints]);

    // Visuals
    this.strutGfx = scene.add.graphics().setDepth(9);
    this.wheelSprites = this.wheels.map(() =>
      scene.add.image(0, 0, `wheel_${spec.id}`).setDepth(10)
    );
    this.bodySprite = scene.add
      .image(0, 0, `veh_${spec.id}`)
      .setOrigin(VEHICLE_TEX.cx / VEHICLE_TEX.w, VEHICLE_TEX.cy / VEHICLE_TEX.h)
      .setDepth(11);
    this.syncVisuals();
  }

  get x() { return this.chassis.position.x; }
  get y() { return this.chassis.position.y; }
  get speed() { return this.chassis.velocity.x; }
  get angle() { return this.chassis.angle; }

  /** Check if a specific wheel is touching (or nearly touching) the ground. */
  isWheelGrounded(w) {
    const r = this.spec.wheel.r;
    const gap = this.terrain.surfaceY(w.position.x) - (w.position.y + r);
    return gap < 7 + r * 0.2;
  }

  /** Number of wheels touching (or nearly touching) the ground. */
  groundedWheels() {
    let n = 0;
    if (this.isWheelGrounded(this.rearWheel)) n++;
    if (this.isWheelGrounded(this.frontWheel)) n++;
    return n;
  }

  /** Called once per fixed physics step, before the engine update. */
  applyControls(gas, brake, hasFuel) {
    const s = this.stats;
    const rearGrounded = this.isWheelGrounded(this.rearWheel);
    const frontGrounded = this.isWheelGrounded(this.frontWheel);
    const grounded = (rearGrounded ? 1 : 0) + (frontGrounded ? 1 : 0);
    const vx = this.chassis.velocity.x;

    if (gas && hasFuel) {
      for (const w of this.wheels) {
        if (w.angularVelocity < s.maxWheelSpeed) {
          Body.setAngularVelocity(w, Math.min(s.maxWheelSpeed, Math.max(w.angularVelocity, -0.05) + s.accel));
        }
      }
      if (grounded > 0) {
        // Rear-wheel only (wheelie) produces higher reaction pitch on chassis because
        // there is no front wheel counteracting the torque. Requires throttle feathering!
        const rx = rearGrounded && !frontGrounded ? s.reaction * 1.5 : s.reaction;
        Body.setAngularVelocity(this.chassis, this.chassis.angularVelocity - rx);

        const ca = this.chassis.angle;
        // Traction distribution: both wheels = 100%, rear wheel = 75%, front wheel = 35%
        const traction = grounded === 2 ? 1.0 : (rearGrounded ? 0.75 : 0.35);
        const driveF = s.driveForce * traction;
        Body.applyForce(this.chassis, this.chassis.position, {
          x: Math.cos(ca) * driveF,
          y: Math.sin(ca) * driveF
        });
      }
    }

    if (brake) {
      if (vx > 0.8) {
        for (const w of this.wheels) Body.setAngularVelocity(w, w.angularVelocity * s.brakeGrip);
        Body.setVelocity(this.chassis, { x: vx * 0.985, y: this.chassis.velocity.y });
        // Forward weight transfer under braking tilts nose slightly down if grounded
        if (grounded > 0) {
          Body.setAngularVelocity(this.chassis, this.chassis.angularVelocity + s.reaction * 0.65);
        }
      } else if (hasFuel) {
        for (const w of this.wheels) {
          if (w.angularVelocity > -s.maxWheelSpeed * 0.5) {
            Body.setAngularVelocity(w, Math.max(-s.maxWheelSpeed * 0.5, Math.min(w.angularVelocity, 0.05) - s.accel * 0.8));
          }
        }
        if (grounded > 0) {
          const ca = this.chassis.angle;
          const revF = s.driveForce * 0.55 * (grounded / 2);
          Body.applyForce(this.chassis, this.chassis.position, {
            x: -Math.cos(ca) * revF,
            y: -Math.sin(ca) * revF
          });
        }
      } else {
        for (const w of this.wheels) Body.setAngularVelocity(w, w.angularVelocity * 0.9);
      }
    }

    // Air control: gas tilts the nose up, brake tilts it down.
    if (grounded === 0) {
      let t = 0;
      if (gas) t -= s.airTorque;
      if (brake) t += s.airTorque;
      if (t !== 0) {
        const av = Phaser.Math.Clamp(this.chassis.angularVelocity + t, -s.maxAirSpin, s.maxAirSpin);
        Body.setAngularVelocity(this.chassis, av);
      }
    }

    this._limit(this.chassis);
    this.wheels.forEach((w) => this._limit(w));
  }

  _limit(body) {
    const v = body.velocity;
    const sp = Math.hypot(v.x, v.y);
    if (sp > MAX_BODY_SPEED) {
      const k = MAX_BODY_SPEED / sp;
      Body.setVelocity(body, { x: v.x * k, y: v.y * k });
    }
  }

  /**
   * Bump-stop & droop limiter: prevents wheels from compressing through the chassis,
   * inverting spring constraints, or separating during violent jumps and hard landings.
   */
  clampSuspension() {
    const c = this.chassis;
    const ca = c.angle;
    const cos = Math.cos(ca);
    const sin = Math.sin(ca);
    const rest = this.spec.suspension.rest;
    const minTravel = 7; // bump stop: cannot compress above 7px below anchor
    const maxTravel = rest * 1.35; // droop limit: cannot extend further than 135% of rest

    this.wheels.forEach((w, idx) => {
      const side = idx === 0 ? -1 : 1;
      const ax = c.position.x + (side * this.spec.wheel.base) * cos - this.anchorY * sin;
      const ay = c.position.y + (side * this.spec.wheel.base) * sin + this.anchorY * cos;

      const dx = w.position.x - ax;
      const dy = w.position.y - ay;
      const localX = dx * cos + dy * sin;
      const localY = -dx * sin + dy * cos;

      const clampedX = Math.max(-16, Math.min(16, localX));
      const clampedY = Math.max(minTravel, Math.min(maxTravel, localY));

      if (clampedX !== localX || clampedY !== localY) {
        const targetWorldX = ax + (clampedX * cos - clampedY * sin);
        const targetWorldY = ay + (clampedX * sin + clampedY * cos);
        Body.setPosition(w, { x: targetWorldX, y: targetWorldY });
        if (localY < minTravel) {
          Body.setVelocity(w, { x: c.velocity.x, y: c.velocity.y });
        }
      }
    });
  }

  /** Driver head in world space (local offset rotated with the chassis). */
  getHead() {
    const a = this.chassis.angle;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const lx = this.spec.head.x;
    const ly = -this.spec.body.h / 2 - this.spec.head.lift;
    return {
      x: this.chassis.position.x + lx * c - ly * s,
      y: this.chassis.position.y + lx * s + ly * c,
      r: this.spec.head.r
    };
  }

  headTouchesGround() {
    const hd = this.getHead();
    return hd.y + hd.r >= this.terrain.surfaceY(hd.x) - 2;
  }

  /** True if the car has flipped over (> 97 deg) and the chassis/roof strikes the ground. */
  isOverturned() {
    const ang = Math.abs(Phaser.Math.Angle.Wrap(this.chassis.angle));
    if (ang < 1.7) return false;
    const c = this.chassis.position;
    const sy = this.terrain.surfaceY(c.x);
    return c.y >= sy - 34;
  }

  /** World position of the lowest point of the rear wheel (for dust). */
  rearContact() {
    const w = this.rearWheel;
    return { x: w.position.x, y: w.position.y + this.spec.wheel.r - 2 };
  }

  syncVisuals() {
    const c = this.chassis;
    this.bodySprite.setPosition(c.position.x, c.position.y).setRotation(c.angle);
    this.wheels.forEach((w, i) => this.wheelSprites[i].setPosition(w.position.x, w.position.y).setRotation(w.angle));

    const g = this.strutGfx;
    g.clear();
    g.lineStyle(5, 0x2b3238, 1);
    this.constraints.forEach((con, i) => {
      const w = this.wheels[i < 2 ? 0 : 1];
      // Matter rotates constraint.pointA in place every step, so it is already
      // the chassis-relative offset in world orientation.
      const p = con.pointA;
      g.lineBetween(c.position.x + p.x, c.position.y + p.y, w.position.x, w.position.y);
    });
  }

  setVisible(v) {
    this.bodySprite.setVisible(v);
    this.wheelSprites.forEach((s) => s.setVisible(v));
    this.strutGfx.setVisible(v);
  }

  destroy() {
    const world = this.scene.matter.world;
    this.constraints.forEach((c) => world.remove(c));
    world.remove(this.chassis);
    this.wheels.forEach((w) => world.remove(w));
    this.bodySprite.destroy();
    this.wheelSprites.forEach((s) => s.destroy());
    this.strutGfx.destroy();
  }
}
