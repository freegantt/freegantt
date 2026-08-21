import { defineConfig } from 'vite';

export default defineConfig({
  root: 'harness',
  build: {
    outDir: '../dist-harness',
    emptyOutDir: true,
  },
});
