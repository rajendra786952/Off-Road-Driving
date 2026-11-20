// Vehicle artwork, drawn in code. Each of the ten body styles has its own
// silhouette; the series adds trim (stripes, spoiler, roof lights, gold rims),
// and colours come from the spec, so all 100 cars look different without a
// single image file. The body and the wheel are recorded once per car into
// pictures and then only moved and rotated each frame.
import type { SkCanvas, SkPicture } from '@shopify/react-native-skia';
import { DEG, fill, poly, record, rrect, shade, stroke } from './gfx';
import type { CarStyle, VehicleSpec } from '../data/vehicles';

export interface CarArt {
  body: SkPicture;
  wheel: SkPicture;
}

interface Cabin {
  /** x offsets from the driver's head: rear base, rear roof, front roof, front base */
  rb: number;
  rr: number;
  fr: number;
  fb: number;
  pillar?: boolean;
}

const cache = new Map<string, CarArt>();

export function getCarArt(spec: VehicleSpec): CarArt {
  const key = `${spec.id}:${spec.colors.main}`;
  let art = cache.get(key);
  if (!art) {
    if (cache.size > 40) cache.clear();
    const pad = 70;
    const { w, h } = spec.body;
    art = {
      body: record(w + pad * 2, h + pad * 2, (c) => drawBody(c, spec), -w / 2 - pad, -h / 2 - pad),
      wheel: record(spec.wheel.r * 2 + 8, spec.wheel.r * 2 + 8, (c) => drawWheel(c, spec), -spec.wheel.r - 4, -spec.wheel.r - 4),
    };
    cache.set(key, art);
  }
  return art;
}

function cabinFor(style: CarStyle, hw: number, hx: number): Cabin | null {
  const rear = -hw - hx; // offset of the rear bumper from the head
  switch (style) {
    case 'pickup': return { rb: -24, rr: -19, fr: 15, fb: 32 };
    case 'monster': return { rb: -27, rr: -21, fr: 17, fb: 35 };
    case 'sports': return { rb: -36, rr: -15, fr: 10, fb: 36 };
    case 'muscle': return { rb: -32, rr: -17, fr: 12, fb: 30 };
    case 'suv': return { rb: rear + 5, rr: rear + 12, fr: 17, fb: 34, pillar: true };
    case 'van': return { rb: rear + 1, rr: rear + 4, fr: 24, fb: 38, pillar: true };
    case 'rally': return { rb: rear + 5, rr: rear + 20, fr: 12, fb: 32, pillar: true };
    case 'truck': return { rb: -24, rr: -22, fr: 18, fb: 24 };
    default: return null; // jeep and buggy are open
  }
}

function drawBody(c: SkCanvas, spec: VehicleSpec): void {
  const { w, h } = spec.body;
  const hw = w / 2;
  const hh = h / 2;
  const top = -hh;
  const hx = spec.head.x;
  const hy = -hh - spec.head.lift;
  const hr = spec.head.r;
  const cabTop = hy - hr - 5;
  const { main, dark, accent, glass } = spec.colors;
  const t = spec.series;
  const style = spec.style;
  const light = shade(main, 0.22);
  const metal = '#2b3238';
  const sporty = style === 'sports' || style === 'muscle' || style === 'rally' || style === 'buggy';

  // ---- things behind the body
  if (style === 'jeep' || style === 'suv') {
    c.drawCircle(-hw - 3, 0, hh * 0.72, fill('#1c1e22'));
    c.drawCircle(-hw - 3, 0, hh * 0.34, fill('#8a9098'));
  }
  if (style === 'truck') {
    for (const sx of [hx - 30, hx - 37]) {
      rrect(c, sx, cabTop - 14, 5, hh + (top - cabTop) + 14, 2, fill('#c9ced6'));
      rrect(c, sx - 1, cabTop - 16, 7, 5, 2, fill('#6b7078'));
    }
  }
  if ((sporty && t >= 3) || style === 'sports') {
    const sy = style === 'buggy' ? cabTop + 4 : top - 9;
    c.drawLine(-hw + 6, top + 2, -hw + 4, sy, stroke(metal, 3));
    c.drawLine(-hw - 6, sy, -hw + 16, sy - 2, stroke(t >= 5 ? accent : dark, 4));
  }

  // ---- cabin
  const cab = cabinFor(style, hw, hx);
  if (cab) {
    c.drawPath(poly([hx + cab.rb, top + 1, hx + cab.rr, cabTop, hx + cab.fr, cabTop, hx + cab.fb, top + 1]), fill(main));
    c.drawLine(hx + cab.rr, cabTop, hx + cab.fr, cabTop, stroke(light, 2));
  } else {
    // open car: roll bar and windscreen frame
    const bar = stroke(style === 'buggy' ? dark : metal, 4);
    c.drawLine(hx - 24, top, hx - 16, cabTop + 2, bar);
    c.drawLine(hx - 16, cabTop + 2, hx + 12, cabTop + 3, bar);
    c.drawLine(hx + 12, cabTop + 3, hx + (style === 'buggy' ? 34 : 22), top, bar);
    if (style === 'buggy') c.drawLine(hx - 16, cabTop + 2, hx - 40, top + 2, bar);
  }

  // ---- driver
  c.drawCircle(hx, hy, hr, fill(accent === '#111418' ? '#e8ecef' : accent));
  c.drawCircle(hx, hy, hr, stroke('#111418', 1.5, 0.5));
  rrect(c, hx + hr * 0.1, hy - hr * 0.35, hr * 0.95, hr * 0.6, 2, fill('#16202a'));
  if (!cab) rrect(c, hx - 5, hy + hr - 1, 12, top - hy - hr + 3, 3, fill('#2f3a45')); // shoulders

  // ---- glass
  if (cab) {
    const gb = top - 1;
    const gt = cabTop + 4;
    const slope = (x0: number, x1: number, y: number) => x0 + ((x1 - x0) * (top - y)) / (top - cabTop);
    const rearB = hx + slope(cab.rb, cab.rr, gb) + 5;
    const rearT = hx + slope(cab.rb, cab.rr, gt) + 5;
    const frontB = hx + slope(cab.fb, cab.fr, gb) - 4;
    const frontT = hx + slope(cab.fb, cab.fr, gt) - 4;
    const g = fill(glass, 0.72);
    if (cab.pillar) {
      const px = hx - 13;
      if (px - 3 > rearT + 6) c.drawPath(poly([rearB, gb, rearT, gt, px - 3, gt, px - 3, gb]), g);
      c.drawPath(poly([px + 3, gb, px + 3, gt, frontT, gt, frontB, gb]), g);
    } else {
      c.drawPath(poly([rearB, gb, rearT, gt, frontT, gt, frontB, gb]), g);
    }
    c.drawLine(frontT - 3, gt + 2, frontB - 6, gb - 2, stroke('#ffffff', 2, 0.35)); // reflection
  }

  // ---- lower body
  const body = fill(main);
  switch (style) {
    case 'buggy':
      c.drawPath(poly([-hw, hh, -hw, -hh * 0.2, -hw * 0.55, top, hw * 0.55, -hh * 0.55, hw, hh * 0.15, hw, hh]), body);
      break;
    case 'sports':
      c.drawPath(poly([-hw, hh, -hw, -hh * 0.6, -hw * 0.8, top, hw * 0.5, top, hw * 0.82, -hh * 0.5, hw, hh * 0.05, hw, hh]), body);
      break;
    case 'muscle':
      c.drawPath(poly([-hw, hh, -hw, -hh * 0.7, -hw * 0.86, top, hw * 0.86, top, hw, -hh * 0.5, hw, hh]), body);
      rrect(c, hw * 0.36, top - 5, 20, 7, 3, fill(dark)); // hood scoop
      break;
    case 'rally':
      c.drawPath(poly([-hw, hh, -hw, top, hw * 0.62, top, hw * 0.9, -hh * 0.55, hw, 0, hw, hh]), body);
      break;
    default:
      rrect(c, -hw, top, w, h, style === 'van' ? 9 : 7, body);
  }
  // shading, sill and arches
  rrect(c, -hw + 4, top + 2, w - 8, 3, 1.5, fill(light, 0.8));
  rrect(c, -hw + 2, hh - h * 0.3, w - 4, h * 0.3, 3, fill(dark));
  for (const side of [-1, 1]) c.drawCircle(side * spec.wheel.base, hh + 2, spec.wheel.r * 0.8, fill(shade(dark, -0.45)));

  // ---- series trim
  if (t >= 1) rrect(c, -hw + 8, -h * 0.08, w - 16, 3.5, 1.5, fill(accent));
  if (t >= 9) rrect(c, -hw + 8, -h * 0.08 + 6, w - 16, 2, 1, fill(accent));
  if (t >= 4) rrect(c, -hw * 0.2, top + 6, 16, 9, 2, fill(accent, 0.9)); // number plate panel
  if (t >= 5 && cab) for (let i = 0; i < 3; i++) c.drawCircle(hx + cab.rr + 10 + i * 9, cabTop - 3, 3, fill('#ffe680'));
  if (t >= 3 && (style === 'suv' || style === 'van' || style === 'jeep') && cab) {
    c.drawLine(hx + cab.rr + 4, cabTop - 4, hx + cab.fr - 4, cabTop - 4, stroke(metal, 2.5));
    c.drawLine(hx + cab.rr + 8, cabTop - 4, hx + cab.rr + 8, cabTop, stroke(metal, 2));
    c.drawLine(hx + cab.fr - 8, cabTop - 4, hx + cab.fr - 8, cabTop, stroke(metal, 2));
  }
  if (t >= 2 && (style === 'jeep' || style === 'pickup' || style === 'monster' || style === 'truck' || style === 'suv')) {
    c.drawLine(hw + 2, hh - 4, hw + 6, top + 4, stroke('#c9ced6', 3)); // bull bar
    c.drawLine(hw - 2, -1, hw + 5, -1, stroke('#c9ced6', 3));
  }
  if (style === 'pickup' || style === 'monster') rrect(c, -hw + 5, top - 3, hw + hx - 30, 5, 2, fill(dark)); // bed rail
  if (style === 'monster') rrect(c, -hw + 14, hh, w - 28, 6, 3, fill(metal));

  // ---- lights and bumpers
  rrect(c, hw - 7, -h * 0.28, 6, 7, 2, fill('#ffe680'));
  rrect(c, -hw + 1, -h * 0.28, 5, 7, 2, fill('#e0463c'));
  rrect(c, hw - 5, hh - 8, 8, 6, 2, fill(metal));
  rrect(c, -hw - 3, hh - 8, 8, 6, 2, fill(metal));
}

function drawWheel(c: SkCanvas, spec: VehicleSpec): void {
  const r = spec.wheel.r;
  const chunky = spec.style === 'monster' || spec.style === 'truck' || spec.style === 'jeep' || spec.style === 'pickup';
  c.drawCircle(0, 0, r, fill('#17191d'));
  if (chunky) {
    const knob = fill('#0c0d10');
    for (let i = 0; i < 12; i++) {
      c.save();
      c.rotate(i * 30, 0, 0);
      rrect(c, -2.5, -r - 1.5, 5, 5, 1.5, knob);
      c.restore();
    }
  }
  c.drawCircle(0, 0, r * 0.82, stroke('#2c3038', 2));
  const rim = spec.series >= 7 ? '#d4a017' : spec.series >= 4 ? '#e8ecef' : '#aab1ba';
  c.drawCircle(0, 0, r * 0.58, fill(rim));
  const spoke = stroke('#3a3f48', Math.max(2, r * 0.13));
  for (let i = 0; i < 5; i++) {
    const a = (i * Math.PI * 2) / 5;
    c.drawLine(0, 0, Math.cos(a) * r * 0.54, Math.sin(a) * r * 0.54, spoke);
  }
  c.drawCircle(0, 0, r * 0.2, fill('#22262c'));
}

/** Draw the body picture at a world position and angle (radians). */
export function drawPictureAt(c: SkCanvas, pic: SkPicture, x: number, y: number, angle: number): void {
  c.save();
  c.translate(x, y);
  if (angle) c.rotate(angle * DEG, 0, 0);
  c.drawPicture(pic);
  c.restore();
}

/** A parked car, for the garage and the home screen. Origin: centre of the chassis. */
export function drawParkedCar(c: SkCanvas, spec: VehicleSpec): void {
  const art = getCarArt(spec);
  const wy = spec.body.h / 2 - 2 + spec.suspension.rest * 0.9;
  for (const side of [-1, 1]) c.drawLine(side * spec.wheel.base, spec.body.h / 2 - 2, side * spec.wheel.base, wy, stroke('#2b3238', 5));
  c.drawPicture(art.body);
  for (const side of [-1, 1]) drawPictureAt(c, art.wheel, side * spec.wheel.base, wy, side * 0.4);
}

/** Vertical extent of a parked car around its origin, to fit it into a view. */
export function carExtent(spec: VehicleSpec): { top: number; bottom: number; half: number } {
  return {
    top: -(spec.body.h / 2 + spec.head.lift + spec.head.r + 24),
    bottom: spec.body.h / 2 + spec.suspension.rest + spec.wheel.r,
    half: spec.body.w / 2 + 14,
  };
}
