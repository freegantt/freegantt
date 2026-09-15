#!/usr/bin/env node
// D-S5-32 (plans/s5-extensibility-and-editing/s5.13-gallery-and-gate.md §1):
// website/docs/guides/plugin-authoring.md is prose about an API, and prose about an API rots.
// Every fenced `ts` block in that guide is
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
/** Every guide whose prose makes a checkable claim about the API. A guide joins this list the day it
 *  gains its first fenced `ts` block — an unchecked example rots exactly as fast as a checked one
 *  stays honest, and nothing but this list decides which it is. */
const guidePaths = [
  path.join(root, 'docs/06-plugin-authoring.md'),
  path.join(root, 'docs/07-row-source-updates.md'),
];
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

let checkedCount = 0;

for (const guidePath of guidePaths) {
  const guideName = path.relative(root, guidePath);

  if (!existsSync(guidePath)) {
    console.error(`check-doc-examples: ${guideName} does not exist.`);
    process.exit(1);
  }

  const blocks = extractTsBlocks(readFileSync(guidePath, 'utf8'));
  if (blocks.length === 0) {
    console.error(`check-doc-examples: ${guideName} carries no fenced ts blocks.`);
    process.exit(1);
  }

  const guideResult = typecheckBlocks(blocks);
  if (!guideResult.ok) {
    console.error(`check-doc-examples: ${blocks.length} example(s) in ${guideName}, one or more failed:\n`);
    console.error(guideResult.output);
    process.exit(1);
  }

  checkedCount += blocks.length;
  console.log(`check-doc-examples: all ${blocks.length} example(s) in ${guideName} typecheck.`);
}

console.log(
  `check-doc-examples: ${checkedCount} example(s) across ${guidePaths.length} guide(s) ` +
    'typecheck against the built package types.',
);
