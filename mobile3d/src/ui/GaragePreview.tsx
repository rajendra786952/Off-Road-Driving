// Live 3D vehicle preview for the garage and the home screen. It shows the real drive model
// built from the real physics parameters, so a lift kit visibly raises the truck, tyre choice
// changes the tread and a winch appears on the bumper. Drag to orbit; it idles in a slow turn.
import React, { useEffect, useMemo, useRef } from 'react';
import { PanResponder, Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import GLSurface from './GLSurface';
import { createRenderer, present, supportsHalfFloatTargets, type GL } from '../platform/gl';
import { CarModel, staticVehicle } from '../drive/render/carModel.js';
import { buildParams } from '../drive/core/specs.js';
import { getVehicle, paintSpec } from '../game/config/vehicles.js';

interface Props {
  vehicleId: string;
  ups: Record<string, number>;
  gear: Record<string, boolean>;
  tire: string;
  paint?: string;
  locked?: boolean;
  style?: StyleProp<ViewStyle>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Stage {
  gl: GL; renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; pivot: THREE.Group;
  car: any; yaw: number; pitch: number; vel: number; drag: boolean; raf: number; alive: boolean; dist: number; dispose(): void;
}

export default function GaragePreview({ vehicleId, ups, gear, tire, paint = 'stock', locked = false, style }: Props) {
  const st = useRef<Stage | null>(null);
  const setup = useRef({ vehicleId, ups, gear, tire, paint });
  setup.current = { vehicleId, ups, gear, tire, paint };
  const key = `${vehicleId}|${JSON.stringify(ups)}|${JSON.stringify(gear)}|${tire}|${paint}`;

  const buildCar = () => {
    const s = st.current;
    if (!s) return;
    const c = setup.current;
    if (s.car) { s.pivot.remove(s.car.group); s.car.dispose(); }
    const spec = paintSpec(getVehicle(c.vehicleId), c.paint);
    const P = buildParams(c.vehicleId, c.ups, { ...c.gear, tire: c.tire });
    const car = new CarModel(spec, P, staticVehicle(P), { pbr: true });
    car.setLights(0.6, false);
    s.pivot.add(car.group);
    car.sync();
    s.car = car;
  };

  const onContext = (gl: GL, w: number, h: number) => {
    const floatOk = supportsHalfFloatTargets(gl);
    const renderer = createRenderer(gl);
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.setClearColor(0x0d151b, 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const scene = new THREE.Scene();
    let envRT: THREE.WebGLRenderTarget | null = null;
    if (floatOk) {
      const pm = new THREE.PMREMGenerator(renderer);
      const room = new RoomEnvironment();
      envRT = pm.fromScene(room, 0.04);
      scene.environment = envRT.texture;
      pm.dispose();
      room.dispose();
    }
    const camera = new THREE.PerspectiveCamera(34, w / h, 0.1, 100);
    const keyLight = new THREE.DirectionalLight(0xfff1dc, 2.4);
    keyLight.position.set(4, 7, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    Object.assign(keyLight.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 });
    const rim = new THREE.DirectionalLight(0x7fb6ff, 1.2);
    rim.position.set(-5, 3, -4);
    // without the studio environment the fill light carries the shading
    scene.add(keyLight, rim, new THREE.HemisphereLight(0xffffff, 0x1a2228, floatOk ? 0.5 : 1.6));
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.8, 0.14, 48), new THREE.MeshStandardMaterial({ color: 0x141b21, roughness: 0.55, metalness: 0.4 }));
    disc.position.y = -0.07;
    disc.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.62, 0.03, 6, 64), new THREE.MeshBasicMaterial({ color: 0xffb020 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.01;
    const pivot = new THREE.Group();
    scene.add(disc, ring, pivot);

    const s: Stage = {
      gl, renderer, scene, camera, pivot, car: null, yaw: 0.7, pitch: 0.22, vel: 0.25, drag: false, raf: 0, alive: true, dist: w / h < 1.2 ? 12.5 : 9,
      dispose() {
        s.alive = false;
        cancelAnimationFrame(s.raf);
        if (s.car) s.car.dispose();
        disc.geometry.dispose(); (disc.material as THREE.Material).dispose();
        ring.geometry.dispose(); (ring.material as THREE.Material).dispose();
        envRT?.dispose();
        renderer.dispose();
      },
    };
    st.current = s;
    buildCar();
    let last = performance.now();
    const loop = (t: number) => {
      if (!s.alive) return;
      s.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      if (!s.drag) { s.yaw += s.vel * dt; s.vel += (0.25 - s.vel) * Math.min(1, dt * 1.5); }
      camera.position.set(Math.sin(s.yaw) * Math.cos(s.pitch) * s.dist, 1.0 + Math.sin(s.pitch) * s.dist, Math.cos(s.yaw) * Math.cos(s.pitch) * s.dist);
      camera.lookAt(0, 0.9, 0);
      if (s.car) { for (const wh of s.car.veh.wheels) wh.spin += dt * 0.6; s.car.sync(); }
      renderer.render(scene, camera);
      present(gl);
    };
    s.raf = requestAnimationFrame(loop);
    if (__DEV__) (globalThis as any).__preview = s;
  };

  // rebuild the model whenever the vehicle or its setup changes
  useEffect(buildCar, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { st.current?.dispose(); st.current = null; }, []);

  const pan = useMemo(() => {
    let lx = 0, ly = 0;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => { const s = st.current; if (s) s.drag = true; lx = e.nativeEvent.pageX; ly = e.nativeEvent.pageY; },
      onPanResponderMove: (e) => {
        const s = st.current;
        if (!s) return;
        const dx = e.nativeEvent.pageX - lx, dy = e.nativeEvent.pageY - ly;
        lx = e.nativeEvent.pageX; ly = e.nativeEvent.pageY;
        s.yaw -= dx * 0.009; s.vel = -dx * 0.25;
        s.pitch = Math.max(0.03, Math.min(0.9, s.pitch + dy * 0.006));
      },
      onPanResponderRelease: () => { if (st.current) st.current.drag = false; },
      onPanResponderTerminate: () => { if (st.current) st.current.drag = false; },
    });
  }, []);

  return (
    <View style={[{ flex: 1, borderRadius: 14, overflow: 'hidden', opacity: locked ? 0.55 : 1 }, style]} {...pan.panHandlers}>
      <GLSurface
        pixelRatio={Platform.OS === 'web' ? 2 : 1.5}
        onContext={onContext}
        onResize={(w, h) => {
          const s = st.current;
          if (!s) return;
          s.renderer.setSize(s.gl.drawingBufferWidth, s.gl.drawingBufferHeight, false);
          s.camera.aspect = w / h;
          s.dist = w / h < 1.2 ? 12.5 : 9;
          s.camera.updateProjectionMatrix();
        }}
      />
    </View>
  );
}
