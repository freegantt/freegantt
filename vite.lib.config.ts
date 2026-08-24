import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

// Library build (#42): emits dist/api/index.js + dist/api/index.d.ts, the two paths package.json's
// sealed `exports` map points at. Separate from vite.config.ts, which builds the harness — `pnpm
// build` runs both (see package.json), so `dist/` and `dist-harness/` are never confused with each
// other and `npm pack` publishes a package whose only export path was actually produced.
export default defineConfig({
  plugins: [
    dts({
      // Emits one .d.ts per source module — dist/api/index.d.ts re-exports from dist/model,
      // dist/time, etc. by relative path, same as the source does. Those internal .d.ts files exist
      // on disk but are not importable: package.json's `exports` map names only ".", and Node
      // enforces that at resolution time regardless of what files happen to exist under dist/
      // (plans/01 §1: internals unreachable). A single flat-bundled index.d.ts (rollupTypes, needing
      // @microsoft/api-extractor) is plans/04 §2's S2 scope, alongside the API report — not S0.
      insertTypesEntry: true,
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: 'src/api/index.ts',
      formats: ['es'],
      fileName: () => 'api/index.js',
    },
    rollupOptions: {
      // plans/04 §1's two runtime dependencies stay external rather than bundled: a consumer
      // installs them once via freegantt's own package.json dependencies, instead of freegantt
      // shipping a second private copy inside its bundle.
      external: ['alien-signals', 'temporal-polyfill', /^temporal-polyfill\//],
    },
  },
});
