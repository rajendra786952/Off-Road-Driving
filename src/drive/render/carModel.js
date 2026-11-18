// Procedural 4x4 models (jeep / pickup / buggy / monster truck) driven by the physics state.
// No model files: every body is an extruded, bevelled side profile with real wheel-arch
// cut-outs, a glass greenhouse with pillars and roof, fender flares, lathe-turned tyres and
// dished rims, lamps, bars and trim. Shaded physically (clear-coated paint, rubber, glass,
// chrome, emissive lamps) and lit by the scene's environment map.
// Used by the drive scene and by the garage's interactive 3D preview.
import * as THREE from 'three';
import { mergeColored, M } from './geo.js';

// paint colours are authored in sRGB; vertex colours are linear, so convert (keeps the paint saturated)
const lin = (v) => Math.pow(v / 255, 2.2);
const rgb = (hex, k = 1) => [lin((hex >> 16) & 255) * k, lin((hex >> 8) & 255) * k, lin(hex & 255) * k];
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

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
    const keepM = (m) => { this.mats.push(m); return m; };
    const std = (o) => keepM(pbr ? new THREE.MeshStandardMaterial(o) : new THREE.MeshLambertMaterial({ vertexColors: !!o.vertexColors, ...(o.color !== undefined ? { color: o.color } : {}), ...(o.transparent ? { transparent: true, opacity: o.opacity } : {}) }));
    // clear-coated metallic paint
    const paintM = keepM(pbr
      ? new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.32, roughness: 0.34, clearcoat: 0.7, clearcoatRoughness: 0.18, envMapIntensity: 0.85 })
      : new THREE.MeshLambertMaterial({ vertexColors: true }));
    const trimM = std({ vertexColors: true, metalness: 0.1, roughness: 0.82, envMapIntensity: 0.4 });
    this.paintM = paintM;
    this.trimM = trimM;
    this.dirt = 0;
    const glassM = std({ color: 0x16242c, metalness: 0.5, roughness: 0.05, transparent: true, opacity: 0.78, envMapIntensity: 2.0 });
    const chromeM = std({ vertexColors: true, metalness: 0.95, roughness: 0.2, envMapIntensity: 1.35 });
    this.headM = keepM(new THREE.MeshBasicMaterial({ color: 0xfff3cf }));
    this.tailM = keepM(new THREE.MeshBasicMaterial({ color: 0xb01008 }));

    const main = rgb(spec.colors.main), dark = rgb(spec.colors.dark), acc = rgb(spec.colors.accent);
    const black = [0.045, 0.045, 0.05], grey = [0.3, 0.31, 0.33], steel = [0.72, 0.74, 0.78], amber = [0.95, 0.55, 0.08];
    const { w, l, h } = P.body;
    const type = spec.type;
    const yb = -(P.comH - P.clearance);          // belly
    const hz = P.wheelbase / 2, R = P.wheelR;
    const G = { paint: [], trim: [], glass: [], chrome: [], head: [], tail: [] };
    const box = (g, sx, sy, sz, x, y, z, color, rx = 0, ry = 0, rz = 0) => G[g].push({ geo: new THREE.BoxGeometry(sx, sy, sz), matrix: M(x, y, z, 1, 1, 1, rx, ry, rz), color: color || [1, 1, 1] });
    const cyl = (g, r1, r2, len, x, y, z, color, rx = 0, rz = 0, seg = 10) => G[g].push({ geo: new THREE.CylinderGeometry(r1, r2, len, seg), matrix: M(x, y, z, 1, 1, 1, rx, 0, rz), color: color || [1, 1, 1] });
    /** Tube between two points (roll cages, bars, links). */
    const tube = (g, a, b, r, color, seg = 6) => {
      const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const len = d.length();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      G[g].push({ geo: new THREE.CylinderGeometry(r, r, len, seg), matrix: new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new THREE.Vector3(1, 1, 1)), color: color || [1, 1, 1] });
    };
    /** Side profile [[z, y], ...] extruded across the car, centred on x, with bevelled edges. */
    const ext = (g, pts, width, color, x = 0, bevel = 0.035) => {
      const shape = new THREE.Shape(pts.map(([pz, py]) => new THREE.Vector2(-pz, py)));
      const depth = Math.max(0.01, width - 2 * bevel);
      const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelOffset: -bevel, bevelThickness: bevel, bevelSegments: 2, steps: 1, curveSegments: 1 });
      G[g].push({ geo, matrix: M(x - depth / 2, 0, 0, 1, 1, 1, 0, Math.PI / 2, 0), color: color || [1, 1, 1] });
    };

    // ---- proportions
    const wc = -(P.comH - R);                    // wheel-centre height at rest
    const Ra = R * 1.2 + 0.035;                  // wheel-arch radius
    const lowH = h * (type === 'buggy' ? 0.5 : 0.56);
    let y0 = yb + 0.12;                          // floor of the body shell
    // big wheels need the body lifted clear of the arches (monster truck)
    y0 += Math.max(0, wc + Ra + 0.1 - (y0 + lowH));
    const T = y0 + lowH;                         // beltline
    const zF = l * 0.49, zR = -l * 0.49;
    const bw = type === 'buggy' ? w * 0.74 : w;  // shell width

    /** Lower body: flat floor with two wheel-arch cut-outs, `top` = roofline points from rear to front. */
    const lowerBody = (top, width, color) => {
      const pts = [];
      const arch = (cz) => {
        const a0 = Math.asin(Math.max(-1, Math.min(1, (y0 - wc) / Ra)));
        for (let k = 0; k <= 8; k++) { const a = a0 + (Math.PI - 2 * a0) * (k / 8); pts.push([cz + Ra * Math.cos(a), wc + Ra * Math.sin(a)]); }
      };
      pts.push([zF - 0.03, y0]);
      if (zF > hz + Ra + 0.04) arch(hz);
      if (zR < -hz - Ra - 0.04) arch(-hz);
      pts.push([zR + 0.03, y0]);
      for (const p of top) pts.push(p);
      ext('paint', pts, width, color, 0, 0.045);
    };
    /** Glass greenhouse + painted roof and pillars between z = cR .. cF. */
    const cabin = (cR, cF, ch, o = {}) => {
      const rake = o.rake ?? 0.34, back = o.back ?? 0.06, gw = bw * 0.86, top = T + ch;
      ext('glass', [[cR, T - 0.02], [cR + back, top - 0.02], [cF - rake, top - 0.02], [cF, T - 0.02]], gw, null, 0, 0.02);
      // roof skin
      ext('paint', [[cR + back - 0.05, top - 0.03], [cR + back - 0.03, top + 0.035], [cF - rake + 0.02, top + 0.035], [cF - rake + 0.08, top - 0.03]], bw * 0.9, o.roof || main, 0, 0.03);
      for (const sx of [-1, 1]) {
        const x = sx * gw / 2;
        tube('paint', [x, T - 0.02, cF - 0.01], [x, top, cF - rake], 0.045, main, 5);               // A pillar
        tube('paint', [x, T - 0.02, cR + 0.01], [x, top, cR + back], 0.055, main, 5);               // rear pillar
        for (const pz of o.pillars || [(cR + cF) / 2 - 0.1]) box('paint', 0.05, ch, 0.09, x, T + ch / 2 - 0.02, pz, main);
        box('trim', 0.03, 0.03, cF - cR - rake * 0.4, x * 1.005, T + 0.0, (cR + cF) / 2 - rake * 0.2, black);   // belt trim
        // mirror
        box('trim', 0.2, 0.13, 0.07, sx * (bw / 2 + 0.11), T + ch * 0.28, cF - rake * 0.55, black);
        box('trim', 0.12, 0.03, 0.04, sx * (bw / 2 + 0.03), T + ch * 0.2, cF - rake * 0.5, black);
      }
      return top;
    };

    // ---- chassis: ladder frame, skid plates, axles, diffs, shocks, exhaust
    box('trim', w * 0.6, 0.09, l * 0.86, 0, yb + 0.05, 0, black);
    for (const sx of [-1, 1]) box('trim', 0.1, 0.15, l * 0.88, sx * w * 0.29, yb + 0.16, 0, black);
    const axY = wc + 0.02;
    for (const sz of [-1, 1]) {
      cyl('trim', 0.075, 0.075, P.track - 0.1, 0, axY, sz * hz, grey, 0, Math.PI / 2, 8);
      G.trim.push({ geo: new THREE.SphereGeometry(0.19, 10, 8), matrix: M(0.14, axY, sz * hz, 1, 0.95, 1.1), color: grey });
      for (const sx of [-1, 1]) {
        tube('chrome', [sx * (P.track / 2 - 0.26), axY + 0.06, sz * hz + 0.1], [sx * (w * 0.3), y0 + 0.16, sz * hz + 0.2], 0.04, [0.9, 0.72, 0.1]);      // shock
        tube('trim', [sx * (P.track / 2 - 0.3), axY, sz * hz], [sx * w * 0.24, yb + 0.16, sz * (hz - 0.75)], 0.035, grey);                               // trailing link
      }
    }
    tube('chrome', [-w * 0.24, yb + 0.1, -l * 0.1], [-w * 0.3, yb + 0.12, zR - 0.02], 0.04, steel);                                                       // exhaust
    box('chrome', w * 0.56, 0.03, 0.5, 0, y0 - 0.02, zF - 0.32, steel, 0.25);                                                                              // front skid plate

    let roofY = T;                 // top of the body (for the light bar / cameras)
    let cabF = l * 0.1, cabCh = h * 0.44;
    if (type === 'jeep') {
      const hood = T - 0.05;
      lowerBody([[zR, y0 + 0.1], [zR, T - 0.02], [zR + 0.04, T], [l * 0.12, T], [l * 0.14, hood], [zF - 0.1, hood - 0.02], [zF - 0.01, hood - 0.1], [zF, y0 + 0.14]], w, main);
      cabF = l * 0.13; cabCh = h * 0.47;
      roofY = cabin(-l * 0.44, cabF, cabCh, { rake: 0.2, back: 0.03, roof: dark, pillars: [-l * 0.03, -l * 0.25] });
      // hood: raised centre, vents, latches
      ext('paint', [[l * 0.16, hood - 0.01], [l * 0.17, hood + 0.04], [zF - 0.16, hood + 0.03], [zF - 0.12, hood - 0.02]], w * 0.56, main, 0, 0.02);
      for (const sx of [-1, 1]) box('trim', 0.2, 0.02, 0.36, sx * w * 0.36, hood + 0.005, l * 0.3, black);
      // seven-slot grille between round lamps
      box('trim', w * 0.52, lowH * 0.46, 0.04, 0, y0 + lowH * 0.62, zF + 0.005, black);
      for (let i = 0; i < 7; i++) box('paint', 0.045, lowH * 0.4, 0.03, (i - 3) * 0.1, y0 + lowH * 0.62, zF + 0.02, main);
      for (const sx of [-1, 1]) {
        cyl('chrome', 0.135, 0.135, 0.05, sx * w * 0.36, y0 + lowH * 0.66, zF + 0.01, steel, Math.PI / 2, 0, 14);
        cyl('head', 0.11, 0.11, 0.06, sx * w * 0.36, y0 + lowH * 0.66, zF + 0.012, null, Math.PI / 2, 0, 14);
        box('head', 0.09, 0.05, 0.03, sx * w * 0.36, y0 + lowH * 0.36, zF + 0.01, amber);                       // indicator
        box('tail', 0.1, 0.2, 0.05, sx * w * 0.42, y0 + lowH * 0.62, zR - 0.01);
      }
      // roof rack with cross bars, snorkel, rear-mounted spare
      for (const sx of [-1, 1]) tube('trim', [sx * w * 0.38, roofY + 0.12, -l * 0.4], [sx * w * 0.38, roofY + 0.12, l * 0.0], 0.025, black);
      for (let i = 0; i < 5; i++) tube('trim', [-w * 0.38, roofY + 0.12, -l * 0.4 + i * l * 0.1], [w * 0.38, roofY + 0.12, -l * 0.4 + i * l * 0.1], 0.02, black);
      for (const sx of [-1, 1]) for (const pz of [-l * 0.4, 0]) tube('trim', [sx * w * 0.38, roofY + 0.03, pz], [sx * w * 0.38, roofY + 0.12, pz], 0.02, black);
      tube('trim', [w * 0.47, T - 0.1, l * 0.2], [w * 0.47, roofY - 0.02, l * 0.12], 0.045, black);
      cyl('trim', 0.07, 0.07, 0.12, w * 0.47, roofY + 0.02, l * 0.12, black, Math.PI / 2, 0, 8);
      cyl('trim', R * 0.95, R * 0.95, 0.26, 0.1, y0 + lowH * 0.72, zR - 0.15, black, Math.PI / 2, 0, 16);
      cyl('chrome', R * 0.52, R * 0.52, 0.27, 0.1, y0 + lowH * 0.72, zR - 0.155, steel, Math.PI / 2, 0, 12);
    } else if (type === 'pickup' || type === 'monster') {
      const hood = T - 0.03;
      lowerBody([[zR, y0 + 0.1], [zR, T], [l * 0.2, T], [l * 0.23, hood + 0.02], [zF - 0.14, hood - 0.03], [zF - 0.01, hood - 0.14], [zF, y0 + 0.16]], w, main);
      cabF = l * 0.2; cabCh = h * 0.46;
      const cabR = -l * 0.1;
      roofY = cabin(cabR, cabF, cabCh, { rake: 0.42, back: 0.08, pillars: [l * 0.04] });
      // open bed: liner, rails, tailgate lettering strip
      box('trim', w * 0.84, 0.05, cabR - zR - 0.16, 0, T + 0.005, (cabR + zR) / 2 - 0.02, black);
      for (const sx of [-1, 1]) box('trim', 0.07, 0.05, cabR - zR - 0.1, sx * (w / 2 - 0.06), T + 0.03, (cabR + zR) / 2, black);
      box('chrome', w * 0.5, 0.06, 0.02, 0, y0 + lowH * 0.7, zR - 0.01, acc);
      // hood power bulge + vents
      ext('paint', [[l * 0.25, hood], [l * 0.27, hood + 0.06], [zF - 0.2, hood + 0.03], [zF - 0.15, hood - 0.03]], w * 0.5, main, 0, 0.025);
      for (const sx of [-1, 1]) box('trim', 0.16, 0.02, 0.3, sx * w * 0.16, hood + 0.05, l * 0.32, black);
      // wide grille with bars, slim LED lamps, amber markers
      box('trim', w * 0.6, lowH * 0.5, 0.05, 0, y0 + lowH * 0.58, zF + 0.005, black);
      for (let i = 0; i < 4; i++) box('chrome', w * 0.56, 0.03, 0.03, 0, y0 + lowH * (0.42 + i * 0.11), zF + 0.03, steel);
      for (const sx of [-1, 1]) {
        box('head', w * 0.17, 0.09, 0.05, sx * w * 0.4, y0 + lowH * 0.72, zF + 0.005);
        box('head', w * 0.17, 0.025, 0.05, sx * w * 0.4, y0 + lowH * 0.6, zF + 0.008, amber);
        box('tail', 0.09, lowH * 0.42, 0.05, sx * (w / 2 - 0.06), y0 + lowH * 0.66, zR - 0.01);
      }
      for (let i = -1; i <= 1; i++) box('head', 0.07, 0.035, 0.03, i * 0.13, y0 + lowH * 0.9, zF + 0.012, amber);      // grille marker lamps
      // sports bar behind the cab with a lamp pod
      for (const sx of [-1, 1]) {
        tube('trim', [sx * w * 0.4, T, cabR - 0.08], [sx * w * 0.36, roofY + 0.06, cabR - 0.3], 0.045, black);
        tube('trim', [sx * w * 0.4, T, cabR - 0.75], [sx * w * 0.36, roofY + 0.06, cabR - 0.3], 0.04, black);
      }
      tube('trim', [-w * 0.36, roofY + 0.06, cabR - 0.3], [w * 0.36, roofY + 0.06, cabR - 0.3], 0.045, black);
      for (let i = -1; i <= 1; i += 2) cyl('head', 0.09, 0.09, 0.06, i * w * 0.18, roofY + 0.16, cabR - 0.28, null, Math.PI / 2, 0, 10);
      if (type === 'monster') {
        // exposed tube chassis tying the lifted body to the axles, plus long-travel coil-overs
        for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
          tube('chrome', [sx * w * 0.34, y0 + 0.05, sz * (hz - 0.9)], [sx * (P.track / 2 - 0.34), axY + 0.05, sz * hz], 0.05, acc);
          tube('chrome', [sx * w * 0.34, y0 + 0.05, sz * (hz + 0.45)], [sx * (P.track / 2 - 0.34), axY + 0.05, sz * hz], 0.05, acc);
          tube('chrome', [sx * w * 0.3, y0 + 0.3, sz * hz], [sx * (P.track / 2 - 0.5), axY + 0.1, sz * hz], 0.075, [0.85, 0.1, 0.08], 8);
        }
        for (const sx of [-1, 1]) tube('chrome', [sx * w * 0.34, y0 + 0.05, -hz + 0.9], [sx * w * 0.34, y0 + 0.05, hz - 0.9], 0.05, acc);
      }
    } else {
      // buggy: low pointed tub, exposed cage, rear engine and wing
      const nose = y0 + lowH * 0.42;
      lowerBody([[zR + 0.2, y0 + 0.1], [zR + 0.25, T - 0.06], [-l * 0.1, T], [l * 0.12, T - 0.02], [zF - 0.2, nose + 0.06], [zF - 0.02, nose - 0.06], [zF, y0 + 0.1]], bw, main);
      ext('paint', [[l * 0.14, T - 0.03], [l * 0.16, T + 0.03], [zF - 0.3, nose + 0.1], [zF - 0.26, nose + 0.04]], bw * 0.5, acc, 0, 0.02);           // nose stripe
      for (const sx of [-1, 1]) ext('paint', [[-l * 0.3, y0 + 0.02], [-l * 0.3, T - 0.12], [l * 0.1, T - 0.16], [l * 0.16, y0 + 0.02]], 0.2, dark, sx * (bw / 2 + 0.08), 0.04);   // side pods
      cabF = l * 0.12; cabCh = h * 0.92;
      roofY = T + cabCh;
      const cx = bw * 0.47, cR = -l * 0.3;
      for (const sx of [-1, 1]) {
        tube('trim', [sx * cx, T - 0.05, cabF + 0.1], [sx * cx * 0.9, roofY, cabF - 0.5], 0.045, black, 8);     // A hoop
        tube('trim', [sx * cx, T - 0.05, cR + 0.25], [sx * cx * 0.9, roofY, cR + 0.42], 0.045, black, 8);        // main hoop
        tube('trim', [sx * cx * 0.9, roofY, cabF - 0.5], [sx * cx * 0.9, roofY, cR + 0.42], 0.045, black, 8);
        tube('trim', [sx * cx * 0.9, roofY, cR + 0.42], [sx * cx * 0.8, T + 0.05, zR + 0.35], 0.04, black);      // rear stay
        tube('trim', [sx * cx, T + 0.02, cabF + 0.05], [sx * cx * 0.95, T + cabCh * 0.45, cR + 0.3], 0.03, black);  // door bar
      }
      tube('trim', [-cx * 0.9, roofY, cabF - 0.5], [cx * 0.9, roofY, cabF - 0.5], 0.045, black, 8);
      tube('trim', [-cx * 0.9, roofY, cR + 0.42], [cx * 0.9, roofY, cR + 0.42], 0.045, black, 8);
      tube('trim', [-cx * 0.9, roofY, cR + 0.42], [cx * 0.9, T, cR + 0.3], 0.03, black);                        // diagonal
      box('trim', bw * 0.84, 0.03, cabF - 0.5 - (cR + 0.42), 0, roofY + 0.03, (cabF - 0.5 + cR + 0.42) / 2, dark);   // roof panel
      for (const sx of [-1, 1]) {                                                                                 // bucket seats
        box('trim', bw * 0.3, 0.12, 0.5, sx * bw * 0.22, T - 0.02, -l * 0.04, black);
        box('trim', bw * 0.3, 0.62, 0.12, sx * bw * 0.22, T + 0.3, -l * 0.13, dark, -0.18);
      }
      box('chrome', bw * 0.6, 0.4, 0.6, 0, T + 0.1, zR + 0.55, steel);                                           // engine
      for (const sx of [-1, 1]) tube('chrome', [sx * 0.18, T + 0.2, zR + 0.35], [sx * 0.24, T + 0.5, zR + 0.05], 0.05, steel, 8);
      box('paint', bw * 1.15, 0.04, 0.42, 0, T + 0.62, zR + 0.2, main, 0.12);                                    // wing
      for (const sx of [-1, 1]) { box('paint', 0.04, 0.3, 0.44, sx * bw * 0.575, T + 0.6, zR + 0.2, dark); tube('trim', [sx * bw * 0.3, T + 0.2, zR + 0.4], [sx * bw * 0.3, T + 0.6, zR + 0.22], 0.025, black); }
      for (const sx of [-1, 1]) {
        cyl('head', 0.1, 0.1, 0.06, sx * bw * 0.3, nose + 0.02, zF - 0.02, null, Math.PI / 2, 0, 12);
        box('tail', 0.16, 0.07, 0.05, sx * bw * 0.3, T - 0.12, zR + 0.2);
      }
    }

    // ---- common trim: bumpers, flares, steps, door lines, plates, hooks, winch
    const bump = y0 + 0.1;
    const fw = type === 'buggy' ? bw * 0.9 : w * 1.02;
    ext('trim', [[zF - 0.04, bump - 0.11], [zF - 0.04, bump + 0.1], [zF + 0.13, bump + 0.06], [zF + 0.15, bump - 0.07]], fw, black, 0, 0.03);
    ext('trim', [[zR + 0.04, bump - 0.11], [zR + 0.04, bump + 0.1], [zR - 0.11, bump + 0.06], [zR - 0.13, bump - 0.07]], fw, black, 0, 0.03);
    if (type !== 'buggy') {
      // bull bar hoop over the grille
      for (const sx of [-1, 1]) tube('trim', [sx * w * 0.24, bump, zF + 0.14], [sx * w * 0.22, y0 + lowH * 0.92, zF + 0.1], 0.035, black);
      tube('trim', [-w * 0.22, y0 + lowH * 0.92, zF + 0.1], [w * 0.22, y0 + lowH * 0.92, zF + 0.1], 0.035, black);
      box('chrome', 0.34, 0.11, 0.01, 0, bump, zF + 0.15, [0.92, 0.92, 0.9]);        // plates
      box('chrome', 0.34, 0.11, 0.01, 0, bump, zR - 0.135, [0.92, 0.92, 0.9]);
      for (const sx of [-1, 1]) {
        box('trim', 0.012, lowH * 0.72, 0.012, sx * (w / 2 + 0.002), y0 + lowH * 0.58, cabF + 0.02, black);     // door shut lines
        box('trim', 0.012, lowH * 0.72, 0.012, sx * (w / 2 + 0.002), y0 + lowH * 0.58, cabF - 1.0, black);
        box('chrome', 0.02, 0.03, 0.13, sx * (w / 2 + 0.006), T - 0.12, cabF - 0.82, steel);                     // handle
        ext('trim', [[-hz + Ra + 0.05, y0 - 0.04], [-hz + Ra + 0.05, y0 + 0.02], [hz - Ra - 0.05, y0 + 0.02], [hz - Ra - 0.05, y0 - 0.04]], 0.2, black, sx * (w / 2 + 0.05), 0.02);   // side step
        box('trim', 0.03, 0.26, 0.02, sx * (P.track / 2), wc + 0.02, -hz - Ra + 0.02, black);                    // mud flap
      }
      tube('trim', [w * 0.3, roofY, cabF - 0.7], [w * 0.32, roofY + 0.7, cabF - 0.85], 0.008, black, 4);        // aerial
    }
    for (const sx of [-1, 1]) {
      cyl('chrome', 0.03, 0.03, 0.18, sx * fw * 0.3, bump - 0.06, zF + 0.16, [0.85, 0.1, 0.08], Math.PI / 2, 0, 6);   // tow hooks
      // fender flares follow the wheel arches
      for (const sz of [-1, 1]) {
        const fl = new THREE.TorusGeometry(Ra + 0.015, 0.042, 6, 14, Math.PI);
        G.trim.push({ geo: fl, matrix: M(sx * (bw / 2 + 0.01), wc, sz * hz, 1.5, 1, 1, 0, Math.PI / 2, 0), color: black });
      }
    }
    if (P.winch) {
      cyl('chrome', 0.085, 0.085, 0.3, 0, bump + 0.1, zF + 0.1, steel, 0, Math.PI / 2, 10);
      box('trim', 0.42, 0.05, 0.2, 0, bump + 0.01, zF + 0.1, black);
      cyl('chrome', 0.03, 0.03, 0.05, 0.1, bump + 0.02, zF + 0.17, [0.85, 0.1, 0.08], Math.PI / 2, 0, 6);
    }
    // roof light bar
    if (type !== 'buggy') {
      box('trim', bw * 0.62, 0.07, 0.09, 0, roofY + (type === 'jeep' ? 0.2 : 0.09), cabF - (type === 'jeep' ? 0.22 : 0.5), black);
      for (let i = -2; i <= 2; i++) box('head', bw * 0.1, 0.05, 0.03, i * bw * 0.115, roofY + (type === 'jeep' ? 0.2 : 0.09), cabF - (type === 'jeep' ? 0.22 : 0.5) + 0.05);
    } else {
      for (let i = -1; i <= 1; i++) cyl('head', 0.08, 0.08, 0.05, i * bw * 0.26, roofY + 0.1, cabF - 0.46, null, Math.PI / 2, 0, 10);
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

    // ---- wheel (axis along X): lathe-turned tyre with rounded shoulders and tread lugs, dished alloy rim
    const ww = Math.max(0.28, Math.min(0.5, R * 0.72)), hw2 = ww / 2;
    const lathe = (pts, seg) => new THREE.LatheGeometry(pts.map(([r, x]) => new THREE.Vector2(r, x)), seg);
    const tyreProfile = [[R * 0.6, -hw2 * 0.86], [R * 0.82, -hw2], [R * 0.95, -hw2 * 0.9], [R, -hw2 * 0.62], [R, hw2 * 0.62], [R * 0.95, hw2 * 0.9], [R * 0.82, hw2], [R * 0.6, hw2 * 0.86]];
    const rubber = [0.04, 0.04, 0.045];
    const tyre = [{ geo: lathe(tyreProfile, 22), matrix: M(0, 0, 0, 1, 1, 1, 0, 0, Math.PI / 2), color: rubber }];
    const lugs = P.tire === 'mud' ? 12 : P.tire === 'rock' ? 14 : P.tire === 'snow' ? 20 : 16;
    const lugL = P.tire === 'mud' ? 0.6 : 0.44;
    for (let i = 0; i < lugs; i++) {
      const a = (i / lugs) * Math.PI * 2;
      // staggered shoulder lugs + a centre rib block
      const side = i % 2 ? 1 : -1;
      tyre.push({ geo: new THREE.BoxGeometry(ww * lugL, 0.036, (Math.PI * 2 * R / lugs) * 0.55), matrix: M(side * ww * (0.46 - lugL / 2), Math.cos(a) * (R + 0.004), Math.sin(a) * (R + 0.004), 1, 1, 1, a), color: [0.065, 0.065, 0.07] });
      if (P.tire !== 'mud') tyre.push({ geo: new THREE.BoxGeometry(ww * 0.2, 0.03, (Math.PI * 2 * R / lugs) * 0.5), matrix: M(0, Math.cos(a + 0.2) * (R + 0.003), Math.sin(a + 0.2) * (R + 0.003), 1, 1, 1, a + 0.2), color: [0.06, 0.06, 0.065] });
    }
    const rimC = type === 'buggy' ? [0.12, 0.12, 0.13] : [0.66, 0.68, 0.71];
    const rimProfile = [[R * 0.62, -hw2 * 0.9], [R * 0.64, -hw2 * 0.5], [R * 0.5, -hw2 * 0.25], [R * 0.2, -hw2 * 0.12], [R * 0.2, hw2 * 0.12], [R * 0.5, hw2 * 0.25], [R * 0.64, hw2 * 0.5], [R * 0.62, hw2 * 0.9]];
    const rim = [{ geo: lathe(rimProfile, 18), matrix: M(0, 0, 0, 1, 1, 1, 0, 0, Math.PI / 2), color: rimC }];
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        rim.push({ geo: new THREE.BoxGeometry(0.035, R * 0.44, R * 0.15), matrix: M(sx * hw2 * 0.3, Math.cos(a) * R * 0.38, Math.sin(a) * R * 0.38, 1, 1, 1, a), color: mul(rimC, 0.8) });
        rim.push({ geo: new THREE.CylinderGeometry(0.018, 0.018, 0.03, 5), matrix: M(sx * hw2 * 0.34, Math.cos(a + 0.63) * R * 0.14, Math.sin(a + 0.63) * R * 0.14, 1, 1, 1, 0, 0, Math.PI / 2), color: steel });
      }
      rim.push({ geo: new THREE.CylinderGeometry(R * 0.11, R * 0.11, 0.05, 10), matrix: M(sx * hw2 * 0.36, 0, 0, 1, 1, 1, 0, 0, Math.PI / 2), color: acc });
      rim.push({ geo: new THREE.CylinderGeometry(R * 0.46, R * 0.46, 0.02, 14), matrix: M(sx * hw2 * 0.05, 0, 0, 1, 1, 1, 0, 0, Math.PI / 2), color: [0.2, 0.2, 0.22] });   // brake disc
    }
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

    // ---- cockpit shown only in the interior camera: dash, binnacle, hood, pillars, header
    const cparts = [];
    const cbox = (sx, sy, sz, x, y, z, color, rx = 0) => cparts.push({ geo: new THREE.BoxGeometry(sx, sy, sz), matrix: M(x, y, z, 1, 1, 1, rx), color });
    const dashY = T + 0.06, dz = cabF - 0.3;
    cbox(bw * 0.9, 0.2, 0.32, 0, dashY, dz, [0.09, 0.09, 0.1]);
    cbox(0.34, 0.12, 0.05, 0.38 * (bw / 1.72), dashY + 0.14, dz - 0.13, [0.02, 0.02, 0.02], -0.3);
    cbox(bw * 0.86, 0.05, zF - cabF, 0, dashY - 0.06, (zF + cabF) / 2, main);
    for (const sx of [-1, 1]) cbox(0.07, cabCh * 1.1, 0.07, sx * bw * 0.43, dashY + cabCh * 0.5, dz + 0.05, dark, -0.3);
    cbox(bw * 0.9, 0.07, 0.1, 0, dashY + cabCh * 0.95, dz - 0.12, dark);
    const cg = mergeColored(cparts);
    this.geos.push(cg);
    this.cockpit = new THREE.Mesh(cg, trimM);
    this.cockpit.visible = false;
    this.group.add(this.cockpit);
    const ex = 0.38 * (bw / 1.72);
    const sw = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 6, 16), trimM);
    this.geos.push(sw.geometry);
    sw.position.set(ex, dashY + 0.16, dz - 0.22);
    sw.rotation.x = -0.35;
    sw.visible = false;
    this.steeringWheel = sw;
    this.group.add(sw);
    this.eye = new THREE.Vector3(ex, dashY + Math.min(0.42, cabCh * 0.8), dz - 0.62);
    this.hoodEye = new THREE.Vector3(0, dashY + 0.5, cabF + 0.25);
    this.lampPos = new THREE.Vector3(0, y0 + lowH * 0.66, zF);

    this._dirtShown = -1;
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

  /** Mud and dirt accumulation: caking on rough/mud trails, washing off in rivers. */
  updateDirt(delta, inWater) {
    if (inWater) {
      this.dirt = Math.max(0, this.dirt - delta * 0.45);
    } else if (delta > 0) {
      this.dirt = Math.min(1, this.dirt + delta * 0.06);
    }
    // materials only need touching when the dirt level has visibly changed
    if (Math.abs(this.dirt - this._dirtShown) < 0.01) return;
    this._dirtShown = this.dirt;
    const m = this.paintM;
    if (m && m.isMeshStandardMaterial) {
      m.roughness = 0.34 + this.dirt * 0.58;
      m.metalness = Math.max(0.04, 0.32 - this.dirt * 0.28);
      if (m.isMeshPhysicalMaterial) m.clearcoat = 0.7 * (1 - this.dirt);
    }
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
    this.disposed = true;
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
