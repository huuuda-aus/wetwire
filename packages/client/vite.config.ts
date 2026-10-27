import { defineConfig } from 'vite';

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  build: { target: 'es2023', chunkSizeWarningLimit: 900 },
  server: { port: 5173 },
});
