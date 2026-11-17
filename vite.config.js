import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative base is required so the bundle loads inside the Capacitor WebView.
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: { manualChunks: { phaser: ['phaser'], three: ['three'], react: ['react', 'react-dom'] } }
    }
  },
  server: { port: 5173 }
});
