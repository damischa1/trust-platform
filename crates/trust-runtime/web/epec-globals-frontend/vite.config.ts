import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  base: '/epec/',
  build: {
    outDir: resolve(__dirname, '../../src/web/ui'),
    emptyOutDir: false,
    sourcemap: false,
    target: 'es2020',
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
      output: {
        entryFileNames: 'epec.js',
        chunkFileNames: 'epec-[name].js',
        assetFileNames: (info) => {
          if (info.name?.endsWith('.css')) return 'epec.css';
          return info.name ?? 'asset';
        },
        inlineDynamicImports: false,
      },
    },
  },
});
