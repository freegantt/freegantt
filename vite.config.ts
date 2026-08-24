import { defineConfig } from 'vite';

export default defineConfig({
  root: 'harness',
  server: {
    host: true,
  },
  build: {
    outDir: '../dist-harness',
    emptyOutDir: true,
  },
});
