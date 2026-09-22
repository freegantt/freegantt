#!/usr/bin/env node
// Guards #42: `pnpm build` must actually produce the library, not just the harness. Checks that the
// two paths package.json's sealed `exports` map points at exist, and that `pnpm pack --dry-run` would
// publish the library entry — proving the exports map is exercised rather than pointed at nothing.
// pnpm, not npm (#50): this repo's script surface is pnpm-only everywhere else.
//
// `--config.ignore-scripts=true` on the dry run (#400): `prepack` now runs the library build, and
// `pnpm pack` (dry run included) runs `prepack`. `pnpm pack` has no `--ignore-scripts` flag of its
// own, so the dry run needs the generic `--config.*` override to skip that second, redundant build.
// This script must also never run from `prepack` itself — that would be `prepack` calling
// `pnpm pack`, which calls `prepack` again, forever.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const exportsEntry = pkg.exports['.'];

let failed = false;
function check(condition, message) {
  if (!condition) {
    console.error(`check-lib-build: ${message}`);
    failed = true;
  }
}

const jsPath = exportsEntry.import.replace(/^\.\//, '');
const dtsPath = exportsEntry.types.replace(/^\.\//, '');
check(existsSync(jsPath), `${jsPath} (package.json exports["."].import) was not produced by the build`);
check(existsSync(dtsPath), `${dtsPath} (package.json exports["."].types) was not produced by the build`);

const packOutput = execFileSync('pnpm', ['pack', '--dry-run', '--json', '--config.ignore-scripts=true'], {
  encoding: 'utf8',
});
const { files } = JSON.parse(packOutput);
const paths = files.map((f) => f.path);
check(paths.includes(jsPath), `pnpm pack would not publish ${jsPath}`);

if (failed) {
  process.exit(1);
}
console.log('check-lib-build: dist/api/index.js + .d.ts produced and published by pnpm pack.');
