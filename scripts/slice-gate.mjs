#!/usr/bin/env node
// Reads the current slice from .slice and prints that gate's mechanical conditions plus the
// human-only checklist items (plans/00 §4, docs/04-hooks-and-ci.md §5.1). Bumping .slice is a
// reviewed commit — this script does not bump it, it only reports.

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const slice = existsSync(path.join(root, '.slice'))
  ? readFileSync(path.join(root, '.slice'), 'utf8').trim()
  : 'S0';

const GATES = {
  S0: {
    name: 'S0 → S1',
    checks: [
      {
        label: 'boundaries lint active and failing on violation (red test)',
        run: () => run('node scripts/guard-red-test.mjs'),
      },
      { label: 'layout tested headlessly (test:node)', run: () => run('pnpm test:node') },
    ],
    human: ['HUMAN: harness renders fixture bars — check before advancing .slice'],
  },
};

function run(cmd) {
  try {
    execSync(cmd, { cwd: root, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

const gate = GATES[slice];
if (!gate) {
  console.log(`gate: no automated checklist defined yet for slice ${slice}.`);
  process.exit(0);
}

console.log(`${gate.name} gate`);
let allPassed = true;
for (const check of gate.checks) {
  const ok = check.run();
  allPassed &&= ok;
  console.log(`  ${ok ? '✔' : '✗'} ${check.label}`);
}
for (const item of gate.human) {
  console.log(`  ☐ ${item}`);
}

process.exit(allPassed ? 0 : 1);
