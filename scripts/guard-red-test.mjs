#!/usr/bin/env node
// Proves the dependency-cruiser boundary guard is loaded: writes a deliberate violating import
// (scheduling/ -> render/, forbidden by plans/01 §1), asserts `depcruise` fails on it, then reverts.
// docs/04-hooks-and-ci.md §4: "a guard with no failing fixture is presumed broken."

import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const violationFile = path.join(root, 'src/scheduling/__boundary_red_test__.ts');

writeFileSync(
  violationFile,
  "// Deliberate boundary violation — asserts dependency-cruiser actually blocks it.\nimport '../render/dom/index.js';\nexport {};\n",
);

let failedAsExpected = false;
try {
  execFileSync('npx', ['depcruise', '--config', '.dependency-cruiser.cjs', 'src', 'harness'], {
    cwd: root,
    stdio: 'pipe',
  });
} catch {
  failedAsExpected = true;
}

unlinkSync(violationFile);

if (!failedAsExpected) {
  console.error(
    'guard-red-test: dependency-cruiser did NOT fail on a deliberate boundary violation. The guard is broken.',
  );
  process.exit(1);
}

console.log('guard-red-test: dependency-cruiser correctly blocked the violating import.');
