// Procedural 4x4 models (jeep / pickup / buggy) driven by the physics state.
// Built from primitives but shaded physically: metallic paint, rubber, glass,
// chrome and emissive lamps, lit by the scene's environment map.
// Used by the drive scene and by the garage's interactive 3D preview.
import * as THREE from 'three';
import { mergeColored, M } from './geo.js';

const rgb = (hex, k = 1) => [((hex >> 16) & 255) / 255 * k, ((hex >> 8) & 255) / 255 * k, (hex & 255) / 255 * k];

export class CarModel {
  /**
   * @param spec entry of VEHICLES (colors, type)   @param P physics params
   * @param veh  Vehicle4x4 or any object with { p, q, steer, yDroop, wheels:[{lx,lz,front,comp,spin}] }
   * @param opts { pbr:boolean }
   */
  constructor(spec, P, veh, opts = {}) {
    this.veh = veh;
    this.P = P;
    this.group = new THREE.Group();
    this.geos = [];
    this.mats = [];
    const pbr = opts.pbr !== false;
    const mat = (o, lam) => {
      const m = pbr ? new THREE.MeshStandardMaterial(o) : new THREE.MeshLambertMaterial(lam || { vertexColors: !!o.vertexColors, color: o.color, transparent: o.transparent, opacity: o.opacity });
      this.mats.push(m);
      return m;
    };
    const paintM = mat({ vertexColors: true, metalness: 0.55, roughness: 0.3, envMapIntensity: 1.1 });
    const trimM = mat({ vertexColors: true, metalness: 0.1, roughness: 0.82, envMapIntensity: 0.4 });
    const glassM = mat({ color: 0x1b2a33, metalness: 0.4, roughness: 0.06, transparent: true, opacity: 0.62, envMapIntensity: 1.8 });
    const chromeM = mat({ vertexColors: true, metalness: 0.95, roughness: 0.22, envMapIntensity: 1.3 });
    this.headM = new THREE.MeshBasicMaterial({ color: 0xfff3cf });
    this.tailM = new THREE.MeshBasicMaterial({ color: 0xb01008 });
    this.mats.push(this.headM, this.tailM);

    const main = rgb(spec.colors.main), dark = rgb(spec.colors.dark), acc = rgb(spec.colors.accent);
    const black = [0.05, 0.05, 0.055], grey = [0.3, 0.31, 0.33], steel = [0.72, 0.74, 0.78];
    const { w, l, h } = P.body;
    const yb = -(P.comH - P.clearance);
    const G = { paint: [], trim: [], glass: [], chrome: [], head: [], tail: [] };
    const box = (g, sx, sy, sz, x, y, z, color, rx = 0, ry = 0, rz = 0) => G[g].push({ geo: new THREE.BoxGeometry(sx, sy, sz), matrix: M(x, y, z, 1, 1, 1, rx, ry, rz), color: color || [1, 1, 1] });
    const cyl = (g, r1, r2, len, x, y, z, color, rx = 0, rz = 0, seg = 10) => G[g].push({ geo: new THREE.CylinderGeometry(r1, r2, len, seg), matrix: M(x, y, z, 1, 1, 1, rx, 0, rz), color: color || [1, 1, 1] });
    const lowH = h * 0.48;
    const y0 = yb + 0.12;                      // floor of the body shell
    const hz = P.wheelbase / 2;

    // chassis: ladder frame, skid plate, axles, diffs, shocks
    box('trim', w * 0.62, 0.1, l * 0.9, 0, yb + 0.05, 0, black);
    for (const sx of [-1, 1]) box('trim', 0.09, 0.14, l * 0.86, sx * w * 0.3, yb + 0.15, 0, black);
    for (const sz of [-1, 1]) {
      cyl('trim', 0.07, 0.07, P.track, 0, yb + 0.02 - (P.clearance - 0.2) * 0.4, sz * hz, grey, 0, Math.PI / 2, 6);
      G.trim.push({ geo: new THREE.SphereGeometry(0.17, 8, 6), matrix: M(0.12, yb + 0.02 - (P.clearance - 0.2) * 0.4, sz * hz), color: grey });
      for (const sx of [-1, 1]) cyl('chrome', 0.035, 0.035, 0.5, sx * (P.track / 2 - 0.22), yb + 0.22, sz * hz + 0.12, [0.9, 0.75, 0.1], 0.2, 0, 6);
    }

    if (spec.type === 'jeep') {
      box('paint', w, lowH, l * 0.96, 0, y0 + lowH / 2, 0, main);
      box('paint', w * 0.9, 0.1, l * 0.31, 0, y0 + lowH + 0.05, l * 0.31, main);                       // hood
      box('trim', w * 0.5, 0.03, l * 0.2, 0, y0 + lowH + 0.11, l * 0.31, dark);                        // hood vent
      box('paint', w * 0.94, h * 0.5, l * 0.52, 0, y0 + lowH + h * 0.25, -l * 0.15, main);             // cabin frame
      box('glass', w * 0.955, h * 0.3, l * 0.2, 0, y0 + lowH + h * 0.27, -l * 0.02);                   // front side glass
      box('glass', w * 0.955, h * 0.3, l * 0.19, 0, y0 + lowH + h * 0.27, -l * 0.265);                 // rear side glass
      box('glass', w * 0.84, h * 0.36, 0.05, 0, y0 + lowH + h * 0.26, l * 0.118, null, -0.2);          // windscreen
      box('glass', w * 0.7, h * 0.26, 0.05, 0, y0 + lowH + h * 0.28, -l * 0.412);                      // rear glass
      box('trim', w * 0.97, 0.07, l * 0.54, 0, y0 + lowH + h * 0.53, -l * 0.15, dark);                 // roof
      for (const sx of [-1, 1]) box('trim', 0.05, 0.05, l * 0.42, sx * w * 0.4, y0 + lowH + h * 0.6, -l * 0.15, black);   // roof rails
      for (let i = 0; i < 4; i++) box('trim', w * 0.82, 0.04, 0.04, 0, y0 + lowH + h * 0.6, -l * 0.33 + i * l * 0.12, black);
      box('trim', w * 0.6, 0.09, 0.1, 0, y0 + lowH + h * 0.63, l * 0.07, black);                       // light bar
      for (let i = -2; i <= 2; i++) box('head', 0.13, 0.07, 0.03, i * 0.2, y0 + lowH + h * 0.63, l * 0.07 + 0.06);
      cyl('trim', P.wheelR * 0.95, P.wheelR * 0.95, 0.26, 0, y0 + lowH * 0.92, -l * 0.5 - 0.14, black, Math.PI / 2, 0, 14);   // spare
      cyl('chrome', P.wheelR * 0.5, P.wheelR * 0.5, 0.27, 0, y0 + lowH * 0.92, -l * 0.5 - 0.145, steel, Math.PI / 2, 0, 10);
      cyl('trim', 0.05, 0.05, h * 0.9, w * 0.47, y0 + lowH + h * 0.3, l * 0.2, black, 0, 0, 6);        // snorkel
      for (let i = 0; i < 7; i++) box('trim', 0.05, lowH * 0.42, 0.03, -0.27 + i * 0.09, y0 + lowH * 0.62, l * 0.48 + 0.012, black);   // grille slots
    } else if (spec.type === 'pickup') {
      box('paint', w, lowH, l * 0.96, 0, y0 + lowH / 2, 0, main);
      box('paint', w * 0.92, 0.1, l * 0.27, 0, y0 + lowH + 0.05, l * 0.34, main);
      box('paint', w * 0.94, h * 0.5, l * 0.3, 0, y0 + lowH + h * 0.25, l * 0.06, main);
      box('glass', w * 0.955, h * 0.28, l * 0.24, 0, y0 + lowH + h * 0.28, l * 0.06);
      box('glass', w * 0.84, h * 0.36, 0.05, 0, y0 + lowH + h * 0.26, l * 0.218, null, -0.22);
      box('glass', w * 0.7, h * 0.24, 0.05, 0, y0 + lowH + h * 0.29, -l * 0.092);
      box('trim', w * 0.97, 0.07, l * 0.32, 0, y0 + lowH + h * 0.53, l * 0.06, dark);
      for (const sx of [-1, 1]) box('paint', 0.07, h * 0.24, l * 0.38, sx * (w / 2 - 0.035), y0 + lowH + h * 0.12, -l * 0.285, main);
      box('paint', w, h * 0.24, 0.07, 0, y0 + lowH + h * 0.12, -l * 0.475, main);
      box('trim', w * 0.86, 0.04, l * 0.36, 0, y0 + lowH + 0.02, -l * 0.285, black);                   // bed liner
      for (const sx of [-1, 1]) cyl('chrome', 0.04, 0.04, 0.62, sx * w * 0.36, y0 + lowH + h * 0.32, -l * 0.11, steel, 0, 0, 6);   // sports bar
      cyl('chrome', 0.04, 0.04, w * 0.72, 0, y0 + lowH + h * 0.6, -l * 0.11, steel, 0, Math.PI / 2, 6);
      for (let i = -1; i <= 1; i++) box('head', 0.16, 0.09, 0.03, i * 0.26, y0 + lowH + h * 0.66, -l * 0.1);
      for (let i = 0; i < 5; i++) box('chrome', w * 0.5, 0.035, 0.03, 0, y0 + lowH * 0.42 + i * 0.07, l * 0.48 + 0.012, steel);
    } else {
      box('paint', w * 0.82, lowH * 0.8, l * 0.9, 0, y0 + lowH * 0.4, 0, main);
      box('paint', w * 0.6, 0.1, l * 0.3, 0, y0 + lowH * 0.86, l * 0.3, main, 0.12);
      const cy = y0 + lowH * 0.8;
      for (const sx of [-1, 1]) {
        cyl('trim', 0.04, 0.04, h * 0.95, sx * w * 0.36, cy + h * 0.42, l * 0.12, black, -0.3, 0, 6);
        cyl('trim', 0.04, 0.04, h * 0.92, sx * w * 0.36, cy + h * 0.42, -l * 0.3, black, 0.25, 0, 6);
        cyl('trim', 0.04, 0.04, l * 0.42, sx * w * 0.36, cy + h * 0.86, -l * 0.09, black, Math.PI / 2, 0, 6);
        cyl('trim', 0.03, 0.03, l * 0.5, sx * w * 0.36, cy + h * 0.38, -l * 0.07, black, Math.PI / 2 - 0.5, 0, 6);
      }
      cyl('trim', 0.04, 0.04, w * 0.72, 0, cy + h * 0.86, l * 0.1, black, 0, Math.PI / 2, 6);
      cyl('trim', 0.04, 0.04, w * 0.72, 0, cy + h * 0.86, -l * 0.28, black, 0, Math.PI / 2, 6);
      box('chrome', w * 0.5, 0.42, 0.52, 0, cy + 0.25, -l * 0.38, steel);                              // engine
      for (const sx of [-1, 1]) cyl('chrome', 0.05, 0.05, 0.7, sx * 0.2, cy + 0.55, -l * 0.47, steel, 0.4, 0, 6);   // exhausts
      for (const sx of [-1, 1]) box('trim', w * 0.26, 0.5, 0.1, sx * w * 0.19, cy + 0.3, -l * 0.02, dark, -0.15);   // seats
      for (let i = -1; i <= 1; i++) box('head', 0.14, 0.09, 0.03, i * 0.24, cy + h * 0.9, l * 0.1 + 0.05);
    }

    // bumpers, flares, lamps, mirrors, steps
    box('trim', w * 1.02, 0.18, 0.16, 0, yb + 0.3, l / 2, black);
    box('trim', w * 1.02, 0.18, 0.16, 0, yb + 0.3, -l / 2, black);
    for (const sx of [-1, 1]) {
      cyl('chrome', 0.03, 0.03, 0.2, sx * w * 0.3, yb + 0.2, l / 2 + 0.1, [0.85, 0.1, 0.08], Math.PI / 2, 0, 6);   // tow hooks
      cyl('head', 0.11, 0.11, 0.05, sx * w * 0.34, y0 + lowH * 0.72, l * 0.48 + 0.02, null, Math.PI / 2, 0, 12);
      box('tail', 0.2, 0.12, 0.05, sx * w * 0.36, y0 + lowH * 0.7, -l * 0.48 - 0.02);
      box('trim', 0.16, 0.1, 0.05, sx * (w / 2 + 0.12), y0 + lowH + h * 0.16, l * 0.1, black);                     // mirrors
      box('trim', 0.16, 0.04, l * 0.3, sx * (w / 2 + 0.06), yb + 0.2, 0, black);                                   // rock sliders
      for (const sz of [-1, 1]) {
        G.trim.push({ geo: new THREE.CylinderGeometry(P.wheelR * 1.28, P.wheelR * 1.28, 0.16, 12, 1, false, 0, Math.PI), matrix: M(sx * (w / 2 + 0.03), y0 + lowH * 0.44, sz * hz, 1, 1, 1, 0, 0, Math.PI / 2).multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2)), color: black });
      }
    }
    box('chrome', w * 0.46, 0.05, 0.02, 0, y0 + lowH * 0.36, l * 0.48 + 0.02, acc);
    if (P.winch) {
      cyl('chrome', 0.09, 0.09, 0.3, 0, yb + 0.36, l / 2 + 0.14, steel, 0, Math.PI / 2, 8);
      box('trim', 0.4, 0.06, 0.22, 0, yb + 0.26, l / 2 + 0.14, black);
    }

    const add = (parts, m, shadow) => {
      if (!parts.length) return null;
      const g = mergeColored(parts);
      this.geos.push(g);
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = shadow;
      return mesh;
    };
    this.body = new THREE.Group();
    for (const [parts, m, sh] of [[G.paint, paintM, true], [G.trim, trimM, true], [G.glass, glassM, false], [G.chrome, chromeM, false], [G.head, this.headM, false], [G.tail, this.tailM, false]]) {
      const mesh = add(parts, m, sh);
      if (mesh) this.body.add(mesh);
    }
    this.group.add(this.body);

    // wheel (axis along X): tyre with tread blocks + rim
    const R = P.wheelR, ww = 0.3;
    const tread = P.tire === 'mud' ? 10 : P.tire === 'rock' ? 12 : P.tire === 'snow' ? 16 : 14;
    const tyre = [{ geo: new THREE.CylinderGeometry(R, R, ww, 18), matrix: M(0, 0, 0, 1, 1, 1, 0, 0, Math.PI / 2), color: [0.045, 0.045, 0.05] }];
    for (let i = 0; i < tread; i++) {
      const a = (i / tread) * Math.PI * 2;
      tyre.push({ geo: new THREE.BoxGeometry(ww + 0.04, 0.06, P.tire === 'mud' ? 0.19 : 0.12), matrix: M(0, Math.cos(a) * R, Math.sin(a) * R, 1, 1, 1, a), color: [0.07, 0.07, 0.075] });
    }
    const rim = [{ geo: new THREE.CylinderGeometry(R * 0.6, R * 0.6, ww + 0.02, 12), matrix: M(0, 0, 0, 1, 1, 1, 0, 0, Math.PI / 2), color: [0.6, 0.62, 0.65] }];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      rim.push({ geo: new THREE.BoxGeometry(ww + 0.05, 0.06, R * 0.5), matrix: M(0, Math.cos(a) * R * 0.3, Math.sin(a) * R * 0.3, 1, 1, 1, a), color: [0.25, 0.25, 0.27] });
    }
    rim.push({ geo: new THREE.CylinderGeometry(R * 0.16, R * 0.16, ww + 0.08, 8), matrix: M(0, 0, 0, 1, 1, 1, 0, 0, Math.PI / 2), color: steel });
    const tyreG = mergeColored(tyre), rimG = mergeColored(rim);
    this.geos.push(tyreG, rimG);
    this.wheels = veh.wheels.map(() => {
      const g = new THREE.Group();
      const a = new THREE.Mesh(tyreG, trimM), b = new THREE.Mesh(rimG, chromeM);
      a.castShadow = true;
      g.add(a, b);
      g.rotation.order = 'YXZ';
      this.group.add(g);
      return g;
    });

    // minimal cockpit shown only in the interior camera
    const cparts = [];
    const cbox = (sx, sy, sz, x, y, z, color, rx = 0) => cparts.push({ geo: new THREE.BoxGeometry(sx, sy, sz), matrix: M(x, y, z, 1, 1, 1, rx), color });
    const dashY = y0 + lowH + 0.08;
    cbox(w * 0.9, 0.2, 0.3, 0, dashY, l * 0.1, [0.1, 0.1, 0.11]);
    cbox(0.3, 0.1, 0.04, 0.38, dashY + 0.13, l * 0.1 - 0.13, [0.02, 0.02, 0.02], -0.3);
    cbox(w * 0.86, 0.06, l * 0.32, 0, dashY - 0.05, l * 0.31, main);
    for (const sx of [-1, 1]) cbox(0.07, h * 0.6, 0.07, sx * w * 0.44, dashY + h * 0.28, l * 0.1, dark, -0.22);
    cbox(w * 0.9, 0.07, 0.1, 0, dashY + h * 0.56, l * 0.04, dark);
    const cg = mergeColored(cparts);
    this.geos.push(cg);
    this.cockpit = new THREE.Mesh(cg, trimM);
    this.cockpit.visible = false;
    this.group.add(this.cockpit);
    const sw = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 6, 14), trimM);
    this.geos.push(sw.geometry);
    sw.position.set(0.38, dashY + 0.16, l * 0.1 - 0.22);
    sw.rotation.x = -0.35;
    sw.visible = false;
    this.steeringWheel = sw;
    this.group.add(sw);
    this.eye = new THREE.Vector3(0.38, dashY + 0.42, l * 0.1 - 0.62);
    this.hoodEye = new THREE.Vector3(0, dashY + 0.5, l * 0.16);
    this.lampPos = new THREE.Vector3(0, y0 + lowH * 0.72, l * 0.5);
  }

  setInterior(on) {
    this.body.visible = !on;
    this.cockpit.visible = on;
    this.steeringWheel.visible = on;
  }

  /** Brake lights + lamp brightness. */
  setLights(night, braking) {
    this.headM.color.setRGB(1.0, 0.95, 0.8).multiplyScalar(0.55 + 0.9 * night);
    this.tailM.color.setRGB(braking ? 1.0 : 0.35 + 0.3 * night, 0.05, 0.03);
  }

  sync() {
    const v = this.veh;
    this.group.position.set(v.p[0], v.p[1], v.p[2]);
    this.group.quaternion.set(v.q[0], v.q[1], v.q[2], v.q[3]);
    for (let i = 0; i < 4; i++) {
      const w = v.wheels[i], m = this.wheels[i];
      m.position.set(w.lx, v.yDroop + w.comp, w.lz);
      m.rotation.set(w.spin, w.front ? v.steer : 0, 0);
    }
    this.steeringWheel.rotation.z = v.steer * 3.5;
  }

  dispose() {
    this.geos.forEach((g) => g.dispose());
    this.mats.forEach((m) => m.dispose());
  }
}

/** A stationary stand-in for Vehicle4x4 so the model can be shown outside a drive (garage preview). */
export function staticVehicle(P) {
  const hx = P.track / 2, hz = P.wheelbase / 2;
  const sag = (P.mass * 9.81) / (4 * P.springK);
  return {
    p: [0, P.comH, 0], q: [0, 0, 0, 1], steer: 0.25, yDroop: -(P.comH - P.wheelR) - sag,
    wheels: [[hx, hz, true], [-hx, hz, true], [hx, -hz, false], [-hx, -hz, false]].map(([lx, lz, front]) => ({ lx, lz, front, comp: sag, spin: 0 }))
  };
}
