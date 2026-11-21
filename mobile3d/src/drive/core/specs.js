// 3D drive specs for the three existing vehicles + how upgrades change them.
// Every upgrade maps to a physics parameter - nothing here is cosmetic.
import { TIRES } from './surfaces.js';

export const DRIVE_SPECS = {
  'mountain-jeep': {
    mass: 1650, wheelbase: 2.45, track: 1.56, wheelR: 0.40, comH: 0.80, clearance: 0.27,
    body: { w: 1.72, l: 3.9, h: 1.05 },
    travel: 0.27, freq: 1.55, damp: 0.38,
    power: 95000, fmax: 0.34, vmax: 28, brake: 1.1, fuel: 60
  },
  'desert-pickup': {
    mass: 2350, wheelbase: 3.63, track: 1.84, wheelR: 0.43, comH: 0.86, clearance: 0.32,
    body: { w: 2.10, l: 5.8, h: 1.20 },
    travel: 0.30, freq: 1.5, damp: 0.40,
    power: 165000, fmax: 0.38, vmax: 34, brake: 1.15, fuel: 90
  },
  'rally-buggy': {
    mass: 1080, wheelbase: 2.55, track: 1.78, wheelR: 0.38, comH: 0.64, clearance: 0.33,
    body: { w: 1.80, l: 3.6, h: 0.85 },
    travel: 0.36, freq: 1.45, damp: 0.42,
    power: 220000, fmax: 0.42, vmax: 42, brake: 1.2, fuel: 45
  },
  'monster-truck': {
    mass: 2800, wheelbase: 3.80, track: 2.30, wheelR: 0.65, comH: 1.15, clearance: 0.52,
    body: { w: 2.40, l: 5.5, h: 1.40 },
    travel: 0.42, freq: 1.35, damp: 0.45,
    power: 260000, fmax: 0.46, vmax: 38, brake: 1.3, fuel: 100
  }
};

/** Upgrade tracks (levels 1..5) available for the 3D mode. */
export const UPGRADE_INFO = {
  engine:     { label: 'Engine',      hint: '+9% power, +7% torque per level' },
  tires:      { label: 'Tyre Quality', hint: '+4% grip on every surface per level' },
  suspension: { label: 'Suspension',  hint: 'More wheel travel and better damping' },
  fuel:       { label: 'Fuel Tank',   hint: '+20% range per level' },
  clearance:  { label: 'Lift Kit',    hint: '+2.5 cm ground clearance (raises centre of gravity)' },
  brakes:     { label: 'Brakes',      hint: '+12% brake force per level' }
};

/** One-off equipment. */
export const GEAR_INFO = {
  difflock: { label: 'Diff Locks', price: 2500, hint: 'Lock both axles: a lifted or spinning wheel no longer steals the torque' },
  winch:    { label: 'Winch',      price: 1500, hint: 'Pull yourself out using trees, rocks and anchor posts' }
};

/**
 * Resolve spec + upgrades + equipment into physics parameters.
 * @param ups  { engine, tires, suspension, fuel, clearance, brakes } levels 1..5
 * @param gear { difflock:boolean, winch:boolean, tire:'at'|'mud'|'rock'|'snow' }
 */
export function buildParams(vehicleId, ups = {}, gear = {}) {
  const s = DRIVE_SPECS[vehicleId] || DRIVE_SPECS['mountain-jeep'];
  const L = (k) => Math.max(0, (ups[k] || 1) - 1);
  const e = L('engine'), t = L('tires'), su = L('suspension'), f = L('fuel'), c = L('clearance'), b = L('brakes');
  const lift = 0.025 * c;
  const tire = TIRES[gear.tire] ? gear.tire : 'at';
  const mass = s.mass;
  const k = (mass / 4) * Math.pow(2 * Math.PI * s.freq, 2);
  const damp = s.damp + 0.03 * su;
  return {
    id: vehicleId,
    mass,
    wheelbase: s.wheelbase, track: s.track, wheelR: s.wheelR,
    comH: s.comH + lift, clearance: s.clearance + lift,
    body: s.body,
    travel: s.travel + 0.022 * su,
    springK: k,
    springC: 2 * damp * Math.sqrt(k * mass / 4),
    power: s.power * (1 + 0.09 * e),
    fmax: s.fmax * (1 + 0.07 * e),
    vmax: s.vmax * (1 + 0.03 * e),
    vmaxLow: 9.0, lowRatio: 2.6, vmaxRev: 8,
    brake: s.brake * (1 + 0.12 * b),
    gripMult: 1 + 0.04 * t,
    tire,
    sinkMult: TIRES[tire].sink,
    digMult: TIRES[tire].dig,
    fuelCap: s.fuel * (1 + 0.2 * f),
    difflock: !!gear.difflock,
    winch: !!gear.winch,
    winchForce: mass * 9.81 * 0.95
  };
}
