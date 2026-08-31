#!/usr/bin/env node
// Proves the dependency-cruiser boundary guard is loaded: writes a deliberate violating import
// (scheduling/ -> render/, forbidden by plans/01 §1), asserts `depcruise` fails on it, then reverts.
// Then proves each `*-is-removable` leaf rule (D-S2-23, S2.7 §3) actually blocks a second importer,
// the same way. docs/04-hooks-and-ci.md §4: "a guard with no failing fixture is presumed broken."

import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function depcruiseFails() {
  try {
    execFileSync('npx', ['depcruise', '--config', '.dependency-cruiser.cjs', 'src', 'harness'], {
      cwd: root,
      stdio: 'pipe',
    });
    return false;
  } catch {
    return true;
  }
}

function checkRedTestFile(relativeFile, contents, description) {
  const file = path.join(root, relativeFile);
  writeFileSync(file, contents);
  let ok = false;
  try {
    ok = depcruiseFails();
  } finally {
    unlinkSync(file);
  }
  if (!ok) {
    console.error(`guard-red-test: ${description} — dependency-cruiser did NOT fail. The guard is broken.`);
    process.exit(1);
  }
  console.log(`guard-red-test: ${description} — blocked as expected.`);
}

checkRedTestFile(
  'src/scheduling/__boundary_red_test__.ts',
  "// Deliberate boundary violation — asserts dependency-cruiser actually blocks it.\nimport '../render/dom/index.js';\nexport {};\n",
  'scheduling/ -> render/ boundary violation',
);

// P3 (plans/s3-direct-manipulation/README.md): interaction/ gained a type-only MODEL edge in S3, but
// still may not reach time/, layout/ or render/ — the one-arrow widening must not have quietly opened
// the door to anything else.
checkRedTestFile(
  'src/interaction/__boundary_red_test__.ts',
  "// Deliberate boundary violation — interaction/ may import model/ (P3) but not layout/.\nimport '../layout/index.js';\nexport {};\n",
  'interaction/ -> layout/ boundary violation (P3 widening stays to one arrow)',
);

// D-S2-23: each removable leaf has exactly one allowed importer. A second file importing the leaf
// from outside that allowlist must fail the build, the same way a layer violation does.
checkRedTestFile(
  'src/data/__rollup_red_test__.ts',
  "// Deliberate second importer of the rollup leaf — only transaction.ts may import it.\nimport './rollup.js';\nexport {};\n",
  'rollup-is-removable: second importer',
);
checkRedTestFile(
  'src/view/__dataset_change_subscription_red_test__.ts',
  "// Deliberate second importer of the dataset-change-subscription leaf — only gantt-shell.ts may import it.\nimport './dataset-change-subscription.js';\nexport {};\n",
  'dataset-change-subscription-is-removable: second importer',
);
checkRedTestFile(
  'src/data/__history_red_test__.ts',
  "// Deliberate second importer of the history leaf — only dataset-state.ts may import it.\nimport './history.js';\nexport {};\n",
  'history-is-removable: second importer',
);
checkRedTestFile(
  'src/data/__serialization_red_test__.ts',
  "// Deliberate second importer of the serialization leaf — only api/dataset.ts may import it.\nimport './serialization/index.js';\nexport {};\n",
  'serialization-is-removable: second importer',
);

console.log('guard-red-test: all boundary and removable-leaf rules correctly blocked their violations.');
