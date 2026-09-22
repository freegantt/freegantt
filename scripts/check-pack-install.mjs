#!/usr/bin/env node
// #400 — the S6 acceptance row "`npm pack` output audited: internals unreachable, types complete"
// (plans/03-slices.md §S6). `check-lib-build.mjs` only reads `pnpm pack`'s file list; nothing until
// now installed the tarball and asked a real TypeScript project to resolve it. This does both:
//   1. `import { Gantt } from 'freegantt'` must compile under `strict` — a consumer's install works.
//   2. `import … from 'freegantt/src/api/index.js'` must fail to resolve — `files: ["dist"]` and
//      the sealed `exports` map (docs/agents/modules/layers.md) keep `src/` out of what ships.
//
// A tarball, not a symlinked `node_modules/freegantt` (check-doc-examples.mjs's approach): a
// symlink resolves straight to this repo's checkout, where `src/` is still on disk. Only a real
// `pnpm pack` + install proves the seal a consumer actually gets.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

let failed = false;
function check(condition, message) {
  if (!condition) {
    console.error(`check-pack-install: ${message}`);
    failed = true;
  }
}

/** Compiles one file alone, under the strict settings a consumer's own project would set. Returns
 *  the tsc output so the caller can read the failure, not just its exit code. */
function typecheck(consumerDir, tscBin, fileName) {
  try {
    execFileSync(
      tscBin,
      [
        '--strict',
        '--target',
        'ES2022',
        '--module',
        'ESNext',
        '--moduleResolution',
        'Bundler',
        '--skipLibCheck',
        '--noEmit',
        fileName,
      ],
      { cwd: consumerDir, stdio: 'pipe' },
    );
    return { ok: true, output: '' };
  } catch (error) {
    return { ok: false, output: (error.stdout ?? error.message ?? '').toString() };
  }
}

const workDir = mkdtempSync(path.join(tmpdir(), 'freegantt-pack-install-'));
try {
  // No `--json`: `prepack` builds the library as part of this call, and its `vite build` progress
  // lines share `pnpm pack`'s stdout with the JSON payload, undivided. `pnpm pack`'s own default
  // tarball name is `<name>-<version>.tgz`, so reading it back from `package.json` needs no parsing
  // of that mixed stream at all.
  execFileSync('pnpm', ['pack', '--pack-destination', workDir], { cwd: root, stdio: 'pipe' });
  const tarballPath = path.join(workDir, `${pkg.name}-${pkg.version}.tgz`);

  const consumerDir = path.join(workDir, 'consumer');
  mkdirSync(consumerDir);
  writeFileSync(
    path.join(consumerDir, 'package.json'),
    JSON.stringify({ name: 'check-pack-install-consumer', private: true, type: 'module' }, null, 2),
  );

  execFileSync('pnpm', ['add', tarballPath, 'typescript'], { cwd: consumerDir, stdio: 'pipe' });
  const tscBin = path.join(consumerDir, 'node_modules/.bin/tsc');

  writeFileSync(
    path.join(consumerDir, 'good.ts'),
    "import { Gantt } from 'freegantt';\nexport type PublicSurface = typeof Gantt;\n",
  );
  writeFileSync(
    path.join(consumerDir, 'bad.ts'),
    "import { Gantt } from 'freegantt/src/api/index.js';\nexport type LeakedSurface = typeof Gantt;\n",
  );

  const good = typecheck(consumerDir, tscBin, 'good.ts');
  check(good.ok, `\`import { Gantt } from 'freegantt'\` did not compile:\n${good.output}`);

  const bad = typecheck(consumerDir, tscBin, 'bad.ts');
  check(
    !bad.ok && bad.output.includes('Cannot find module'),
    '`freegantt/src/api/index.js` resolved from the packed tarball — the exports map no longer seals src/.',
  );
} catch (error) {
  // `pnpm pack` or `pnpm add` failed. Their output is piped, so print it here: the `vite build`
  // log inside `prepack` names the real cause, and the scratch folder goes away next.
  console.error(`check-pack-install: ${error.message}`);
  console.error((error.stdout ?? '').toString());
  console.error((error.stderr ?? '').toString());
  failed = true;
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

if (failed) {
  process.exit(1);
}
console.log(
  'check-pack-install: the packed tarball installs, `freegantt` compiles under strict, ' +
    'and `freegantt/src/...` stays unreachable.',
);
