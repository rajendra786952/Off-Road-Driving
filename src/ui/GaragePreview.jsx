// Live 3D vehicle preview (Three.js) for the garage and the home screen.
// Shows the real drive model built from the real physics parameters, so a lift
// kit visibly raises the truck, tyre choice changes the tread, a winch appears
// on the bumper. Drag to orbit; it idles in a slow turn.
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CarModel, staticVehicle } from '../drive/render/carModel.js';
import { buildParams } from '../drive/core/specs.js';
import { getVehicle } from '../game/config/vehicles.js';

export default function GaragePreview({ vehicleId, ups, gear, tire, interactive = true, locked = false }) {
  const host = useRef(null);
  const st = useRef(null);
  const key = `${vehicleId}|${JSON.stringify(ups)}|${JSON.stringify(gear)}|${tire}|${locked}`;

  // renderer + scene: once per mount
  useEffect(() => {
    const el = host.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const envRT = pm.fromScene(room, 0.04);
    scene.environment = envRT.texture;
    pm.dispose();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    const key = new THREE.DirectionalLight(0xfff1dc, 2.4);
    key.position.set(4, 7, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 });
    const rimL = new THREE.DirectionalLight(0x7fb6ff, 1.2);
    rimL.position.set(-5, 3, -4);
    scene.add(key, rimL, new THREE.HemisphereLight(0xffffff, 0x1a2228, 0.5));
    // turntable
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.8, 0.14, 48), new THREE.MeshStandardMaterial({ color: 0x141b21, roughness: 0.55, metalness: 0.4 }));
    disc.position.y = -0.07;
    disc.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.62, 0.03, 6, 64), new THREE.MeshBasicMaterial({ color: 0xffb020 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.01;
    scene.add(disc, ring);
    const pivot = new THREE.Group();
    scene.add(pivot);

    const s = { renderer, scene, camera, pivot, car: null, yaw: 0.7, pitch: 0.22, vel: 0.25, drag: false, lx: 0, ly: 0, raf: 0, alive: true, envRT, disc, ring, dist: 9 };
    st.current = s;
    const resize = () => {
      const w = el.clientWidth || 300, h = el.clientHeight || 200;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = w / h;
      s.dist = w / h < 1.2 ? 12.5 : 9;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    let last = performance.now();
    const loop = (t) => {
      if (!s.alive) return;
      s.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      if (!s.drag) { s.yaw += s.vel * dt; s.vel += (0.25 - s.vel) * Math.min(1, dt * 1.5); }
      camera.position.set(Math.sin(s.yaw) * Math.cos(s.pitch) * s.dist, 1.0 + Math.sin(s.pitch) * s.dist, Math.cos(s.yaw) * Math.cos(s.pitch) * s.dist);
      camera.lookAt(0, 0.9, 0);
      if (s.car) { for (const w of s.car.veh.wheels) w.spin += dt * 0.6; s.car.sync(); }
      renderer.render(scene, camera);
    };
    s.renderOnce = () => { const a = s.alive; s.alive = false; s.alive = a; last = performance.now() - 16; cancelAnimationFrame(s.raf); loop(performance.now()); };
    s.raf = requestAnimationFrame(loop);
    const dom = renderer.domElement;
    const down = (e) => { if (!interactive) return; s.drag = true; s.lx = e.clientX; s.ly = e.clientY; dom.setPointerCapture && dom.setPointerCapture(e.pointerId); };
    const move = (e) => {
      if (!s.drag) return;
      const dx = e.clientX - s.lx, dy = e.clientY - s.ly;
      s.lx = e.clientX; s.ly = e.clientY;
      s.yaw -= dx * 0.009; s.vel = -dx * 0.25;
      s.pitch = Math.max(0.03, Math.min(0.9, s.pitch + dy * 0.006));
    };
    const up = () => { s.drag = false; };
    dom.addEventListener('pointerdown', down);
    dom.addEventListener('pointermove', move);
    dom.addEventListener('pointerup', up);
    dom.addEventListener('pointercancel', up);
    dom.style.touchAction = 'none';
    return () => {
      s.alive = false;
      cancelAnimationFrame(s.raf);
      ro.disconnect();
      if (s.car) s.car.dispose();
      disc.geometry.dispose(); disc.material.dispose(); ring.geometry.dispose(); ring.material.dispose();
      envRT.dispose();
      room.dispose && room.dispose();
      renderer.dispose();
      renderer.forceContextLoss && renderer.forceContextLoss();
      dom.remove();
    };
  }, []);

  // (re)build the model whenever the vehicle or its setup changes
  useEffect(() => {
    const s = st.current;
    if (!s) return;
    if (s.car) { s.pivot.remove(s.car.group); s.car.dispose(); }
    const spec = getVehicle(vehicleId);
    const P = buildParams(vehicleId, ups, { ...gear, tire });
    const car = new CarModel(spec, P, staticVehicle(P), { pbr: true });
    car.setLights(0.6, false);
    s.pivot.add(car.group);
    car.sync();
    s.car = car;
    s.renderOnce();
    window.__preview = s;
  }, [key]);

  return <div ref={host} className={`preview3d${locked ? ' locked' : ''}`} />;
}
