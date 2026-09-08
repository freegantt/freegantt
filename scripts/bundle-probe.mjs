#!/usr/bin/env node
// D-S5-28 (plans/s5-extensibility-and-editing/s5.13-gallery-and-gate.md §1): "unused features are
// absent from a consumer bundle" ([S5-A6]) is a claim about what a third party's bundler produces, so
// this probe builds a fixture the way a third party would — against `dist/api/index.js`, never a path
// inside `src/` — and checks the result for the one string each built-in cannot hide: its plugin `id`.
//
// A `size-limit` budget alone would not catch a single accidental import dragging in a built-in
// unnoticed under a budget with headroom to spare; this probe alone would not catch slow growth no
// single import causes. `.size-limit.json` carries the second half.

import { build } from 'vite';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distEntry = path.join(root, 'dist/api/index.js');

if (!existsSync(distEntry)) {
  console.error('bundle-probe: dist/api/index.js is missing. Run `pnpm build` first.');
  process.exit(1);
}

// Each built-in already carries one string nothing else in the bundle writes: its own plugin `id`
// (extensions/features/tooltips.ts, context-menu.ts, inline-editing.ts).
const BUILT_IN_MARKERS = {
  tooltips: 'freegantt.tooltips',
  contextMenu: 'freegantt.contextMenu',
  inlineEditing: 'freegantt.inlineEditing',
};

const workDir = mkdtempSync(path.join(tmpdir(), 'freegantt-bundle-probe-'));
const entryFile = path.join(workDir, 'entry.js');
// The fixture entry D-S5-28 asks for: Dataset and Gantt, and nothing else. Both are used (not just
// imported), so a bundler has a real reason to keep them and every built-in a real reason to drop.
writeFileSync(
  entryFile,
  [
    `import { Dataset, Gantt } from ${JSON.stringify(distEntry)};`,
    'export function mount(container) {',
    '  const dataset = new Dataset({ entries: [] });',
    '  return new Gantt({ container, dataset });',
    '}',
    '',
  ].join('\n'),
);

let code = '';
try {
  const result = await build({
    root: workDir,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: { entry: entryFile, formats: ['es'], fileName: () => 'out.js' },
      rollupOptions: {
        // plans/04 §1: the two runtime dependencies stay external for the real package too, so a
        // consumer's own tree-shaking never has to reach into either.
        external: ['alien-signals', 'temporal-polyfill', /^temporal-polyfill\//],
      },
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  const chunk = outputs[0]?.output?.find((entry) => entry.type === 'chunk');
  code = chunk?.code ?? '';
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

if (code.length === 0) {
  console.error('bundle-probe: the fixture build produced no output — the bundler step itself failed.');
  process.exit(1);
}

const leaked = Object.entries(BUILT_IN_MARKERS).filter(([, marker]) => code.includes(marker));
if (leaked.length > 0) {
  console.error(
    `bundle-probe: a Dataset + Gantt only bundle still carries ${leaked.map(([name]) => name).join(', ')}. ` +
      'Tree-shaking failed — check that built-in factory for a call it makes at module scope (D-S5-28).',
  );
  process.exit(1);
}

console.log(
  `bundle-probe: a Dataset + Gantt only bundle is ${code.length} bytes and carries none of ` +
    'tooltips, contextMenu or inlineEditing.',
);
