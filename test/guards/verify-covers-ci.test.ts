// A guard with no failing fixture is presumed broken (docs/04-hooks-and-ci.md §4).
//
// `.github/workflows/ci.yml` is `workflow_dispatch:` only, so `.githooks/pre-push` is the gate that
// actually runs. That only holds while the hook runs everything the workflow would: the failure mode
// is silent — someone adds a CI job, nobody adds it to `pnpm verify`, and the hook keeps reporting
// green over a check it no longer performs.
//
// So: every `pnpm <script>` a CI job runs must also appear in the `verify` script, and `pre-push`
// must invoke the gate. Adding a job without extending `verify` fails here.
//
// The chain has one more link since #255: `pre-push` invokes `pnpm verify:full`, and that wrapper
// runs `verify`'s chain plus `test:e2e` — the check with no CI job behind it. It reads its check
// list from `verify` at run time, so it cannot drift from CI parity. These fixtures prove the
// derivation, and prove the wrapper refuses a list it cannot run instead of skipping a check.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCheckList } from '../../scripts/verify-full.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string): string => fs.readFileSync(path.join(root, rel), 'utf8');

/** `- run: pnpm install --frozen-lockfile` is scaffolding every job repeats, not a check. */
const SCAFFOLDING = new Set(['install']);

/** The `pnpm <script>` steps the `verify` chain runs, in order. */
function scriptsChainedBy(verifyScript: string): string[] {
  return [...verifyScript.matchAll(/pnpm ([\w:-]+)/g)].map((m) => m[1]!);
}

function pnpmScriptsRunBy(workflow: string): string[] {
  const names = [...workflow.matchAll(/^\s*-\s*run:\s*pnpm\s+(?:run\s+)?([\w:-]+)/gm)].map((m) => m[1]!);
  return [...new Set(names)].filter((name) => !SCAFFOLDING.has(name));
}

describe('pre-push runs everything CI would', () => {
  const workflow = read('.github/workflows/ci.yml');
  const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
  const verify = pkg.scripts['verify'] ?? '';
  const prePush = read('.githooks/pre-push');

  it('finds the CI jobs to compare against', () => {
    // Guards the parser itself: a workflow rewrite that stops matching would otherwise make every
    // assertion below vacuously pass.
    expect(pnpmScriptsRunBy(workflow).length).toBeGreaterThan(5);
  });

  for (const script of pnpmScriptsRunBy(workflow)) {
    it(`\`pnpm ${script}\` is covered by \`pnpm verify\``, () => {
      expect(verify).toContain(`pnpm ${script}`);
    });
  }

  it('pre-push invokes the full gate', () => {
    expect(prePush).toMatch(/^\s*pnpm verify:full\s*$/m);
  });

  // e2e is the one check with no CI job behind it (docs/04 §3.1), so this gate is the only thing
  // running it. Two of the five S1 acceptance boxes are Playwright tests and `scripts/slice-gate.mjs`
  // shells out to the same script for both — drop e2e from the gate and the S1 gate becomes
  // unprovable in silence.
  it("the full gate runs verify's chain, then the browser check", () => {
    expect(readCheckList(pkg)).toEqual([...scriptsChainedBy(verify), 'test:e2e']);
  });

  it('the full gate refuses a verify step it cannot run', () => {
    const pkgWithRawStep = {
      scripts: { verify: 'pnpm lint && tsc --noEmit', lint: 'eslint .', 'test:e2e': 'playwright test' },
    };
    expect(() => readCheckList(pkgWithRawStep)).toThrow(/cannot run/);
  });

  it('the full gate refuses an empty verify', () => {
    expect(() => readCheckList({ scripts: { verify: '  ', 'test:e2e': 'playwright test' } })).toThrow(
      /prove nothing/,
    );
  });

  it('the full gate refuses a check that no script defines', () => {
    expect(() => readCheckList({ scripts: { verify: 'pnpm lint', lint: 'eslint .' } })).toThrow(
      /not a script/,
    );
  });

  it('every script verify chains actually exists in package.json', () => {
    const chained = scriptsChainedBy(verify);
    expect(chained.length).toBeGreaterThan(0);
    for (const script of chained) {
      expect(Object.keys(pkg.scripts)).toContain(script);
    }
  });
});
