#!/usr/bin/env node
// D-S5-32 (plans/s5-extensibility-and-editing/s5.13-gallery-and-gate.md §1): docs/06-plugin-authoring.md
// is prose about an API, and prose about an API rots. Every fenced `ts` block in that guide is
// extracted and typechecked here against the BUILT package types — `dist/api/index.d.ts`, resolved
// through package.json's own sealed `exports` map, the way a third party's `import ... from
// 'freegantt'` resolves it. Never against `src/`: a guide that only compiles against internals is a
// guide that lies to the reader who actually installs the package.
//
// Two things fail this check, and both must:
//   1. An example that no longer compiles — the guide names an API that moved.
//   2. An example that reaches a private path — `src/extensions/**` proves the dogfood rule for
//      shipped code; this proves it for the documentation a third party actually copies.
//
// `guard-red-test` posture (docs/04-hooks-and-ci.md §4): "a guard with no failing fixture is presumed
// broken." `runRedTest` below typechecks two fixtures built to fail — one broken example, one private
// import — and exits nonzero itself if either one is not rejected, before this script ever looks at
// the real guide.

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const guidePath = path.join(root, 'docs/06-plugin-authoring.md');
const pagePath = path.join(root, 'harness/docs/plugin-authoring.html');
const distTypesPath = path.join(root, 'dist/api/index.d.ts');
const tsc = path.join(root, 'node_modules/.bin/tsc');

/** Every fenced ` ```ts ` block in `markdown`, in reading order. A block with no `import`/`export` of
 *  its own would not be a module under `isolatedModules` (the repo's own rule) — the guide's examples
 *  all carry one, the same discipline `src/` already keeps. */
function extractTsBlocks(markdown) {
  const fence = /```ts\n([\s\S]*?)```/g;
  const blocks = [];
  let match;
  while ((match = fence.exec(markdown)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

/** Every `<pre><code>` block on the HTML plugin-authoring page, in reading order.
 *
 *  **Every `<pre>` on that page must carry a `data-check` attribute**, and a block without one fails
 *  this script. That is the whole point: before Build 4 no sample on the page was typechecked at all,
 *  and a page where "unchecked" is the silent default goes straight back to that.
 *
 *  - `data-check="module"` — a whole module. Compiled exactly as written.
 *  - `data-check="plugin-data"` — the `data(ctx)` half of a plugin, shown on its own. Wrapped in the
 *    `PLUGIN_DATA_PREAMBLE` below, so the reader sees the half and the compiler sees a whole plugin.
 *    The preamble carries only what the page says it carries: `definePlugin` and `entryId` out of
 *    `'freegantt'`, and `PhaseProps`, which the page names as the app's own props type.
 *  - `data-check="type-sketch"` — a library type quoted for the reader. Skipped, and counted out
 *    loud, because it declares names rather than calling them.
 *
 *  A block may also carry `data-file="note-field.ts"`. That is the file name the block is written
 *  under, so a later block importing `'./note-field.js'` resolves to it — the page shows two files
 *  and the compiler sees two files.
 */
function extractPageBlocks(markup) {
  const fence = /<pre([^>]*)><code>([\s\S]*?)<\/code><\/pre>/g;
  const blocks = [];
  const names = [];
  let skipped = 0;
  let match;
  while ((match = fence.exec(markup)) !== null) {
    const mode = /data-check="([a-z-]+)"/.exec(match[1])?.[1];
    const fileName = /data-file="([\w.-]+)"/.exec(match[1])?.[1];
    const code = decodeEntities(match[2]);
    if (mode === undefined) {
      console.error(
        'check-doc-examples: a <pre> block in harness/docs/plugin-authoring.html carries no ' +
          'data-check attribute. Every block declares "module", "plugin-data" or "type-sketch".\n\n' +
          code.slice(0, 200),
      );
      process.exit(1);
    }
    if (mode === 'type-sketch') {
      skipped += 1;
      continue;
    }
    if (mode === 'plugin-data') {
      blocks.push(
        `${PLUGIN_DATA_PREAMBLE}export const example = definePlugin({\n  id: 'doc.example',\n${code}\n});\n`,
      );
      names.push(fileName);
      continue;
    }
    if (mode !== 'module') {
      console.error(`check-doc-examples: unknown data-check mode "${mode}".`);
      process.exit(1);
    }
    blocks.push(code);
    names.push(fileName);
  }
  return { blocks, names, skipped };
}

/** What a `plugin-data` fragment sees around it. The page states each of these in prose beside the
 *  fragment that uses it, so nothing here is scope a reader could not have known about. */
const PLUGIN_DATA_PREAMBLE = [
  "import { definePlugin, entryId } from 'freegantt';",
  '',
  'interface PhaseProps {',
  '  phaseId?: string;',
  '}',
  '',
].join('\n');

/** The four entities the page escapes inside a code block. Enough for TypeScript source, and one
 *  place to extend if a fifth ever shows up. */
function decodeEntities(text) {
  return text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&');
}

/** Writes `blocks` as sibling `.ts` files in a fresh temp package, resolving the bare specifier
 *  `'freegantt'` through a `node_modules/freegantt` symlink to this repo's own root — the same
 *  resolution `npm install freegantt` gives a real consumer, and the reason this never points at
 *  `src/`. Returns `{ ok, output }`; the temp directory is always removed. */
function typecheckBlocks(blocks, names = []) {
  if (!existsSync(distTypesPath)) {
    console.error('check-doc-examples: dist/api/index.d.ts is missing. Run `pnpm build` first.');
    process.exit(1);
  }
  const workDir = mkdtempSync(path.join(tmpdir(), 'freegantt-doc-examples-'));
  try {
    mkdirSync(path.join(workDir, 'node_modules'));
    symlinkSync(root, path.join(workDir, 'node_modules', 'freegantt'), 'dir');

    const fileNames = blocks.map((_, index) => names[index] ?? `example-${index + 1}.ts`);
    blocks.forEach((code, index) => writeFileSync(path.join(workDir, fileNames[index]), code));

    writeFileSync(
      path.join(workDir, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            lib: ['ES2022', 'DOM'],
            module: 'ESNext',
            moduleResolution: 'Bundler',
            strict: true,
            noUncheckedIndexedAccess: true,
            exactOptionalPropertyTypes: true,
            isolatedModules: true,
            skipLibCheck: true,
            noEmit: true,
          },
          include: fileNames,
        },
        null,
        2,
      ),
    );

    execFileSync(tsc, ['--noEmit', '-p', 'tsconfig.json'], { cwd: workDir, stdio: 'pipe' });
    return { ok: true, output: '' };
  } catch (error) {
    return { ok: false, output: (error.stdout ?? error.message ?? '').toString() };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

/** The fixture that proves this checker actually rejects a bad example. One block fails to compile;
 *  one reaches past the sealed `exports` map into a path only `src/` can see. Neither is the shipped
 *  guide — both are written here, on purpose, so the check that watches the guide is itself watched. */
function runRedTest() {
  const brokenExample = [
    "import { Dataset } from 'freegantt';",
    '',
    'const dataset = new Dataset({ entries: [] });',
    '// Deliberate type error: Dataset is not assignable to number.',
    'const notANumber: number = dataset;',
    'export { notANumber };',
    '',
  ].join('\n');
  const privateImport = [
    "import { ensureBaseStyles } from 'freegantt/dist/view/styles.js';",
    '',
    '// Deliberate private-path reach: only "." is in the published exports map.',
    'export { ensureBaseStyles };',
    '',
  ].join('\n');

  const result = typecheckBlocks([brokenExample, privateImport]);
  if (result.ok) {
    console.error(
      'check-doc-examples: RED TEST FAILED — a broken example and a private-path import both ' +
        'typechecked clean. The checker is not actually checking anything. Fix it before trusting a ' +
        'green run on the real guide.',
    );
    process.exit(1);
  }
  console.log(
    'check-doc-examples: red test — a broken example and a private import were both rejected, as expected.',
  );
}

runRedTest();

if (!existsSync(guidePath)) {
  console.error(`check-doc-examples: ${path.relative(root, guidePath)} does not exist.`);
  process.exit(1);
}

const guideMarkdown = readFileSync(guidePath, 'utf8');
const blocks = extractTsBlocks(guideMarkdown);
if (blocks.length === 0) {
  console.error(`check-doc-examples: ${path.relative(root, guidePath)} carries no fenced ts blocks.`);
  process.exit(1);
}

const guideResult = typecheckBlocks(blocks);
if (!guideResult.ok) {
  console.error(`check-doc-examples: ${blocks.length} example(s) in the guide, one or more failed:\n`);
  console.error(guideResult.output);
  process.exit(1);
}

console.log(
  `check-doc-examples: all ${blocks.length} example(s) in ${path.relative(root, guidePath)} ` +
    'typecheck against the built package types.',
);

// ADR 0020, Build 4: the HTML page finally describes built code, so its samples can compile too.
// Until this ran, no sample on that page had ever been typechecked.
if (!existsSync(pagePath)) {
  console.error(`check-doc-examples: ${path.relative(root, pagePath)} does not exist.`);
  process.exit(1);
}

const page = extractPageBlocks(readFileSync(pagePath, 'utf8'));
if (page.blocks.length === 0) {
  console.error(`check-doc-examples: ${path.relative(root, pagePath)} carries no checkable blocks.`);
  process.exit(1);
}

const pageResult = typecheckBlocks(page.blocks, page.names);
if (!pageResult.ok) {
  console.error(`check-doc-examples: ${page.blocks.length} example(s) on the page, one or more failed:\n`);
  console.error(pageResult.output);
  process.exit(1);
}

console.log(
  `check-doc-examples: all ${page.blocks.length} example(s) in ${path.relative(root, pagePath)} ` +
    `typecheck against the built package types (${page.skipped} type sketch(es) skipped).`,
);
