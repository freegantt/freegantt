#!/usr/bin/env node
// Proves the dependency-cruiser boundary guard is loaded: writes a deliberate violating import
// (scheduling/ -> render/, forbidden by plans/01 §1), asserts `depcruise` fails on it, then reverts.
// Then proves each `*-is-removable` leaf rule actually blocks a second importer,
// the same way. docs/04-hooks-and-ci.md §4: "a guard with no failing fixture is presumed broken."

import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function depcruiseFails() {
  try {
    execFileSync(
      'npx',
      ['depcruise', '--config', '.dependency-cruiser.cjs', 'src', 'harness', 'e2e', 'fixtures'],
      {
        cwd: root,
        stdio: 'pipe',
      },
    );
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

function eslintFails(relativeFile) {
  try {
    execFileSync('npx', ['eslint', relativeFile], { cwd: root, stdio: 'pipe' });
    return false;
  } catch {
    return true;
  }
}

// The eslint.config.js harness/e2e/fixtures block reads the specifier *text*, which is what
// proves the case dependency-cruiser's resolved-path exception cannot state on its own (see the
// comment above the two calls of this below). Same write/assert/delete shape as `checkRedTestFile`,
// pointed at `eslint` instead of `depcruise`.
function eslintRedTestFile(relativeFile, contents, description) {
  const file = path.join(root, relativeFile);
  writeFileSync(file, contents);
  let ok = false;
  try {
    ok = eslintFails(relativeFile);
  } finally {
    unlinkSync(file);
  }
  if (!ok) {
    console.error(`guard-red-test: ${description} — eslint did NOT fail. The guard is broken.`);
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

// Each removable leaf has exactly one allowed importer. A second file importing the leaf
// from outside that allowlist must fail the build, the same way a layer violation does.
checkRedTestFile(
  'src/data/__rollup_red_test__.ts',
  "// Deliberate second importer of the rollup leaf — only build-commit-change-set.ts and transaction.ts may import it.\nimport './rollup.js';\nexport {};\n",
  'rollup-is-removable: second importer',
);
// The `autogroup-is-removable` red test is RETIRED here, authorized by the author 2026-09-11.
// [ADR 0013] deleted `src/data/hierarchy.ts`, so this fixture imported a module that no longer
// exists, dependency-cruiser found no rule to break, and this script correctly reported the guard
// broken. A red test whose subject is gone is not a weaker guard — it is no guard at all, and
// leaving it would have meant a permanently red gate asserting nothing.
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

// extensions/ (see plans/s5-extensibility-and-editing/s5.1-plugin-runtime.md) may import only
// api/ and model/ — the dogfood gate that proves a built-in feature took no back door.
checkRedTestFile(
  'src/extensions/__boundary_red_test__.ts',
  "// Deliberate boundary violation — extensions/ may import api/ and model/ only (D-S5-5).\nimport '../view/styles.js';\nexport {};\n",
  'extensions/ -> view/ boundary violation (D-S5-5, the dogfood gate)',
);

// S5.4 QC (plans/01 §1, "render/ --> data/dev-mode.ts"): render/ and extensions/ may each reach that
// one named leaf, not `data/` generally — a different `data/` file must still be blocked.
checkRedTestFile(
  'src/render/dom/__dev_mode_leaf_red_test__.ts',
  "// Deliberate boundary violation — render/ may reach data/dev-mode.ts only, not data/ generally.\nimport '../../data/transaction.js';\nexport {};\n",
  'render/ -> data/transaction.js boundary violation (dev-mode.ts leaf stays scoped)',
);
checkRedTestFile(
  'src/extensions/__dev_mode_leaf_red_test__.ts',
  "// Deliberate boundary violation — extensions/ may reach data/dev-mode.ts only, not data/ generally.\nimport '../data/transaction.js';\nexport {};\n",
  'extensions/ -> data/transaction.js boundary violation (dev-mode.ts leaf stays scoped)',
);

// #287: dependency-cruiser matches *resolved* paths, so `pathNot:
// '^src/api/index\.ts$'` — the clause that lets the `freegantt` alias through — cannot tell that
// alias from a hand-written relative path naming the same file. This fixture lands one file short
// of that clause (an internal, `src/layout/bars/variants.ts`, same shape as `render/ ->
// data/transaction.js` above): it proves the cruiser rule still blocks a relative reach past the
// index, not that it can tell the index path itself from the alias. That second claim is
// `eslint.config.js`'s job (the ESLint check, right below) — it reads the specifier text.
checkRedTestFile(
  'harness/__boundary_red_test__.ts',
  "// Deliberate boundary violation — harness/ may import 'freegantt' only, not a relative src/ path,\n// and this lands one file short of the one exception (src/api/index.ts) the cruiser rule states.\nimport '../src/layout/bars/variants.js';\nexport {};\n",
  'harness/ -> src/ boundary violation (an internal, one file short of the index exception, #287)',
);

// The case dependency-cruiser's own exception cannot catch — a relative path that names
// `src/api/index.ts` itself, the exact file the `freegantt` alias resolves to. `pathNot` lets the
// alias through by resolved path, so it lets this through too; only reading the specifier *text*
// (eslint.config.js's harness/e2e/fixtures block) can tell the two apart. Two positions: a plain
// import, and the type-position inline `import(...)` that shipped uncaught in
// `e2e/variant-styles.spec.ts` (`TSImportType`, which neither `no-restricted-imports` nor
// `@typescript-eslint/no-restricted-imports` visits).
eslintRedTestFile(
  'harness/__index_path_red_test__.ts',
  "// Deliberate boundary violation — the index path itself, not an internal, is the case dependency-\n// cruiser's resolved-path exception cannot tell from the 'freegantt' alias (#287, F7).\nimport { Gantt } from '../src/api/index.js';\nexport type T = Gantt;\n",
  'harness/ -> src/api/index.ts by a relative path (the case the cruiser exception cannot catch, #287 F7)',
);
eslintRedTestFile(
  'e2e/__index_path_type_position_red_test__.ts',
  "// Deliberate boundary violation — the exact shape e2e/variant-styles.spec.ts shipped uncaught:\n// a type-position inline import() naming the index by a relative path (#287, F7).\ndeclare global {\n  interface Window {\n    __redTest: import('../src/api/index.js').Gantt;\n  }\n}\nexport {};\n",
  "e2e/ -> src/api/index.ts by a type-position inline import() (#287 F7's live instance)",
);

console.log('guard-red-test: all boundary and removable-leaf rules correctly blocked their violations.');
