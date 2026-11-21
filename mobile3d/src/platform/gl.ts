// Three.js on a native GL surface (expo-gl). Three expects a browser <canvas>; on a phone it
// gets the GL context of a GLView plus a small stand-in object for the canvas.
import * as THREE from 'three';
import { Platform } from 'react-native';
import type { ExpoWebGLRenderingContext } from 'expo-gl';

export type GL = ExpoWebGLRenderingContext;

const patched = new WeakSet<object>();

/**
 * Can this device draw into half-float textures? The soft image-based lighting needs it; phones
 * that cannot do it fall back to plain sky + sun lighting. Call before the renderer is created.
 */
export function supportsHalfFloatTargets(gl: GL): boolean {
  try {
    gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('EXT_color_buffer_half_float');
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 4, 4, 0, gl.RGBA, gl.HALF_FLOAT, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(tex);
    while (gl.getError() !== gl.NO_ERROR) {
      // clear anything the probe left behind
    }
    return ok;
  } catch {
    return false;
  }
}

export function createRenderer(gl: GL): THREE.WebGLRenderer {
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  let canvas: unknown = (gl as unknown as { canvas?: unknown }).canvas;
  if (Platform.OS !== 'web') {
    if (!patched.has(gl)) {
      patched.add(gl);
      // expo-gl only knows the flip-Y pixel-store flag and logs a warning for every other one
      const pixelStorei = gl.pixelStorei.bind(gl);
      gl.pixelStorei = ((name: number, value: number) => {
        if (name === gl.UNPACK_FLIP_Y_WEBGL) pixelStorei(name, value);
      }) as typeof gl.pixelStorei;
    }
    canvas = {
      width: w, height: h, clientWidth: w, clientHeight: h, style: {},
      addEventListener() {}, removeEventListener() {},
      getContext: () => gl,
    };
  }
  const renderer = new THREE.WebGLRenderer({ canvas: canvas as HTMLCanvasElement, context: gl as unknown as WebGL2RenderingContext, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  // reading the shader log back after every compile is slow on phones; keep it for development
  renderer.debug.checkShaderErrors = __DEV__;
  return renderer;
}

/** Hand the finished frame to the screen (a no-op in the browser). */
export function present(gl: GL): void {
  gl.endFrameEXP();
}
