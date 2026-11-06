import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Target ES2018 so the bundle runs on the Oculus Go browser (Chromium 6x-8x era)
// and older Android WebViews used by VR Box / Cardboard viewers.
export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@game': fileURLToPath(new URL('./supabase/functions/_shared/game', import.meta.url)),
    },
  },
  build: {
    target: 'es2018',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1500,
  },
  esbuild: { target: 'es2018' },
  optimizeDeps: { esbuildOptions: { target: 'es2018' } },
  server: { host: true, port: 5173 },
});
