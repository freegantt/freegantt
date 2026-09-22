#!/usr/bin/env node
// TEMPORARY stopgap until the first npm registry publish (#442). Remove this script and its
// `prepare` call once the consumer installs from the registry.
//
// A git dependency gets no `dist/` from `prepack`: npm's `pacote` runs only `prepare` for a git
// install (`lib/dir.js`), whatever npm's docs say. So `prepare` also runs the library build
// (about 3 s). A registry install needs none of this, because the tarball already carries `dist/`.

import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const result = spawnSync('vite', ['build', '--config', 'vite.lib.config.ts'], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
