import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// `root: 'harness'` with no explicit input list makes `pnpm build` emit only harness/index.html —
// scroll-sync.html, zoom.html and large-dataset.html would silently never see a production build
// (plans/s1.11-close-the-gate/README.md D-S1.11-5). Every harness page goes in the input map.
const page = (name: string): string => fileURLToPath(new URL(`harness/${name}`, import.meta.url));

export default defineConfig({
  root: 'harness',
  server: {
    host: true,
  },
  build: {
    outDir: '../dist-harness',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: page('index.html'),
        'scroll-sync': page('scroll-sync.html'),
        zoom: page('zoom.html'),
        'large-dataset': page('large-dataset.html'),
        data: page('data.html'),
        editing: page('editing.html'),
        hierarchy: page('hierarchy.html'),
        plugins: page('plugins.html'),
        // Static architecture pages under harness/docs/ — without an input entry, `pnpm build`
        // would drop them the same way D-S1.11-5 caught the missing demo HTML files.
        'docs-index': page('docs/index.html'),
        'docs-layers': page('docs/layers.html'),
        'docs-files': page('docs/files.html'),
        'docs-lifecycle': page('docs/lifecycle.html'),
        'docs-classes': page('docs/classes.html'),
        'docs-timeline': page('docs/timeline.html'),
        'docs-diagram': page('docs/diagram.html'),
        'docs-maintaining': page('docs/maintaining.html'),
      },
    },
  },
});
