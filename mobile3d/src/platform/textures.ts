// Bundled game assets: raw pixel files (see scripts/bake-assets.mjs) and the asset-pack models.
//
// Files are read into memory first (preload) so the renderer can build textures synchronously,
// exactly where the browser version used to draw on a canvas. No image is ever decoded on the
// phone: every texture is uploaded from plain bytes, the one path every GL driver handles.
import * as THREE from 'three';
import { Asset } from 'expo-asset';
import { Platform } from 'react-native';
import { MODEL_FILES, RAW_FILES, RAW_INFO } from './assetIndex';

const cache = new Map<string, ArrayBuffer>();
const pending = new Map<string, Promise<void>>();

async function readModule(mod: number): Promise<ArrayBuffer> {
  const asset = Asset.fromModule(mod);
  if (Platform.OS === 'web') {
    const res = await fetch(asset.uri);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.arrayBuffer();
  }
  if (!asset.localUri) await asset.downloadAsync();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { File } = require('expo-file-system') as typeof import('expo-file-system');
  return new File(asset.localUri ?? asset.uri).arrayBuffer();
}

function moduleOf(key: string): number | undefined {
  return key.startsWith('model:') ? MODEL_FILES[key.slice(6)] : RAW_FILES[key];
}

/** Read the given assets into memory. Keys are raw texture names or "model:<name>". A missing file is skipped. */
export function preload(keys: string[], onProgress?: (fraction: number) => void): Promise<void> {
  let done = 0;
  const one = (key: string): Promise<void> => {
    if (cache.has(key)) return Promise.resolve();
    let p = pending.get(key);
    if (!p) {
      const mod = moduleOf(key);
      p = (mod === undefined ? Promise.reject(new Error('not in the bundle')) : readModule(mod))
        .then((buf) => {
          cache.set(key, buf);
        })
        .catch((e) => console.warn(`Asset ${key} did not load:`, e))
        .finally(() => pending.delete(key)) as Promise<void>;
      pending.set(key, p);
    }
    return p;
  };
  return Promise.all(
    keys.map((k) =>
      one(k).then(() => {
        done++;
        onProgress?.(done / keys.length);
      }),
    ),
  ).then(() => undefined);
}

/** Drop the file bytes once the textures have been built (the GPU has its own copy). */
export function releaseAssets(): void {
  cache.clear();
}

export function hasAsset(key: string): boolean {
  return cache.has(key);
}

export function modelBytes(name: string): ArrayBuffer | null {
  return cache.get('model:' + name) ?? null;
}

export const MODEL_NAMES = Object.keys(MODEL_FILES);

export interface RawOptions {
  srgb?: boolean;
  /** Tiles (default) or clamps to the edge. */
  repeat?: boolean;
  anisotropy?: number;
}

function finish<T extends THREE.Texture>(t: T, o: RawOptions): T {
  t.colorSpace = o.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = o.repeat === false ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  if (o.anisotropy) t.anisotropy = o.anisotropy;
  t.needsUpdate = true;
  return t;
}

/** A texture made from pixel bytes (RGBA, rows bottom-up). */
export function pixelTexture(data: Uint8Array<ArrayBuffer>, w: number, h: number, o: RawOptions = {}): THREE.DataTexture {
  return finish(new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType), o);
}

/** A preloaded raw texture. If the file is missing the result is a plain mid-grey tile, never a crash. */
export function rawTexture(key: string, o: RawOptions = {}): THREE.DataTexture {
  const buf = cache.get(key), info = RAW_INFO[key];
  if (!buf || !info) {
    console.warn(`Texture ${key} was not preloaded`);
    return pixelTexture(new Uint8Array([150, 150, 150, 255]), 1, 1, o);
  }
  return pixelTexture(new Uint8Array(buf), info.w, info.h, o);
}

/** A preloaded stack of layers as a texture array, or null if the file is missing. */
export function rawTextureArray(key: string, o: RawOptions = {}): THREE.DataArrayTexture | null {
  const buf = cache.get(key), info = RAW_INFO[key];
  if (!buf || !info || !info.layers) return null;
  const t = new THREE.DataArrayTexture(new Uint8Array(buf), info.w, info.h, info.layers);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  return finish(t, o);
}
