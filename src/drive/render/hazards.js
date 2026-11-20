// Draws the generated obstacle layer: what core/obstacles.js placed and core/hazards.js moves.
// Everything repeated is an InstancedMesh (one draw call per kind); moving bodies are written
// into their instance slots each frame, and only those within DRAW metres of the truck.
import * as THREE from 'three';
import { mergeColored, M } from './geo.js';

const DRAW = 230;
const WIDE = { cow: 1.35, boar: 1.3, elephant: 1.0, horse: 1.05, deer: 0.9, goat: 1.0, monkey: 1.1 };
const WHITE = [1, 1, 1];

export class HazardView {
  /** world: render/world.js World (scene, materials, rock geometry). hazards: core Hazards for this run. */
  constructor(world, hazards) {
    this.world = world;
    this.hz = hazards;
    this.track = world.track;
    this.scene = world.scene;
    this.own = [];                 // geometries / materials to dispose
    this.meshes = [];
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.q2 = new THREE.Quaternion();
    this.v = new THREE.Vector3(); this.sc = new THREE.Vector3(); this.col = new THREE.Color();
    this.up = new THREE.Vector3(0, 1, 0); this.ax = new THREE.Vector3(1, 0, 0); this.n = new THREE.Vector3();
    this.shadows = !!world.q.shadows;
    this._statics();
    this._dynamics();
    this._trees();
    this._birds();
  }

  keep(o) { this.own.push(o); return o; }

  _inst(geo, n, mat, shadow = true) {
    const im = new THREE.InstancedMesh(geo, mat || this.world.propMat, Math.max(1, n));
    im.count = 0; im.frustumCulled = false;
    im.castShadow = shadow && this.shadows; im.receiveShadow = true;
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 3).fill(1), 3);
    this.scene.add(im);
    this.meshes.push(im);
    return im;
  }

  // ------------------------------------------------------------------ statics
  _statics() {
    const tr = this.track, L = tr.layer, env = this.world.env;
    const box = this.keep(mergeColored([{ geo: new THREE.BoxGeometry(1, 1, 1), color: WHITE }]));

    // slabs: stone steps, root ridges, speed bumps
    const slabs = L.obstacles.filter((o) => o.type === 'slab');
    if (slabs.length) {
      const im = this._inst(box, slabs.length);
      const st = env.cliff;
      slabs.forEach((o, i) => {
        const y = tr.heightAt(o.x, o.z);
        this.q.setFromAxisAngle(this.up, Math.atan2(-o.az, o.ax));
        im.setMatrixAt(i, this.m4.compose(this.v.set(o.x, y + o.h / 2 - 0.2, o.z), this.q, this.sc.set(o.len, o.h + 0.4, o.depth)));
        const k = 0.85 + (i % 3) * 0.08;
        if (o.look === 'bump') this.col.setRGB(0.85, 0.66, 0.08);
        else if (o.look === 'root') this.col.setRGB(0.3 * k, 0.21 * k, 0.13 * k);
        else this.col.setRGB(st[0] * k, st[1] * k, st[2] * k);
        im.setColorAt(i, this.col);
      });
      im.count = slabs.length;
    }

    // potholes: dark standing water lying in the bowl
    const holes = L.obstacles.filter((o) => o.type === 'hole');
    if (holes.length) {
      const g = this.keep(mergeColored([{ geo: new THREE.CircleGeometry(1, 14), matrix: M(0, 0, 0, 1, 1, 1, -Math.PI / 2, 0, 0), color: WHITE }]));
      const mat = this.keep(new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.86, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
      const im = this._inst(g, holes.length, mat, false);
      holes.forEach((o, i) => {
        const y = tr.heightAt(o.x, o.z);
        // tilt the puddle to the ground around the hole (sampled just outside its rim)
        const e = o.r + 0.3;
        this.n.set(-(tr.heightAt(o.x + e, o.z) - tr.heightAt(o.x - e, o.z)), 2 * e, -(tr.heightAt(o.x, o.z + e) - tr.heightAt(o.x, o.z - e))).normalize();
        this.q.setFromUnitVectors(this.up, this.n);
        im.setMatrixAt(i, this.m4.compose(this.v.set(o.x, y + 0.035, o.z), this.q, this.sc.set(o.r * 1.02, 1, o.r * 1.02)));
        im.setColorAt(i, this.col.setRGB(0.09, 0.1, 0.11));
      });
      im.count = holes.length; im.renderOrder = 1;
    }

    // cement blocks
    const blocks = L.solids.filter((o) => o.look === 'block');
    if (blocks.length) {
      const g = this.keep(mergeColored([
        { geo: new THREE.BoxGeometry(0.62, 0.8, 1.0), matrix: M(0, 0.4, 0), color: [0.62, 0.62, 0.6] },
        { geo: new THREE.BoxGeometry(0.8, 0.16, 1.02), matrix: M(0, 0.08, 0), color: [0.5, 0.5, 0.48] },
        { geo: new THREE.BoxGeometry(0.64, 0.14, 1.02), matrix: M(0, 0.62, 0), color: [0.8, 0.16, 0.1] }
      ]));
      const barrier = this.world.pack && this.world.pack.geo.road_barrier;
      const im = this._inst(barrier ? this.keep(barrier.clone()) : g, blocks.length);
      blocks.forEach((o, i) => {
        // the pack's barrier is modelled 2 m long across; turn it along the road and size it to one block
        this.q.setFromAxisAngle(this.up, o.rot + (barrier ? Math.PI / 2 : 0));
        im.setMatrixAt(i, this.m4.compose(this.v.set(o.x, tr.heightAt(o.x, o.z) - 0.05, o.z), this.q, barrier ? this.sc.set(0.56, 1.2, 1.6) : this.sc.set(1, 1, 1)));
      });
      im.count = blocks.length;
    }

    // abandoned wrecks
    const wrecks = L.solids.filter((o) => o.look === 'wreck');
    if (wrecks.length) {
      const rust = [0.38, 0.2, 0.11], rust2 = [0.27, 0.15, 0.09], dark = [0.06, 0.06, 0.06];
      const parts = [
        { geo: new THREE.BoxGeometry(1.85, 0.62, 4.3), matrix: M(0, 0.78, 0), color: rust },
        { geo: new THREE.BoxGeometry(1.7, 0.66, 1.9), matrix: M(0, 1.38, -0.25), color: rust2 },
        { geo: new THREE.BoxGeometry(1.5, 0.4, 1.2), matrix: M(0, 1.3, -0.25), color: dark },
        { geo: new THREE.BoxGeometry(1.8, 0.12, 1.5), matrix: M(0.1, 1.22, 1.5, 1, 1, 1, -0.5, 0, 0.05), color: rust2 }   // sprung bonnet
      ];
      for (const [x, z, flat] of [[0.95, 1.4, 0], [-0.95, 1.4, 1], [0.95, -1.4, 0], [-0.95, -1.4, 0]]) {
        parts.push({ geo: new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10), matrix: M(x, flat ? 0.3 : 0.42, z, 1, 1, 1, 0, 0, Math.PI / 2), color: dark });
      }
      const g = this.keep(mergeColored(parts));
      const im = this._inst(g, wrecks.length);
      wrecks.forEach((o, i) => {
        this.q.setFromAxisAngle(this.up, o.rot);
        this.q2.setFromAxisAngle(this.ax, 0.04); this.q.multiply(this.q2);
        im.setMatrixAt(i, this.m4.compose(this.v.set(o.x, tr.heightAt(o.x, o.z) - 0.12, o.z), this.q, this.sc.set(1, 1, 1)));
      });
      im.count = wrecks.length;
    }

    // root plates on the fallen trees that were there from the start
    const trees = L.obstacles.filter((o) => o.type === 'log' && o.tree);
    if (trees.length) {
      const g = this.keep(mergeColored([
        { geo: new THREE.CylinderGeometry(1.25, 1.05, 0.34, 9), matrix: M(0, 0, 0, 1, 1, 1, Math.PI / 2, 0, 0), color: [0.2, 0.14, 0.09] },
        { geo: new THREE.ConeGeometry(0.16, 1.5, 5), matrix: M(0.3, 0.75, 0.9), color: [0.3, 0.21, 0.13] },
        { geo: new THREE.ConeGeometry(0.13, 1.3, 5), matrix: M(-0.5, 0.6, 1.7, 1, 1, 1, 0, 0, 0.5), color: [0.3, 0.21, 0.13] }
      ]));
      const im = this._inst(g, trees.length);
      trees.forEach((o, i) => {
        // the root end is the one further from the road
        const ex = o.x + o.ax * o.len / 2, ez = o.z + o.az * o.len / 2, fx = o.x - o.ax * o.len / 2, fz = o.z - o.az * o.len / 2;
        tr.surfaceAt(ex, ez); const eOn = tr.sq.onRoad;
        const rx = eOn ? fx : ex, rz = eOn ? fz : ez, dir = eOn ? 1 : -1;
        this.q.setFromAxisAngle(this.up, Math.atan2(o.ax * dir, o.az * dir));
        im.setMatrixAt(i, this.m4.compose(this.v.set(rx, tr.heightAt(rx, rz) + o.r * 0.9, rz), this.q, this.sc.set(1, 1, 1)));
      });
      im.count = trees.length;
    }
  }

  // ------------------------------------------------------------------ moving bodies
  _dynamics() {
    const B = this.hz.bodies;
    const count = (f) => B.filter(f).length;
    const g = {};
    g.cone = mergeColored([
      { geo: new THREE.BoxGeometry(0.42, 0.05, 0.42), matrix: M(0, 0.025, 0), color: [0.1, 0.1, 0.1] },
      { geo: new THREE.ConeGeometry(0.17, 0.66, 8), matrix: M(0, 0.38, 0), color: [0.95, 0.36, 0.05] },
      { geo: new THREE.CylinderGeometry(0.105, 0.125, 0.1, 8), matrix: M(0, 0.36, 0), color: [0.95, 0.95, 0.95] }
    ]);
    g.crate = mergeColored([
      { geo: new THREE.BoxGeometry(0.8, 0.74, 0.8), matrix: M(0, 0.4, 0), color: [0.56, 0.4, 0.22] },
      { geo: new THREE.BoxGeometry(0.86, 0.1, 0.86), matrix: M(0, 0.08, 0), color: [0.38, 0.26, 0.14] },
      { geo: new THREE.BoxGeometry(0.86, 0.1, 0.86), matrix: M(0, 0.74, 0), color: [0.38, 0.26, 0.14] }
    ]);
    g.barrel = mergeColored([
      { geo: new THREE.CylinderGeometry(0.31, 0.31, 0.9, 10), matrix: M(0, 0.45, 0), color: WHITE },
      { geo: new THREE.CylinderGeometry(0.33, 0.33, 0.06, 10), matrix: M(0, 0.3, 0), color: [0.5, 0.5, 0.5] },
      { geo: new THREE.CylinderGeometry(0.33, 0.33, 0.06, 10), matrix: M(0, 0.62, 0), color: [0.5, 0.5, 0.5] }
    ]);
    g.branch = mergeColored([
      { geo: new THREE.CylinderGeometry(0.05, 0.07, 1.7, 5), matrix: M(0, 0.09, 0, 1, 1, 1, Math.PI / 2, 0, 0), color: [0.33, 0.23, 0.14] },
      { geo: new THREE.CylinderGeometry(0.03, 0.045, 0.9, 4), matrix: M(0.3, 0.2, 0.25, 1, 1, 1, Math.PI / 2, 0, -0.9), color: [0.33, 0.23, 0.14] },
      { geo: new THREE.CylinderGeometry(0.03, 0.04, 0.7, 4), matrix: M(-0.25, 0.18, -0.3, 1, 1, 1, Math.PI / 2, 0, 0.8), color: [0.3, 0.21, 0.13] },
      { geo: new THREE.IcosahedronGeometry(0.22, 0), matrix: M(0.6, 0.3, 0.45, 1, 0.6, 1), color: [0.2, 0.34, 0.14] }
    ]);
    const leg = (x, z) => ({ geo: new THREE.BoxGeometry(0.09, 0.56, 0.1), matrix: M(x, 0.28, z), color: [0.8, 0.8, 0.8] });
    g.quad = mergeColored([
      { geo: new THREE.BoxGeometry(0.34, 0.38, 0.92), matrix: M(0, 0.73, 0), color: WHITE },
      leg(0.11, 0.36), leg(-0.11, 0.36), leg(0.11, -0.36), leg(-0.11, -0.36),
      { geo: new THREE.BoxGeometry(0.16, 0.34, 0.2), matrix: M(0, 0.95, 0.5, 1, 1, 1, 0.5, 0, 0), color: WHITE },
      { geo: new THREE.BoxGeometry(0.15, 0.17, 0.3), matrix: M(0, 1.07, 0.68), color: [0.85, 0.85, 0.85] },
      { geo: new THREE.BoxGeometry(0.05, 0.22, 0.05), matrix: M(0, 0.78, -0.5, 1, 1, 1, -0.5, 0, 0), color: [0.7, 0.7, 0.7] }
    ]);
    g.elephant = mergeColored([
      { geo: new THREE.BoxGeometry(0.5, 0.5, 0.9), matrix: M(0, 0.7, 0), color: WHITE },
      { geo: new THREE.BoxGeometry(0.15, 0.5, 0.17), matrix: M(0.16, 0.25, 0.32), color: [0.9, 0.9, 0.9] },
      { geo: new THREE.BoxGeometry(0.15, 0.5, 0.17), matrix: M(-0.16, 0.25, 0.32), color: [0.9, 0.9, 0.9] },
      { geo: new THREE.BoxGeometry(0.15, 0.5, 0.17), matrix: M(0.16, 0.25, -0.32), color: [0.9, 0.9, 0.9] },
      { geo: new THREE.BoxGeometry(0.15, 0.5, 0.17), matrix: M(-0.16, 0.25, -0.32), color: [0.9, 0.9, 0.9] },
      { geo: new THREE.BoxGeometry(0.36, 0.36, 0.3), matrix: M(0, 0.82, 0.56), color: WHITE },
      { geo: new THREE.BoxGeometry(0.09, 0.52, 0.1), matrix: M(0, 0.5, 0.74, 1, 1, 1, -0.15, 0, 0), color: [0.9, 0.9, 0.9] },        // trunk
      { geo: new THREE.BoxGeometry(0.34, 0.34, 0.04), matrix: M(0.3, 0.84, 0.48, 1, 1, 1, 0, 0.5, 0), color: [0.85, 0.85, 0.85] },   // ears
      { geo: new THREE.BoxGeometry(0.34, 0.34, 0.04), matrix: M(-0.3, 0.84, 0.48, 1, 1, 1, 0, -0.5, 0), color: [0.85, 0.85, 0.85] },
      { geo: new THREE.ConeGeometry(0.025, 0.24, 5), matrix: M(0.1, 0.62, 0.74, 1, 1, 1, 1.9, 0, 0), color: [1.2, 1.2, 1.1] },       // tusks
      { geo: new THREE.ConeGeometry(0.025, 0.24, 5), matrix: M(-0.1, 0.62, 0.74, 1, 1, 1, 1.9, 0, 0), color: [1.2, 1.2, 1.1] }
    ]);
    // asset-pack tracks: the pack's cone, crate and barrel, and its animals
    const pk = this.world.pack;
    this.pkSize = {};
    if (pk) {
      for (const [k, model] of [['cone', 'traffic_cone'], ['crate', 'crate'], ['barrel', 'barrel']]) if (pk.geo[model]) { g[k].dispose(); g[k] = pk.geo[model].clone(); }
      for (const sp of ['deer', 'cow', 'goat', 'elephant']) if (pk.geo[sp]) { g['pk_' + sp] = pk.geo[sp].clone(); this.pkSize[sp] = pk.size[sp]; }
    }
    for (const k in g) this.keep(g[k]);
    this.im = {
      cone: this._inst(g.cone, count((b) => b.kind === 'cone')),
      crate: this._inst(g.crate, count((b) => b.kind === 'crate')),
      barrel: this._inst(g.barrel, count((b) => b.kind === 'barrel')),
      branch: this._inst(g.branch, count((b) => b.kind === 'branch')),
      rock: this._inst(this.world.rockGeo, count((b) => b.kind === 'rock' || b.kind === 'boulder'), this.world.rockMat),
      quad: this._inst(g.quad, count((b) => b.kind === 'animal' && b.sp !== 'elephant')),
      elephant: this._inst(g.elephant, count((b) => b.sp === 'elephant'))
    };
    for (const sp in this.pkSize) this.im['pk_' + sp] = this._inst(g['pk_' + sp], count((b) => b.sp === sp));
    this.cnt = { cone: 0, crate: 0, barrel: 0, branch: 0, rock: 0, quad: 0, elephant: 0 };
    for (const sp in this.pkSize) this.cnt['pk_' + sp] = 0;
  }

  // ------------------------------------------------------------------ trees that come down
  _trees() {
    const env = this.world.env, tr = this.track;
    this.trees = this.hz.trees.map((t) => {
      const len = t.len, r = t.log.r;
      const parts = [{ geo: new THREE.CylinderGeometry(r * 0.55, r * 1.1, len, 8), matrix: M(0, len / 2, 0), color: env.trunk }];
      const f = env.foliage, f2 = env.foliage2;
      for (let k = 0; k < 4; k++) {
        const y = len * (0.42 + k * 0.13);
        parts.push({ geo: new THREE.ConeGeometry(1.5 - k * 0.24, len * 0.24, 7), matrix: M(0, y, 0), color: k % 2 ? f2 : f, shade: [y - 1, y + 1.5] });
      }
      const mesh = new THREE.Mesh(this.keep(mergeColored(parts)), this.world.propMat);
      mesh.castShadow = this.shadows; mesh.receiveShadow = true;
      const y0 = tr.heightAt(t.base.x, t.base.z);
      mesh.position.set(t.base.x, y0 - 0.2, t.base.z);
      // it falls from its base towards the far end of where the trunk will lie
      let dx = t.log.x - t.base.x, dz = t.log.z - t.base.z;
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      this.scene.add(mesh);
      return { t, mesh, axis: new THREE.Vector3(dz, 0, -dx), y0, r, ang: -1 };
    });
  }

  // ------------------------------------------------------------------ birds
  _birds() {
    const flocks = this.hz.birds;
    const total = flocks.reduce((a, f) => a + f.n, 0);
    this.flocks = [];
    if (!total) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0.12, 0.34, 0.08, -0.1, 0, 0, -0.06, 0, 0, 0.12, 0, 0, -0.06, -0.34, 0.08, -0.1]), 3));
    geo.computeVertexNormals();
    this.keep(geo);
    const mat = this.keep(new THREE.MeshBasicMaterial({ color: 0x1a1a1c, side: THREE.DoubleSide }));
    const im = new THREE.InstancedMesh(geo, mat, total);
    im.frustumCulled = false; im.count = 0;
    this.scene.add(im); this.meshes.push(im);
    this.birdIm = im;
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (const f of flocks) {
      const list = [];
      for (let k = 0; k < f.n; k++) list.push({ ox: (rnd() - 0.5) * 5, oz: (rnd() - 0.5) * 5, a: rnd() * 6.28, sp: 5 + rnd() * 4, ph: rnd() * 6.28 });
      this.flocks.push({ f, list, y: null });
    }
  }

  // ------------------------------------------------------------------ per frame
  update(dt, time, px, pz) {
    const hz = this.hz, cnt = this.cnt, im = this.im;
    for (const k in cnt) cnt[k] = 0;
    for (const b of hz.bodies) {
      if (!b.active) continue;
      if (Math.abs(b.x - px) + Math.abs(b.z - pz) > DRAW) continue;
      if (!b.hasY) hz._ground(b);
      let key = b.kind, y = b.y;
      this.sc.set(1, 1, 1);
      if (b.kind === 'rock' || b.kind === 'boulder') {
        key = 'rock';
        // roll about the horizontal axis across its direction of travel
        this.q.setFromAxisAngle(this.up, b.rot); this.q2.setFromAxisAngle(this.ax, b.spin); this.q.multiply(this.q2);
        this.sc.set(b.r * 1.05, b.r * 0.95, b.r * 1.05);
        y += b.r * 0.72;
      } else if (b.kind === 'animal') {
        key = b.sp === 'elephant' ? 'elephant' : 'quad';
        const S = b.spec, w = WIDE[b.sp] || 1;
        const moving = Math.hypot(b.vx, b.vz);
        this.q.setFromAxisAngle(this.up, b.rot);
        if (moving > 0.2) { this.q2.setFromAxisAngle(this.ax, Math.sin(b.spin * 5) * 0.05); this.q.multiply(this.q2); y += Math.abs(Math.sin(b.spin * 5)) * 0.05 * S.tall; }
        if (this.pkSize[b.sp]) { key = 'pk_' + b.sp; const z = this.pkSize[b.sp]; this.sc.set(S.len / z[2], S.tall / z[1], S.len / z[2]); }
        else if (key === 'elephant') this.sc.set(S.len / 1.5, S.tall / 1.05, S.len / 1.5);
        else this.sc.set((S.len / 1.25) * w, S.tall / 1.16, S.len / 1.25);
      } else {
        this.q.setFromAxisAngle(this.up, b.rot);
        // light things get knocked over once they have been hit
        if (b.kind === 'cone' && (b.awake || b.x !== b.x0)) { this.q2.setFromAxisAngle(this.ax, 1.45); this.q.multiply(this.q2); y += 0.16; }
      }
      const m = im[key], i = cnt[key]++;
      m.setMatrixAt(i, this.m4.compose(this.v.set(b.x, y, b.z), this.q, this.sc));
      if (b.kind === 'animal' && this.pkSize[b.sp]) this.col.setRGB(1, 1, 1);
      else if (b.kind === 'animal') { const c = b.spec.color, k = 0.9 + (b.id % 4) * 0.06; this.col.setRGB(c[0] * k, c[1] * k, c[2] * k); }
      else if (b.kind === 'barrel' && this.world.pack) this.col.setRGB(1, 1, 1);
      else if (b.kind === 'barrel') this.col.setRGB(...(b.id % 3 === 0 ? [0.7, 0.14, 0.1] : b.id % 3 === 1 ? [0.12, 0.3, 0.55] : [0.75, 0.6, 0.1]));
      else if (key === 'rock') { const k = 0.82 + (b.id % 5) * 0.06; this.col.setRGB(k, k, k); }
      else this.col.setRGB(1, 1, 1);
      m.setColorAt(i, this.col);
    }
    for (const k in cnt) {
      const m = im[k];
      m.count = cnt[k];
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
    }
    // trees
    for (const T of this.trees) {
      if (T.ang === T.t.ang) continue;
      T.ang = T.t.ang;
      T.mesh.quaternion.setFromAxisAngle(T.axis, T.ang);
      T.mesh.position.y = T.y0 - 0.2 + (T.r * 0.55 + 0.2) * (T.ang / (Math.PI / 2));
    }
    // birds: pecking on the trail until the truck comes, then away
    if (this.birdIm) {
      let n = 0;
      for (const F of this.flocks) {
        const f = F.f;
        if (Math.abs(f.x - px) + Math.abs(f.z - pz) > DRAW) continue;
        const t = f.up ? hz.t - f.t0 : 0;
        if (t > 9) continue;
        if (F.y === null) F.y = this.track.heightAt(f.x, f.z);
        for (const b of F.list) {
          const flap = f.up ? Math.sin(time * 22 + b.ph) : 0;
          const x = f.x + b.ox + Math.sin(b.a) * b.sp * t, z = f.z + b.oz + Math.cos(b.a) * b.sp * t;
          const y = F.y + 0.12 + (f.up ? t * 3.2 + Math.min(t, 1) * 1.5 : Math.abs(Math.sin(time * 3 + b.ph)) * 0.03);
          this.q.setFromAxisAngle(this.up, b.a);
          this.birdIm.setMatrixAt(n++, this.m4.compose(this.v.set(x, y, z), this.q, this.sc.set(1, f.up ? 1 + flap * 2.5 : 0.3, 1)));
        }
      }
      this.birdIm.count = n;
      this.birdIm.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    for (const m of this.meshes) { this.scene.remove(m); m.dispose(); }
    for (const T of this.trees) this.scene.remove(T.mesh);
    for (const o of this.own) o.dispose();
  }
}
