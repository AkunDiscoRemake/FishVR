import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Target ES2018 so the bundle runs on the Oculus Go browser (Chromium 6x-8x era)
// and older Android WebViews used by VR Box / Cardboard viewers.
export default defineConfig(({ mode }) => ({
  base: './',
  // WebXR needs a secure context: `npm run dev:https` serves a self-signed HTTPS dev
  // server reachable from a headset on the same Wi-Fi.
  plugins: mode === 'https' ? [basicSsl()] : [],
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
}));
