import { FUEL } from './constants.js';

// All physics numbers live here so tuning never requires touching game code.
// Units: angular speeds are rad per physics step (1/60 s).
export const VEHICLES = [
  {
    id: 'mountain-jeep',
    name: 'Mountain Jeep',
    price: 0,
    desc: 'Reliable all-rounder. Easy to control on any slope.',
    type: 'jeep',
    colors: { main: 0x3f8f4a, dark: 0x244d2b, accent: 0xf2c14e, glass: 0x9fd6ef },
    body: { w: 112, h: 30, density: 0.0020 },
    wheel: { r: 19, base: 39, density: 0.0009 },
    suspension: { rest: 20, spread: 10, stiffness: 0.32, damping: 0.15 },
    head: { x: 4, lift: 13, r: 8 },
    power: { accel: 0.0240, maxWheelSpeed: 0.38, reaction: 0.00095, driveForce: 0.0085 },
    grip: 1.6,
    fuelUse: 1.0
  },
  {
    id: 'desert-pickup',
    name: 'Desert Raptor 4x4',
    price: 1800,
    desc: 'Heavy 4x4 super-truck with V8 power, wide track, and incredible off-road torque.',
    type: 'pickup',
    colors: { main: 0xd9812b, dark: 0x6b3d12, accent: 0xf4e3b0, glass: 0xa9dcf0 },
    body: { w: 128, h: 32, density: 0.0026 },
    wheel: { r: 21, base: 44, density: 0.0010 },
    suspension: { rest: 21, spread: 11, stiffness: 0.36, damping: 0.17 },
    head: { x: 4, lift: 12, r: 8 },
    power: { accel: 0.0300, maxWheelSpeed: 0.42, reaction: 0.00085, driveForce: 0.0135 },
    grip: 1.60,
    fuelUse: 1.2
  },
  {
    id: 'rally-buggy',
    name: 'Rally Buggy',
    price: 3500,
    desc: 'Lightweight and very fast. High flight control, needs a steady hand.',
    type: 'buggy',
    colors: { main: 0xd6342c, dark: 0x3a1210, accent: 0xffffff, glass: 0xbfe6f7 },
    body: { w: 100, h: 26, density: 0.0015 },
    wheel: { r: 18, base: 35, density: 0.0008 },
    suspension: { rest: 19, spread: 9, stiffness: 0.28, damping: 0.13 },
    head: { x: 2, lift: 12, r: 8 },
    power: { accel: 0.0340, maxWheelSpeed: 0.48, reaction: 0.00110, driveForce: 0.0080 },
    grip: 1.45,
    fuelUse: 0.95
  },
  {
    id: 'monster-truck',
    name: 'Bigfoot Monster Truck',
    price: 4500,
    desc: 'Giant high-clearance Bigfoot monster truck with massive terrain-crushing power.',
    type: 'monster',
    colors: { main: 0x1d4ed8, dark: 0x0f172a, accent: 0xfacc15, glass: 0x38bdf8 },
    body: { w: 140, h: 36, density: 0.0030 },
    wheel: { r: 28, base: 48, density: 0.0014 },
    suspension: { rest: 26, spread: 14, stiffness: 0.42, damping: 0.22 },
    head: { x: 5, lift: 16, r: 10 },
    power: { accel: 0.0360, maxWheelSpeed: 0.44, reaction: 0.00095, driveForce: 0.0175 },
    grip: 1.75,
    fuelUse: 1.35
  }
];

/** Paint jobs (cosmetic only): a late-game coin sink. `stock` keeps each vehicle's own colours. */
export const PAINTS = [
  { id: 'stock', name: 'Factory', price: 0 },
  { id: 'sand', name: 'Desert Sand', price: 1500, main: 0xc9a66b, dark: 0x6e5630 },
  { id: 'arctic', name: 'Arctic White', price: 2500, main: 0xe8ecef, dark: 0x7c8790 },
  { id: 'midnight', name: 'Midnight Blue', price: 4000, main: 0x1c2f5e, dark: 0x0c1430 },
  { id: 'crimson', name: 'Crimson', price: 6000, main: 0xa3161c, dark: 0x3d0a0c },
  { id: 'stealth', name: 'Stealth Black', price: 9000, main: 0x1a1b1e, dark: 0x08080a },
  { id: 'gold', name: 'Champion Gold', price: 20000, main: 0xd4a017, dark: 0x6b4f08 }
];

/** The vehicle spec with a paint job applied. */
export function paintSpec(spec, paintId) {
  const p = PAINTS.find((x) => x.id === paintId);
  if (!p || p.main === undefined) return spec;
  return { ...spec, colors: { ...spec.colors, main: p.main, dark: p.dark } };
}

export function getVehicle(id) {
  return VEHICLES.find((v) => v.id === id) || VEHICLES[0];
}

/** Resolve base spec + upgrade levels into the numbers the physics uses. */
export function computeStats(spec, ups) {
  const e = (ups.engine || 1) - 1;
  const t = (ups.tires || 1) - 1;
  const s = (ups.suspension || 1) - 1;
  const f = (ups.fuel || 1) - 1;
  return {
    accel: spec.power.accel * (1 + 0.14 * e),
    maxWheelSpeed: spec.power.maxWheelSpeed * (1 + 0.06 * e),
    driveForce: (spec.power.driveForce || 0.0085) * (1 + 0.16 * e),
    reaction: spec.power.reaction * (1 + 0.05 * e),
    grip: spec.grip * (1 + 0.10 * t),
    stiffness: Math.min(0.65, spec.suspension.stiffness * (1 + 0.08 * s)),
    damping: spec.suspension.damping * (1 + 0.06 * s),
    airTorque: 0.0016,
    maxAirSpin: 0.08,
    brakeGrip: 0.88,
    fuelCapacity: FUEL.base + 25 * f,
    fuelUse: spec.fuelUse
  };
}

/** 0..1 values for the garage stat bars. */
export function displayStats(spec, ups) {
  const st = computeStats(spec, ups);
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  return {
    Speed: clamp01((st.maxWheelSpeed * spec.wheel.r) / 11),
    Power: clamp01((st.accel / 0.045) * 0.5 + (st.driveForce / 0.016) * 0.5),
    Grip: clamp01(st.grip / 2.3),
    Handling: clamp01(st.stiffness / 0.55)
  };
}
