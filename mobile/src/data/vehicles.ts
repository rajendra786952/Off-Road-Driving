// 100 vehicles = 10 body styles x 10 series, generated from the tables below.
// All physics numbers live here so tuning never requires touching game code.
// Units: angular speeds are rad per physics step (1/60 s).
// The four original vehicles (Mountain Jeep, Desert Raptor, Rally Buggy, Bigfoot)
// are the first series of their style and keep their original numbers and prices.
import { FUEL } from '../core/constants';

export type CarStyle = 'jeep' | 'pickup' | 'buggy' | 'monster' | 'sports' | 'muscle' | 'suv' | 'van' | 'rally' | 'truck';

export interface CarColors {
  main: string;
  dark: string;
  accent: string;
  glass: string;
}

export interface VehicleSpec {
  id: string;
  name: string;
  style: CarStyle;
  series: number; // 0..9
  price: number;
  desc: string;
  colors: CarColors;
  body: { w: number; h: number; density: number };
  wheel: { r: number; base: number; density: number };
  suspension: { rest: number; spread: number; stiffness: number; damping: number };
  head: { x: number; lift: number; r: number };
  power: { accel: number; maxWheelSpeed: number; reaction: number; driveForce: number };
  grip: number;
  fuelUse: number;
  /** Wheel speed kept per step while braking (lower = stronger brakes). */
  brake: number;
  /** Rotation added per step by the pedals in the air (handling). */
  air: number;
}

type Base = Omit<VehicleSpec, 'id' | 'series' | 'price' | 'brake' | 'air' | 'style'> & { price0: number; short: string; hue: number };

const BASES: Record<CarStyle, Base> = {
  jeep: {
    name: 'Mountain Jeep', short: 'Jeep', price0: 0, hue: 128,
    desc: 'Reliable all-rounder. Easy to control on any slope.',
    colors: { main: '#3f8f4a', dark: '#244d2b', accent: '#f2c14e', glass: '#9fd6ef' },
    body: { w: 112, h: 30, density: 0.002 },
    wheel: { r: 19, base: 39, density: 0.0009 },
    suspension: { rest: 20, spread: 10, stiffness: 0.32, damping: 0.15 },
    head: { x: 4, lift: 13, r: 8 },
    power: { accel: 0.024, maxWheelSpeed: 0.38, reaction: 0.00095, driveForce: 0.0085 },
    grip: 1.6, fuelUse: 1.0,
  },
  van: {
    name: 'Camper Van', short: 'Van', price0: 1200, hue: 190,
    desc: 'Tall and steady with a frugal engine. Slow, but it goes a long way on a tank.',
    colors: { main: '#3fa7b5', dark: '#1f5560', accent: '#fff3d6', glass: '#bfe6f7' },
    body: { w: 126, h: 36, density: 0.0023 },
    wheel: { r: 19, base: 43, density: 0.0009 },
    suspension: { rest: 21, spread: 10, stiffness: 0.36, damping: 0.18 },
    head: { x: 20, lift: 10, r: 8 },
    power: { accel: 0.025, maxWheelSpeed: 0.38, reaction: 0.0009, driveForce: 0.0105 },
    grip: 1.6, fuelUse: 0.85,
  },
  pickup: {
    name: 'Desert Raptor 4x4', short: 'Raptor', price0: 1800, hue: 28,
    desc: 'Heavy 4x4 super-truck with V8 power, wide track, and incredible off-road torque.',
    colors: { main: '#d9812b', dark: '#6b3d12', accent: '#f4e3b0', glass: '#a9dcf0' },
    body: { w: 128, h: 32, density: 0.0026 },
    wheel: { r: 21, base: 44, density: 0.001 },
    suspension: { rest: 21, spread: 11, stiffness: 0.36, damping: 0.17 },
    head: { x: 4, lift: 12, r: 8 },
    power: { accel: 0.03, maxWheelSpeed: 0.42, reaction: 0.00085, driveForce: 0.0135 },
    grip: 1.6, fuelUse: 1.2,
  },
  suv: {
    name: 'Trail SUV', short: 'SUV', price0: 2600, hue: 215,
    desc: 'Comfortable, grippy and hard to upset. A safe pick for rough ground.',
    colors: { main: '#4667b8', dark: '#22335e', accent: '#e8ecef', glass: '#a9dcf0' },
    body: { w: 120, h: 32, density: 0.0024 },
    wheel: { r: 21, base: 41, density: 0.001 },
    suspension: { rest: 22, spread: 11, stiffness: 0.34, damping: 0.17 },
    head: { x: 6, lift: 12, r: 8 },
    power: { accel: 0.027, maxWheelSpeed: 0.4, reaction: 0.0009, driveForce: 0.011 },
    grip: 1.7, fuelUse: 1.1,
  },
  buggy: {
    name: 'Rally Buggy', short: 'Buggy', price0: 3500, hue: 4,
    desc: 'Lightweight and very fast. High flight control, needs a steady hand.',
    colors: { main: '#d6342c', dark: '#3a1210', accent: '#ffffff', glass: '#bfe6f7' },
    body: { w: 100, h: 26, density: 0.0015 },
    wheel: { r: 18, base: 35, density: 0.0008 },
    suspension: { rest: 19, spread: 9, stiffness: 0.28, damping: 0.13 },
    head: { x: 2, lift: 12, r: 8 },
    power: { accel: 0.034, maxWheelSpeed: 0.48, reaction: 0.0011, driveForce: 0.008 },
    grip: 1.45, fuelUse: 0.95,
  },
  monster: {
    name: 'Bigfoot Monster Truck', short: 'Bigfoot', price0: 4500, hue: 224,
    desc: 'Giant high-clearance Bigfoot monster truck with massive terrain-crushing power.',
    colors: { main: '#1d4ed8', dark: '#0f172a', accent: '#facc15', glass: '#38bdf8' },
    body: { w: 140, h: 36, density: 0.003 },
    wheel: { r: 28, base: 48, density: 0.0014 },
    suspension: { rest: 26, spread: 14, stiffness: 0.42, damping: 0.22 },
    head: { x: 5, lift: 16, r: 10 },
    power: { accel: 0.036, maxWheelSpeed: 0.44, reaction: 0.00095, driveForce: 0.0175 },
    grip: 1.75, fuelUse: 1.35,
  },
  rally: {
    name: 'Rally Hatch', short: 'Hatch', price0: 5200, hue: 52,
    desc: 'Short, nimble and sticky. Lands jumps cleanly and brakes late.',
    colors: { main: '#e0b62a', dark: '#6a5210', accent: '#1c2f5e', glass: '#bfe6f7' },
    body: { w: 108, h: 26, density: 0.0018 },
    wheel: { r: 19, base: 38, density: 0.0009 },
    suspension: { rest: 21, spread: 10, stiffness: 0.31, damping: 0.15 },
    head: { x: 2, lift: 12, r: 8 },
    power: { accel: 0.034, maxWheelSpeed: 0.47, reaction: 0.001, driveForce: 0.0095 },
    grip: 1.7, fuelUse: 1.0,
  },
  muscle: {
    name: 'Muscle V8', short: 'Muscle', price0: 6000, hue: 280,
    desc: 'Huge torque from a big engine. Quick off the line and thirsty.',
    colors: { main: '#7a3fb8', dark: '#3a1d5a', accent: '#f4f4f4', glass: '#a9dcf0' },
    body: { w: 124, h: 27, density: 0.0022 },
    wheel: { r: 19, base: 42, density: 0.0009 },
    suspension: { rest: 19, spread: 10, stiffness: 0.33, damping: 0.16 },
    head: { x: 0, lift: 12, r: 8 },
    power: { accel: 0.033, maxWheelSpeed: 0.46, reaction: 0.0011, driveForce: 0.0115 },
    grip: 1.55, fuelUse: 1.2,
  },
  sports: {
    name: 'Street Racer', short: 'Racer', price0: 7500, hue: 340,
    desc: 'The fastest thing on wheels. Low and stiff: bumps are your enemy.',
    colors: { main: '#e0356f', dark: '#5e1430', accent: '#111418', glass: '#bfe6f7' },
    body: { w: 118, h: 24, density: 0.0017 },
    wheel: { r: 17, base: 40, density: 0.0008 },
    suspension: { rest: 17, spread: 9, stiffness: 0.34, damping: 0.16 },
    head: { x: 0, lift: 11, r: 7 },
    power: { accel: 0.036, maxWheelSpeed: 0.5, reaction: 0.001, driveForce: 0.009 },
    grip: 1.5, fuelUse: 1.05,
  },
  truck: {
    name: 'Big Rig', short: 'Rig', price0: 9000, hue: 160,
    desc: 'A wall of steel. Shrugs off obstacles and climbs anything, slowly.',
    colors: { main: '#2f9e7a', dark: '#16463a', accent: '#d8dde2', glass: '#a9dcf0' },
    body: { w: 136, h: 38, density: 0.003 },
    wheel: { r: 24, base: 48, density: 0.0013 },
    suspension: { rest: 24, spread: 12, stiffness: 0.42, damping: 0.21 },
    head: { x: 30, lift: 14, r: 9 },
    power: { accel: 0.03, maxWheelSpeed: 0.4, reaction: 0.0009, driveForce: 0.0165 },
    grip: 1.75, fuelUse: 1.4,
  },
};

export const STYLE_ORDER: CarStyle[] = ['jeep', 'van', 'pickup', 'suv', 'buggy', 'monster', 'rally', 'muscle', 'sports', 'truck'];
export const SERIES_NAMES = ['Classic', 'Sport', 'Trail', 'Turbo', 'Pro', 'Rally', 'Elite', 'Titan', 'Apex', 'Legend'];
export const STYLE_LABEL: Record<CarStyle, string> = {
  jeep: 'Jeeps', van: 'Vans', pickup: 'Pickups', suv: 'SUVs', buggy: 'Buggies',
  monster: 'Monster trucks', rally: 'Hatchbacks', muscle: 'Muscle cars', sports: 'Sports cars', truck: 'Big rigs',
};

function hsl(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

const ACCENTS = ['#f4f4f4', '#f2c14e', '#111418', '#ff7a3a', '#38bdf8', '#f4f4f4', '#d4a017', '#e0463c', '#8dff9b', '#ffd23f'];

function build(style: CarStyle, series: number): VehicleSpec {
  const b = BASES[style];
  const t = series;
  const round = (v: number, p: number) => Math.round(v * p) / p;
  const colors: CarColors =
    t === 0
      ? b.colors
      : {
          main: hsl(b.hue + t * 37, t === 9 ? 0.2 : 0.62, t === 9 ? 0.16 : 0.42 + (t % 3) * 0.05),
          dark: hsl(b.hue + t * 37, 0.5, t === 9 ? 0.07 : 0.2),
          accent: ACCENTS[t],
          glass: b.colors.glass,
        };
  return {
    id: t === 0 ? ORIGINAL_ID[style] ?? `${style}-0` : `${style}-${t}`,
    name: t === 0 ? b.name : `${b.short} ${SERIES_NAMES[t]}`,
    style,
    series: t,
    price: t === 0 ? b.price0 : Math.round(((b.price0 * 0.6 + 2500) * Math.pow(1.42, t) * 1.5) / 100) * 100,
    desc: t === 0 ? b.desc : `${SERIES_NAMES[t]} series ${b.short.toLowerCase()}: more power, grip and brakes than the ${SERIES_NAMES[t - 1].toLowerCase()} model.`,
    colors,
    body: b.body,
    wheel: b.wheel,
    suspension: { ...b.suspension, stiffness: round(Math.min(0.6, b.suspension.stiffness * (1 + 0.02 * t)), 1e4), damping: round(b.suspension.damping * (1 + 0.02 * t), 1e4) },
    head: b.head,
    power: {
      accel: round(b.power.accel * (1 + 0.045 * t), 1e5),
      maxWheelSpeed: round(b.power.maxWheelSpeed * (1 + 0.03 * t), 1e4),
      reaction: b.power.reaction,
      driveForce: round(b.power.driveForce * (1 + 0.06 * t), 1e5),
    },
    grip: round(b.grip * (1 + 0.025 * t), 1e3),
    fuelUse: round(b.fuelUse * (1 - 0.012 * t), 1e3),
    brake: round(0.88 - 0.008 * t, 1e3),
    air: round(0.0016 * (1 + 0.035 * t), 1e6),
  };
}

// ids of the original four vehicles are kept so old saves still point at them
const ORIGINAL_ID: Partial<Record<CarStyle, string>> = {
  jeep: 'mountain-jeep',
  pickup: 'desert-pickup',
  buggy: 'rally-buggy',
  monster: 'monster-truck',
};

export const VEHICLES: VehicleSpec[] = [];
for (let t = 0; t < 10; t++) for (const style of STYLE_ORDER) VEHICLES.push(build(style, t));
VEHICLES.sort((a, b) => a.price - b.price);

export const VEHICLE_COUNT = VEHICLES.length;

/**
 * Rewarded ads needed to unlock this vehicle instead of paying coins, or 0 if it
 * can only be bought. The ten Sport-series vehicles (one per body style) qualify.
 */
export function adUnlockCost(spec: VehicleSpec): number {
  return spec.series === 1 ? 3 : 0;
}
export const STARTER_ID = 'mountain-jeep';

const byId = new Map(VEHICLES.map((v) => [v.id, v]));
export function getVehicle(id: string): VehicleSpec {
  return byId.get(id) ?? byId.get(STARTER_ID)!;
}

/** Paint jobs (cosmetic only). `stock` keeps each vehicle's own colours. */
export interface Paint {
  id: string;
  name: string;
  price: number;
  main?: string;
  dark?: string;
}
export const PAINTS: Paint[] = [
  { id: 'stock', name: 'Factory', price: 0 },
  { id: 'sand', name: 'Desert Sand', price: 1500, main: '#c9a66b', dark: '#6e5630' },
  { id: 'arctic', name: 'Arctic White', price: 2500, main: '#e8ecef', dark: '#7c8790' },
  { id: 'midnight', name: 'Midnight Blue', price: 4000, main: '#1c2f5e', dark: '#0c1430' },
  { id: 'crimson', name: 'Crimson', price: 6000, main: '#a3161c', dark: '#3d0a0c' },
  { id: 'stealth', name: 'Stealth Black', price: 9000, main: '#1a1b1e', dark: '#08080a' },
  { id: 'gold', name: 'Champion Gold', price: 20000, main: '#d4a017', dark: '#6b4f08' },
];

export function paintSpec(spec: VehicleSpec, paintId: string): VehicleSpec {
  const p = PAINTS.find((x) => x.id === paintId);
  if (!p || !p.main || !p.dark) return spec;
  return { ...spec, colors: { ...spec.colors, main: p.main, dark: p.dark } };
}

export const UPGRADE_KEYS = ['engine', 'tires', 'suspension', 'brakes', 'fuel'] as const;
export type UpgradeKey = (typeof UPGRADE_KEYS)[number];
export type Upgrades = Record<UpgradeKey, number>;
export const MAX_UPGRADE = 8;
export const UPGRADE_LABEL: Record<UpgradeKey, string> = {
  engine: 'Engine', tires: 'Tyres', suspension: 'Suspension', brakes: 'Brakes', fuel: 'Fuel tank',
};
export const UPGRADE_HINT: Record<UpgradeKey, string> = {
  engine: 'Acceleration and top speed',
  tires: 'Grip on every surface',
  suspension: 'Stiffer springs, calmer landings',
  brakes: 'Stops the wheels sooner',
  fuel: '+25 fuel per level',
};
const BASE_COST: Record<UpgradeKey, number> = { engine: 200, tires: 150, suspension: 150, fuel: 120, brakes: 140 };

/** Cost to upgrade from `level` to `level + 1`. */
export function upgradeCost(key: UpgradeKey, level: number): number {
  return Math.round((BASE_COST[key] * Math.pow(1.7, level - 1)) / 10) * 10;
}
export function defaultUpgrades(): Upgrades {
  return { engine: 1, tires: 1, suspension: 1, brakes: 1, fuel: 1 };
}

export interface VehicleStats {
  accel: number;
  maxWheelSpeed: number;
  driveForce: number;
  reaction: number;
  grip: number;
  stiffness: number;
  damping: number;
  airTorque: number;
  maxAirSpin: number;
  brakeGrip: number;
  fuelCapacity: number;
  fuelUse: number;
}

/** Resolve base spec + upgrade levels into the numbers the physics uses. */
export function computeStats(spec: VehicleSpec, ups: Partial<Upgrades>): VehicleStats {
  const e = (ups.engine || 1) - 1;
  const t = (ups.tires || 1) - 1;
  const s = (ups.suspension || 1) - 1;
  const f = (ups.fuel || 1) - 1;
  const b = (ups.brakes || 1) - 1;
  return {
    accel: spec.power.accel * (1 + 0.14 * e),
    maxWheelSpeed: spec.power.maxWheelSpeed * (1 + 0.06 * e),
    driveForce: (spec.power.driveForce || 0.0085) * (1 + 0.16 * e),
    reaction: spec.power.reaction * (1 + 0.05 * e),
    grip: spec.grip * (1 + 0.1 * t),
    stiffness: Math.min(0.65, spec.suspension.stiffness * (1 + 0.08 * s)),
    damping: spec.suspension.damping * (1 + 0.06 * s),
    airTorque: spec.air,
    maxAirSpin: 0.08,
    brakeGrip: Math.max(0.7, spec.brake - 0.012 * b),
    fuelCapacity: FUEL.base + 25 * f,
    fuelUse: spec.fuelUse,
  };
}

export const STAT_NAMES = ['Speed', 'Acceleration', 'Handling', 'Braking', 'Suspension'] as const;
export type StatName = (typeof STAT_NAMES)[number];

/** 0..1 values for the garage stat bars. */
export function displayStats(spec: VehicleSpec, ups: Partial<Upgrades>): Record<StatName, number> {
  const st = computeStats(spec, ups);
  const c = (v: number) => Math.max(0.04, Math.min(1, v));
  return {
    Speed: c((st.maxWheelSpeed * spec.wheel.r) / 19),
    Acceleration: c((st.accel / 0.1) * 0.5 + (st.driveForce / 0.055) * 0.5),
    Handling: c((st.grip / 3.6) * 0.6 + (st.airTorque / 0.0022) * 0.4),
    Braking: c((1 - st.brakeGrip) / 0.3),
    Suspension: c((st.stiffness / 0.65) * 0.6 + (st.damping / 0.38) * 0.4),
  };
}
