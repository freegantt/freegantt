#!/usr/bin/env node
// `pnpm verify:full` — the local gate, and the one command that states its own result in words.
//
// Why a script, and not `pnpm verify && pnpm test:e2e` (#255). A chain reports only through its
// exit code, and the caller transcribes that code by hand. The pattern this repo used —
// `cmd 2>&1 | tail -4; echo "EXIT: $?"` — reads `tail`'s status, not the command's. It prints
// `EXIT: 0` over a failed run. An agent then reports green in good faith, and the failure surfaces
// at the push, one or two steps from whoever could fix it fastest.
//
// So the result moves into the output stream, where no plumbing strips it. Every run prints exactly
// one verdict line. It says PASS or FAILED, and it names the check that stopped the run. Green
// needs that exact line. A run that a signal kills, or a pipe truncates, has no verdict line at
// all. It then reads as unproven, never as green.
//
// The verdict is the last line this script prints. `pnpm` adds one `[ELIFECYCLE]` line after it on
// a failure, so a reader wants the last three lines: `pnpm verify:full > /tmp/v.log 2>&1;
// tail -3 /tmp/v.log`.
//
// The check list is not written here. This script reads it from the `verify` script in
// `package.json`. So `verify` stays the single source of truth, and a new check joins every caller
// at once — this gate, `.githooks/pre-push`, and CI, which runs this same command in one job
// (docs/04 §5). `test:e2e` is appended: it is the browser half `verify` leaves out, and it catches
// the class of failure #255 records — a drag that a real browser breaks, and happy-dom cannot see.

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** The browser half: the one check `verify` leaves out, because it needs a browser. */
const BROWSER_CHECK = 'test:e2e';

/**
 * Every check this gate runs, in order: the `verify` chain first, the browser check last.
 * Throws when `verify` holds a step this script cannot run, or names a script that does not exist.
 * A check that disappears in silence is the failure this whole script exists to prevent.
 */
export function readCheckList(pkg) {
  const scripts = pkg.scripts ?? {};
  const chained = (scripts.verify ?? '')
    .split('&&')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .map((segment) => {
      const step = /^pnpm (?:run )?([\w:-]+)$/.exec(segment);
      if (!step) throw new Error(`the \`verify\` script holds a step this gate cannot run: "${segment}"`);
      return step[1];
    });

  if (chained.length === 0) throw new Error('the `verify` script is empty, so this gate would prove nothing');

  const checks = [...chained, BROWSER_CHECK];
  for (const check of checks) {
    if (!(check in scripts)) throw new Error(`\`pnpm ${check}\` is not a script in package.json`);
  }
  return checks;
}

/** Why a check stopped the run, in the words the reader needs to act on it. */
function describeFailure(result) {
  if (result.error) return result.error.message;
  if (result.signal) return `killed by ${result.signal}`;
  return `exit code ${result.status}`;
}

/** What the failure cost, so the reader knows how much of the gate is still unproven. */
function describeSkipped(count) {
  if (count === 0) return 'It was the last check.';
  if (count === 1) return '1 later check did not run.';
  return `${count} later checks did not run.`;
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const startedAt = Date.now();
  const elapsed = () => Math.round((Date.now() - startedAt) / 1000);

  let checks;
  try {
    checks = readCheckList(JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')));
  } catch (error) {
    // Still a verdict line, because a gate that cannot read its own check list is not green.
    console.log(`verify:full FAILED before any check ran — ${error.message}.`);
    process.exit(1);
  }

  for (const [index, check] of checks.entries()) {
    const position = `check ${index + 1} of ${checks.length}`;
    console.log(`\nverify:full → ${position}: pnpm ${check}`);

    const result = spawnSync('pnpm', [check], { cwd: root, stdio: 'inherit' });
    if (result.status === 0) continue;

    if (check === BROWSER_CHECK) {
      console.log('If the browser binary is missing, run `pnpm exec playwright install chromium` first.');
    }
    console.log(
      `\nverify:full FAILED at ${position}: pnpm ${check} (${describeFailure(result)}). ` +
        `${describeSkipped(checks.length - index - 1)} (${elapsed()}s)`,
    );
    process.exit(result.status ?? 1);
  }

  console.log(
    `\nverify:full PASS — all ${checks.length} checks green, ${BROWSER_CHECK} included (${elapsed()}s).`,
  );
}
