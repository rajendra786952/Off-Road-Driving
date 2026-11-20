# Trail Torque Balanced Asset Pack

This pack contains original procedural starter assets for a React + Three.js off-road game.

## Contents
- GLB: off-road jeep (wheels are separate named meshes), buildings, trees, rocks, bridges, props, landmarks, and simple static animal placeholders.
- Ground colour maps and generated tangent-space normal maps at 1024x1024.
- Water colour/foam and normal textures at 1024x1024.
- Building facade texture.
- Two 2K Radiance HDR environment maps: tropical day and sunset.

## Important quality note
These are lightweight procedural starter assets, not photogrammetry or AAA production models. The animal models are static placeholders and do not include walk animations. Use them as blockout/placeholder assets or replace individual models with licensed production assets as needed.

## Three.js integration
```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

const gltfLoader = new GLTFLoader();
const jeep = await gltfLoader.loadAsync('/assets/models/vehicles/offroad_jeep.glb');
scene.add(jeep.scene);

// The jeep has named wheel meshes such as wheel_L_front and wheel_R_rear.
// Find them with:
const wheels = {};
jeep.scene.traverse((obj) => {
  if (obj.isMesh && obj.name.startsWith('wheel_')) wheels[obj.name] = obj;
});

const hdr = await new RGBELoader().loadAsync('/assets/environments/tropical_day_2k.hdr');
hdr.mapping = THREE.EquirectangularReflectionMapping;
scene.environment = hdr;
scene.background = hdr;
```

## Scale and orientation
- Models use approximate metres and Z-up modelling coordinates. Three.js projects commonly use Y-up; rotate the imported model root by `-Math.PI / 2` around X if your project expects Y-up, and verify wheel axes before applying physics.
- Vehicle forward direction is negative Y in the source asset.
- Apply your own physics colliders; GLB visual meshes are not a substitute for a tuned collision model.
- Ground normal maps should be loaded with `texture.colorSpace = THREE.NoColorSpace`.
- Colour textures should use `THREE.SRGBColorSpace`.

## Mobile performance
Use the low-poly GLBs as a starting point, enable shadows selectively, instance repeated trees/rocks, and load distant map areas using chunks/LOD.
