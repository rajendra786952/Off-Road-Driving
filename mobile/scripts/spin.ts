// How fast does a car spin up in the air with the brake held? (physics check)
import Matter from 'matter-js';
import { GameWorld } from '../src/core/world';
import { LEVELS } from '../src/data/levels';
import { getVehicle, defaultUpgrades, computeStats } from '../src/data/vehicles';

const carId = process.argv[2] ?? 'mountain-jeep';
const car = getVehicle(carId);
const w = new GameWorld(LEVELS[0], car, defaultUpgrades());
for (let i = 0; i < 60; i++) w.step(false, false);
const v = w.vehicle;
for (const b of [v.chassis, ...v.wheels]) Matter.Body.setPosition(b, { x: b.position.x, y: b.position.y - 900 });
if (process.argv[3] === "free") for (const c of v.constraints) { c.stiffness = 0; c.damping = 0; }
const st = computeStats(car, defaultUpgrades());
console.log(`${carId} airTorque ${st.airTorque.toFixed(4)} cap ${st.maxAirSpin.toFixed(3)}`);
let rot = 0;
let last = v.angle;
for (let i = 1; i <= 70; i++) {
  w.step(false, true);
  rot += v.angle - last;
  last = v.angle;
  if (i % 5 === 0) console.log(`step ${i} om=${v.chassis.angularVelocity.toFixed(4)} rot=${rot.toFixed(2)} grounded=${v.groundedWheels()}`);
}
