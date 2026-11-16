import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base is required so the bundle loads inside the Capacitor WebView.
  base: './',
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: { manualChunks: { phaser: ['phaser'] } }
    }
  },
  server: { port: 5173 }
});
