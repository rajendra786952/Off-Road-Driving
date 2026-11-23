// Chassis + two wheels joined by V-shaped spring struts. Ported line for line
// from the original Phaser game (src/game/objects/Vehicle.js) onto plain
// matter-js, so the driving feel is unchanged.
// - Chassis and wheels share a negative collision group (they never collide
//   with each other).
// - Drive is applied as wheel angular velocity (a motor), brakes damp it.
// - In the air the pedals rotate the chassis (flip control).
// - Crash detection is analytic: the driver's head against the ground height.
import Matter from 'matter-js';
import { computeStats, type Upgrades, type VehicleSpec, type VehicleStats } from '../data/vehicles';

const { Bodies, Body, Constraint, Composite } = Matter;

const MAX_BODY_SPEED = 28; // px per step - keeps wheels from tunnelling through terrain

export function wrapAngle(a: number): number {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

export class Vehicle {
  spec: VehicleSpec;
  stats: VehicleStats;
  chassis: Matter.Body;
  wheels: Matter.Body[];
  rearWheel: Matter.Body;
  frontWheel: Matter.Body;
  constraints: Matter.Constraint[] = [];
  anchorY: number;
  private world: Matter.World;
  /** Height of whatever the car can stand on at x (terrain, bridge deck, platform). */
  private ground: (x: number) => number;

  constructor(world: Matter.World, spec: VehicleSpec, upgrades: Partial<Upgrades>, x: number, y: number, ground: (x: number) => number) {
    this.world = world;
    this.spec = spec;
    this.ground = ground;
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
      label: 'chassis',
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
        label: 'wheel',
      }),
    );
    [this.rearWheel, this.frontWheel] = this.wheels;

    // Two struts per wheel (a "V") = vertical springiness + lateral stability.
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
            damping: s.damping,
          }),
        );
      });
    });

    Composite.add(world, [this.chassis, ...this.wheels, ...this.constraints]);
  }

  get x() { return this.chassis.position.x; }
  get y() { return this.chassis.position.y; }
  get angle() { return this.chassis.angle; }

  /** Is this wheel touching (or nearly touching) the ground? */
  isWheelGrounded(w: Matter.Body): boolean {
    const r = this.spec.wheel.r;
    const gap = this.ground(w.position.x) - (w.position.y + r);
    return gap < 7 + r * 0.2;
  }

  groundedWheels(): number {
    return (this.isWheelGrounded(this.rearWheel) ? 1 : 0) + (this.isWheelGrounded(this.frontWheel) ? 1 : 0);
  }

  /**
   * Hard landings wear the suspension: the springs go soft and floppy as damage
   * (0..100) builds up, so a battered car bottoms out and wallows more.
   */
  setDamage(damage: number): void {
    const k = 1 - 0.4 * Math.min(1, Math.max(0, damage / 100));
    for (const c of this.constraints) {
      c.stiffness = this.stats.stiffness * k;
      c.damping = this.stats.damping * k;
    }
  }

  /** Called once per fixed physics step, before the engine update. */
  applyControls(gas: boolean, brake: boolean, hasFuel: boolean, slip = 1, flipFront = false, flipBack = false): void {
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
        // Rear wheel only (a wheelie) pitches the chassis harder: nothing at the
        // front resists the torque, so the throttle has to be feathered.
        const rx = rearGrounded && !frontGrounded ? s.reaction * 1.5 : s.reaction;
        Body.setAngularVelocity(this.chassis, this.chassis.angularVelocity - rx);

        const ca = this.chassis.angle;
        // Traction: both wheels 100 %, rear only 75 %, front only 35 %
        const traction = (grounded === 2 ? 1.0 : rearGrounded ? 0.75 : 0.35) * slip;
        const driveF = s.driveForce * traction;
        Body.applyForce(this.chassis, this.chassis.position, { x: Math.cos(ca) * driveF, y: Math.sin(ca) * driveF });
      }
    }

    if (brake) {
      if (vx > 0.8) {
        for (const w of this.wheels) Body.setAngularVelocity(w, w.angularVelocity * s.brakeGrip);
        Body.setVelocity(this.chassis, { x: vx * (1 - 0.125 * (1 - s.brakeGrip)), y: this.chassis.velocity.y });
        // weight transfer under braking tilts the nose down
        if (grounded > 0) Body.setAngularVelocity(this.chassis, this.chassis.angularVelocity + s.reaction * 0.65);
      } else if (hasFuel) {
        // reverse
        for (const w of this.wheels) {
          if (w.angularVelocity > -s.maxWheelSpeed * 0.5) {
            Body.setAngularVelocity(w, Math.max(-s.maxWheelSpeed * 0.5, Math.min(w.angularVelocity, 0.05) - s.accel * 0.8));
          }
        }
        if (grounded > 0) {
          const ca = this.chassis.angle;
          const revF = s.driveForce * 0.55 * (grounded / 2);
          Body.applyForce(this.chassis, this.chassis.position, { x: -Math.cos(ca) * revF, y: -Math.sin(ca) * revF });
        }
      } else {
        for (const w of this.wheels) Body.setAngularVelocity(w, w.angularVelocity * 0.9);
      }
    }

    // Air control (only with all wheels off the ground): gas tilts the nose up, brake
    // tilts it down. The torque is spread over many steps, so a flip takes real time,
    // and it is limited by the car's inertia (see computeStats): trucks turn slowly.
    if (grounded === 0) {
      let t = 0;
      // only the two flip buttons turn the car in the air: BACK FLIP lifts the nose, FRONT FLIP drops it
      // (the gas and brake pedals do nothing up there)
      if (flipBack) t -= s.airTorque;
      if (flipFront) t += s.airTorque;
      let av = this.chassis.angularVelocity;
      if (t !== 0) {
        av = Math.max(-s.maxAirSpin, Math.min(s.maxAirSpin, av + t));
        Body.setAngularVelocity(this.chassis, av);
      }
      if (Math.abs(av) > 0.004) this.spinAsOneBody(av);
    }

    this.limit(this.chassis);
    this.limit(this.rearWheel);
    this.limit(this.frontWheel);
  }

  /**
   * While the car spins in the air the chassis and both wheels move as one rigid
   * body about their common centre of mass: each gets the velocity that rotation
   * gives it. Left alone, the suspension springs fight a fast spin and eat it
   * (the torque would barely turn the car), and the wheels would swing about.
   * No momentum is created: only the spin is shared out.
   */
  private spinAsOneBody(av: number): void {
    const bodies = [this.chassis, ...this.wheels];
    let m = 0;
    let cx = 0;
    let cy = 0;
    let vx = 0;
    let vy = 0;
    for (const q of bodies) {
      m += q.mass;
      cx += q.mass * q.position.x;
      cy += q.mass * q.position.y;
      vx += q.mass * q.velocity.x;
      vy += q.mass * q.velocity.y;
    }
    cx /= m;
    cy /= m;
    vx /= m;
    vy /= m;
    for (const q of bodies) {
      Body.setVelocity(q, { x: vx - av * (q.position.y - cy), y: vy + av * (q.position.x - cx) });
    }
  }

  private limit(body: Matter.Body): void {
    const v = body.velocity;
    const sp = Math.hypot(v.x, v.y);
    if (sp > MAX_BODY_SPEED) {
      const k = MAX_BODY_SPEED / sp;
      Body.setVelocity(body, { x: v.x * k, y: v.y * k });
    }
  }

  /**
   * Bump stop and droop limiter: keeps the wheels from compressing through the
   * chassis or separating from it during violent jumps and hard landings.
   */
  clampSuspension(): void {
    const c = this.chassis;
    const cos = Math.cos(c.angle);
    const sin = Math.sin(c.angle);
    const rest = this.spec.suspension.rest;
    const minTravel = 7;
    const maxTravel = rest * 1.35;

    this.wheels.forEach((w, idx) => {
      const side = idx === 0 ? -1 : 1;
      const ax = c.position.x + side * this.spec.wheel.base * cos - this.anchorY * sin;
      const ay = c.position.y + side * this.spec.wheel.base * sin + this.anchorY * cos;
      const dx = w.position.x - ax;
      const dy = w.position.y - ay;
      const localX = dx * cos + dy * sin;
      const localY = -dx * sin + dy * cos;
      const clampedX = Math.max(-16, Math.min(16, localX));
      const clampedY = Math.max(minTravel, Math.min(maxTravel, localY));
      if (clampedX !== localX || clampedY !== localY) {
        Body.setPosition(w, { x: ax + (clampedX * cos - clampedY * sin), y: ay + (clampedX * sin + clampedY * cos) });
        if (localY < minTravel) Body.setVelocity(w, { x: c.velocity.x, y: c.velocity.y });
      }
    });
  }

  /** Driver head in world space (local offset rotated with the chassis). */
  getHead(): { x: number; y: number; r: number } {
    const a = this.chassis.angle;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const lx = this.spec.head.x;
    const ly = -this.spec.body.h / 2 - this.spec.head.lift;
    return { x: this.chassis.position.x + lx * c - ly * s, y: this.chassis.position.y + lx * s + ly * c, r: this.spec.head.r };
  }

  headTouchesGround(): boolean {
    const hd = this.getHead();
    return hd.y + hd.r >= this.ground(hd.x) - 2;
  }

  /** True if the car has flipped over (> 97 deg) and the roof is on the ground. */
  isOverturned(): boolean {
    if (Math.abs(wrapAngle(this.chassis.angle)) < 1.7) return false;
    const c = this.chassis.position;
    return c.y >= this.ground(c.x) - 34;
  }

  /** Lowest point of the rear wheel (for dust). */
  rearContact(): { x: number; y: number } {
    const w = this.rearWheel;
    return { x: w.position.x, y: w.position.y + this.spec.wheel.r - 2 };
  }

  destroy(): void {
    Composite.remove(this.world, [...this.constraints, this.chassis, ...this.wheels] as never);
  }
}
