#!/usr/bin/env node
// `prepare` runs in two very different places: this repo's own checkout, and a consumer's
// `npm install` of the packed tarball. Only the first one has a `.git` to point at `.githooks`,
// and running `git config` inside a consumer's node_modules is at best noise and at worst an
// error that fails their install (#packaging). Detect the checkout, and no-op everywhere else.

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

if (!existsSync(join(repoRoot, '.git'))) {
  process.exit(0);
}

const result = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], {
  cwd: repoRoot,
  stdio: 'inherit',
});

process.exit(result.status ?? 0);
