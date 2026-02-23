import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// EPEC Globals — standalone React app.
// Development: `npm run dev`  (proxies API calls to trust-runtime at localhost:8080)
// Production:  `npm run build` → serve the `dist/` folder statically, then point
//              the app at the correct runtime URL via the VITE_RUNTIME_BASE env var.

const runtimeBase = process.env.VITE_RUNTIME_BASE ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api/epec': {
        target: runtimeBase,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
  },
});
