// Procedural low-poly 4x4 models (jeep / pickup / buggy) driven by the physics state.
import * as THREE from 'three';
import { mergeColored, M } from './geo.js';

const rgb = (hex, k = 1) => [((hex >> 16) & 255) / 255 * k, ((hex >> 8) & 255) / 255 * k, (hex & 255) / 255 * k];

export class CarModel {
  /** @param spec entry of VEHICLES (colors, type)  @param P physics params  @param veh Vehicle4x4 */
  constructor(spec, P, veh) {
    this.veh = veh;
    this.P = P;
    this.group = new THREE.Group();
    this.geos = [];
    this.mats = [];
    const main = rgb(spec.colors.main), dark = rgb(spec.colors.dark), acc = rgb(spec.colors.accent), glass = rgb(spec.colors.glass, 0.55);
    const black = [0.07, 0.07, 0.08], grey = [0.32, 0.33, 0.35];
    const { w, l, h } = P.body;
    const yb = -(P.comH - P.clearance);
    const parts = [];
    const box = (sx, sy, sz, x, y, z, color, rx = 0) => parts.push({ geo: new THREE.BoxGeometry(sx, sy, sz), matrix: M(x, y, z, 1, 1, 1, rx), color });
    const lowH = h * 0.48;
    // frame + skid plate
    box(w * 0.7, 0.12, l * 0.9, 0, yb + 0.06, 0, black);
    if (spec.type === 'jeep') {
      box(w, lowH, l * 0.96, 0, yb + 0.12 + lowH / 2, 0, main);
      box(w * 0.86, 0.1, l * 0.3, 0, yb + 0.12 + lowH + 0.05, l * 0.31, dark);                 // hood top
      box(w * 0.94, h * 0.5, l * 0.52, 0, yb + 0.12 + lowH + h * 0.25, -l * 0.15, main);       // cabin
      box(w * 0.96, h * 0.3, l * 0.46, 0, yb + 0.12 + lowH + h * 0.26, -l * 0.15, glass);      // side glass band
      box(w * 0.86, h * 0.34, 0.06, 0, yb + 0.12 + lowH + h * 0.25, l * 0.115, glass, -0.18);  // windscreen
      box(w * 0.96, 0.08, l * 0.54, 0, yb + 0.12 + lowH + h * 0.52, -l * 0.15, dark);          // roof
      box(w * 0.8, 0.06, l * 0.4, 0, yb + 0.12 + lowH + h * 0.6, -l * 0.15, black);            // rack
      parts.push({ geo: new THREE.CylinderGeometry(P.wheelR * 0.95, P.wheelR * 0.95, 0.24, 10), matrix: M(0, yb + 0.12 + lowH * 0.9, -l * 0.5 - 0.12, 1, 1, 1, Math.PI / 2), color: black }); // spare
    } else if (spec.type === 'pickup') {
      box(w, lowH, l * 0.96, 0, yb + 0.12 + lowH / 2, 0, main);
      box(w * 0.88, 0.1, l * 0.26, 0, yb + 0.12 + lowH + 0.05, l * 0.34, dark);
      box(w * 0.94, h * 0.5, l * 0.3, 0, yb + 0.12 + lowH + h * 0.25, l * 0.06, main);
      box(w * 0.96, h * 0.28, l * 0.26, 0, yb + 0.12 + lowH + h * 0.27, l * 0.06, glass);
      box(w * 0.86, h * 0.34, 0.06, 0, yb + 0.12 + lowH + h * 0.25, l * 0.215, glass, -0.2);
      box(w * 0.96, 0.08, l * 0.32, 0, yb + 0.12 + lowH + h * 0.52, l * 0.06, dark);
      for (const sx of [-1, 1]) box(0.08, h * 0.22, l * 0.38, sx * (w / 2 - 0.04), yb + 0.12 + lowH + h * 0.11, -l * 0.28, main); // bed sides
      box(w, h * 0.22, 0.08, 0, yb + 0.12 + lowH + h * 0.11, -l * 0.47, main);
      box(w * 0.5, 0.5, 0.08, 0, yb + 0.12 + lowH + h * 0.4, -l * 0.1, black);                 // headache rack
    } else {
      box(w * 0.82, lowH * 0.8, l * 0.9, 0, yb + 0.12 + lowH * 0.4, 0, main);
      box(w * 0.6, 0.1, l * 0.3, 0, yb + 0.12 + lowH * 0.85, l * 0.3, dark, 0.12);
      for (const sx of [-1, 1]) {
        box(0.07, h * 0.85, 0.07, sx * w * 0.36, yb + 0.12 + lowH * 0.8 + h * 0.42, l * 0.12, black, -0.3);
        box(0.07, h * 0.85, 0.07, sx * w * 0.36, yb + 0.12 + lowH * 0.8 + h * 0.42, -l * 0.3, black, 0.25);
        box(0.07, 0.07, l * 0.42, sx * w * 0.36, yb + 0.12 + lowH * 0.8 + h * 0.84, -l * 0.09, black);
      }
      box(w * 0.74, 0.07, 0.07, 0, yb + 0.12 + lowH * 0.8 + h * 0.84, l * 0.1, black);
      box(w * 0.74, 0.07, 0.07, 0, yb + 0.12 + lowH * 0.8 + h * 0.84, -l * 0.28, black);
      box(w * 0.5, 0.45, 0.5, 0, yb + 0.12 + lowH * 0.8 + 0.25, -l * 0.38, grey);              // engine
      box(w * 0.4, 0.5, 0.1, 0, yb + 0.12 + lowH * 0.8 + 0.3, -l * 0.02, dark);                // seat back
    }
    // bumpers, lights, flares
    box(w * 1.02, 0.18, 0.16, 0, yb + 0.3, l / 2, black);
    box(w * 1.02, 0.18, 0.16, 0, yb + 0.3, -l / 2, black);
    box(0.3, 0.14, 0.22, 0, yb + 0.33, l / 2 + 0.14, grey);                                    // winch
    for (const sx of [-1, 1]) {
      box(0.24, 0.16, 0.06, sx * w * 0.34, yb + 0.12 + lowH * 0.72, l * 0.48 + 0.02, [1, 0.96, 0.8]);
      box(0.2, 0.12, 0.06, sx * w * 0.36, yb + 0.12 + lowH * 0.7, -l * 0.48 - 0.02, [0.8, 0.08, 0.06]);
      for (const sz of [-1, 1]) box(0.14, 0.08, P.wheelR * 2.5, sx * (w / 2 + 0.04), yb + 0.12 + lowH * 0.82, sz * P.wheelbase / 2, black);
    }
    box(w * 0.5, 0.05, 0.02, 0, yb + 0.12 + lowH * 0.5, l * 0.48 + 0.02, acc);
    const bodyGeo = mergeColored(parts);
    this.geos.push(bodyGeo);
    const lam = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mats.push(lam);
    this.body = new THREE.Mesh(bodyGeo, lam);
    this.body.castShadow = true;
    this.group.add(this.body);

    // wheel (axis along X)
    const R = P.wheelR, ww = 0.3;
    const wparts = [
      { geo: new THREE.CylinderGeometry(R, R, ww, 14), matrix: M(0, 0, 0, 1, 1, 1, 0, 0, Math.PI / 2), color: [0.06, 0.06, 0.065] },
      { geo: new THREE.CylinderGeometry(R * 0.58, R * 0.58, ww + 0.02, 10), matrix: M(0, 0, 0, 1, 1, 1, 0, 0, Math.PI / 2), color: [0.55, 0.56, 0.58] }
    ];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      wparts.push({ geo: new THREE.BoxGeometry(ww + 0.03, 0.07, 0.16), matrix: M(0, Math.cos(a) * R, Math.sin(a) * R, 1, 1, 1, a), color: [0.1, 0.1, 0.1] });
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      wparts.push({ geo: new THREE.BoxGeometry(ww + 0.04, 0.06, R * 0.5), matrix: M(0, Math.cos(a) * R * 0.3, Math.sin(a) * R * 0.3, 1, 1, 1, a), color: [0.3, 0.3, 0.32] });
    }
    const wheelGeo = mergeColored(wparts);
    this.geos.push(wheelGeo);
    this.wheels = veh.wheels.map(() => {
      const m = new THREE.Mesh(wheelGeo, lam);
      m.castShadow = true;
      m.rotation.order = 'YXZ';
      this.group.add(m);
      return m;
    });

    // minimal cockpit shown only in the interior camera
    const cparts = [];
    const cbox = (sx, sy, sz, x, y, z, color, rx = 0, rz = 0) => cparts.push({ geo: new THREE.BoxGeometry(sx, sy, sz), matrix: M(x, y, z, 1, 1, 1, rx, 0, rz), color });
    const dashY = yb + 0.12 + lowH + 0.08;
    cbox(w * 0.9, 0.2, 0.3, 0, dashY, l * 0.1, [0.12, 0.12, 0.13]);
    cbox(w * 0.86, 0.06, l * 0.32, 0, dashY - 0.05, l * 0.31, main);
    for (const sx of [-1, 1]) cbox(0.07, h * 0.6, 0.07, sx * w * 0.44, dashY + h * 0.28, l * 0.1, dark, -0.22);
    cbox(w * 0.9, 0.07, 0.1, 0, dashY + h * 0.56, l * 0.04, dark);
    const cg = mergeColored(cparts);
    this.geos.push(cg);
    this.cockpit = new THREE.Mesh(cg, lam);
    this.cockpit.visible = false;
    this.group.add(this.cockpit);
    const sw = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 6, 14), new THREE.MeshLambertMaterial({ color: 0x151515 }));
    this.geos.push(sw.geometry); this.mats.push(sw.material);
    sw.position.set(0.38, dashY + 0.16, l * 0.1 - 0.22);
    sw.rotation.x = -0.35;
    sw.visible = false;
    this.steeringWheel = sw;
    this.group.add(sw);
    this.eye = new THREE.Vector3(0.38, dashY + 0.42, l * 0.1 - 0.62);
    this.hoodEye = new THREE.Vector3(0, dashY + 0.5, l * 0.16);
  }

  setInterior(on) {
    this.body.visible = !on;
    this.cockpit.visible = on;
    this.steeringWheel.visible = on;
  }

  sync() {
    const v = this.veh, P = this.P;
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
