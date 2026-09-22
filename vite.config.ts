import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// `root: 'harness'` with no explicit input list makes `pnpm build` emit only harness/index.html —
// every other demo page would silently never see a production build (plans/s1.11-close-the-gate/
// README.md D-S1.11-5). Every demo page goes in the input map. The e2e fixture pages under
// `harness/e2e/` stay out on purpose: the dev server serves them to Playwright, and the demo build
// never ships them.
const page = (name: string): string => fileURLToPath(new URL(`harness/${name}`, import.meta.url));

export default defineConfig({
  root: 'harness',
  server: {
    host: true,
  },
  resolve: {
    alias: {
      // S5.6, [S5-A2]: same alias as tsconfig.json's own "paths" entry — see that file's comment.
      // A published `freegantt` package resolves this specifier through its own `exports` map
      // (dist/api/index.js); this points at the same public entry, unbuilt, so the harness dev
      // server and `pnpm build` both work with no separate lib build step first.
      freegantt: fileURLToPath(new URL('./src/api/index.ts', import.meta.url)),
    },
  },
  build: {
    outDir: '../dist-harness',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: page('index.html'),
        generic: page('generic.html'),
        'editing-and-data': page('editing-and-data.html'),
        'hierarchy-and-timeline': page('hierarchy-and-timeline.html'),
        performance: page('performance.html'),
      },
    },
  },
});
