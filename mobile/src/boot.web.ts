// Browser build: Skia runs as WebAssembly (CanvasKit) and must be loaded before
// any module that touches the Skia API is evaluated.
import '@expo/metro-runtime';
import { registerRootComponent } from 'expo';
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

LoadSkiaWeb({ locateFile: (file: string) => `/${file}` }).then(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  registerRootComponent(require('../App').default);
});
