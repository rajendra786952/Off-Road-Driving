// 3D drive specs for the three existing vehicles + how upgrades change them.
// Every upgrade maps to a physics parameter - nothing here is cosmetic.
import { TIRES } from './surfaces.js';

export const DRIVE_SPECS = {
  'mountain-jeep': {
    mass: 1650, wheelbase: 2.45, track: 1.56, wheelR: 0.40, comH: 0.80, clearance: 0.27,
    body: { w: 1.72, l: 3.9, h: 1.05 },
    travel: 0.27, freq: 1.55, damp: 0.38,
    power: 52000, fmax: 0.20, vmax: 17, brake: 1.0, fuel: 60
  },
  'desert-pickup': {
    mass: 2150, wheelbase: 3.10, track: 1.70, wheelR: 0.43, comH: 0.86, clearance: 0.29,
    body: { w: 1.90, l: 5.0, h: 1.10 },
    travel: 0.26, freq: 1.5, damp: 0.40,
    power: 74000, fmax: 0.225, vmax: 18.5, brake: 0.95, fuel: 80
  },
  'rally-buggy': {
    mass: 1080, wheelbase: 2.55, track: 1.78, wheelR: 0.38, comH: 0.64, clearance: 0.33,
    body: { w: 1.80, l: 3.6, h: 0.85 },
    travel: 0.36, freq: 1.45, damp: 0.42,
    power: 60000, fmax: 0.25, vmax: 23, brake: 1.05, fuel: 45
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
    vmaxLow: 6.5, lowRatio: 2.4, vmaxRev: 7,
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
